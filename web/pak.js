// The game's .pak archives (layout: tools/re/pakx.js): u32 dirSize, u32 count, count x {u32 hash, u32 packed, u32 size, u8 deflated,
// u32 offset}. Entries are found by the hash of their path. Shared by the server (server/pak.js, web/bundle.js) and the page, which
// reads the curtain from the player's own copy (web/ui/curtain.js) and packs the paks a server sends again (web/bundle.js).

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

const ROW = 17;
const through = async (data, stream) => new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(stream)).arrayBuffer());

// Every directory row: { packed, size, deflated, offset }.
function rows(bytes) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), count = dv.getUint32(4, true), out = [];
  for (let i = 0, o = 8; i < count; i++, o += ROW) out.push({ packed: dv.getUint32(o + 4, true), size: dv.getUint32(o + 8, true), deflated: bytes[o + 12] !== 0, offset: dv.getUint32(o + 13, true) });
  return out;
}

// A pak with the same directory, in the same order, holding `bodies`: deflated where `deflated[i]`, else stored. Bodies follow the
// directory in row order, with nothing between them.
function build(bytes, entries, bodies, deflated) {
  const head = 8 + ROW * entries.length, out = new Uint8Array(head + bodies.reduce((n, b) => n + b.length, 0));
  out.set(bytes.subarray(0, head));
  const dv = new DataView(out.buffer);
  dv.setUint32(0, head, true);
  let at = head;
  bodies.forEach((b, i) => {
    const o = 8 + ROW * i;
    dv.setUint32(o + 4, b.length, true); dv.setUint32(o + 8, entries[i].size, true); out[o + 12] = deflated[i] ? 1 : 0; dv.setUint32(o + 13, at, true);
    out.set(b, at); at += b.length;
  });
  return out;
}

// The pak with every deflated entry stored, for sending: a compressor over the whole file finds far more in the entries' own bytes
// than in their deflate streams. `zlib` and `raw` list the rows that were deflated, by index, in each format, for repackPak.
export async function unpackPak(bytes) {
  const entries = rows(bytes), zlib = [], raw = [], bodies = [];
  for (const [i, e] of entries.entries()) {
    if (!e.deflated) { bodies.push(bytes.subarray(e.offset, e.offset + e.size)); continue; }
    const packed = bytes.subarray(e.offset, e.offset + e.packed);
    let data = null;
    for (const [format, list] of [['deflate', zlib], ['deflate-raw', raw]]) {
      try { data = await through(packed, new DecompressionStream(format)); } catch { data = null; }
      if (data?.length === e.size) { list.push(i); break; }
      data = null;
    }
    if (!data) throw new Error(`pak row ${i}: can't unpack it`);
    bodies.push(data);
  }
  return { bytes: build(bytes, entries, bodies, entries.map(() => false)), zlib, raw };
}

// The pak unpackPak made, with the rows in `zlib` and `raw` deflated again in their format. The deflate streams differ from the
// original's, but every entry reads the same.
export async function repackPak(bytes, { zlib = [], raw = [] }) {
  const entries = rows(bytes), format = new Map([...zlib.map(i => [i, 'deflate']), ...raw.map(i => [i, 'deflate-raw'])]), bodies = [];
  for (const [i, e] of entries.entries()) {
    const data = bytes.subarray(e.offset, e.offset + e.size);
    bodies.push(format.has(i) ? await through(data, new CompressionStream(format.get(i))) : data);
  }
  return build(bytes, entries, bodies, entries.map((_, i) => format.has(i)));
}
