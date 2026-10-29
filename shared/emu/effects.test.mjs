// Self-check for the effect-list patch (EFFECT_ONCE in host.js, docs/re/re_render.md "The battle view's effects"), on the engine
// of the copy in RG_GAME: npm run test:effects. A new effect is added once, at the end of the list, even when earlier entries are
// free; the stock engine also copies it into every free entry, which made a late egg hit draw its splat thousands of times a frame.
// check-paths: shared/emu/host.js
import assert from 'assert';
import { loadGame } from '../game.mjs';
import { GameHost } from './host.js';

const game = new GameHost(await loadGame(), { warn: m => { throw new Error(m); } });
game.boot();
const m = game.m, cpu = m.cpu, rd = a => cpu.rd32(a) >>> 0;
const COUNT = 0x31c, ENTRIES = 0x320, GROWS = 0x324, ENTRY = 0x1c;

// A battle view as far as the list goes: its count, its entries, and the flag that lets the list grow.
const view = m.heap.alloc(0x400);
cpu.m8[view + GROWS] = 1;
const add = (image, x, y) => {
  const ecx = cpu.r[1];
  cpu.r[1] = view;
  try { cpu.call(m.addr(0x1002ea10), [image, x, y, 7, 8, 9]); } finally { cpu.r[1] = ecx; }
};
const entry = i => {
  const e = rd(view + ENTRIES) + i * ENTRY;
  return { image: rd(e), x: rd(e + 4), y: rd(e + 8), a: rd(e + 0xc), b: rd(e + 0x10), c: rd(e + 0x14), age: rd(e + 0x18) };
};

for (let i = 0; i < 3; i++) add(0x1000 + i, i, i);
assert.deepStrictEqual([0, 1, 2].map(i => entry(i).image), [0x1000, 0x1001, 0x1002], 'each effect added to an empty list is appended');
// The first two effects end: their entries are free again, as the battle view leaves them.
for (const i of [0, 1]) cpu.wr32(rd(view + ENTRIES) + i * ENTRY, 0);

add(0x2000, 5, 6);
assert.strictEqual(rd(view + COUNT), 4, 'the list grows by one entry per effect, as on a stock engine');
assert.deepStrictEqual([0, 1, 2].map(i => entry(i).image), [0, 0, 0x1002], 'the free entries stay free and the live effect stays');
assert.deepStrictEqual(entry(3), { image: 0x2000, x: 5, y: 6, a: 7, b: 8, c: 9, age: 0 }, 'the new effect is the last entry');
console.log('ok: a new battle effect is set once, at the end of the list');
