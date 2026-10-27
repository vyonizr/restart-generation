// Speed budgets for the moments a slow device drops frames in: the first frame of each battle animation, which loads its
// pictures (docs/re/re_loading.md), and the worst frame of a battle. Plays each scenario (scenarios.mjs) with the fast paths,
// as the page does, and counts the guest instructions each tick runs: a count is the same on every machine, unlike its
// time. Fails when a count is more than 5% over tools/emu/perf-baseline.json, then checks that the fast paths leave every
// frame as the guest would (fasttest.mjs, each scenario on both views at once). --update writes the counts to the
// baseline instead and skips that check. With --replay <id>, it also plays a replay from this machine's data/ (one only
// a development server keeps, so it can't be committed) at normal speed on Classic and reports its counts, without a budget.
// Usage: node tools/emu/perftest.mjs [--update] [--replay <id>]
import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { loadGame } from '../../shared/game.mjs';
import { GameHost } from '../../shared/emu/host.js';
import { SCENARIOS, pinClock, scenarioEngine, playTick, animations } from './scenarios.mjs';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BASELINE = path.join(root, 'tools', 'emu', 'perf-baseline.json');
const TOLERANCE = 1.05;
const args = process.argv.slice(2), update = args.includes('--update'), replayId = args.includes('--replay') && args[args.indexOf('--replay') + 1];

// Runs tick(i) for i = 1..ticks on g and returns what the counts are made of: each animation's first tick (named by its
// kind and the order it started in, as chain#3), the worst tick, and all the battle's instructions.
const measure = (g, tick, ticks) => {
  const cpu = g.m.cpu, started = { chain: 0, fight: 0, rescue: 0 }, moments = {};
  let was = { chain: false, fight: false, rescue: false }, worst = 0, total = 0;
  for (let i = 1; i <= ticks; i++) {
    const before = cpu.icount;
    if (tick(i) === false) break;
    const n = cpu.icount - before, now = animations(g);
    if (!now) continue; // not in a battle
    total += n;
    if (n > worst) worst = n;
    for (const kind of Object.keys(started)) {
      if (now[kind] && !was[kind]) moments[`${kind}#${++started[kind]}`] = n;
    }
    was = now;
  }
  return { ...moments, worst, total };
};

pinClock();
const files = await loadGame();
const counts = {};
for (const name of Object.keys(SCENARIOS)) {
  for (const view of ['classic', 'full']) {
    const scenario = SCENARIOS[name], keys = new Map(scenario.keys), pulled = new Map();
    const g = scenarioEngine(files, view);
    counts[`${name} ${view}`] = measure(g, i => playTick(g, keys, i, pulled), scenario.ticks);
  }
}

const mi = n => `${(n / 1e6).toFixed(2)} Mi`;
let failed = 0;
if (update) {
  fs.writeFileSync(BASELINE, JSON.stringify(counts, null, 2) + '\n');
  console.log(`wrote ${path.relative(root, BASELINE)}`);
} else {
  const baseline = JSON.parse(fs.readFileSync(BASELINE, 'utf8'));
  for (const [run, got] of Object.entries(counts)) {
    for (const [what, n] of Object.entries(got)) {
      const budget = baseline[run]?.[what];
      if (budget === undefined) { console.log(`${run} ${what}: ${mi(n)}, not in the baseline (npm run test:perf -- --update)`); failed++; continue; }
      const over = n > budget * TOLERANCE, under = n < budget / TOLERANCE;
      if (over) failed++;
      console.log(`${run} ${what}: ${mi(n)} against ${mi(budget)}${over ? ' OVER BUDGET' : under ? ' (faster: update the baseline)' : ''}`);
    }
    for (const what of Object.keys(baseline[run] ?? {})) if (!(what in got)) { console.log(`${run} ${what}: didn't happen`); failed++; }
  }
}

if (replayId) {
  const dbs = ['data/replays-names.db', 'data/replays.db', 'data/dev/replays-names.db', 'data/dev/replays.db'].map(f => path.join(root, f));
  const row = dbs.filter(f => fs.existsSync(f)).map(f => new DatabaseSync(f, { readOnly: true }).prepare('SELECT text FROM replays WHERE id = ?').get(replayId)).find(Boolean);
  if (!row) { console.log(`replay ${replayId}: not in data/`); process.exit(1); }
  const g = new GameHost(files, { replay: row.text, warn: () => {} });
  g.boot();
  const pulled = new Map(), logic = () => g.replayLogic;
  // Over once the clock reaches the end, nothing is left to animate and the logic says it's finished (tools/playreplay.mjs).
  const got = measure(g, () => {
    g.tick();
    while ((pulled.get(g) ?? 0) * 64 < g.time) { g.pullSound(); pulled.set(g, (pulled.get(g) ?? 0) + 1); }
    return !(g.replayLoaded && g.replayTime >= g.replayLength && !g.replayAnimating && g.m.cpu.m8[logic() + 0x28]);
  }, 60000);
  for (const [what, n] of Object.entries(got)) console.log(`replay ${replayId} ${what}: ${mi(n)}`);
}

if (!update) {
  const runs = Object.keys(SCENARIOS).flatMap(name => ['classic', 'full'].map(view => [name, view]));
  const results = await Promise.all(runs.map(([name, view]) => new Promise(done => {
    const p = spawn(process.execPath, [path.join(root, 'tools', 'emu', 'fasttest.mjs'), name, view], { stdio: ['ignore', 'pipe', 'inherit'] });
    let out = '';
    p.stdout.on('data', d => { out += d; });
    p.on('close', code => done({ name, view, code, last: out.trim().split('\n').filter(l => !/: identical/.test(l)).join('\n') }));
  })));
  for (const { name, view, code, last } of results) {
    console.log(`fasttest ${name} ${view}: ${code === 0 ? 'every frame the same' : 'DIFFERS'}\n  ${last.replace(/\n/g, '\n  ')}`);
    if (code !== 0) failed++;
  }
}

if (failed) { console.log(`${failed} failed`); process.exit(1); }
console.log('perf ok');
