// Scripted battles for the emulator's checks (fasttest.mjs, perftest.mjs): wide-test's keys into a local 4-player Arcade
// battle with the UNLOCKS patches and the Full board's hooks, each played on a fixed schedule of key presses with the
// wall clock pinned, so every run of a scenario plays the same ticks.
import { GameHost, VK, UNLOCKS } from '../../shared/emu/host.js';

// wide-test's keys up to the battle's first move.
const BATTLE = [[100, 'ESCAPE'], [150, 'CONTROL'], [190, 'DOWN'], [220, 'DOWN'], [250, 'CONTROL'], [320, 'CONTROL'], [380, 'CONTROL'],
  [440, 'CONTROL'], [500, 'CONTROL'], [560, 'CONTROL'], [600, 'UP'], [640, 'CONTROL'], [720, 'CONTROL'], [780, 'CONTROL'], [840, 'CONTROL'], [900, 'CONTROL']];

// Each scenario's keys, the tick it runs to by default, and whether its cut-in is on in a battle view bv.
export const SCENARIOS = {
  // The local hero walks 3 cells right on its first move and confirms its second without moving, so red's hero, next to
  // it, attacks it: the fight cut-in's state (bv+0x29c, +0x14) is 1 on ticks 4602-4772.
  fight: { ticks: 4800, keys: [...BATTLE, [1676, 'RIGHT'], [1687, 'RIGHT'], [1692, 'RIGHT'], [1717, 'CONTROL'], [4450, 'CONTROL']],
    on: (rd, bv) => rd(rd(bv + 0x29c) + 0x14) === 1 },
  // wide-test's keys: a princess rescued, the rescue's state (bv+0x2a0, +0x8) not 0 on ticks 6791-6932.
  rescue: { ticks: 7000, keys: [...BATTLE, [1280, 'ESCAPE'], [1330, 'ESCAPE']], on: (rd, bv) => rd(rd(bv + 0x2a0) + 8) !== 0 },
};

// Pins the wall clock, which rdtsc and GetSystemTimeAsFileTime read, and returns the real one for timing runs.
export function pinClock() {
  const clock = performance.now.bind(performance);
  performance.now = Date.now = () => 0;
  return clock;
}

// An engine for a scenario, booted on the Full board or on Classic. warn throws: a patch that doesn't apply spoils the run.
export function scenarioEngine(files, view, fast = true) {
  const g = new GameHost(files, { fast, patches: UNLOCKS, board: true, warn: m => { throw new Error(m); } });
  g.boot();
  g.fullBoard = view === 'full';
  return g;
}

// Plays tick i of a key schedule on g, and pulls sound as the page does (one 64 ms block per 64 ms of game time): without
// it the battle doesn't get as far, and some drawing never runs. pulled maps each engine to the blocks it pulled; sound,
// if given, gets each block.
export function playTick(g, keys, i, pulled, sound) {
  const k = keys.get(i); if (k) { g.key(true, VK[k]); g.tick(); g.key(false, VK[k]); } g.tick();
  while ((pulled.get(g) ?? 0) * 64 < g.time) { const s = g.pullSound(); sound?.push(s.join(',')); pulled.set(g, (pulled.get(g) ?? 0) + 1); }
}

// The game object (0x101b828c) and its battle view (+0x9c), and the battle animations playing in it (docs/re/re_screen.md):
// the animation chain (intro, banners, special skills, item messages), the fight cut-in and the rescue.
export function animations(g) {
  const rd = x => g.m.cpu.rd32(x) >>> 0, bv = rd(rd(g.m.addr(0x101b828c)) + 0x9c);
  if (!bv) return null;
  return { chain: g.m.cpu.m8[rd(bv + 0x2a4) + 0x50] !== 0, fight: rd(rd(bv + 0x29c) + 0x14) === 1, rescue: rd(rd(bv + 0x2a0) + 8) !== 0 };
}
