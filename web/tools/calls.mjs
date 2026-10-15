// Logs every function called (as original 0x10xxxxxx addresses, indented by stack depth) during
// tick N. Usage: node web/tools/calls.mjs <tick> [maxLines]
import fs from 'fs';
import path from 'path';
import { GameHost } from '../emu/host.js';

const dir = 'tmp/ResetGeneration-Standalone/ResetGeneration';
const which = +(process.argv[2] || 5), maxLines = +(process.argv[3] || 400);
const files = {};
for (const f of fs.readdirSync(dir)) files[f] = new Uint8Array(fs.readFileSync(path.join(dir, f)));
const g = new GameHost(files, { log: s => console.log('  log:', s) });
g.boot();
for (let i = 1; i < which; i++) g.tick(i * 33);
const cpu = g.m.cpu, base = g.m.pe.base, va = a => ((a >>> 0) - base + 0x10000000).toString(16);
const run = cpu.run.bind(cpu), top = cpu.r[4];
let lines = 0;
cpu.run = function (max) {
  let n = 0;
  while (n < max && !this.stop) {
    const eip = this.eip >>> 0, b = this.m8[eip], b2 = this.m8[eip + 1];
    const isCall = b === 0xe8 || (b === 0xff && ((b2 >> 3) & 7) === 2);
    run(1); n++;
    if (isCall && lines < maxLines) {
      const depth = Math.max(0, ((top - this.r[4]) >> 2) / 8) | 0;
      const t = this.eip >>> 0, name = this.traps.has(t) ? `trap@${t.toString(16)}` : va(t);
      console.log(' '.repeat(Math.min(depth, 40)) + name);
      lines++;
    }
  }
  return n;
};
g.tick(which * 33);
