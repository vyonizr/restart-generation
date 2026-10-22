// Plays into an Arcade battle with and without the JS fast paths (web/emu/fast.js) in lockstep and
// reports the first tick where registers, flags, pixels, sound or memory differ. Memory below ESP is skipped:
// the guest's own calls leave scratch there that the fast paths don't reproduce. Sound is pulled as the page
// does (one 64 ms block per 64 ms of game time): without it the battle doesn't get as far, and some drawing never runs.
// Usage: node web/tools/fasttest.mjs [ticks]
import crypto from 'crypto';
import { loadGame } from './game.mjs';
import { GameHost, VK } from '../emu/host.js';

const ticks = +(process.argv[2] || 2200);
// Title, main menu, Arcade Mode, character, random opponents, Start.
const keys = new Map([[620, 'CONTROL'], [700, 'CONTROL'], [820, 'DOWN'], [840, 'DOWN'], [860, 'CONTROL'], [1120, 'CONTROL'],
  [1220, 'CONTROL'], [1320, 'CONTROL'], [1620, 'UP'], [1640, 'CONTROL'], [1800, 'CONTROL'], [1900, 'CONTROL']]);
// rdtsc and GetSystemTimeAsFileTime read the wall clock, so pin it; clock() times the runs.
const clock = performance.now.bind(performance);
performance.now = Date.now = () => 0;
const files = await loadGame();
const a = new GameHost(files, { fast: false }), b = new GameHost(files, { fast: true });
a.boot(); b.boot();
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
let ta = 0, tb = 0;
for (let i = 1; i <= ticks; i++) {
  let t = clock(); step(a, i); ta += clock() - t;
  t = clock(); step(b, i); tb += clock() - t;
  const sa = state(a), sb = state(b);
  if (sa !== sb) { console.log(`tick ${i}: CPU state differs\n slow ${sa}\n fast ${sb}`); process.exit(1); }
  if (sound.get(a).join(';') !== sound.get(b).join(';')) { console.log(`tick ${i}: sound differs`); process.exit(1); }
  sound.get(a).length = 0; sound.get(b).length = 0;
  if (hash(new Uint8Array(a.pixels.buffer, a.pixels.byteOffset, a.pixels.byteLength)) !==
    hash(new Uint8Array(b.pixels.buffer, b.pixels.byteOffset, b.pixels.byteLength))) { console.log(`tick ${i}: pixels differ`); process.exit(1); }
  if (i % 100 === 0 || i === ticks) {
    if (memHash(a) !== memHash(b)) { console.log(`tick ${i}: memory differs`); process.exit(1); }
    console.log(`tick ${i}: identical (slow ${ta.toFixed(0)} ms, fast ${tb.toFixed(0)} ms)`);
  }
}
