// Counts which opcodes the block compiler sends to the interpreter, weighted by execution count.
import fs from 'fs';
import path from 'path';
import { GameHost } from '../emu/host.js';
import * as jit from '../emu/jit.js';

const dir = 'tmp/ResetGeneration-Standalone/ResetGeneration';
const files = {};
for (const f of fs.readdirSync(dir)) files[f] = new Uint8Array(fs.readFileSync(path.join(dir, f)));
const g = new GameHost(files);
g.boot();
const cpu = g.m.cpu, counts = new Map();
const decode = cpu.decode.bind(cpu);
cpu.decode = function (pc) {
  const f = decode(pc);
  let p = pc; const pre = [];
  while ([0x66, 0xf2, 0xf3, 0x64].includes(this.m8[p])) pre.push(this.m8[p++].toString(16));
  let key = pre.join(' ') + ' ' + this.m8[p].toString(16);
  if (this.m8[p] === 0x0f) key += ' ' + this.m8[p + 1].toString(16);
  else if ([0x80, 0x81, 0x83, 0xc1, 0xd1, 0xd3, 0xf6, 0xf7, 0xff, 0xfe, 0xc0, 0xd0, 0xd2].includes(this.m8[p])) key += ' /' + ((this.m8[p + 1] >> 3) & 7);
  if (pre.includes('f3') || pre.includes('f2')) key += ' rep';
  key = key.trim();
  return () => { counts.set(key, (counts.get(key) || 0) + 1); return f(); };
};
for (let i = 0; i < +(process.argv[2] || 600); i++) g.tick();
const total = cpu.icount;
console.log(`total ${total} instructions`);
[...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([k, n]) => console.log(`${(n / total * 100).toFixed(2).padStart(6)}%  ${k}`));
