// Minimal PE32 DLL loader: maps sections at a chosen base, applies base relocations, binds every
// import to a trap address handled in JavaScript, and returns the export table.
export function loadPE(cpu, bytes, base, bindImport) {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const pe = dv.getUint32(0x3c, true);
  if (dv.getUint32(pe, true) !== 0x4550) throw new Error('not a PE file');
  const nsec = dv.getUint16(pe + 6, true), optSize = dv.getUint16(pe + 20, true), opt = pe + 24;
  const prefBase = dv.getUint32(opt + 28, true), imageSize = dv.getUint32(opt + 56, true);
  const headerSize = dv.getUint32(opt + 60, true), entry = dv.getUint32(opt + 16, true);
  const dir = n => ({ rva: dv.getUint32(opt + 96 + n * 8, true), size: dv.getUint32(opt + 100 + n * 8, true) });

  const m8 = cpu.m8, mdv = cpu.dv;
  m8.set(bytes.subarray(0, headerSize), base);
  for (let i = 0; i < nsec; i++) {
    const s = pe + 24 + optSize + i * 40;
    const va = dv.getUint32(s + 12, true), rawSize = dv.getUint32(s + 16, true), raw = dv.getUint32(s + 20, true);
    m8.set(bytes.subarray(raw, raw + rawSize), base + va);
  }

  // Base relocations (IMAGE_REL_BASED_HIGHLOW only, which is all an x86 DLL uses).
  const delta = (base - prefBase) | 0, rel = dir(5);
  for (let blk = rel.rva; delta && blk < rel.rva + rel.size;) {
    const page = mdv.getUint32(base + blk, true), size = mdv.getUint32(base + blk + 4, true);
    for (let e = blk + 8; e < blk + size; e += 2) {
      const ent = mdv.getUint16(base + e, true), type = ent >> 12;
      if (type === 3) { const a = base + page + (ent & 0xfff); mdv.setInt32(a, (mdv.getInt32(a, true) + delta) | 0, true); }
      else if (type !== 0) throw new Error(`relocation type ${type}`);
    }
    blk += size;
  }

  // Imports: write a trap address for each name into the IAT.
  const imp = dir(1);
  for (let d = base + imp.rva; mdv.getUint32(d + 12, true); d += 20) {
    const dll = cpu.readCString(base + mdv.getUint32(d + 12, true)).toUpperCase();
    const lookup = mdv.getUint32(d, true) || mdv.getUint32(d + 16, true), iat = mdv.getUint32(d + 16, true);
    for (let k = 0; ; k++) {
      const t = mdv.getUint32(base + lookup + k * 4, true);
      if (!t) break;
      const name = t & 0x80000000 ? `#${t & 0xffff}` : cpu.readCString(base + t + 2);
      mdv.setUint32(base + iat + k * 4, bindImport(dll, name), true);
    }
  }

  const exports = new Map(), ex = dir(0);
  if (ex.size) {
    const e = base + ex.rva, n = mdv.getUint32(e + 24, true);
    const funcs = base + mdv.getUint32(e + 28, true), names = base + mdv.getUint32(e + 32, true), ords = base + mdv.getUint32(e + 36, true);
    for (let i = 0; i < n; i++) {
      const name = cpu.readCString(base + mdv.getUint32(names + i * 4, true));
      exports.set(name, base + mdv.getUint32(funcs + mdv.getUint16(ords + i * 2, true) * 4, true));
    }
  }
  return { base, size: imageSize, entry: base + entry, exports, delta };
}
