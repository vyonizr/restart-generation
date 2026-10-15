// Reads a .zip file with the platform's DecompressionStream (browsers and Node 18+). Handles stored and
// deflated entries, which is what the game's standalone .zip uses; ZIP64 archives are not supported.

// Returns { path: Uint8Array } for the file entries whose path passes `keep`.
export async function unzip(bytes, keep = () => true) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let eocd = bytes.length - 22;
  while (eocd >= 0 && dv.getUint32(eocd, true) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a .zip file');
  const count = dv.getUint16(eocd + 10, true), out = {};
  for (let i = 0, p = dv.getUint32(eocd + 16, true); i < count; i++) {
    const method = dv.getUint16(p + 10, true), size = dv.getUint32(p + 20, true), nameLen = dv.getUint16(p + 28, true);
    const local = dv.getUint32(p + 42, true), name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
    if (name.endsWith('/') || !keep(name)) continue;
    const start = local + 30 + dv.getUint16(local + 26, true) + dv.getUint16(local + 28, true), data = bytes.subarray(start, start + size);
    if (method === 0) out[name] = data.slice();
    else if (method === 8) out[name] = new Uint8Array(await new Response(new Blob([data]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    else throw new Error(`${name}: unsupported compression method ${method}`);
  }
  return out;
}

// The game's files from a .zip of the standalone build: the entries in its ResetGeneration folder, by file name.
export async function gameFromZip(bytes) {
  const entries = await unzip(bytes, name => /(^|\/)ResetGeneration\/[^/]+$/i.test(name));
  return Object.fromEntries(Object.entries(entries).map(([name, data]) => [name.split('/').pop(), data]));
}
