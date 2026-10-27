// JS versions of the engine's hottest loops and routines, mostly drawing, installed as traps at their original
// addresses (0x10xxxxxx). Each one leaves memory, registers and flags as the guest code would, except the dead
// stack below ESP that the guest's own calls (and the frames of routines done whole) would have scribbled on.
export function installFastPaths(cpu, addr) {
  const { r, dv, m8, m32 } = cpu;
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

  // The run-length image's blitters FUN_1009e550 and FUN_1009de90; docs/re/re_render.md has the image, its data and
  // the loop states. Each 16-bit code is a run: length in the top nibble and palette index below, or a zero nibble and
  // the index in the next code. Index bit 15 marks an opaque run; the image's draw mode (+0x20) picks fill, blend or add.
  // rleRows draws rows rows from data index at and screen offset off, as FUN_1009e550's row loop does, and leaves in
  // run* the data index, offset, pixels done in the last row, last code, index after the last run and EDX it ends with.
  let runAt = 0, runOff = 0, runX = 0, runCode = 0, runNext = 0, runEdx = 0;
  const rleRows = (self, data, at, dst, off, width, rows, rowStep, shift, pal, edx) => {
    const mode = rd(self + 0x20) >>> 0, level = m8[(self + 0x64) >>> 0], full = rd(self + 0x64) === 0xff;
    let x = 0, code = 0, next = 0;
    for (;;) {
      x = 0;
      if (width > 0) {
        do {
          code = dv.getUint16((data + at * 2) >>> 0, true); at = (at + 1) | 0;
          let len, index;
          if (code & 0xf000) { len = code >>> 12; index = code & 0xfff; }
          else { len = code; index = dv.getUint16((data + at * 2) >>> 0, true); at = (at + 1) | 0; }
          next = at;
          if (index & 0x8000) {
            const p = (dst + off) >>> 0, color = rd(pal + (index & 0x7fff) * 4);
            if (mode === 0) { for (let i = 0; i < len; i++) wr(p + i * 4, color); }
            else if (mode === 1) blend(p, color, level, len);
            else if (mode === 2) { const a = color >>> 24; blend(p, color, (full ? ((a + 1) * 0xff) >>> 8 : a) & 255, len); }
            else if (mode === 3) add(self, p, color, level, len);
          }
          edx = (len << shift) | 0; off = (off + edx) | 0; x = (x + len) | 0;
        } while (x < width);
      }
      off = (off + rowStep) | 0;
      rows = (rows - 1) | 0;
      if (rows === 0) break;
    }
    runAt = at; runOff = off; runX = x; runCode = code; runNext = next; runEdx = edx;
  };
  // The trap at FUN_1009e550's row loop (0x1009e600-0x1009e719), for the draws that run in the guest.
  const exit = addr(0x1009e719);
  cpu.traps.set(addr(0x1009e600), c => {
    const esp = r[4] >>> 0, S = o => rd(esp + o), width = S(0x10), rowStep = S(0x1c);
    rleRows(r[6], S(0x18), r[3], S(0x24), r[5], width, S(0x14), rowStep, S(0x28) & 31, S(0x38), r[2]);
    c.alu(0, (runOff - rowStep) | 0, rowStep, 32); c.dec(1, 32);
    wr(esp + 0x2c, runX); wr(esp + 0x14, 0);
    if (width > 0) { wr(esp + 0x34, runNext); wr(esp + 0x30, runCode); }
    r[0] = rowStep; r[1] = 0; r[2] = runEdx; r[3] = runAt; r[5] = runOff;
    c.eip = exit;
  });

  // FUN_1009de90's row loop: the same runs, but rows before the top cut and pixels outside the left cut and right stop
  // aren't drawn. Returns the screen offset after the last row and leaves the row, the pixels done in it, the data
  // index, the last run's length and whether any run was read in clip*.
  let clipY = 0, clipX = 0, clipNext = 0, clipLen = 0, clipRead = false;
  const rleClippedRows = (self, data, next, dst, off, width, pal, left, right, top, rows, rowStep, shift, y, len) => {
    const mode = rd(self + 0x20) >>> 0, level = m8[(self + 0x64) >>> 0];
    let x = 0, read = false;
    do {
      x = 0;
      if (width > 0) {
        do {
          const code = dv.getUint16((data + next * 2) >>> 0, true); next = (next + 1) | 0;
          let index;
          if (code & 0xf000) { len = code >>> 12; index = code & 0xfff; }
          else { len = code; index = dv.getUint16((data + next * 2) >>> 0, true); next = (next + 1) | 0; }
          read = true;
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
    clipY = y; clipX = x; clipNext = next; clipLen = len; clipRead = read;
    return off;
  };
  // The trap at that loop (0x1009df68-0x1009e0a9), for the draws that run in the guest.
  const exitClipped = addr(0x1009e0a9);
  cpu.traps.set(addr(0x1009df68), c => {
    const esp = r[4] >>> 0, S = o => rd(esp + o), rows = S(0x2c), rowStep = S(0x30);
    const off = rleClippedRows(r[6], S(0x1c), S(0x48), S(0x38), S(0x44), S(0x10), S(0x18), S(0x20), S(0x24), S(0x28),
      rows, rowStep, S(0x3c) & 31, S(0x14), r[3]);
    c.alu(7, clipY, rows, 32);
    wr(esp + 0x14, clipY); wr(esp + 0x40, clipX); wr(esp + 0x44, off);
    if (clipRead) { wr(esp + 0x48, clipNext); wr(esp + 0x4c, clipLen); }
    r[0] = rowStep; r[1] = clipY; r[2] = off; r[3] = clipLen; r[5] = rows; r[7] = clipX;
    c.eip = exitClipped;
  });

  // FUN_1009e0d0 draws a mirrored frame against the clip (docs/re/re_render.md "Draw a mirrored run-length frame"): the
  // runs of FUN_1009de90's loop, laid out leftward from the frame's right edge, the cut counted from that edge. The trap
  // at its row loop (0x1009e1b0-0x1009e2f7) does every row. EDI ends as the last run left it: the end of a fill, the start
  // of another draw, or the run's count << shift when it drew nothing.
  const exitMirrored = addr(0x1009e2f7);
  cpu.traps.set(addr(0x1009e1b0), c => {
    const esp = r[4] >>> 0, S = o => rd(esp + o), self = r[3], width = S(0x10), pal = S(0x14), rows = S(0x18), data = S(0x1c);
    const cut = S(0x20), stop = S(0x24), top = S(0x28), rowStep = S(0x30), dst = S(0x38), shift = S(0x3c) & 31;
    const mode = rd(self + 0x20) >>> 0, level = m8[(self + 0x64) >>> 0];
    let row = S(0x40), next = S(0x44), off = r[5], x = 0, len = 0, count = r[6], edi = 0, read = false;
    do {
      x = 0; edi = 0;
      if (width > 0) {
        do {
          const code = dv.getUint16((data + next * 2) >>> 0, true); next = (next + 1) | 0;
          let index;
          if (code & 0xf000) { len = code >>> 12; index = code & 0xfff; }
          else { len = code; index = dv.getUint16((data + next * 2) >>> 0, true); next = (next + 1) | 0; }
          read = true;
          const skip = x < cut ? (cut - x) | 0 : 0;
          count = (len - skip) | 0;
          if (((len + x) | 0) > stop) count = (stop - skip - x) | 0;
          edi = count << shift; off = (off - edi) | 0;
          if ((index & 0x8000) && row >= top && count > 0) {
            const p = (dst + off - skip * 4) | 0, color = rd(pal + (index & 0x7fff) * 4);
            edi = p;
            if (mode === 0) { for (let i = 0; i < count; i++) wr(p + i * 4, color); edi = (p + count * 4) | 0; }
            else if (mode === 1) blend(p, color, level, count);
            else if (mode === 2) blend(p, color, color >>> 24, count);
            else if (mode === 3) add(self, p, color, level, count);
          }
          off = (off - ((len - count) << shift)) | 0; x = (x + len) | 0;
        } while (x < width);
      }
      off = (off + rowStep) | 0;
      row = (row + 1) | 0;
    } while (row < rows);
    c.alu(7, row, rows, 32);
    wr(esp + 0x40, row); wr(esp + 0x48, x);
    if (read) { wr(esp + 0x44, next); wr(esp + 0x2c, len); wr(esp + 0x4c, len); }
    r[0] = rowStep; r[1] = row; r[2] = rows; r[5] = off; r[6] = count; r[7] = edi;
    c.eip = exitMirrored;
  });

  // The run-length image's draw routines as plain functions of their arguments (self the image). Each leaves the
  // EAX, ECX and EDX the routine returns with in out*.
  let outA = 0, outC = 0, outD = 0;
  // The palette of frame f; sets outD to the EDX choosing it leaves: the palette, or the vtable when it's the palette object's.
  const palette = (self, f) => {
    if (m8[(self + 0x2e) >>> 0] === 0) return (outD = rd(rd(self + 0x54) + f * 4));
    outD = rd(self);
    const owner = rd(self + 0x48);
    return owner ? rd(owner + 8) : 0;
  };
  // FUN_1009de90: draws frame f at (x, y) cut to the image's clip.
  const drawClipped = (self, dst, shift, pitch, x, y, f) => {
    const data = rd(rd(self + 4)), size = rd(self + 0x14), width = rd(size + 0x18), height = rd(size + 0x1c), s = shift & 31;
    const below = (rd(self + 0x30) - y) | 0, overBottom = (height - below) | 0, rows = (below + (overBottom < 0 ? overBottom : 0)) | 0;
    const space = (rd(self + 0x3c) - x) | 0, overRight = (width - space) | 0, right = (space + (overRight < 0 ? overRight : 0)) | 0;
    const fromLeft = (x - rd(self + 0x38)) | 0, left = -(fromLeft < 0 ? fromLeft : 0) | 0;
    const fromTop = (y - rd(self + 0x34)) | 0, top = -(fromTop < 0 ? fromTop : 0) | 0;
    const at = rd(rd(self + 0x44) + f * 4) >> 1, pal = palette(self, f), off = (Math.imul(pitch, y) + x) << s;
    if (rows <= 0) { outA = pitch; outC = shift; outD = off; return; }
    const rowStep = (pitch - width) << s;
    outD = rleClippedRows(self, data, at, dst, off, width, pal, left, right, top, rows, rowStep, s, 0, 0);
    outA = rowStep; outC = rows;
  };
  // FUN_1009e550: draws frame f at (x, y), or passes it to FUN_1009de90 unless it's wholly inside the clip.
  const drawFrame = (self, dst, shift, pitch, x, y, f) => {
    const size = rd(self + 0x14), height = rd(size + 0x1c), width = rd(size + 0x18), s = shift & 31;
    if (x < rd(self + 0x38) || x > ((rd(self + 0x3c) - width) | 0) || y < rd(self + 0x34) || y > ((rd(self + 0x30) - height) | 0)) {
      drawClipped(self, dst, shift, pitch, x, y, f);
      return;
    }
    const data = rd(rd(self + 4)), at = rd(rd(self + 0x44) + f * 4) >> 1, pal = palette(self, f), off = (Math.imul(pitch, y) + x) << s;
    if (height <= 0) { outA = pitch; outC = shift; return; }
    const rowStep = (pitch - width) << s;
    rleRows(self, data, at, dst, off, width, height, rowStep, s, pal, outD);
    outA = rowStep; outC = 0; outD = runEdx;
  };
  // FUN_1009e940 for an image that isn't mirrored (+0x2d) and has no other draw (+0x70): takes the renderer's clip,
  // gives up on a frame wholly outside it or a format other than 2, and draws the rest with FUN_1009e550.
  const drawImage = (self, renderer, dst, pitch, x, y, level, f) => {
    if (f < 0 || f >= rd(self + 0x40)) f = 0;
    wr(self + 0x30, rd(renderer + 0x24)); wr(self + 0x3c, rd(renderer + 0x18)); wr(self + 0x38, rd(renderer + 0x1c));
    wr(self + 0x34, rd(renderer + 0x20)); wr(self + 0x64, level);
    const size = rd(self + 0x14), width = rd(size + 0x18), height = rd(size + 0x1c), left = rd(self + 0x38), top = rd(self + 0x34);
    outA = x;
    if (x >= rd(self + 0x3c)) { outC = width; outD = left; return; }
    if (((width + x) | 0) < left) { outC = (width + x) | 0; outD = left; return; }
    outC = y;
    if (y >= rd(self + 0x30)) { outD = left; return; }
    if (((height + y) | 0) < top) { outD = top; return; }
    const format = rd(size + 0x20);
    if (format !== 2) { outD = (format - 2) | 0; return; }
    wr(self + 0xc, rd(renderer + 0xc));
    drawFrame(self, dst, 2, pitch, x, y, f);
  };

  // FUN_10052de0 draws one scene object; the trap at its entry does the whole call. It needs the object's and the
  // screen's images loaded and their caches the usual one, so that FUN_1004a060 only marks them recently used. It
  // draws run-length images itself and calls any other image's draw method in the guest. Anything else (no object,
  // no image, an image to load) runs in the guest from the routine's second instruction.
  const cacheVt = addr(0x1017bd8c), rleVt = addr(0x10182a88), holderOf = addr(0x10112570), drawObjectRest = addr(0x10052de3);
  // Whether FUN_1004a060(o) would only move o's cache node to the front (or do nothing, without a cache).
  const plainTouch = o => { const m = rd(o + 0x28); return m === 0 || (rd(m) === cacheVt && rd(o + 0x24) !== 0 && m8[(o + 0x2c) >>> 0] === 0); };
  // FUN_1004a060(o) for such an o: unlinks its node from the cache's newest-first list and puts it in front.
  const touch = o => {
    const m = rd(o + 0x28);
    if (m === 0) return;
    const node = rd(o + 0x44);
    if (node === 0 || node === rd(m + 0x14)) return;
    const newer = rd(node + 4), older = rd(node);
    if (newer) wr(newer, older);
    if (older) wr(older + 4, newer);
    if (node === rd(m + 0x10)) wr(m + 0x10, newer);
    wr(node + 4, 0); wr(node, rd(m + 0x14)); wr(rd(m + 0x14) + 4, node); wr(m + 0x14, node);
  };
  cpu.traps.set(addr(0x10052de0), c => {
    const esp = r[4] >>> 0, self = r[1], obj = rd(esp + 4), screen = obj && rd(self + 4);
    if (!obj || !rd(obj + 0x24) || !plainTouch(obj) || !plainTouch(screen) || !rd(screen + 0x24) || rd(rd(rd(screen + 0x24)) + 0xc) !== holderOf) {
      r[4] = c.alu(5, esp, 8, 32);
      c.eip = drawObjectRest;
      return;
    }
    touch(obj); touch(obj);
    const img = rd(obj + 0x24);
    touch(screen); touch(screen);
    const dst = rd(rd(rd(screen + 0x24) + 4));
    touch(screen);
    const pitch = rd(rd(rd(screen + 0x24) + 4) + 4);
    const pos = rd(esp + 8), x = rd(pos), y = rd(pos + 4), level = rd(rd(esp + 12) + 8), frame = rd(esp + 16);
    if (rd(img) === rleVt && rd(img + 0x70) === 0 && m8[(img + 0x2d) >>> 0] === 0) {
      drawImage(img, self, dst, pitch, x, y, level, frame);
      r[0] = outA; r[1] = outC; r[2] = outD;
    } else {
      // The routine's frame, its registers at the call, and the call itself, which returns to a sentinel instead.
      const ebx = r[3], ebp = r[5], esi = r[6], edi = r[7];
      wr(esp - 4, rd(screen + 0x1c)); wr(esp - 8, pitch); wr(esp - 12, esi); wr(esp - 16, edi); wr(esp - 20, ebx); wr(esp - 24, ebp);
      r[0] = x; r[1] = img; r[2] = rd(img); r[3] = img; r[5] = dst; r[6] = screen; r[7] = self; r[4] = esp - 24;
      cpu.call(rd(rd(img) + 0x50), [self, dst, esp - 8, x, y, level, frame]);
      r[3] = ebx; r[5] = ebp; r[6] = esi; r[7] = edi;
    }
    c.alu(0, esp - 8, 8, 32);
    r[4] = esp + 20;
    c.eip = rd(esp) >>> 0;
  });

  // FUN_10078810 draws a curved band of short lines between two points (docs/re/re_render.md). The trap at the test
  // before its first loop (0x1007893c), reached with the setup done, draws both parts with the two span routines below
  // and returns from the routine. A screen whose pixels need the guest leaves the loops to the guest.
  const bandFirst = addr(0x10078942), bandSecond = addr(0x10078a5b);
  // FUN_10078510 and FUN_10078460 on band self: count pixels from (x, y) of screen, cut to the band's +0x44 by +0x48.
  // Returns the address of the first pixel to change and sets spanCount to how many (none when it isn't positive).
  let spanCount = 0;
  const bandSpan = (self, screen, x, y, count) => {
    spanCount = 0;
    if (y < 0 || y >= rd(self + 0x48)) return 0;
    const width = rd(self + 0x44);
    if (((x + count) | 0) >= width) count = (width - x) | 0;
    let skip = 0;
    if (x < 0) { skip = -x | 0; x = 0; }
    touch(screen);
    const base = rd(rd(rd(screen + 0x24) + 4));
    touch(screen);
    const pitch = rd(rd(rd(screen + 0x24) + 4) + 4);
    spanCount = (count - skip) | 0;
    return (base + ((Math.imul(pitch, y) + x) | 0) * 4) >>> 0;
  };
  const bandFill = (self, screen, x, y, count, color) => {
    const p = bandSpan(self, screen, x, y, count);
    if (spanCount <= 0) return;
    if ((p & 3) === 0) cpu.m32.fill(color, p >>> 2, (p >>> 2) + spanCount);
    else for (let i = 0; i < spanCount; i++) wr(p + i * 4, color);
  };
  const bandDarken = (self, screen, x, y, count, shift, mask) => {
    const p = bandSpan(self, screen, x, y, count);
    for (let i = 0; i < spanCount; i++) {
      const v = rd(p + i * 4);
      if ((v & 0xff000000) !== 0x33000000) wr(p + i * 4, ((v >>> (shift & 31)) & mask) | 0x33000000);
    }
  };
  cpu.traps.set(addr(0x1007893c), c => {
    const esp = r[4] >>> 0, S = o => rd(esp + o), self = r[6], screen = S(0x14), sag = rd(self + 0x38);
    if (sag === 0 || sag === -1 || !plainTouch(screen) || !rd(screen + 0x24) || rd(rd(rd(screen + 0x24)) + 0xc) !== holderOf) {
      c.eip = r[1] <= 0 ? bandSecond : bandFirst;
      return;
    }
    const steps = rd(self + 0x30), plain = m8[(esp + 0x50) >>> 0] !== 0, dx = S(0x44), dy = S(0x48), shades = (S(0x4c) << 8) | 0;
    const table = rd(self + 0x2c), xStep = S(0x34), yStep = S(0x38), lift = rd(self + 0x3c) << 8, full = rd(self + 0x34);
    let swapped = S(0x18), width = S(0x40), shade = S(0x20), downs = S(0x24), last = S(0x28), x = S(0x2c), y = r[3], i = S(0x10);
    // The line of step i: the walk's y plus the curve's sag, in whole pixels.
    const lineAt = () => { const d = (i - (steps >> 1)) | 0; return ((((((Math.imul(d, d) << 8) / sag) | 0) - lift) << 8) + y) >> 16; };
    const colorOf = s => rd(table + ((shades + s) | 0) * 4);
    if (steps > 0) {
      do {
        const left = (x - (width << 15)) >> 16;
        if (swapped === 1) {
          if (width === ((full + 6) | 0)) { width = full; swapped = 2; }
          else if (width < ((full + 6) | 0)) width = (width + 1) | 0;
        }
        const line = lineAt();
        if (last < line) {
          shade = (shade + rd(self + 0xc)) | 0;
          if (++downs > 1) break;
        }
        last = line;
        if (swapped !== 0 || !plain) {
          bandFill(self, screen, (left - dx) | 0, (line - dy) | 0, width, colorOf(shade));
          if (!plain) bandDarken(self, screen, (left - dx - 1) | 0, ((y >> 16) - dy) | 0, (width - 2) | 0, 1, 0x7f7f7f);
        }
        x = (x + xStep) | 0; y = (y + yStep) | 0; i++;
      } while (i < steps);
    }
    r[0] = i; r[1] = rd(self); r[2] = steps;
    if (i < steps) {
      const top = (rd(self) + S(0x1c)) | 0, taper = (steps - full - 6) | 0;
      width = full;
      shade = (rd(self + 4) + rd(self)) | 0;
      do {
        const left = (x - (width << 15)) >> 16, line = lineAt();
        shade = (shade + rd(self + 8)) | 0;
        if (shade > top) shade = top;
        if (swapped === 0 ? true : !plain) {
          bandFill(self, screen, (left - dx) | 0, (line - dy) | 0, width, colorOf(shade));
          if (!plain) bandDarken(self, screen, (left - dx - 1) | 0, ((y >> 16) - dy) | 0, (width - 2) | 0, 1, 0x7f7f7f);
        }
        if (swapped === 0) {
          if (i === taper) width = (full + 6) | 0;
          else if (i > taper) width = (width - 1) | 0;
        }
        x = (x + xStep) | 0; y = (y + yStep) | 0; i++;
      } while (i < steps);
      r[0] = i; r[1] = xStep;
    }
    // The epilogue: pop EDI, EBP, EBX and ESI, drop the locals, return popping five arguments.
    r[7] = S(0); r[5] = S(4); r[3] = S(8); r[6] = S(0xc);
    c.alu(0, esp + 0x10, 0x2c, 32);
    c.eip = S(0x3c) >>> 0;
    r[4] = esp + 0x54;
  });

  // FUN_100529e0 and FUN_10052ac0 blend a row or a column of a drawable toward a color (docs/re/re_render.md). The traps
  // at their entries do the whole call for a drawable without a cache; any other goes on in the guest after the
  // routine's first instruction, a push of EBX (row) or EDI (column).
  const blendLine = (c, column, rest) => {
    const esp = r[4] >>> 0, S = o => rd(esp + o), screen = S(4), img = rd(screen + 0x24);
    if (rd(screen + 0x28) !== 0 || !img || rd(rd(img) + 0xc) !== holderOf) {
      wr(esp - 4, r[column ? 7 : 3]); r[4] = esp - 4;
      c.eip = rest;
      return;
    }
    const x = S(8), y = S(0xc), color = S(0x14), amount = S(0x18), holder = rd(img + 4), pitch = rd(holder + 4);
    const fixed = column ? x : y, edge = rd(screen + (column ? 0x18 : 0x1c));
    if (fixed < 0 || fixed >= edge) {
      if (fixed < 0) c.alu(4, fixed, fixed, 32); else c.alu(7, fixed, edge, 32);
      r[0] = fixed; r[1] = column ? pitch : img;
    } else {
      const end = rd(screen + (column ? 0x1c : 0x18));
      let along = column ? y : x, count = S(0x10), skip = 0;
      if (((along + count) | 0) >= end) count = (end - along) | 0;
      if (along < 0) { skip = -along | 0; along = 0; }
      const base = rd(holder), at = column ? Math.imul(pitch, along) + x : Math.imul(pitch, y) + along;
      let p = (base + (at | 0) * 4) >>> 0;
      c.alu(7, skip, count, 32);
      if (skip >= count) {
        r[0] = column ? base : holder; r[1] = column ? pitch : base; r[2] = p;
      } else {
        const step = column ? pitch << 2 : 4, cl = color & 0xff00ff, cg = (color >>> 8) & 255;
        let dl = 0, rb = 0;
        for (let n = (count - skip) | 0; n > 0; n--, p = (p + step) >>> 0) {
          const d = rd(p), dg = (d >>> 8) & 255;
          dl = d & 0xff00ff;
          rb = ((Math.imul(cl - dl, amount) >>> 8) + dl) & 0xff00ff;
          wr(p, ((Math.imul(cg - dg, amount) & 0xffffff00) + (dg << 8)) | rb);
        }
        c.alu(0, p - step, step, 32); c.dec(1, 32);
        r[0] = dl; r[1] = column ? step : rb; r[2] = p;
      }
    }
    r[4] = esp + 0x1c;
    c.eip = rd(esp) >>> 0;
  };
  const rowRest = addr(0x100529e1), columnRest = addr(0x10052ac1);
  cpu.traps.set(addr(0x100529e0), c => blendLine(c, false, rowRest));
  cpu.traps.set(addr(0x10052ac0), c => blendLine(c, true, columnRest));

  // FUN_10038160's loop at 0x100383c0 calls the virtual method +0x18 of each of its 0x7c-byte objects; for the sprung
  // points that is FUN_1006ca60 (docs/re/re_render.md), done here. Other methods run in the guest. The trap runs the
  // whole loop and leaves it at 0x100383d6.
  const springStep = addr(0x1006ca60), springsDone = addr(0x100383d6);
  // FUN_1006ca60 on point p: returns the EDX it leaves (the z velocity); its EAX is the new z.
  const spring = p => {
    const wait = rd(p + 0x78);
    if (wait > 0) wr(p + 0x78, wait - 1);
    else { const rest = (0x40 - rd(p + 0x74)) | 0; wr(p + 0x74, -(rest < 0 ? rest : 0) | 0); }
    const x = rd(p + 4), y = rd(p + 8);
    const vz = (rd(p + 0x18) + (Math.imul(rd(p + 0xc), -24) >> 8) + 0x1000) | 0;
    wr(p + 0x18, (Math.imul(vz, 0xdc) >> 8) + rd(p + 0x70));
    const vx = rd(p + 0x10);
    if (vx !== 0) wr(p + 0x10, Math.imul((((-x | 0) << 3) >> 8) + vx, 200) >> 8);
    const vy = rd(p + 0x14);
    if (vy !== 0) wr(p + 0x14, Math.imul((((-y | 0) << 3) >> 8) + vy, 200) >> 8);
    wr(p + 4, rd(p + 4) + rd(p + 0x10));
    wr(p + 8, rd(p + 8) + rd(p + 0x14));
    const z = rd(p + 0xc), dz = rd(p + 0x18);
    wr(p + 0xc, z + dz);
    return dz;
  };
  cpu.traps.set(addr(0x100383c0), c => {
    const owner = r[6];
    let i = r[7], off = r[5], ecx = r[1], edx = r[2];
    do {
      const p = (rd(owner + 0xc) + off) | 0, vt = rd(p), fn = rd(vt + 0x18) >>> 0;
      if (fn === springStep) { edx = spring(p); ecx = p; }
      else {
        r[1] = p; r[2] = vt; r[7] = i; r[5] = off;
        cpu.call(fn, []);
        ecx = r[1]; edx = r[2];
      }
      r[0] = rd(owner + 8);
      i = (i + 1) | 0; off = (off + 0x7c) | 0;
    } while (i < r[0]);
    c.alu(7, i, r[0], 32);
    r[1] = ecx; r[2] = edx; r[5] = off; r[7] = i;
    c.eip = springsDone;
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

  // The span routines as plain functions of (sprite, dst, src, count, alpha), for the sprite blitters
  // below to call instead of "call [sprite+0x68]". Each draws nothing when count isn't positive.
  // Blends each color channel of d toward s by a/256 and clears the top byte.
  const fade = (d, s, a) => {
    const dg = (d >>> 8) & 255, dl = d & 0xff00ff;
    return ((Math.imul(((s >>> 8) & 255) - dg, a) & 0xffffff00) + (dg << 8)) | (((Math.imul((s & 0xff00ff) - dl, a) >>> 8) + dl) & 0xff00ff);
  };
  const spans = new Map([
    // FUN_1009f2c0: copies at alpha 0xff, else fades toward the source at alpha.
    [addr(0x1009f2c0), (self, dst, src, count, alpha) => {
      if (alpha === 0xff) { if (count > 0) m8.copyWithin(dst >>> 0, src >>> 0, (src >>> 0) + count * 4); return; }
      for (; count > 0; count--, dst = (dst + 4) | 0, src = (src + 4) | 0) wr(dst, fade(rd(dst), rd(src), alpha));
    }],
    // FUN_1009f340: blends at the source pixel's alpha, scaled by alpha below 0xff.
    [addr(0x1009f340), (self, dst, src, count, alpha) => {
      for (; count > 0; count--, dst = (dst + 4) | 0, src = (src + 4) | 0) {
        const s = rd(src);
        wr(dst, toward(rd(dst), s, alpha === 0xff ? s >>> 24 : Math.imul((s >>> 24) + 1, alpha) >>> 8, 0));
      }
    }],
    // FUN_1009f8c0: the source is a palette index and alpha. At alpha 0xff it blends toward the palette color
    // as FUN_1009f340 does; below, it fades toward it by source alpha * alpha / 256.
    [addr(0x1009f8c0), (self, dst, src, count, alpha) => {
      if (count <= 0) return;
      const pal = rd(rd(self + 0x48) + 8);
      for (; count > 0; count--, dst = (dst + 4) | 0, src = (src + 4) | 0) {
        const s = rd(src), color = rd(pal + (s & 0xfff) * 4);
        wr(dst, alpha === 0xff ? toward(rd(dst), color, s >>> 24, 0) : fade(rd(dst), color, Math.imul(s >>> 24, alpha) >>> 8));
      }
    }],
  ]);
  // The sprite's span routine fn; one without a JS version runs in the guest, with ECX the sprite.
  const spanOf = fn => spans.get(fn) ?? ((self, dst, src, count, alpha) => { r[1] = self; cpu.call(fn, [dst, src, count, alpha]); });
  // Copies a run's second segment straight to the screen, as the blitters do when the sprite's +0x64 byte is set.
  const copy = (dst, src, bytes) => { if (bytes > 0) m8.copyWithin(dst >>> 0, src >>> 0, (src >>> 0) + bytes); };

  // The row loop of the run-length sprite blitter FUN_100a1880 (0x100a1900-0x100a1a04), for a frame inside
  // the clip; docs/re/re_render.md has the data format and the stack slots. Each run steps over transparent
  // pixels, then passes its two segments to the span routine, or copies the second.
  const exitSprite = addr(0x100a1a04);
  cpu.traps.set(addr(0x100a1900), c => {
    const esp = r[4] >>> 0, S = o => rd(esp + o);
    const self = r[5], data = S(0x10), dst = S(0x1c), shift = S(0x20), pitch = S(0x24);
    const width = rd(self + 0x50), height = rd(self + 0x54), alpha = rd(self + 0x60), straight = m8[(self + 0x64) >>> 0] !== 0;
    const span = spanOf(rd(self + 0x68) >>> 0);
    let row = S(0x28), at = r[3], off = r[7], x = 0, mid = 0, n2 = 0, ran = false;
    do {
      x = 0;
      if (width > 0) {
        do {
          const skip = rd(data + at * 2), n1 = rd(data + at * 2 + 4);
          off = (off + skip) | 0; at = (at + 4) | 0;
          span(self, (dst + off) | 0, data + at * 2, n1 >> shift, alpha);
          off = (off + n1) | 0; at = (at + (n1 >> 1)) | 0;
          n2 = rd(data + at * 2); at = (at + 2) | 0; mid = off;
          if (straight) copy(dst + off, data + at * 2, n2);
          else span(self, (dst + off) | 0, data + at * 2, n2 >> shift, alpha);
          off = (off + n2) | 0; at = (at + (n2 >> 1)) | 0;
          x = (x + (skip >> shift) + (n1 >> shift) + (n2 >> shift)) | 0;
          ran = true;
        } while (x < width);
      }
      off = (off + ((pitch - width) << shift)) | 0;
      row = (row + 1) | 0;
    } while (row < height);
    c.alu(7, row, height, 32);
    wr(esp + 0x28, row); wr(esp + 0x30, x);
    if (ran) { wr(esp + 0x14, mid); wr(esp + 0x2c, n2); }
    r[0] = row; r[1] = shift; if (width > 0) r[2] = data; r[3] = at; r[6] = height; r[7] = off;
    c.eip = exitSprite;
  });

  // The clipped variant FUN_100a1a40 first walks the rows above the clip without drawing
  // (0x100a1ae0-0x100a1b30), only to move its data index past them.
  const exitSkipped = addr(0x100a1b30);
  cpu.traps.set(addr(0x100a1ae0), c => {
    const esp = r[4] >>> 0, width = rd(esp + 0x2c), shift = r[5], data = r[7];
    let rows = rd(esp + 0x1c), at = r[3], x = 0;
    do {
      x = 0;
      if (width > 0) {
        do {
          const skip = rd(data + at * 2), n1 = rd(data + at * 2 + 4);
          at = (at + 4 + (n1 >> 1)) | 0;
          const n2 = rd(data + at * 2);
          at = (at + 2 + (n2 >> 1)) | 0;
          x = (x + (skip >> shift) + (n1 >> shift) + (n2 >> shift)) | 0;
        } while (x < width);
      }
      rows = (rows - 1) | 0;
    } while (rows !== 0);
    if (width > 0) { c.alu(7, x, width, 32); r[2] = rd(esp + 0x38); } else c.alu(4, width, width, 32);
    c.dec(1, 32);
    wr(esp + 0x1c, 0);
    r[1] = width; r[3] = at; r[6] = x;
    c.eip = exitSkipped;
  });

  // Then its drawing row loop (0x100a1b70-0x100a1d7a): the same runs, each segment cut to the clip's left
  // and right edges before it is drawn.
  const exitClippedSprite = addr(0x100a1d7a);
  cpu.traps.set(addr(0x100a1b70), c => {
    const esp = r[4] >>> 0, S = o => rd(esp + o);
    const self = r[6], data = S(0x14), dst = S(0x28), pitch = S(0x30), x0 = S(0x34), shift = r[5];
    const width = rd(self + 0x50), clipLeft = rd(self + 0x38), clipRight = rd(self + 0x3c), alpha = rd(self + 0x60);
    const straight = m8[(self + 0x64) >>> 0] !== 0, span = spanOf(rd(self + 0x68) >>> 0);
    // Cuts a segment of n pixels, x pixels into the row, to the clip: returns the pixels left to draw, and sets
    // `lead` to those cut off on the left, which the source and the screen skip.
    let lead = 0;
    const clip = (x, n) => {
      const from = (x0 + x - clipLeft) | 0, over = (x0 + x + n - clipRight) | 0;
      lead = from < 0 ? Math.min(-from | 0, n) : 0;
      return ((over < 0 ? n : Math.max((n - over) | 0, 0)) - lead) | 0;
    };
    let rows = S(0x20), at = r[3], off = r[0], x = 0, n2 = 0, bytes = 0, cut = 0, stored = 0, step = 0, before = 0, ran = false;
    do {
      if (width > 0) {
        x = 0;
        do {
          const skip = rd(data + at * 2), n1bytes = rd(data + at * 2 + 4), n1 = n1bytes >> shift;
          off = (off + skip) | 0; at = (at + 4) | 0; x = (x + (skip >> shift)) | 0;
          if (n1bytes > 0) {
            const count = clip(x, n1);
            span(self, (dst + off + (lead << shift)) | 0, data + (at + (lead << (shift - 1))) * 2, count, alpha);
          }
          off = (off + n1bytes) | 0; at = (at + (n1bytes >> 1)) | 0; x = (x + n1) | 0;
          bytes = rd(data + at * 2); n2 = bytes >> shift; at = (at + 2) | 0; cut = 0;
          if (bytes > 0) {
            const count = clip(x, n2), to = (dst + off + (lead << shift)) | 0, from = data + (at + (lead << (shift - 1))) * 2;
            cut = lead;
            if (straight) copy(to, from, count << shift);
            else span(self, to, from, count, alpha);
          }
          stored = (off + (cut << shift)) | 0;
          off = (off + bytes) | 0; at = (at + (bytes >> 1)) | 0; x = (x + n2) | 0;
          ran = true;
        } while (x < width);
      }
      step = (pitch - width) << shift; before = off; off = (off + step) | 0;
      rows = (rows - 1) | 0;
    } while (rows !== 0);
    c.alu(0, before, step, 32); c.dec(1, 32);
    wr(esp + 0x20, 0);
    if (ran) { wr(esp + 0x18, cut); wr(esp + 0x1c, bytes); wr(esp + 0x2c, stored); wr(esp + 0x38, x); wr(esp + 0x3c, n2); }
    r[0] = off; r[1] = 0; r[2] = step; r[3] = at;
    if (width > 0) { r[6] = S(0x10); r[7] = data; }
    c.eip = exitClippedSprite;
  });

  // The row loop of FUN_100846d0 (0x100846f1-0x100848a8), which marks the edges of a tile grid. Each nonzero
  // cell (12 bytes: value, mask, packed sides) gets a mask bit for each neighbor above, below, right and left
  // (1, 2, 4, 8) that is off the grid or holds another value, and its value in that side's byte of the packed word.
  const exitEdges = addr(0x100848a8);
  cpu.traps.set(addr(0x100846f1), c => {
    const esp = r[4] >>> 0, cols = rd(r[0] + 8), rows = rd(r[0] + 0xc), cells = rd(rd(esp + 0x30) + 4);
    const differs = (y, x, v) => rd(cells + Math.imul(Math.imul(y, cols) + x, 12)) !== v;
    let row = r[5], at = 0, mask = 0, down = 0, right = 0, last = 0;
    do {
      for (let col = 0; col < cols; col++) {
        at = Math.imul(Math.imul(cols, row) + col, 12);
        const v = rd(cells + at);
        mask = 0; down = 0; right = 0;
        if (v === 0) continue;
        let up = 0, left = 0;
        if (row < 1 || differs(row - 1, col, v)) { mask |= 1; up = v; }
        if (row + 1 >= rows || differs(row + 1, col, v)) { mask |= 2; down = v; }
        if (col + 1 >= cols || differs(row, col + 1, v)) { mask |= 4; right = v; }
        if (col < 1 || differs(row, col - 1, v)) { mask |= 8; left = v; }
        wr(cells + at + 4, mask);
        wr(cells + at + 8, (((up << 8 | down) << 8 | right) << 8) | left);
        last = col + 1;
      }
      row = (row + 1) | 0;
    } while (row < rows);
    c.alu(7, row, rows, 32);
    wr(esp + 0x18, row);
    if (cols > 0) {
      wr(esp + 0x10, mask); wr(esp + 0x1c, down); wr(esp + 0x20, right); wr(esp + 0x28, 0);
      r[1] = rd(esp + 0x14); r[3] = at;
    }
    if (last) wr(esp + 0x24, last);
    r[2] = rows; r[5] = row; r[6] = 0; r[7] = cols > 0 ? cols : 0;
    c.eip = exitEdges;
  });

  // FUN_10052bb0 sets the top byte of each pixel of a rectangle of a drawable to an alpha's low byte, keeping the colors
  // (docs/re/re_render.md "Set the alpha byte of a rectangle"); the battle view's large-screen mode runs it over its 240 x 320
  // offscreen every frame the curtain is up. The trap at its 32-bit row loop (0x10052d00-0x10052d39), reached with the
  // rectangle cut and the cache told, does every row. Pixels that aren't dword-aligned go on in the guest after the loop's
  // first instruction, which sets ECX to the left cut * 4.
  const alphaRest = addr(0x10052d07), alphaDone = addr(0x10052d39);
  cpu.traps.set(addr(0x10052d00), c => {
    const esp = r[4] >>> 0, width = r[3], cut = r[7], count = (width - cut) | 0, step = rd(esp + 0x24), alpha = rd(esp + 0x30) << 24;
    let p = r[0];
    if (p & 3) { r[1] = cut << 2; c.eip = alphaRest; return; }
    let rows = r[5], before = 0, last = 0;
    do {
      p = (p + (cut << 2)) | 0;
      if (cut < width) {
        for (let i = p >>> 2, end = i + count; i < end; i++) last = m32[i] = (m32[i] & 0xffffff) | alpha;
        p = (p + (count << 2)) | 0;
      }
      before = p; p = (p + step) | 0;
      rows = (rows - 1) | 0;
    } while (rows !== 0);
    c.alu(0, before, step, 32); c.dec(1, 32);
    if (cut < width) { r[1] = 0; r[2] = alpha; r[6] = last; } else r[1] = cut << 2;
    r[0] = p; r[5] = 0;
    c.eip = alphaDone;
  });

  // The fight cut-in's two passes over its picture of the screen (docs/re/re_render.md "The fight cut-in's picture effects").
  // Each moves every channel a step toward a target: one above the target plus the step loses it, one below the target
  // less the step gains it. The pixel gets a top byte of 0. Both loop over the display's width x height, which the guest
  // reads, together with the pictures' pixels after telling their caches, before the traps at the loops take over.
  const nudge = (ch, to, d) => (ch > to + d ? ch - d : ch < to - d ? ch + d : ch);
  const nudged = (v, tr, tg, tb, d) => (nudge((v >>> 16) & 255, tr, d) << 16) | (nudge((v >>> 8) & 255, tg, d) << 8) | nudge(v & 255, tb, d);
  // A pixel's gray: its three channels' mean, rounded down.
  const grayOf = v => (((v >>> 16) & 255) + ((v >>> 8) & 255) + (v & 255)) / 3 | 0;
  // FUN_100824a0 moves each pixel 3 levels toward its own gray. The trap at the test before its row loop (0x100824f4),
  // reached with a positive height, does every row and leaves at the epilogue (0x10082599). A picture whose pixels aren't
  // dword-aligned goes on in the guest after the trap's instruction, which sets ECX to the row length * 4.
  const grayRest = addr(0x100824fb), grayDone = addr(0x10082599);
  cpu.traps.set(addr(0x100824f4), c => {
    const esp = r[4] >>> 0, width = rd(esp + 0x1c), step = r[0] << 2;
    let p = r[5];
    if (p & 3) { r[1] = step; c.eip = grayRest; return; }
    let rows = r[3], before = 0, last = 0;
    do {
      for (let i = p >>> 2, end = i + width; i < end; i++) { const v = last = m32[i], m = grayOf(v); m32[i] = nudged(v, m, m, m, 3); }
      before = p; p = (p + step) | 0;
      rows = (rows - 1) | 0;
    } while (rows !== 0);
    c.alu(0, before, step, 32); c.dec(1, 32);
    wr(esp + 0x10, 0); wr(esp + 0x18, step);
    if (width > 0) {
      const m = grayOf(last);
      wr(esp + 0x14, last);
      r[2] = m + 3; r[3] = width; r[6] = nudge(last & 255, m, 3); r[7] = nudge((last >>> 8) & 255, m, 3);
    } else r[3] = 0;
    r[0] = 0; r[1] = step; r[5] = p;
    c.eip = grayDone;
  });
  // FUN_100825b0 moves each pixel of the first picture 9 levels toward the pixel at the same place in the second. The trap
  // at the test before its row loop (0x10082635), reached with a positive height, does every row and leaves at the epilogue
  // (0x1008272b). Pictures whose pixels aren't dword-aligned go on in the guest after the trap's instruction, which sets
  // ECX to the first picture's row length * 4.
  const fadeRest = addr(0x1008263c), fadeDone = addr(0x1008272b);
  cpu.traps.set(addr(0x10082635), c => {
    const esp = r[4] >>> 0, width = rd(esp + 0x30), stepA = r[7] << 2, stepB = r[0] << 2;
    let a = r[5], b = rd(esp + 0x14);
    if ((a | b) & 3) { r[1] = stepA; c.eip = fadeRest; return; }
    let rows = r[3], before = 0, lastA = 0, lastB = 0, v = 0, t = 0;
    do {
      if (width > 0) {
        for (let i = a >>> 2, j = b >>> 2, end = i + width; i < end; i++, j++) {
          v = m32[i]; t = m32[j];
          m32[i] = nudged(v, (t >>> 16) & 255, (t >>> 8) & 255, t & 255, 9);
        }
        lastA = a; lastB = b;
      }
      b = (b + stepB) | 0; before = a; a = (a + stepA) | 0;
      rows = (rows - 1) | 0;
    } while (rows !== 0);
    c.alu(0, before, stepA, 32); c.dec(1, 32);
    wr(esp + 0x14, b); wr(esp + 0x1c, a); wr(esp + 0x20, 0); wr(esp + 0x28, stepA); wr(esp + 0x2c, stepB);
    if (width > 0) {
      wr(esp + 0x10, t & 255); wr(esp + 0x18, 0); wr(esp + 0x24, (lastB - lastA) | 0);
      r[3] = nudge((v >>> 8) & 255, (t >>> 8) & 255, 9); r[6] = (lastA + (width << 2)) | 0; r[7] = (t & 255) + 9;
    }
    r[0] = 0; r[1] = b; r[2] = stepA; r[5] = a;
    c.eip = fadeDone;
  });

  // The engine's zlib (docs/re/re_loading.md) unpacks every picture it loads, so an animation that loads its pictures as
  // it starts spends most of that frame in two loops: the checksum and the decoder's fast loop.
  // FUN_100a2930's 16-byte loops: a sums the bytes, b sums a after each byte. The trap at the long loop's head
  // (0x100a29f0) runs its EAX turns and leaves at the reduction after it (0x100a2a79), whose MOV and XOR set EAX, EDX and
  // the flags. The trap at the short loop's head (0x100a2ab1) also takes 16 off EBX each turn and leaves at its TEST
  // (0x100a2b3d). Both leave EAX 0 and EDX the last byte, as the loops do.
  const sums16 = (p, turns) => {
    let a = r[1] >>> 0, b = r[7] >>> 0;
    for (const end = p + turns * 16; p < end; p++) { a += m8[p]; b += a; }
    r[0] = 0; r[1] = a; r[2] = m8[p - 1]; r[6] = p; r[7] = b;
  };
  const longSumsDone = addr(0x100a2a79), shortSumsDone = addr(0x100a2b3d);
  cpu.traps.set(addr(0x100a29f0), c => { sums16(r[6] >>> 0, r[0] >>> 0); c.eip = longSumsDone; });
  cpu.traps.set(addr(0x100a2ab1), c => {
    const turns = r[0] >>> 0;
    sums16(r[6] >>> 0, turns); r[3] = (r[3] - turns * 16) | 0;
    c.eip = shortSumsDone;
  });

  // FUN_100a4910, the decoder's fast loop. The trap at the loop's head (0x100a49a2), after the prologue has laid out the
  // frame, decodes until the input passes its last safe byte or the output its last safe place, an end of block, or a bad
  // code, and leaves at the epilogue (0x100a4d28) with the registers it reads: EBX the bit count, EDX the input pointer,
  // EDI the bit buffer, ESI the output pointer, EBP the state. Both pointers point at the byte before the next one, as the
  // loop keeps them. The loop keeps the length in the stack slot of the routine's second argument, which the caller
  // owns, so the trap leaves there the last value the loop would have written.
  const inflateDone = addr(0x100a4d28);
  const tooFarBack = addr(0x1017c9c8), badDistance = addr(0x1017c9e8), badLength = addr(0x1017ca00);
  cpu.traps.set(addr(0x100a49a2), c => {
    const esp = r[4] >>> 0, strm = rd(esp + 0x50) >>> 0, state = r[5] >>> 0;
    const last = rd(esp + 0x30) >>> 0, end = rd(esp + 0x34) >>> 0, beg = rd(esp + 0x44) >>> 0;
    const lcode = rd(esp + 0x20) >>> 0, dcode = rd(esp + 0x24) >>> 0, lmask = rd(esp + 0x38), dmask = rd(esp + 0x3c);
    const wsize = rd(esp + 0x28) >>> 0, window = rd(esp + 0x2c) >>> 0, write = rd(esp + 0x1c) >>> 0, whave = rd(esp + 0x48) >>> 0;
    let inp = r[2] >>> 0, out = r[6] >>> 0, hold = r[7] >>> 0, bits = r[3] >>> 0, slot = rd(esp + 0x54) >>> 0;
    const refill = () => { hold = (hold + (m8[inp + 1] << bits)) >>> 0; inp++; bits = (bits + 8) >>> 0; };
    const copy = (from, n) => { for (; n > 0; n--) m8[++out] = m8[++from]; return from; };
    let here = 0, op = 0;
    const take = () => { op = here & 0xff; const n = (here >>> 8) & 0xff; hold = (hold >>> (n & 31)) >>> 0; bits = (bits - n) >>> 0; };
    decode: do {
      if (bits < 15) { refill(); refill(); }
      here = rd(lcode + (lmask & hold) * 4); take();
      for (;;) {
        if (op === 0) { m8[++out] = (here >>> 16) & 0xff; continue decode; }
        if (op & 0x10) break;
        if (op & 0x40) {
          if (op & 0x20) wr(state, 0xb);
          else { wr(strm + 0x18, badLength); wr(state, 0x1b); }
          break decode;
        }
        slot = 1;
        here = rd(lcode + ((((1 << op) - 1) & hold) + (here >>> 16)) * 4); take();
      }
      slot = here >>> 16;
      op &= 0xf;
      if (op) {
        if (bits < op) refill();
        slot = (slot + (((1 << op) - 1) & hold)) >>> 0;
        hold = (hold >>> op) >>> 0; bits = (bits - op) >>> 0;
      }
      if (bits < 15) { refill(); refill(); }
      here = rd(dcode + (dmask & hold) * 4); take();
      while (!(op & 0x10)) {
        if (op & 0x40) { wr(strm + 0x18, badDistance); wr(state, 0x1b); break decode; }
        here = rd(dcode + ((((1 << op) - 1) & hold) + (here >>> 16)) * 4); take();
      }
      op &= 0xf;
      if (bits < op) { refill(); if (bits < op) refill(); }
      const dist = ((here >>> 16) + (((1 << op) - 1) & hold)) >>> 0;
      bits = (bits - op) >>> 0; hold = (hold >>> op) >>> 0;
      const have = (out - beg) >>> 0;
      let from;
      if (dist <= have) {
        // From the output already written, three bytes a turn while more than two are left.
        from = out - dist;
        do { from = copy(from, 3); slot = (slot - 3) >>> 0; } while (slot > 2);
        if (slot) { m8[++out] = m8[++from]; if (slot > 1) m8[++out] = m8[++from]; }
        continue;
      }
      // From the window, which may wrap, then from the output.
      let n = (dist - have) >>> 0;
      if (n > whave) { wr(strm + 0x18, tooFarBack); wr(state, 0x1b); break; }
      from = window - 1;
      if (write === 0) {
        from += wsize - n;
        if (n < slot) { slot = (slot - n) >>> 0; copy(from, n); from = out - dist; }
      } else if (write < n) {
        from += wsize + write - n; n -= write;
        if (n < slot) {
          slot = (slot - n) >>> 0; copy(from, n);
          from = window - 1;
          if (write < slot) { slot = (slot - write) >>> 0; copy(from, write); from = out - dist; }
        }
      } else {
        from += write - n;
        if (n < slot) { slot = (slot - n) >>> 0; copy(from, n); from = out - dist; }
      }
      // The rest: three bytes a turn while more than two are left, then one or two.
      while (slot > 2) { from = copy(from, 3); slot -= 3; }
      if (slot) { m8[++out] = m8[++from]; if (slot > 1) m8[++out] = m8[++from]; }
    } while (inp < last && out < end);
    wr(esp + 0x54, slot);
    r[2] = inp; r[3] = bits; r[5] = state; r[6] = out; r[7] = hold;
    c.eip = inflateDone;
  });

  // FUN_101074e0(name), the hash the engine finds a file in its archives by (docs/re/re_loading.md): each byte, a-z
  // uppercased and a backslash read as a slash, times a multiplier that steps on after each byte, summed. It measures the
  // name again before each byte, so a load of an animation's files spent a fifth of its frame here. The trap does the
  // call: EAX the hash, EDX the multiplier, ECX the name's length, and the flags of its last compare (of the length with
  // itself), or of testing the length when the name is empty.
  cpu.traps.set(addr(0x101074e0), c => {
    const esp = r[4] >>> 0, name = rd(esp + 4) >>> 0;
    let len = 0;
    while (m8[name + len]) len++;
    let hash = 0, mul = len;
    for (let i = 0; i < len; i++) {
      const b = m8[name + i], s = (b << 24) >> 24;
      const ch = b === 0x5c ? 0x2f : s >= 0x61 && s <= 0x7a ? b - 0x20 : b;
      hash = (hash + Math.imul(ch, mul)) | 0;
      mul = ((mul >>> 16) + Math.imul(mul & 0xffff, 0x4650)) | 0;
    }
    if (len > 0) c.alu(7, len, len, 32); else c.alu(4, 0, 0, 32);
    r[0] = hash; r[1] = len; r[2] = mul;
    r[4] = esp + 4;
    c.eip = rd(esp) >>> 0;
  });

  // FUN_1009c4b0 clears a picture: width × height dwords, or 16-bit pixels in formats 3 and 4, reading the size again each
  // pixel. The traps at its two loops' heads (0x1009c511, 0x1009c4e0), reached with the picture's pixels in EDX and the
  // index 0 in EAX, clear them all and leave at the epilogue (0x1009c527) with EAX and EDI the count, ECX the size's
  // holder and the flags of the last compare. A picture whose pixels overlap its own size or the pointer to it goes on in
  // the guest after the loop's first store.
  const clearDone = addr(0x1009c527);
  const clear = (size, next) => c => {
    const self = r[6] >>> 0, desc = rd(self + 0x14) >>> 0, base = r[2] >>> 0;
    const n = Math.imul(rd(desc + 0x1c), rd(desc + 0x18)), end = base + n * size;
    if (r[0] !== 0 || (base < desc + 0x20 && end > desc + 0x18) || (base < self + 0x18 && end > self + 0x14)) {
      for (let i = 0; i < size; i++) m8[base + r[0] * size + i] = 0;
      c.eip = next;
      return;
    }
    m8.fill(0, base, end);
    c.alu(7, n, n, 32);
    r[0] = n; r[1] = desc; r[7] = n;
    c.eip = clearDone;
  };
  cpu.traps.set(addr(0x1009c511), clear(4, addr(0x1009c518)));
  cpu.traps.set(addr(0x1009c4e0), clear(2, addr(0x1009c4e6)));

  // FUN_10163f40(i), a thiscall on the description reader's ring buffer (docs/re/re_loading.md): the byte i places past
  // the read position. The trap does the call when the byte is in the buffer already (i below both the capacity and the
  // bytes filled): AL the byte over the rest of EAX the capacity less 1, ECX the buffer, and the flags of comparing the
  // bytes filled with i. Otherwise the guest runs the call from its second instruction, to fill the buffer.
  const peekRest = addr(0x10163f41);
  cpu.traps.set(addr(0x10163f40), c => {
    const esp = r[4] >>> 0, self = r[1] >>> 0, i = rd(esp + 4), cap = rd(self), filled = rd(self + 0x10);
    if (i >= cap || filled <= i) { wr(esp - 4, r[3]); r[4] = esp - 4; c.eip = peekRest; return; }
    const buf = rd(self + 4), mask = (cap - 1) | 0;
    c.alu(7, filled, i, 32);
    r[0] = (mask & ~0xff) | m8[(((rd(self + 0xc) + i) & mask) + buf) >>> 0];
    r[1] = buf;
    r[4] = esp + 8;
    c.eip = rd(esp) >>> 0;
  });
}
