// Self-play: a base Bot against a candidate Bot, headless (docs/adr/0012, ticket 06).
// The base Bot runs the game's own AI profiles, or the changes in --baseline. The candidate runs them with the changes in
// --candidate (the format of server/bot-ai.json). Each battle starts a throwaway gateway's two Bot engines
// (server/bot.mjs), which queue in ranked Quick Match like people and are seated at a 2-player table. Each engine
// reports its own result from the engine's rank table (rank 1 won); the server's guess (server/battle.js) isn't used.
//
// Usage: node --env-file=.env tools/selfplay.mjs [--battles 20] [--seed N] [--candidate deltas.json] [--baseline deltas.json]
//          [--lanes 1] [--speed 1] [--timeout 20] [--pass 0.7] [--same-hero] [--out results.json]
//   --candidate  AI profile changes for the candidate (default server/bot-ai.json)
//   --baseline   AI profile changes for the base Bot (default none: the game's own profiles)
//   --seed       picks each battle's two heroes and which Bot is queued first (default random, printed)
//   --lanes      battles run at once, each on its own throwaway gateway (default 1); each needs about 1 GB
//   --speed      how many times faster than real time the engines' clocks run (default 1)
//   --timeout    real minutes before a battle counts as undecided (default 20)
//   --pass       share of the decided battles the candidate must win to exit 0 (default 0.7)
//   --same-hero  both Bots play the same hero in a battle (a random one), so hero strength can't decide the result
//   --out        write the per-battle results as JSON
// Exit code 0 if the candidate passed, 1 if not, 2 on an error. Needs RG_GAME.
// A gateway seats a queue of 4 at once, so two battles on one gateway would mix their Bots; that is why each lane has its own.
import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';
import aiProfiles from '../server/aiprofiles.js';

// Low priority: a run takes the CPU nobody else wants and never starves the machine.
try { os.setPriority(os.constants.priority.PRIORITY_LOW); } catch { /* not allowed here; run at normal priority */ }

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i + 1]; };
const BATTLES = +arg('battles', 20), TIMEOUT_MS = +arg('timeout', 20) * 60000, PASS = +arg('pass', 0.7);
const WANTED_LANES = Math.max(1, +arg('lanes', 1)), SPEED = +arg('speed', 1), OUT = arg('out', ''), SAME_HERO = process.argv.includes('--same-hero');
// Never take more than the machine can spare: a lane needs about 1.2 GB and two busy threads, and the OS and the user's own
// programs keep 3 GB and three quarters of the threads. Asking for more is cut down, with a notice.
const LANES = Math.max(1, Math.min(WANTED_LANES, Math.floor((os.freemem() - 3e9) / 1.2e9), Math.floor(os.availableParallelism() / 4)));
if (LANES < WANTED_LANES) console.log(`Asked for ${WANTED_LANES} lanes; running ${LANES}, which is what the free memory and cores allow.`);
const SEED = +arg('seed', Math.floor(Math.random() * 2 ** 32)) >>> 0;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidateFile = path.resolve(arg('candidate', path.join(root, 'server', 'bot-ai.json')));
const baselineFile = arg('baseline', '') && path.resolve(arg('baseline', ''));
const SIDES = { base: baselineFile ? aiProfiles.load(baselineFile) : [], candidate: aiProfiles.load(candidateFile) };
if (!process.env.RG_GAME) { console.error('set RG_GAME (npm run selfplay reads .env)'); process.exit(2); }
if (JSON.stringify(SIDES.base) === JSON.stringify(SIDES.candidate)) console.log('Both sides have the same changes, so this is a mirror match.');
const other = side => (side === 'base' ? 'candidate' : 'base');
const label = { base: 'Base', candidate: 'Cand' };

// mulberry32: the same seed gives the same heroes and queue order.
let state = SEED;
const rand = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32; };

const freePort = () => new Promise(resolve => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const lanes = [];
const cleanup = () => { for (const l of lanes) l.stop(); };
const quit = code => { cleanup(); process.exit(code); };
process.on('SIGINT', () => quit(2));

// A throwaway gateway on free ports, with accounts in a temporary file.
async function startLane(id) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'selfplay-'));
  const [PORT, HTTP_PORT] = [await freePort(), await freePort()];
  const lines = []; // the gateway's log
  const gateway = spawn(process.execPath, [path.join(root, 'server', 'gateway.js')], {
    cwd: root, env: { ...process.env, PORT, HTTP_PORT, RG_DB: path.join(dir, 'accounts.db'), RG_GAME: '', RG_GATHER_MS: '500',
      // Name-only login: the harness's Bots have no tokens, so a Discord setting from .env must not reach this gateway.
      RG_DISCORD_CLIENT_ID: '', RG_DISCORD_CLIENT_SECRET: '', RG_PUBLIC_URL: '' } });
  const feed = chunk => { for (const l of String(chunk).split('\n')) if (l.trim()) { lines.push(l.trim()); if (process.env.SELFPLAY_LOG) console.log(`[${id}] ${l.trim()}`); } };
  gateway.stdout.on('data', feed); gateway.stderr.on('data', feed);
  let stopped = false;
  const lane = { id, lines, HTTP_PORT, stop() { stopped = true; gateway.kill(); try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }); } catch { /* a temp file the OS still holds; harmless */ } } };
  gateway.on('exit', code => { if (code && !stopped) { console.error(`lane ${id}: gateway stopped (${code}):\n${lines.slice(-10).join('\n')}`); quit(2); } });
  for (let i = 0; !lines.some(l => l.includes('browser client on')); i++) { if (i > 100) { console.error(`lane ${id}: gateway did not start`); quit(2); } await sleep(100); }
  lanes.push(lane);
  return lane;
}

// One battle on a lane: both Bots queue, the server seats them, and each engine reports the ranks. Resolves with
// { winner: 'base' | 'candidate' | null, why, turns, seats: {base: index, candidate: index} }.
function battle(lane, n, heroes, first) {
  const url = `http://127.0.0.1:${lane.HTTP_PORT}/snap`, bots = {}, got = {};
  const names = { base: `Base_${n}`, candidate: `Cand_${n}` };
  return new Promise(resolve => {
    const done = result => { clearTimeout(timer); for (const w of Object.values(bots)) w.terminate(); resolve(result); };
    const timer = setTimeout(() => done({ winner: null, why: `no result in ${TIMEOUT_MS / 60000} min (${Object.keys(got).join(', ') || 'neither'} reported)` }), TIMEOUT_MS);
    // The first Bot reaches Quick Match first, so it is queued, and usually seated, first.
    [first, other(first)].forEach((side, i) => setTimeout(() => {
      const w = bots[side] = new Worker(new URL('../server/bot.mjs', import.meta.url), {
        workerData: { name: names[side], password: '', url, deltas: SIDES[side], hero: heroes[side], report: true, speed: SPEED } });
      w.on('message', m => {
        if (!m.ended || got[side]) return;
        got[side] = m.ended;
        if (got.base && got.candidate) done(decide(got));
      });
      w.on('error', e => done({ winner: null, why: `${side} Bot stopped: ${e.message}` }));
      w.on('exit', () => { if (!got[side]) done({ winner: null, why: `${side} Bot exited before the battle ended` }); });
    }, i * 3000));
  });
}

// Both engines simulate the same battle, so their rank tables must agree; rank 1 is the winner.
function decide(got) {
  const a = got.base, b = got.candidate;
  if (JSON.stringify(a.ranks) !== JSON.stringify(b.ranks)) return { winner: null, why: `the two engines disagree on the ranks: ${JSON.stringify(a.ranks)} / ${JSON.stringify(b.ranks)}` };
  const firsts = Object.keys(a.ranks).filter(i => a.ranks[i] === 1).map(Number);
  const seats = { base: a.me, candidate: b.me };
  if (firsts.length !== 1) return { winner: null, why: `ranks don't name one winner: ${JSON.stringify(a.ranks)}`, seats };
  const winner = Object.keys(seats).find(s => seats[s] === firsts[0]);
  return winner ? { winner, turns: a.turn, seats } : { winner: null, why: `winner is player ${firsts[0]}, neither Bot`, seats };
}

// The whole schedule is drawn up front from the seed, so a run is the same list of matches whatever the lanes finish first.
const schedule = Array.from({ length: BATTLES }, (_, i) => {
  const a = Math.floor(rand() * 10), b = Math.floor(rand() * 10);
  return { n: i + 1, heroes: { base: a, candidate: SAME_HERO ? a : b }, first: rand() < 0.5 ? 'base' : 'candidate' };
});
const results = [], t0 = Date.now();
console.log(`seed ${SEED}, ${BATTLES} battles, ${LANES} lane${LANES > 1 ? 's' : ''}, speed ${SPEED}x, candidate ${path.basename(candidateFile)}, base ${baselineFile ? path.basename(baselineFile) : 'stock'}`);
await Promise.all(Array.from({ length: LANES }, (_, i) => startLane(i)));

let next = 0;
async function work(lane) {
  while (next < schedule.length) {
    const { n, heroes, first } = schedule[next++];
    const mark = lane.lines.length, started = Date.now();
    const r = await battle(lane, n, heroes, first);
    // The gateway logs "<name> joined the battle as player N (<hero>)": the hero names as the server saw them.
    const hero = side => lane.lines.slice(mark).map(l => new RegExp(`${label[side]}_${n} joined the battle as player \\d+ \\((.*)\\)`).exec(l)?.[1]).find(Boolean) ?? `hero ${heroes[side]}`;
    const row = { n, ...r, heroes: { base: hero('base'), candidate: hero('candidate') }, seconds: Math.round((Date.now() - started) / 1000) };
    results.push(row);
    console.log(`battle ${n}: ${r.winner ?? 'undecided'}${r.turns ? ` in ${r.turns} turns` : ''}; base ${row.heroes.base} (seat ${r.seats?.base ?? '?'}), candidate ${row.heroes.candidate} (seat ${r.seats?.candidate ?? '?'}); ${row.seconds} s${r.why ? `; ${r.why}` : ''}`);
    await sleep(1000);
  }
}
await Promise.all(lanes.map(work));

results.sort((a, b) => a.n - b.n);
if (OUT) fs.writeFileSync(OUT, JSON.stringify({ seed: SEED, speed: SPEED, candidate: SIDES.candidate, base: SIDES.base, results }, null, 1));
const decided = results.filter(r => r.winner), wins = side => decided.filter(r => r.winner === side).length;
const tally = (key, of) => { const t = {}; for (const r of decided) for (const side of ['base', 'candidate']) { const k = of(r, side); (t[k] ??= [0, 0])[1]++; if (r.winner === side) t[k][0]++; } return t; };
const show = t => Object.entries(t).sort().map(([k, [w, g]]) => `${k} ${w}/${g}`).join(', ');
console.log(`\nDecided ${decided.length} of ${BATTLES} battles in ${((Date.now() - t0) / 60000).toFixed(1)} min.`);
console.log(`Candidate won ${wins('candidate')}, base won ${wins('base')}${decided.length ? ` (candidate ${(100 * wins('candidate') / decided.length).toFixed(0)}%)` : ''}.`);
console.log(`Wins by seat (player index): ${show(tally('seat', (r, side) => r.seats[side]))}`);
console.log(`Wins by hero, either side: ${show(tally('hero', (r, side) => r.heroes[side]))}`);
const pass = decided.length > 0 && wins('candidate') / decided.length >= PASS;
console.log(pass ? `Passes: the candidate won at least ${PASS * 100}% of the decided battles.` : `Does not pass: the gate is ${PASS * 100}% of the decided battles.`);
quit(pass ? 0 : 1);
