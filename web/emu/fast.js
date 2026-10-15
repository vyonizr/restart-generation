// JS versions of the engine's hottest drawing loops, installed as traps at their original addresses
// (0x10xxxxxx). Each one leaves memory, registers and flags as the guest code would, except the dead
// stack below ESP that the guest's own calls would have scribbled on.
export function installFastPaths(cpu, addr) {
  const { r, dv, m8 } = cpu;
  const rd = a => dv.getInt32(a >>> 0, true);
  const wr = (a, v) => dv.setInt32(a >>> 0, v, true);

  // The engine's blend of pixel d toward color by a/256, two channels at a time.
  const mix = (d, color, a) => {
    const dh = (d >>> 8) & 0xff00ff, dl = d & 0xff00ff;
    const x = (Math.imul(((color >>> 8) & 0xff00ff) - dh, a) & 0xffffff00) + (dh << 8);
    const y = (Math.imul((color & 0xff00ff) - dl, a) >>> 8) + dl;
    return ((x ^ y) & 0xff00ff) ^ x;
  };

  // FUN_1009d8c0(dst, color, alpha, count): blends count pixels toward color.
  const blend = (p, color, a, count) => {
    if (count <= 0) return;
    if (a === 0x40) {
      const c = (color >>> 2) & 0x3f3f3f3f;
      for (; count > 0; count--, p += 4) { const d = rd(p); wr(p, ((d >>> 1) & 0x7f7f7f7f) + ((d >>> 2) & 0x3f3f3f3f) + c); }
    } else if (a === 0x80) {
      const c = (color >>> 1) & 0x7f7f7f7f;
      for (; count > 0; count--, p += 4) wr(p, ((rd(p) >>> 1) & 0x7f7f7f7f) + c);
    } else if (a === 0xff) {
      for (; count > 0; count--, p += 4) wr(p, color);
    } else {
      for (; count > 0; count--, p += 4) wr(p, mix(rd(p), color, a));
    }
  };

  // FUN_1009da10(this, dst, color, level, count): adds a per-level lookup of color to count pixels, clamped.
  const add = (self, p, color, level, count) => {
    if (count <= 0) return;
    const t = (level << 8) + rd(self + 0xc);
    const ar = m8[(t + ((color >>> 16) & 255)) >>> 0], ag = m8[(t + ((color >>> 8) & 255)) >>> 0], ab = m8[(t + (color & 255)) >>> 0];
    for (; count > 0; count--, p += 4) {
      const cr = Math.min(m8[p + 2] + ar, 255), cg = Math.min(m8[p + 1] + ag, 255), cb = Math.min(m8[p] + ab, 255);
      wr(p, (cr << 16) | (cg << 8) | cb);
    }
  };

  // The row loop of the RLE sprite blitter FUN_1009e550 (0x1009e600-0x1009e719). Each 16-bit code is a
  // run: length in the top nibble and palette index below, or a zero nibble and the index in the next code.
  // Index bit 15 marks an opaque run; the object's draw mode (+0x20) picks fill, blend or add.
  const exit = addr(0x1009e719);
  cpu.traps.set(addr(0x1009e600), c => {
    const esp = r[4] >>> 0, S = o => rd(esp + o);
    const width = S(0x10), data = S(0x18), dst = S(0x24), shift = S(0x28) & 31, rowStep = S(0x1c), pal = S(0x38);
    const self = r[6], mode = rd(self + 0x20) >>> 0, level = m8[(self + 0x64) >>> 0], full = rd(self + 0x64) === 0xff;
    let eax = r[0], ebx = r[3], edx = r[2], ebp = r[5], rows = S(0x14), x = 0, code = 0, next = 0;
    for (;;) {
      x = 0;
      if (width > 0) {
        do {
          code = dv.getUint16((data + ebx * 2) >>> 0, true); ebx = (ebx + 1) | 0;
          let len;
          if (code & 0xf000) { len = code >>> 12; eax = code & 0xfff; }
          else { len = code; eax = dv.getUint16((data + ebx * 2) >>> 0, true); ebx = (ebx + 1) | 0; }
          next = ebx;
          if (eax & 0x8000) {
            const p = (dst + ebp) >>> 0, color = rd(pal + (eax & 0x7fff) * 4);
            if (mode === 0) { for (let i = 0; i < len; i++) wr(p + i * 4, color); }
            else if (mode === 1) blend(p, color, level, len);
            else if (mode === 2) { const a = color >>> 24; blend(p, color, (full ? ((a + 1) * 0xff) >>> 8 : a) & 255, len); }
            else if (mode === 3) add(self, p, color, level, len);
          }
          edx = (len << shift) | 0; ebp = (ebp + edx) | 0; x = (x + len) | 0; ebx = next; eax = width;
        } while (x < width);
        eax = rowStep;
      }
      const before = ebp;
      ebp = (ebp + eax) | 0;
      rows = (rows - 1) | 0;
      if (rows === 0) { c.alu(0, before, eax, 32); c.dec(1, 32); break; }
    }
    dv.setInt32(esp + 0x2c, x, true); dv.setInt32(esp + 0x14, 0, true);
    if (width > 0) { dv.setInt32(esp + 0x34, next, true); dv.setInt32(esp + 0x30, code, true); }
    r[0] = eax; r[1] = 0; r[2] = edx; r[3] = ebx; r[5] = ebp;
    c.eip = exit;
  });

  // The row loop of the clipped variant FUN_1009de90 (0x1009df68-0x1009e0a9): same runs and draw modes,
  // but it skips rows above the clip, pixels left of it, and pixels past its right edge.
  const exitClipped = addr(0x1009e0a9);
  cpu.traps.set(addr(0x1009df68), c => {
    const esp = r[4] >>> 0, S = o => rd(esp + o);
    const width = S(0x10), pal = S(0x18), data = S(0x1c), left = S(0x20), right = S(0x24), top = S(0x28), rows = S(0x2c);
    const rowStep = S(0x30), dst = S(0x38), shift = S(0x3c) & 31;
    const self = r[6], mode = rd(self + 0x20) >>> 0, level = m8[(self + 0x64) >>> 0];
    let y = S(0x14), off = S(0x44), next = S(0x48), x = 0, len = r[3], wrote = false;
    do {
      x = 0;
      if (width > 0) {
        do {
          const code = dv.getUint16((data + next * 2) >>> 0, true); next = (next + 1) | 0;
          let index;
          if (code & 0xf000) { len = code >>> 12; index = code & 0xfff; }
          else { len = code; index = dv.getUint16((data + next * 2) >>> 0, true); next = (next + 1) | 0; }
          wrote = true;
          const skip = x < left ? left - x : 0;
          let count = len - skip;
          if (len + x > right) count = right - skip - x;
          if ((index & 0x8000) && y >= top && count > 0) {
            const p = (off + skip * 4 + dst) >>> 0, color = rd(pal + (index & 0x7fff) * 4);
            if (mode === 0) { for (let i = 0; i < count; i++) wr(p + i * 4, color); }
            else if (mode === 1) blend(p, color, level, count);
            else if (mode === 2) blend(p, color, color >>> 24, count);
            else if (mode === 3) add(self, p, color, level, count);
          }
          off = (off + (len << shift)) | 0; x = (x + len) | 0;
        } while (x < width);
      }
      off = (off + rowStep) | 0;
      y = (y + 1) | 0;
    } while (y < rows);
    c.alu(7, y, rows, 32);
    dv.setInt32(esp + 0x14, y, true); dv.setInt32(esp + 0x40, x, true); dv.setInt32(esp + 0x44, off, true);
    if (wrote) { dv.setInt32(esp + 0x48, next, true); dv.setInt32(esp + 0x4c, len, true); }
    r[0] = rowStep; r[1] = y; r[2] = off; r[3] = len; r[5] = rows; r[7] = x;
    c.eip = exitClipped;
  });

  // The two row loops of FUN_1009c9f0, which alpha-blends a 32-bit image onto the screen using each
  // source pixel's alpha. The object's alpha (+0x60) picks the loop: 0xff (0x1009ca37-0x1009cacd)
  // blends with the source alpha alone; anything else (0x1009cb04-0x1009cc13) scales it first.
  // Both step the source by the image stride (+0x50) and the destination by the skip at [esp+0x20].
  const blit = (c, src, dst, exit, pixel) => {
    const esp = r[4] >>> 0, S = o => rd(esp + o);
    const width = S(0x28), skip = S(0x20), stride = rd(S(0x10) + 0x50);
    let rows = S(0x2c);
    for (;;) {
      if (width > 0) {
        for (let n = width; n > 0; n--, src = (src + 4) | 0, dst = (dst + 4) | 0) wr(dst, pixel(rd(src), rd(dst)));
        dv.setInt32(esp + 0x24, 0, true);
      }
      src = (src + Math.imul(stride - width, 4)) | 0;
      const before = dst;
      dst = (dst + skip) | 0;
      if (--rows === 0) { c.alu(0, before, skip, 32); c.dec(1, 32); break; }
    }
    dv.setInt32(esp + 0x1c, src, true); dv.setInt32(esp + 0x2c, 0, true);
    r[2] = width;
    c.eip = exit;
    return [src, dst, skip];
  };
  const exitOpaque = addr(0x1009cacd);
  cpu.traps.set(addr(0x1009ca37), c => {
    const [src, dst, skip] = blit(c, r[1], r[5], exitOpaque, (s, d) => {
      const a = s >>> 24, sg = (s >>> 8) & 255, dg = (d >>> 8) & 255;
      const g = (Math.imul(sg - dg, a) & 0xffffff00) + (dg << 8);
      const rb = ((Math.imul((s & 0xff00ff) - (d & 0xff00ff), a) >>> 8) + (d & 0xff00ff)) & 0xff00ff;
      return g | rb | (d & 0xff000000);
    });
    r[0] = skip; r[1] = src; r[5] = dst; r[6] = 0;
  });
  const exitScaled = addr(0x1009cc13);
  cpu.traps.set(addr(0x1009cb04), c => {
    const alpha = rd(rd((r[4] >>> 0) + 0x10) + 0x60);
    const [src, dst] = blit(c, r[6], r[3], exitScaled, (s, d) => {
      const a = Math.imul(s >>> 24, alpha) >>> 8;
      if (a === 0x40) return ((d >>> 2) & 0x3f3f3f3f) + ((d >>> 1) & 0x7f7f7f7f) + ((s >>> 2) & 0x3f3f3f3f);
      if (a === 0x80) return ((d >>> 1) & 0x7f7f7f7f) + ((s >>> 1) & 0x7f7f7f7f);
      return mix(d, s, a);
    });
    r[0] = 0; r[3] = dst; r[6] = src;
  });

  // Loops of the span blends FUN_1009f2c0, FUN_1009f340 and FUN_1009f8c0 (dst, src, count, alpha).
  // Each writes count pixels at dst from the source pixel at dst + delta, then leaves the flags of its
  // closing "add dst, 4; dec count". pixel(d, s) returns the new pixel and sets `out` to the EDX it leaves.
  let out = 0;
  const span = (c, dst, delta, count, exit, pixel) => {
    for (; count > 0; count--, dst = (dst + 4) | 0) wr(dst, pixel(rd(dst), rd(dst + delta)));
    c.alu(0, (dst - 4) | 0, 4, 32); c.dec(1, 32);
    r[2] = out;
    c.eip = exit;
    return dst;
  };
  // Blends toward s by a: the halving fast paths at 0x40 and 0x80, else mix. Sets `out` as each path does.
  const toward = (d, s, a, general) => {
    if (a === 0x40) { out = (d >>> 1) & 0x7f7f7f7f; return out + ((d >>> 2) & 0x3f3f3f3f) + ((s >>> 2) & 0x3f3f3f3f); }
    if (a === 0x80) return out = ((d >>> 1) & 0x7f7f7f7f) + ((s >>> 1) & 0x7f7f7f7f);
    out = general;
    return mix(d, s, a);
  };

  // FUN_1009f2c0 below alpha 0xff (0x1009f2f5-0x1009f339): blends at the constant alpha, dropping the alpha byte.
  const exitConst = addr(0x1009f339);
  cpu.traps.set(addr(0x1009f2f5), c => {
    const a = r[7];
    let low = 0;
    r[0] = span(c, r[0], r[6], r[3], exitConst, (d, s) => {
      const dg = (d >>> 8) & 255, g = (Math.imul(((s >>> 8) & 255) - dg, a) & 0xffffff00) + (dg << 8);
      low = d & 0xff00ff;
      out = ((Math.imul((s & 0xff00ff) - low, a) >>> 8) + low) & 0xff00ff;
      return g | out;
    });
    r[1] = low; r[3] = 0;
  });
  // FUN_1009f340 at alpha 0xff (0x1009f371-0x1009f43c): blends at each source pixel's alpha.
  const exitAlpha = addr(0x1009f43c);
  cpu.traps.set(addr(0x1009f371), c => {
    const esp = r[4] >>> 0;
    r[1] = span(c, r[1], r[7], rd(esp + 0x18), exitAlpha, (d, s) => toward(d, s, s >>> 24, (((d >>> 8) & 0xff00ff) << 8) | 0));
    dv.setInt32(esp + 0x18, 0, true); r[0] = 0;
  });
  // FUN_1009f340 below alpha 0xff (0x1009f461-0x1009f539): the source alpha scaled by the constant alpha.
  const exitScaledSpan = addr(0x1009f539);
  cpu.traps.set(addr(0x1009f461), c => {
    const esp = r[4] >>> 0, alpha = rd(esp + 0x14);
    r[1] = span(c, r[1], r[6], rd(esp + 0x18), exitScaledSpan, (d, s) => {
      const a = Math.imul((s >>> 24) + 1, alpha) >>> 8;
      return toward(d, s, a, a);
    });
    dv.setInt32(esp + 0x18, 0, true); r[0] = 0;
  });
  // FUN_1009f8c0 at alpha 0xff (0x1009f8f6-0x1009f9e6): the source holds a palette index (low 12 bits)
  // and an alpha (top byte); the palette is this+0x48 -> +8.
  const exitIndexed = addr(0x1009f9e6);
  cpu.traps.set(addr(0x1009f8f6), c => {
    const esp = r[4] >>> 0, pal = rd(rd(r[1] + 0x48) + 8);
    let a = 0;
    r[2] = span(c, r[2], r[6], rd(esp + 0x20), exitIndexed, (d, s) => {
      a = s >>> 24;
      return toward(d, rd(pal + (s & 0xfff) * 4), a, r[2]);
    });
    dv.setInt32(esp + 0x20, 0, true); dv.setInt32(esp + 0x24, a, true); r[0] = 0;
  });
}
