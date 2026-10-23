// Reads and rewrites one entry of a Reset Generation .pak in memory, synchronously (the layout and the path hash: web/pak.js).
const zlib = require('zlib');
const { pathHash: hash, pakEntry: find } = require('../web/pak.js');

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
