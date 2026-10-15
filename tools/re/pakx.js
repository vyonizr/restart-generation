// Extracts a Reset Generation .pak: u32 dirSize, u32 count, count x {u32 hash, u32 a, u32 b, u8 flag, u32 c}.
// Tries the plausible (offset, length, size) assignments with raw deflate, zlib and stored data.
// Usage: node pakx.js <file.pak> <outdir>
const fs = require('fs');
const zlib = require('zlib');
const [file, outdir] = process.argv.slice(2);
const b = fs.readFileSync(file);
const count = b.readUInt32LE(4);
fs.mkdirSync(outdir, { recursive: true });
let o = 8, ok = 0;
for (let i = 0; i < count; i++, o += 17) {
  const e = { hash: b.readUInt32LE(o), a: b.readUInt32LE(o + 4), b: b.readUInt32LE(o + 8), flag: b[o + 12], c: b.readUInt32LE(o + 13) };
  let data = null;
  for (const [off, len] of [[e.b, e.c], [e.b, e.a], [e.c, e.a], [e.a, e.c]]) {
    if (off + len > b.length) continue;
    const raw = b.subarray(off, off + len);
    for (const fn of [zlib.inflateRawSync, zlib.inflateSync]) { try { data = fn(raw); break; } catch {} }
    if (data) break;
  }
  if (!data && e.flag === 0 && e.b + e.a <= b.length) data = b.subarray(e.b, e.b + e.a);
  const name = `${i.toString().padStart(3, '0')}_${e.hash.toString(16)}`;
  if (data) { fs.writeFileSync(`${outdir}/${name}.bin`, data); ok++; }
  else console.log('failed', name, JSON.stringify(e));
}
console.log(`${ok}/${count} extracted`);
