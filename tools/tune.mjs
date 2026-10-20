// Automated tuning of the Bots' AI profiles by self-play (docs/adr/0012, ticket 07). No human measures anything.
//
// It keeps a current best set of changes (the format of server/bot-ai.json), starting from none. Each step proposes a
// candidate (the best plus one change: first a list of hypotheses taken from reading the profiles, then random scalings of
// related keys) and plays it against the best in tools/selfplay.mjs. A candidate that wins enough of the decided battles
// becomes the best. After every few candidates the best plays the game's own profiles, which gives the strength curve;
// tuning stops when two such checks in a row improve by less than the plateau, or at --max-evals.
//
// With --stack N it instead plays every hypothesis at once against the game's own profiles for N battles, to see whether
// the changes add up to something that single 24-battle comparisons are too noisy to show.
//
// Usage: node --env-file=.env tools/tune.mjs [--stack N] [--battles 24] [--accept 0.625] [--check-every 4] [--check-battles 24]
//          [--plateau 0.05] [--max-evals 40] [--max-minutes 50] [--lanes 1] [--speed 8]
// Everything it writes is in tmp/tune/ (state.json, best.json, log.md); run it again to resume. --max-minutes ends the run
// after the step that passes it, so a long search can be run in pieces.
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import aiProfiles from '../server/aiprofiles.js';
import { loadGame } from '../web/tools/game.mjs';

// Low priority, and one lane by default: a tuning run takes the CPU nobody else wants.
try { os.setPriority(os.constants.priority.PRIORITY_LOW); } catch { /* not allowed here; run at normal priority */ }

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i + 1]; };
const BATTLES = +arg('battles', 24), ACCEPT = +arg('accept', 0.625), CHECK_EVERY = +arg('check-every', 4);
const CHECK_BATTLES = +arg('check-battles', 24), PLATEAU = +arg('plateau', 0.05), MAX_EVALS = +arg('max-evals', 40);
const MAX_MS = +arg('max-minutes', 50) * 60000, LANES = +arg('lanes', 1), SPEED = +arg('speed', 8);
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const dir = path.join(root, 'tmp', 'tune');
fs.mkdirSync(dir, { recursive: true });
const stateFile = path.join(dir, 'state.json'), bestFile = path.join(dir, 'best.json'), logFile = path.join(dir, 'log.md');
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8'))
  : { best: [], tried: [], checks: [], evals: 0, rng: 12345, bestAt: 0 };
const save = () => { fs.writeFileSync(stateFile, JSON.stringify(state, null, 1)); fs.writeFileSync(bestFile, JSON.stringify(state.best, null, 1)); };
const log = line => { console.log(line); fs.appendFileSync(logFile, line + '\n'); };

const NAME = { D: 'AISD', GTP: 'AISGTP', GH: 'AISGH', ROP: 'AISROP' };
const d = (p, key, value, why) => ({ profile: NAME[p], key, value, why });
const all = (key, value, why) => Object.keys(NAME).map(p => d(p, key, value, why));

// Hypotheses from reading the live profiles (ticket 07's list, and the weights that look too timid). Each is tried once.
const HYPOTHESES = [
  ['calmer randomness', [...all('PROPERTY_MOVE_RANDOM', 8, 'the AI picks among near-equal moves at random; a strong player does not'),
    ...all('PROPERTY_FIRING_RANDOM', 3, 'same, for cannon shots'), ...all('PROPERTY_TILE_PLACING_RANDOM', 1, 'same, for tile placing'),
    ...all('PROPERTY_RANDOM_MOVEMENT', 1, 'same, for the planning fallback')]],
  ['defend the castle', [...all('MOVE_OWNCASTLE_ATTACK_MULTIPLIER', 3, 'own castle had no defensive weight in any profile'),
    ...all('MOVE_DISTANCE_HOMECASTLE_MULTIPLIER', 1, 'distance to the own castle was ignored in every profile')]],
  ['defend the princess', [d('D', 'MOVE_ATTACK_OWNPRINCESS_HOLDER_BONUS', 300, 'default profile cared 80 about whoever carries its princess; the others 150 to 500')]],
  ['go for the laser cannon', all('LASERCANNON_IMP_STARTING', 100, 'importance 0 in every profile, so the AI never took the item')],
  ['fix the GTP cannon item typo', [d('GTP', 'CANNON_ITEMIMPORTANCE_MULTIPLIER', 4, '42 against 2 in the default; probably a typo')]],
  ['attack while carrying a princess', [d('GH', 'MOVE_ATTACK_IMPORTACE_MULTIPLIER', 1, 'weight 0 meant it never attacked while carrying')]],
  ['hunt heroes', [d('D', 'MOVE_KILLED_HERO_BONUS', 500, 'kills decide battles'), d('D', 'CANNON_KILLED_HERO_BONUS', 900, 'same, for cannon shots')]],
  ['build combos', [d('D', 'PROPERTY_COMBO_BUILDING_MULTIPLIER', 10, 'combos are the main source of damage'), d('D', 'PROPERTY_COMBO_BREAKING_MULTIPLIER', 6, 'and stopping the enemy\'s')]],
  ['take items', [d('D', 'MOVE_ITEM_IMPORTANCE_MULTIPLIER', 8, 'items swing battles'), d('D', 'MOVE_ITEM_MULTIPLIER', 30, 'same')]],
  ['respect threats', [d('D', 'THREAT_ENEMY_CASTLE_BONUS', 400, 'stay clear of the enemy castle\'s reach'), d('D', 'THREAT_FIELD_DYING_NEAR_ENEMY_CASTLE_BONUS', 600, 'same')]],
  ['shoot princess carriers', [d('D', 'CANNON_SHOOT_PRINCESS_CARRIER_BONUS', 900, 'a carried princess decides the battle')]],
];

// Random scalings of a few related keys of one profile, for when the hypotheses run out.
const rng = () => { state.rng = (state.rng + 0x6d2b79f5) >>> 0; let t = state.rng; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32; };
const pick = list => list[Math.floor(rng() * list.length)];
const game = await loadGame();
const base = Object.fromEntries(Object.values(NAME).map(p => [p, aiProfiles.values(game, p)]));
const current = (profile, key) => state.best.find(x => x.profile === profile && x.key === key)?.value ?? base[profile][key];
function mutation() {
  const profile = pick(['AISD', 'AISD', 'AISD', 'AISGTP', 'AISGH', 'AISROP']);
  const keys = Object.keys(base[profile]).filter(k => !/SEGMENTATION|_RANDOM|DISTANCE_TO_MOVEMENT/.test(k) && current(profile, k) !== 0);
  const group = pick([...new Set(keys.map(k => k.split('_')[0]))]);
  const chosen = [];
  const pool = keys.filter(k => k.split('_')[0] === group);
  for (let i = 0; i < 1 + Math.floor(rng() * 3) && pool.length; i++) chosen.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
  const f = pick([0.5, 0.7, 1.4, 2]);
  const name = `scale ${group} keys of ${profile} by ${f}`;
  return [name, chosen.map(k => { const v = current(profile, k); let n = Math.round(v * f); if (n === v) n = v + Math.sign(v); return { profile, key: k, value: n, why: `random scaling ${f} of ${k}` }; })];
}

const merge = (best, extra) => { const out = best.filter(b => !extra.some(e => e.profile === b.profile && e.key === b.key)); return [...out, ...extra]; };

// Plays `candidate` against `baseline` (an array of changes, or null for the game's own profiles).
function play(label, candidate, baseline, battles) {
  const cand = path.join(dir, `${label}-cand.json`), basef = path.join(dir, `${label}-base.json`), out = path.join(dir, `${label}.json`);
  fs.writeFileSync(cand, JSON.stringify(candidate)); fs.writeFileSync(basef, JSON.stringify(baseline ?? []));
  const args = ['--env-file-if-exists=.env', 'tools/selfplay.mjs', '--battles', battles, '--lanes', LANES, '--speed', SPEED, '--timeout', 8,
    '--seed', String(Math.floor(rng() * 2 ** 31)), '--candidate', cand, '--baseline', basef, '--same-hero', '--out', out];
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'ignore', 'inherit'] });
    child.on('exit', () => {
      if (!fs.existsSync(out)) return reject(new Error(`${label}: the self-play run left no result`));
      const { results } = JSON.parse(fs.readFileSync(out, 'utf8'));
      const decided = results.filter(r => r.winner);
      resolve({ decided: decided.length, wins: decided.filter(r => r.winner === 'candidate').length, of: results.length });
    });
  });
}
const pct = (w, n) => (n ? `${w}/${n} (${(100 * w / n).toFixed(0)}%)` : 'none decided');

if (arg('stack', '')) {
  const all = HYPOTHESES.reduce((best, [, extra]) => merge(best, extra), []);
  const r = await play('stack', all, null, +arg('stack', 30));
  fs.writeFileSync(path.join(dir, 'stack.json'), JSON.stringify(all, null, 1));
  console.log(`all ${HYPOTHESES.length} hypotheses (${all.length} changes) against the game's own profiles: ${pct(r.wins, r.decided)}`);
  process.exit(0);
}

const started = Date.now();
log(`\n## Run ${new Date().toISOString()} (battles ${BATTLES}, accept ${ACCEPT}, speed ${SPEED}x, ${LANES} lanes)`);
let evalsSinceCheck = 0, changed = false;
const check = async () => {
  const r = await play(`check${state.checks.length + 1}`, state.best, null, CHECK_BATTLES);
  const rate = r.decided ? r.wins / r.decided : 0;
  state.checks.push({ evals: state.evals, rate, wins: r.wins, decided: r.decided, changes: state.best.length });
  log(`CHECK ${state.checks.length}: best (${state.best.length} changes) against the game's own profiles: ${pct(r.wins, r.decided)}`);
  save();
  const n = state.checks.length;
  return n >= 3 && state.checks[n - 1].rate - state.checks[n - 2].rate < PLATEAU && state.checks[n - 2].rate - state.checks[n - 3].rate < PLATEAU;
};

let plateau = false;
while (!plateau && state.evals < MAX_EVALS && Date.now() - started < MAX_MS) {
  const index = state.tried.length;
  let [name, extra] = index < HYPOTHESES.length ? HYPOTHESES[index] : mutation();
  while (!extra.length) [name, extra] = mutation();
  const candidate = merge(state.best, extra);
  try { aiProfiles.apply(game, candidate); } catch (e) { log(`SKIP ${name}: ${e.message}`); state.tried.push({ name, skipped: true }); save(); continue; }
  const r = await play(`eval${state.evals + 1}`, candidate, state.best, BATTLES);
  state.evals++;
  const rate = r.decided ? r.wins / r.decided : 0;
  const ok = r.decided >= BATTLES * 0.75 && rate >= ACCEPT;
  state.tried.push({ name, extra, wins: r.wins, decided: r.decided, accepted: ok });
  log(`${ok ? 'ACCEPT' : 'reject'} ${name}: ${pct(r.wins, r.decided)} against the best so far`);
  if (ok) { state.best = candidate; changed = true; }
  evalsSinceCheck++;
  save();
  if (evalsSinceCheck >= CHECK_EVERY && changed) { plateau = await check(); evalsSinceCheck = 0; changed = false; }
}
if (changed && !plateau) plateau = await check();
log(plateau ? 'Stopped: two checks in a row improved by less than the plateau.' : state.evals >= MAX_EVALS ? 'Stopped: --max-evals.' : 'Paused: --max-minutes; run again to resume.');
log(`Best so far has ${state.best.length} changes (${state.evals} candidates tried).`);
process.exit(0);
