// Prints instructions and the return value of each of the first N ticks.
import fs from 'fs';
import path from 'path';
import { GameHost } from '../emu/host.js';
const dir = 'tmp/ResetGeneration-Standalone/ResetGeneration';
const files = {};
for (const f of fs.readdirSync(dir)) files[f] = new Uint8Array(fs.readFileSync(path.join(dir, f)));
const g = new GameHost(files, { log: s => console.log('  log:', s) });
g.boot();
for (let i = 1; i <= +(process.argv[2] || 30); i++) {
  const before = g.m.cpu.icount, ret = g.tick(i * 33);
  console.log(`tick ${i}: ret=${ret} instr=${g.m.cpu.icount - before} now=${g.m.win.now}`);
}
