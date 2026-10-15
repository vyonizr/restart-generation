// Runs the game on the interpreter and on the block compiler in lockstep and reports the first tick
// where registers, flags, pixels or memory differ. Usage: node web/tools/difftest.mjs [ticks]
import { loadGame } from './game.mjs';
import crypto from 'crypto';
import { GameHost } from '../emu/host.js';

const ticks = +(process.argv[2] || 300);
const files = await loadGame();
const a = new GameHost(files, { jit: false }), b = new GameHost(files, { jit: true });
a.boot(); b.boot();
const state = g => {
  const c = g.m.cpu; c.materialize();
  return JSON.stringify({ r: [...c.r], eip: c.eip >>> 0, fl: c.lflags, df: c.df, fpu: [...c.fpu.st], top: c.fpu.top, now: g.m.win.now, heap: g.m.heap.top });
};
// The CRT security cookie (0x101b725c) is seeded from the wall clock, so it differs between runs.
const cookie = 0x101b725c - 0x10000000 + 0x400000;
const memHash = g => { const m = g.m.cpu.m8; m.fill(0, cookie, cookie + 4); return crypto.createHash('sha1').update(m.subarray(0, g.m.heap.top)).digest('hex'); };
let ta = 0, tb = 0;
for (let i = 1; i <= ticks; i++) {
  let t = performance.now(); a.tick(); ta += performance.now() - t;
  t = performance.now(); b.tick(); tb += performance.now() - t;
  const sa = state(a), sb = state(b);
  if (sa !== sb) { console.log(`tick ${i}: CPU state differs\n interp ${sa}\n jit    ${sb}`); process.exit(1); }
  if (i % 25 === 0 || i === ticks) {
    const ha = memHash(a), hb = memHash(b);
    if (ha !== hb) {
      const ma = a.m.cpu.m8, mb = b.m.cpu.m8, top = Math.max(a.m.heap.top, b.m.heap.top);
      const ranges = []; let start = -1;
      for (let k = 0; k <= top; k++) {
        const d = k < top && ma[k] !== mb[k];
        if (d && start < 0) start = k; else if (!d && start >= 0) { ranges.push([start, k]); start = -1; }
      }
      console.log(`tick ${i}: memory differs in ${ranges.length} ranges; esp=${(a.m.cpu.r[4] >>> 0).toString(16)}`);
      for (const [x, y] of ranges.slice(0, 20)) console.log(`  ${x.toString(16)}-${y.toString(16)}: ${[...ma.subarray(x, Math.min(y, x + 8))].map(v => v.toString(16)).join(' ')} vs ${[...mb.subarray(x, Math.min(y, x + 8))].map(v => v.toString(16)).join(' ')}`);
      process.exit(1);
    }
    console.log(`tick ${i}: identical (interp ${ta.toFixed(0)} ms, jit ${tb.toFixed(0)} ms, ${a.m.cpu.icount} instr)`);
  }
}
