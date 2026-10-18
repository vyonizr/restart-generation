// Reads and rewrites one entry of a Reset Generation .pak in memory (layout: tools/re/pakx.js and
// analysis/unpacked/INVENTORY.md): u32 dirSize, u32 count, count x {u32 hash, u32 packed, u32 size, u8 deflated, u32 offset}.
// Entries are found by the hash of their path.
const zlib = require('zlib');

// FUN_00197144 in the Mac dylib: uppercase a-z, '\' to '/', h += c * k, k = (k & 0xffff) * 18000 + (k >> 16), k starting at the length.
function hash(p) {
  let h = 0, k = p.length >>> 0;
  for (let c of Buffer.from(p, 'latin1')) {
    if (c >= 0x61 && c <= 0x7a) c -= 0x20;
    if (c === 0x5c) c = 0x2f;
    h = (h + Math.imul(c, k)) >>> 0;
    k = (Math.imul(k & 0xffff, 18000) + (k >>> 16)) >>> 0;
  }
  return h;
}

// The directory row of `path`, or null.
function find(buf, path) {
  const h = hash(path), count = buf.readUInt32LE(4);
  for (let i = 0, o = 8; i < count; i++, o += 17)
    if (buf.readUInt32LE(o) === h) return { row: o, packed: buf.readUInt32LE(o + 4), size: buf.readUInt32LE(o + 8), deflated: buf[o + 12] !== 0, offset: buf.readUInt32LE(o + 13) };
  return null;
}

// The bytes of `path` in the pak, or null if it has no such entry.
function read(pak, path) {
  const buf = Buffer.from(pak.buffer, pak.byteOffset, pak.byteLength), e = find(buf, path);
  if (!e) return null;
  if (!e.deflated) return buf.subarray(e.offset, e.offset + e.size);
  const packed = buf.subarray(e.offset, e.offset + e.packed);
  for (const inflate of [zlib.inflateSync, zlib.inflateRawSync]) {
    try { const data = inflate(packed); if (data.length === e.size) return data; } catch {}
  }
  throw new Error(`${path}: can't unpack the pak entry`);
}

// A copy of the pak whose `path` holds `data`. The new bytes go at the end, stored, and the entry's row points at
// them; the old bytes stay where they were, unused. `pak` itself isn't changed.
function replace(pak, path, data) {
  const buf = Buffer.from(pak.buffer, pak.byteOffset, pak.byteLength), e = find(buf, path);
  if (!e) throw new Error(`${path}: not in the pak`);
  const out = Buffer.concat([buf, data]);
  out.writeUInt32LE(data.length, e.row + 4);
  out.writeUInt32LE(data.length, e.row + 8);
  out[e.row + 12] = 0;
  out.writeUInt32LE(buf.length, e.row + 13);
  return new Uint8Array(out.buffer, out.byteOffset, out.length);
}

if (hash('data/levels/story/missions.xml') !== 0x6a38e2d5 || hash('filepack.list') !== 0xdd9d93e8) throw new Error('pak path hash broken');

module.exports = { hash, read, replace };
