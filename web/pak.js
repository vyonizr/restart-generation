// The game's .pak archives (layout: tools/re/pakx.js): u32 dirSize, u32 count, count x {u32 hash, u32 packed, u32 size, u8 deflated,
// u32 offset}. Entries are found by the hash of their path. Shared by the server (server/pak.js) and the page, which reads the
// curtain from the player's own copy (web/ui/curtain.js).

// FUN_00197144 in the Mac dylib: uppercase a-z, '\' to '/', h += c * k, k = (k & 0xffff) * 18000 + (k >> 16), k starting at the length.
// Paths are ASCII.
export function pathHash(path) {
  let h = 0, k = path.length >>> 0;
  for (let i = 0; i < path.length; i++) {
    let c = path.charCodeAt(i) & 0xff;
    if (c >= 0x61 && c <= 0x7a) c -= 0x20;
    if (c === 0x5c) c = 0x2f;
    h = (h + Math.imul(c, k)) >>> 0;
    k = (Math.imul(k & 0xffff, 18000) + (k >>> 16)) >>> 0;
  }
  return h;
}

// The directory row of `path` in the pak's bytes, or null: { row, packed, size, deflated, offset }.
export function pakEntry(bytes, path) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), h = pathHash(path), count = dv.getUint32(4, true);
  for (let i = 0, o = 8; i < count; i++, o += 17) {
    if (dv.getUint32(o, true) === h) return { row: o, packed: dv.getUint32(o + 4, true), size: dv.getUint32(o + 8, true), deflated: bytes[o + 12] !== 0, offset: dv.getUint32(o + 13, true) };
  }
  return null;
}

// The bytes of `path` in the pak, or null if it has no such entry; with the platform's DecompressionStream, as web/zip.js reads.
// A deflated entry is zlib-wrapped in the copies we've seen, raw in others.
export async function pakRead(bytes, path) {
  const e = pakEntry(bytes, path);
  if (!e) return null;
  if (!e.deflated) return bytes.subarray(e.offset, e.offset + e.size);
  const packed = bytes.subarray(e.offset, e.offset + e.packed);
  for (const format of ['deflate', 'deflate-raw']) {
    try {
      const data = new Uint8Array(await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream(format))).arrayBuffer());
      if (data.length === e.size) return data;
    } catch { /* the other format */ }
  }
  throw new Error(`${path}: can't unpack the pak entry`);
}
