// Headless run: boots the game, ticks it, presses keys on a schedule, and saves frames as PNG.
// Usage: node web/tools/run.mjs [ticks] [outdir] [keys]   keys like "300:CONTROL,360:DOWN"
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { loadGame } from './game.mjs';
import { GameHost, WIDTH, HEIGHT, VK } from '../emu/host.js';

const ticks = +(process.argv[2] || 200), out = process.argv[3] || 'tmp/frames';
const script = new Map((process.argv[4] || '').split(',').filter(Boolean).map(s => { const [t, k] = s.split(':'); return [+t, k]; }));
fs.mkdirSync(out, { recursive: true });

function png(file, px) {
  const raw = Buffer.alloc((WIDTH * 3 + 1) * HEIGHT);
  for (let y = 0; y < HEIGHT; y++) for (let x = 0; x < WIDTH; x++) {
    const v = px[y * WIDTH + x], o = y * (WIDTH * 3 + 1) + 1 + x * 3;
    raw[o] = (v >> 16) & 255; raw[o + 1] = (v >> 8) & 255; raw[o + 2] = v & 255;
  }
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(WIDTH); ihdr.writeUInt32BE(HEIGHT, 4); ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
}

const files = await loadGame();
const g = new GameHost(files, { log: s => console.log('  ', s) });
const t0 = performance.now();
try {
  g.boot();
  console.log(`booted: ${g.m.cpu.icount} instructions, ${(performance.now() - t0).toFixed(0)} ms`);
  for (let i = 1; i <= ticks; i++) {
    const k = script.get(i);
    if (k) { g.key(true, VK[k]); g.tick(); g.key(false, VK[k]); }
    const before = g.m.cpu.icount, ts = performance.now();
    g.tick();
    if (i % 50 === 0 || i === ticks) {
      png(path.join(out, `frame_${String(i).padStart(4, '0')}.png`), g.pixels);
      console.log(`tick ${i}: ${g.m.cpu.icount - before} instr, ${(performance.now() - ts).toFixed(1)} ms, game time ${g.time} ms`);
    }
  }
  console.log(`total ${g.m.cpu.icount} instructions in ${(performance.now() - t0).toFixed(0)} ms`);
} catch (e) {
  console.error(e.stack || e.message, `\nafter ${g.m?.cpu.icount} instructions, eip 0x${(g.m?.cpu.eip >>> 0).toString(16)}`);
  process.exitCode = 1;
}
