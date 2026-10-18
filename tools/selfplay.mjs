// Self-play: a stock Bot against a candidate Bot, headless, one battle at a time (docs/adr/0010, ticket 06).
// The stock Bot runs the game's own AI profiles. The candidate runs them with a deltas file (the format of
// server/bot-ai.json). Each battle starts a throwaway gateway's two Bot engines (server/bot.mjs), which queue in
// ranked Quick Match like people and are seated at a 2-player table. Each engine reports its own result from
// the engine's rank table (rank 1 won); the server's guess (server/battle.js) isn't used.
//
// Usage: node --env-file=.env tools/selfplay.mjs [--battles 20] [--seed N] [--candidate deltas.json] [--timeout 20]
//   --candidate  AI profile changes for the candidate (default server/bot-ai.json)
//   --seed       picks each battle's two heroes and which Bot is queued first (default random, printed)
//   --timeout    minutes before a battle counts as undecided (default 20)
// Exit code 0 if the candidate won at least 70% of the decided battles, 1 if not, 2 on an error.
// Needs RG_GAME. Each engine holds 350 to 410 MB, so a battle needs about 1 GB. Battles run one after another:
// the server seats a queue of 4 at once, so two battles in parallel would mix their Bots.
import { spawn } from 'child_process';
import fs from 'fs';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { Worker } from 'worker_threads';
import aiProfiles from '../server/aiprofiles.js';

const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i < 0 ? fallback : process.argv[i + 1]; };
const BATTLES = +arg('battles', 20), TIMEOUT_MS = +arg('timeout', 20) * 60000, PASS = 0.7;
const SEED = +arg('seed', Math.floor(Math.random() * 2 ** 32)) >>> 0;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const candidateFile = path.resolve(arg('candidate', path.join(root, 'server', 'bot-ai.json')));
const candidate = aiProfiles.load(candidateFile);
const SIDES = { stock: [], candidate };
if (!process.env.RG_GAME) { console.error('set RG_GAME (npm run selfplay reads .env)'); process.exit(2); }
if (!candidate.length) console.log('The candidate has no changes, so this is stock against stock.');

// mulberry32: the same seed gives the same heroes and queue order.
let state = SEED;
const rand = () => { state = (state + 0x6d2b79f5) >>> 0; let t = state; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32; };

const freePort = () => new Promise(resolve => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'selfplay-'));
const [PORT, HTTP_PORT] = [await freePort(), await freePort()];
const lines = []; // the gateway's log
const gateway = spawn(process.execPath, [path.join(root, 'server', 'gateway.js')], {
  cwd: root, env: { ...process.env, PORT, HTTP_PORT, RG_ACCOUNTS: path.join(dir, 'accounts.json'), RG_GAME: '' } });
const feed = chunk => { for (const l of String(chunk).split('\n')) if (l.trim()) lines.push(l.trim()); };
gateway.stdout.on('data', feed); gateway.stderr.on('data', feed);
const quit = code => { gateway.kill(); fs.rmSync(dir, { recursive: true, force: true }); process.exit(code); };
process.on('SIGINT', () => quit(2));
gateway.on('exit', code => { if (code) { console.error(`gateway stopped (${code}):\n${lines.slice(-10).join('\n')}`); fs.rmSync(dir, { recursive: true, force: true }); process.exit(2); } });
for (let i = 0; !lines.some(l => l.includes('browser client on')); i++) { if (i > 100) { console.error('gateway did not start'); quit(2); } await sleep(100); }

// One battle: both Bots queue, the server seats them, and each engine reports the ranks. Resolves with
// { winner: 'stock' | 'candidate' | null, why, turns, seats: {stock: index, candidate: index} }.
function battle(n, heroes, first) {
  const url = `http://127.0.0.1:${HTTP_PORT}/snap`, bots = {}, got = {};
  const names = { stock: `Stock_${n}`, candidate: `Cand_${n}` };
  return new Promise(resolve => {
    const done = result => { clearTimeout(timer); for (const w of Object.values(bots)) w.terminate(); resolve(result); };
    const timer = setTimeout(() => done({ winner: null, why: `no result in ${TIMEOUT_MS / 60000} min (${Object.keys(got).join(', ') || 'neither'} reported)` }), TIMEOUT_MS);
    // The first Bot reaches Quick Match first, so it is queued, and usually seated, first.
    [first, first === 'stock' ? 'candidate' : 'stock'].forEach((side, i) => setTimeout(() => {
      const w = bots[side] = new Worker(new URL('../server/bot.mjs', import.meta.url), {
        workerData: { name: names[side], password: '', url, deltas: SIDES[side], hero: heroes[side], report: true } });
      w.on('message', m => {
        if (!m.ended || got[side]) return;
        got[side] = m.ended;
        if (got.stock && got.candidate) done(decide(got));
      });
      w.on('error', e => done({ winner: null, why: `${side} Bot stopped: ${e.message}` }));
      w.on('exit', () => { if (!got[side]) done({ winner: null, why: `${side} Bot exited before the battle ended` }); });
    }, i * 3000));
  });
}

// Both engines simulate the same battle, so their rank tables must agree; rank 1 is the winner.
function decide(got) {
  const a = got.stock, b = got.candidate;
  if (JSON.stringify(a.ranks) !== JSON.stringify(b.ranks)) return { winner: null, why: `the two engines disagree on the ranks: ${JSON.stringify(a.ranks)} / ${JSON.stringify(b.ranks)}` };
  const firsts = Object.keys(a.ranks).filter(i => a.ranks[i] === 1).map(Number);
  const seats = { stock: a.me, candidate: b.me };
  if (firsts.length !== 1) return { winner: null, why: `ranks don't name one winner: ${JSON.stringify(a.ranks)}`, seats };
  const winner = Object.keys(seats).find(s => seats[s] === firsts[0]);
  return winner ? { winner, turns: a.turn, seats } : { winner: null, why: `winner is player ${firsts[0]}, neither Bot`, seats };
}

const results = [], t0 = Date.now();
console.log(`seed ${SEED}, ${BATTLES} battles, candidate ${candidate.length ? candidateFile : 'none'}`);
for (let n = 1; n <= BATTLES; n++) {
  const heroes = { stock: Math.floor(rand() * 10), candidate: Math.floor(rand() * 10) }, first = rand() < 0.5 ? 'stock' : 'candidate';
  const mark = lines.length, started = Date.now();
  const r = await battle(n, heroes, first);
  // The gateway logs "<name> joined the battle as player N (<hero>)": the hero names as the server saw them.
  const hero = side => lines.slice(mark).map(l => new RegExp(`${side === 'stock' ? 'Stock' : 'Cand'}_${n} joined the battle as player \\d+ \\((.*)\\)`).exec(l)?.[1]).find(Boolean) ?? `hero ${heroes[side]}`;
  const row = { n, ...r, heroes: { stock: hero('stock'), candidate: hero('candidate') }, seconds: Math.round((Date.now() - started) / 1000) };
  results.push(row);
  console.log(`battle ${n}: ${r.winner ?? 'undecided'}${r.turns ? ` in ${r.turns} turns` : ''}; stock ${row.heroes.stock} (seat ${r.seats?.stock ?? '?'}), candidate ${row.heroes.candidate} (seat ${r.seats?.candidate ?? '?'}); ${row.seconds} s${r.why ? `; ${r.why}` : ''}`);
  await sleep(1000);
}

const decided = results.filter(r => r.winner), wins = side => decided.filter(r => r.winner === side).length;
const tally = (key, of) => { const t = {}; for (const r of decided) for (const side of ['stock', 'candidate']) { const k = of(r, side); (t[k] ??= [0, 0])[1]++; if (r.winner === side) t[k][0]++; } return t; };
const show = t => Object.entries(t).sort().map(([k, [w, g]]) => `${k} ${w}/${g}`).join(', ');
console.log(`\nDecided ${decided.length} of ${BATTLES} battles in ${Math.round((Date.now() - t0) / 60000)} min.`);
console.log(`Candidate won ${wins('candidate')}, stock won ${wins('stock')}${decided.length ? ` (candidate ${(100 * wins('candidate') / decided.length).toFixed(0)}%)` : ''}.`);
console.log(`Wins by seat (player index): ${show(tally('seat', (r, side) => r.seats[side]))}`);
console.log(`Wins by hero, either side: ${show(tally('hero', (r, side) => r.heroes[side]))}`);
const pass = decided.length > 0 && wins('candidate') / decided.length >= PASS;
console.log(pass ? `Passes: the candidate won at least ${PASS * 100}% of the decided battles.` : `Does not pass: the gate is ${PASS * 100}% of the decided battles.`);
quit(pass ? 0 : 1);
