// Boots the game, runs N ticks, then prints the address of every instruction in one more tick
// (as original DLL addresses, 0x10xxxxxx) and the JS-handled calls it makes.
import fs from 'fs';
import path from 'path';
import { GameHost } from '../emu/host.js';

const dir = 'tmp/ResetGeneration-Standalone/ResetGeneration';
const warm = +(process.argv[2] || 60);
const files = {};
for (const f of fs.readdirSync(dir)) files[f] = new Uint8Array(fs.readFileSync(path.join(dir, f)));
const g = new GameHost(files, { log: s => console.log('  log:', s) });
g.boot();
for (let i = 1; i <= warm; i++) g.tick(i * 33);
const cpu = g.m.cpu, base = g.m.pe.base, va = a => ((a >>> 0) - base + 0x10000000).toString(16);
const seen = [];
const run = cpu.run.bind(cpu);
cpu.run = function (max) {
  // Single-step so each eip can be recorded.
  let n = 0;
  while (n < max && !this.stop) { seen.push(this.eip >>> 0); run(1); n++; }
  return n;
};
g.tick((warm + 1) * 33);
const inImage = a => a >= base && a < base + g.m.pe.size;
let line = [];
for (const a of seen) {
  line.push(inImage(a) ? va(a) : `[trap ${a.toString(16)}]`);
  if (line.length === 12) { console.log(line.join(' ')); line = []; }
}
console.log(line.join(' '));
