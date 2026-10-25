// Plays into an Arcade battle with and without the JS fast paths (shared/emu/fast.js) in lockstep and
// reports the first tick where registers, flags, pixels, sound or memory differ. Memory below ESP is skipped:
// the guest's own calls leave scratch there that the fast paths don't reproduce. Sound is pulled as the page
// does (one 64 ms block per 64 ms of game time): without it the battle doesn't get as far, and some drawing never runs.
// With a scenario, both engines play wide-test's keys into a local 4-player Arcade battle with the UNLOCKS patches and
// the Full board's hooks, on the Full board or on Classic, through one of a battle's cut-ins (docs/re/re_screen.md
// "What goes through the curtain"), and the run reports the ticks the cut-in played.
// Usage: node tools/emu/fasttest.mjs [ticks]
//        node tools/emu/fasttest.mjs fight|rescue full|classic [ticks]
import crypto from 'crypto';
import { loadGame } from '../../shared/game.mjs';
import { GameHost, VK, UNLOCKS } from '../../shared/emu/host.js';

// wide-test's keys up to the battle's first move.
const BATTLE = [[100, 'ESCAPE'], [150, 'CONTROL'], [190, 'DOWN'], [220, 'DOWN'], [250, 'CONTROL'], [320, 'CONTROL'], [380, 'CONTROL'],
  [440, 'CONTROL'], [500, 'CONTROL'], [560, 'CONTROL'], [600, 'UP'], [640, 'CONTROL'], [720, 'CONTROL'], [780, 'CONTROL'], [840, 'CONTROL'], [900, 'CONTROL']];
// Each scenario's keys, the tick it runs to by default, and whether its cut-in is on in a battle view bv.
const SCENARIOS = {
  // The local hero walks 3 cells right on its first move and confirms its second without moving, so red's hero, next to
  // it, attacks it: the fight cut-in's state (bv+0x29c, +0x14) is 1 on ticks 4602-4772.
  fight: { ticks: 4800, keys: [...BATTLE, [1676, 'RIGHT'], [1687, 'RIGHT'], [1692, 'RIGHT'], [1717, 'CONTROL'], [4450, 'CONTROL']],
    on: (rd, bv) => rd(rd(bv + 0x29c) + 0x14) === 1 },
  // wide-test's keys: a princess rescued, the rescue's state (bv+0x2a0, +0x8) not 0 on ticks 6791-6932.
  rescue: { ticks: 7000, keys: [...BATTLE, [1280, 'ESCAPE'], [1330, 'ESCAPE']], on: (rd, bv) => rd(rd(bv + 0x2a0) + 8) !== 0 },
};
const args = process.argv.slice(2), scenario = SCENARIOS[args[0]] && SCENARIOS[args.shift()], view = scenario && args.shift();
if (scenario && view !== 'full' && view !== 'classic') { console.log('usage: node tools/emu/fasttest.mjs [fight|rescue full|classic] [ticks]'); process.exit(2); }
const ticks = +(args[0] || (scenario ? scenario.ticks : 2200));
// Title, main menu, Arcade Mode, character, random opponents, Start.
const keys = new Map(scenario ? scenario.keys : [[620, 'CONTROL'], [700, 'CONTROL'], [820, 'DOWN'], [840, 'DOWN'], [860, 'CONTROL'], [1120, 'CONTROL'],
  [1220, 'CONTROL'], [1320, 'CONTROL'], [1620, 'UP'], [1640, 'CONTROL'], [1800, 'CONTROL'], [1900, 'CONTROL']]);
// rdtsc and GetSystemTimeAsFileTime read the wall clock, so pin it; clock() times the runs.
const clock = performance.now.bind(performance);
performance.now = Date.now = () => 0;
const files = await loadGame();
const engine = fast => new GameHost(files, scenario ? { fast, patches: UNLOCKS, board: true, warn: m => { throw new Error(m); } } : { fast });
const a = engine(false), b = engine(true);
a.boot(); b.boot();
if (scenario) a.fullBoard = b.fullBoard = view === 'full';
const pulled = new Map([[a, 0], [b, 0]]), sound = new Map([[a, []], [b, []]]);
const step = (g, i) => {
  const k = keys.get(i); if (k) { g.key(true, VK[k]); g.tick(); g.key(false, VK[k]); } g.tick();
  while (pulled.get(g) * 64 < g.time) { sound.get(g).push(g.pullSound().join(',')); pulled.set(g, pulled.get(g) + 1); }
};
const state = g => {
  const c = g.m.cpu; c.materialize();
  return JSON.stringify({ r: [...c.r], eip: c.eip >>> 0, fl: c.lflags, now: g.m.win.now });
};
const hash = (m, from, to) => crypto.createHash('sha1').update(m.subarray(from, to)).digest('hex');
// The CRT security cookie (0x101b725c) is seeded from the wall clock, so it differs between runs.
const cookie = a.m.addr(0x101b725c);
const memHash = g => {
  const m = g.m.cpu.m8, esp = g.m.cpu.r[4] >>> 0; m.fill(0, cookie, cookie + 4);
  return hash(m, 0, 0x100000) + hash(m, esp, g.m.heap.top);
};
// The game object (0x101b828c) and its battle view (+0x9c), to tell when the scenario's cut-in plays.
const rdA = x => a.m.cpu.rd32(x) >>> 0, app = rdA(a.m.addr(0x101b828c));
let ta = 0, tb = 0, first = 0, last = 0;
for (let i = 1; i <= ticks; i++) {
  let t = clock(); step(a, i); ta += clock() - t;
  t = clock(); step(b, i); tb += clock() - t;
  const sa = state(a), sb = state(b);
  if (sa !== sb) { console.log(`tick ${i}: CPU state differs\n slow ${sa}\n fast ${sb}`); process.exit(1); }
  if (sound.get(a).join(';') !== sound.get(b).join(';')) { console.log(`tick ${i}: sound differs`); process.exit(1); }
  sound.get(a).length = 0; sound.get(b).length = 0;
  if (hash(new Uint8Array(a.pixels.buffer, a.pixels.byteOffset, a.pixels.byteLength)) !==
    hash(new Uint8Array(b.pixels.buffer, b.pixels.byteOffset, b.pixels.byteLength))) { console.log(`tick ${i}: pixels differ`); process.exit(1); }
  const bv = scenario ? rdA(app + 0x9c) : 0;
  if (bv && scenario.on(rdA, bv)) { first ||= i; last = i; }
  if (i % 100 === 0 || i === ticks) {
    if (memHash(a) !== memHash(b)) { console.log(`tick ${i}: memory differs`); process.exit(1); }
    console.log(`tick ${i}: identical (slow ${ta.toFixed(0)} ms, fast ${tb.toFixed(0)} ms)`);
  }
}
if (scenario) console.log(first ? `the cut-in played on ticks ${first}-${last}` : 'the cut-in didn\'t play');
