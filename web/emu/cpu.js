// 32-bit x86 user-mode CPU for running ResetGeneration-Win32-Web.dll in JavaScript.
// Flat memory, no paging, no privilege checks. Each instruction is decoded once into a closure
// cached by address. Flags are lazy: the last ALU result is kept and flags are derived on demand.
import { decodeFPU, FPU } from './fpu.js';
import { compileBlock } from './jit.js';

export const EAX = 0, ECX = 1, EDX = 2, EBX = 3, ESP = 4, EBP = 5, ESI = 6, EDI = 7;

// Lazy flag sources.
const F_ADD = 1, F_SUB = 2, F_LOGIC = 3, F_INC = 4, F_DEC = 5, F_SHIFT = 6, F_MUL = 7, F_EXPL = 8;
const CF = 1, PF = 4, AF = 16, ZF = 64, SF = 128, DF = 1024, OF = 2048;
const MASK = { 8: 0xff, 16: 0xffff, 32: 0xffffffff };
const SIGN = { 8: 0x80, 16: 0x8000, 32: 0x80000000 };
const PARITY = new Uint8Array(256).map((_, i) => {
  let p = 1; for (let b = i; b; b >>= 1) p ^= b & 1; return p;
});

export class CpuFault extends Error {
  constructor(msg, eip) { super(`${msg} at eip=0x${(eip >>> 0).toString(16)}`); this.eip = eip; }
}

export class CPU {
  constructor(memSize) {
    this.mem = new ArrayBuffer(memSize);
    this.m8 = new Uint8Array(this.mem);
    this.dv = new DataView(this.mem);
    this.r = new Int32Array(8);
    this.eip = 0;
    this.fsBase = 0;
    this.df = 0;
    this.lop = F_EXPL; this.lres = 0; this.la = 0; this.lb = 0; this.lsz = 32; this.lcin = 0;
    this.lflags = 0; this.lcf = 0; this.lof = 0;
    this.fpu = new FPU(this);
    this.xmm = new DataView(new ArrayBuffer(8 * 16));
    this.codeBase = 0; this.codeCache = []; this.otherCache = new Map();
    this.traps = new Map();   // address -> handler(cpu), for import thunks and host callbacks
    this.icount = 0;
    this.jit = true;
  }

  // Code at [base, base+size) is cached in a dense array; everything else in a Map.
  setCodeRange(base, size) { this.codeBase = base; this.codeCache = new Array(size).fill(undefined); }

  // ---- memory ----
  rd8(a) { return this.m8[a]; }
  rd16(a) { return this.dv.getUint16(a, true); }
  rd32(a) { return this.dv.getInt32(a, true); }
  wr8(a, v) { this.m8[a] = v; }
  wr16(a, v) { this.dv.setUint16(a, v & 0xffff, true); }
  wr32(a, v) { this.dv.setInt32(a, v | 0, true); }
  push(v) { const sp = (this.r[ESP] - 4) | 0; this.r[ESP] = sp; this.dv.setInt32(sp >>> 0, v | 0, true); }
  pop() { const sp = this.r[ESP]; const v = this.dv.getInt32(sp >>> 0, true); this.r[ESP] = (sp + 4) | 0; return v; }
  readCString(a) { let s = ''; for (let c; (c = this.m8[a]); a++) s += String.fromCharCode(c); return s; }
  writeCString(a, s) { for (let i = 0; i < s.length; i++) this.m8[a + i] = s.charCodeAt(i) & 0xff; this.m8[a + s.length] = 0; }

  // ---- flags ----
  setFlags(op, res, a, b, sz, cin = 0) {
    const m = MASK[sz];
    this.lop = op; this.lres = (res & m) >>> 0; this.la = (a & m) >>> 0; this.lb = (b & m) >>> 0; this.lsz = sz; this.lcin = cin;
  }
  getCF() {
    switch (this.lop) {
      case F_ADD: return this.lcin ? this.lres <= this.la : this.lres < this.la;
      case F_SUB: return this.lcin ? this.la <= this.lb : this.la < this.lb;
      case F_LOGIC: return false;
      case F_INC: case F_DEC: return !!this.lcf;
      case F_SHIFT: case F_MUL: return !!this.lcf;
      default: return (this.lflags & CF) !== 0;
    }
  }
  getZF() { return this.lop === F_EXPL ? (this.lflags & ZF) !== 0 : this.lres === 0; }
  getSF() { return this.lop === F_EXPL ? (this.lflags & SF) !== 0 : (this.lres & SIGN[this.lsz]) !== 0; }
  getPF() { return this.lop === F_EXPL ? (this.lflags & PF) !== 0 : PARITY[this.lres & 0xff] === 1; }
  getOF() {
    const s = SIGN[this.lsz];
    switch (this.lop) {
      case F_ADD: return ((this.la ^ this.lres) & (this.lb ^ this.lres) & s) !== 0;
      case F_SUB: return ((this.la ^ this.lb) & (this.la ^ this.lres) & s) !== 0;
      case F_LOGIC: return false;
      case F_INC: return this.lres === s;
      case F_DEC: return this.lres === ((s - 1) >>> 0);
      case F_SHIFT: case F_MUL: return !!this.lof;
      default: return (this.lflags & OF) !== 0;
    }
  }
  getAF() {
    switch (this.lop) {
      case F_ADD: case F_SUB: return ((this.la ^ this.lb ^ this.lres) & 0x10) !== 0;
      case F_INC: return (this.lres & 0xf) === 0;
      case F_DEC: return (this.lres & 0xf) === 0xf;
      case F_EXPL: return (this.lflags & AF) !== 0;
      default: return false;
    }
  }
  materialize() {
    if (this.lop === F_EXPL) return;
    this.lflags = (this.getCF() ? CF : 0) | (this.getPF() ? PF : 0) | (this.getAF() ? AF : 0) |
      (this.getZF() ? ZF : 0) | (this.getSF() ? SF : 0) | (this.getOF() ? OF : 0);
    this.lop = F_EXPL;
  }
  getEflags() { this.materialize(); return this.lflags | 2 | 0x200 | (this.df ? DF : 0); }
  setEflags(v) { this.lop = F_EXPL; this.lflags = v & (CF | PF | AF | ZF | SF | OF); this.df = (v & DF) ? 1 : 0; }
  setCFOnly(on) { this.materialize(); this.lflags = on ? this.lflags | CF : this.lflags & ~CF; }
  cond(n) {
    // Fast path for cmp/sub results, the overwhelmingly common case before a jcc.
    if (this.lop === F_SUB && this.lcin === 0) {
      const a = this.la, b = this.lb;
      switch (n) {
        case 2: return a < b; case 3: return a >= b; case 4: return a === b; case 5: return a !== b;
        case 6: return a <= b; case 7: return a > b;
        case 12: case 13: case 14: case 15: {
          const sh = 32 - this.lsz, sa = (a << sh) >> sh, sb = (b << sh) >> sh;
          return n === 12 ? sa < sb : n === 13 ? sa >= sb : n === 14 ? sa <= sb : sa > sb;
        }
      }
    }
    switch (n) {
      case 0: return this.getOF(); case 1: return !this.getOF();
      case 2: return this.getCF(); case 3: return !this.getCF();
      case 4: return this.getZF(); case 5: return !this.getZF();
      case 6: return this.getCF() || this.getZF(); case 7: return !this.getCF() && !this.getZF();
      case 8: return this.getSF(); case 9: return !this.getSF();
      case 10: return this.getPF(); case 11: return !this.getPF();
      case 12: return this.getSF() !== this.getOF(); case 13: return this.getSF() === this.getOF();
      case 14: return this.getZF() || this.getSF() !== this.getOF();
      default: return !this.getZF() && this.getSF() === this.getOF();
    }
  }

  // ---- ALU ----
  alu(op, a, b, sz) {
    let r;
    switch (op) {
      case 0: r = a + b; this.setFlags(F_ADD, r, a, b, sz); return r;
      case 1: r = a | b; this.setFlags(F_LOGIC, r, a, b, sz); return r;
      case 2: { const c = this.getCF() ? 1 : 0; r = a + b + c; this.setFlags(F_ADD, r, a, b, sz, c); return r; }
      case 3: { const c = this.getCF() ? 1 : 0; r = a - b - c; this.setFlags(F_SUB, r, a, b, sz, c); return r; }
      case 4: r = a & b; this.setFlags(F_LOGIC, r, a, b, sz); return r;
      case 5: case 7: r = a - b; this.setFlags(F_SUB, r, a, b, sz); return r;
      default: r = a ^ b; this.setFlags(F_LOGIC, r, a, b, sz); return r;
    }
  }
  inc(a, sz) { this.lcf = this.getCF() ? 1 : 0; const r = a + 1; this.setFlags(F_INC, r, a, 1, sz); return r; }
  dec(a, sz) { this.lcf = this.getCF() ? 1 : 0; const r = a - 1; this.setFlags(F_DEC, r, a, 1, sz); return r; }

  // Shift/rotate group (C0/C1/D0-D3): op = reg field, count already masked to 5 bits.
  shift(op, v, cnt, sz) {
    if (cnt === 0) return v;
    const m = MASK[sz], s = SIGN[sz];
    v = (v & m) >>> 0;
    let r, cf, of;
    switch (op) {
      case 0: case 1: case 2: case 3: { // rol, ror, rcl, rcr: only CF/OF change
        this.materialize();
        let c = (this.lflags & CF) ? 1 : 0;
        if (op === 0) { const k = cnt % sz; r = k ? ((v << k) | (v >>> (sz - k))) & m : v; cf = r & 1; of = ((r & s) !== 0) !== !!cf; }
        else if (op === 1) { const k = cnt % sz; r = k ? ((v >>> k) | (v << (sz - k))) & m : v; cf = (r & s) !== 0 ? 1 : 0; of = ((r & s) !== 0) !== ((r & (s >>> 1)) !== 0); }
        else if (op === 2) { r = v; for (let i = 0; i < cnt % (sz + 1); i++) { const out = (r & s) ? 1 : 0; r = ((r << 1) | c) & m; c = out; } cf = c; of = ((r & s) !== 0) !== !!c; }
        else { r = v; of = ((r & s) !== 0) !== !!c; for (let i = 0; i < cnt % (sz + 1); i++) { const out = r & 1; r = ((r >>> 1) | (c ? s : 0)) & m; c = out; } cf = c; }
        r >>>= 0;
        this.lflags = (this.lflags & ~(CF | OF)) | (cf ? CF : 0) | (of ? OF : 0);
        return r;
      }
      case 4: case 6: // shl
        r = cnt < 32 ? (v << cnt) & m : 0; cf = cnt <= sz ? (v >>> (sz - cnt)) & 1 : 0;
        of = ((r & s) !== 0) !== !!cf; break;
      case 5: // shr
        r = cnt < 32 ? v >>> cnt : 0; cf = (v >>> (cnt - 1)) & 1; of = (v & s) !== 0; break;
      default: { // sar
        const sv = (v << (32 - sz)) >> (32 - sz);
        r = (sv >> Math.min(cnt, 31)) & m; cf = (sv >> Math.min(cnt - 1, 31)) & 1; of = false;
      }
    }
    this.lop = F_SHIFT; this.lres = r >>> 0; this.lsz = sz; this.lcf = cf; this.lof = of ? 1 : 0;
    return r;
  }

  // ---- execution ----
  run(maxInstr) {
    const cache = this.codeCache, base = this.codeBase, size = cache.length;
    let n = 0;
    while (n < maxInstr && !this.stop) {
      const eip = this.eip, off = eip - base;
      let f = off >= 0 && off < size ? cache[off] : this.otherCache.get(eip);
      if (f === undefined) f = this.fetch(eip);
      const k = f();
      n += k === undefined ? 1 : k;
    }
    this.icount += n;
    return n;
  }
  fetch(eip) {
    const trap = this.traps.get(eip);
    const off0 = eip - this.codeBase;
    const f = trap ? () => trap(this) : this.jit && off0 >= 0 && off0 < this.codeCache.length ? compileBlock(this, eip) : this.decode(eip);
    const off = eip - this.codeBase;
    if (off >= 0 && off < this.codeCache.length) this.codeCache[off] = f; else this.otherCache.set(eip, f);
    return f;
  }
  // Calls fn at address with stdcall/cdecl args and runs until it returns to a sentinel.
  call(addr, args = [], limit = 2e9) {
    // Each nesting level returns to its own sentinel, so JS called from the guest can call back in.
    this.depth = (this.depth || 0) + 1;
    const SENTINEL = this.sentinel + this.depth * 4, savedEip = this.eip, savedEsp = this.r[ESP];
    for (let i = args.length - 1; i >= 0; i--) this.push(args[i]);
    this.push(SENTINEL);
    const savedStop = this.stop;
    this.eip = addr >>> 0;
    this.stop = false;
    let done = false;
    this.traps.set(SENTINEL, () => { done = true; this.stop = true; });
    this.otherCache.delete(SENTINEL);
    while (!done) {
      this.run(limit);
      if (!done && this.stop) throw new CpuFault('stopped inside call', this.eip);
    }
    this.stop = savedStop;
    this.depth--;
    this.r[ESP] = savedEsp; // works for both stdcall and cdecl callees
    this.eip = savedEip;
    return this.r[EAX];
  }

  // ---- decoder ----
  decode(start) {
    const c = this, m8 = this.m8, dv = this.dv, r = this.r;
    let p = start >>> 0;
    let opsize = 32, rep = 0, seg = 0;
    for (;;) {
      const b = m8[p];
      if (b === 0x66) opsize = 16;
      else if (b === 0xf3) rep = 1;
      else if (b === 0xf2) rep = 2;
      else if (b === 0x64) seg = 1;
      else if (b === 0x65 || b === 0x26 || b === 0x2e || b === 0x36 || b === 0x3e || b === 0xf0) { /* ignored */ }
      else if (b === 0x67) throw new CpuFault('16-bit addressing not supported', start);
      else break;
      p++;
    }
    const u8 = () => m8[p++];
    const s8 = () => (m8[p++] << 24) >> 24;
    const u16 = () => { const v = dv.getUint16(p, true); p += 2; return v; };
    const s32 = () => { const v = dv.getInt32(p, true); p += 4; return v; };
    const imm = sz => sz === 8 ? u8() : sz === 16 ? u16() : s32();
    const segBase = seg ? () => c.fsBase : null;

    // ModRM: returns { mod, reg, rm, ea } where ea is an address closure, or null for register operands.
    const modrm = () => {
      const b = u8(), mod = b >> 6, reg = (b >> 3) & 7, rm = b & 7;
      if (mod === 3) return { mod, reg, rm, ea: null };
      let base = -1, index = -1, scale = 0, disp = 0;
      if (rm === 4) {
        const sib = u8(); scale = sib >> 6; index = (sib >> 3) & 7; base = sib & 7;
        if (index === 4) index = -1;
        if (base === 5 && mod === 0) { base = -1; disp = s32(); }
      } else if (rm === 5 && mod === 0) { disp = s32(); }
      else base = rm;
      if (mod === 1) disp = s8(); else if (mod === 2) disp = s32();
      let ea;
      const sc = 1 << scale;
      if (base >= 0 && index >= 0) ea = sc === 1 ? () => (r[base] + r[index] + disp) >>> 0 : () => (r[base] + r[index] * sc + disp) >>> 0;
      else if (base >= 0) ea = disp ? () => (r[base] + disp) >>> 0 : () => r[base] >>> 0;
      else if (index >= 0) ea = () => (r[index] * sc + disp) >>> 0;
      else { const a = disp >>> 0; ea = () => a; }
      if (segBase) { const e = ea; ea = () => (e() + c.fsBase) >>> 0; }
      return { mod, reg, rm, ea };
    };
    // Register accessors by size.
    const getReg = (sz, i) => sz === 32 ? () => r[i] : sz === 16 ? () => r[i] & 0xffff
      : i < 4 ? () => r[i] & 0xff : () => (r[i - 4] >> 8) & 0xff;
    const setReg = (sz, i) => sz === 32 ? v => { r[i] = v; } : sz === 16 ? v => { r[i] = (r[i] & ~0xffff) | (v & 0xffff); }
      : i < 4 ? v => { r[i] = (r[i] & ~0xff) | (v & 0xff); } : v => { r[i - 4] = (r[i - 4] & ~0xff00) | ((v & 0xff) << 8); };
    const rdm = sz => sz === 32 ? a => dv.getInt32(a, true) : sz === 16 ? a => dv.getUint16(a, true) : a => m8[a];
    const wrm = sz => sz === 32 ? (a, v) => dv.setInt32(a, v | 0, true) : sz === 16 ? (a, v) => dv.setUint16(a, v & 0xffff, true) : (a, v) => { m8[a] = v; };
    const getRM = (mr, sz) => mr.ea ? (rd => { const ea = mr.ea; return () => rd(ea()); })(rdm(sz)) : getReg(sz, mr.rm);
    const setRM = (mr, sz) => mr.ea ? ((wr, ea) => v => wr(ea(), v))(wrm(sz), mr.ea) : setReg(sz, mr.rm);
    // Read-modify-write on r/m: fn(old) -> new value, or undefined to skip the write.
    const rmw = (mr, sz, fn) => {
      if (!mr.ea) { const g = getReg(sz, mr.rm), s = setReg(sz, mr.rm); return () => { const v = fn(g()); if (v !== undefined) s(v); }; }
      const ea = mr.ea, rd = rdm(sz), wr = wrm(sz);
      return () => { const a = ea(); const v = fn(rd(a)); if (v !== undefined) wr(a, v); };
    };
    const sext = sz => sz === 8 ? v => (v << 24) >> 24 : sz === 16 ? v => (v << 16) >> 16 : v => v | 0;

    const op = u8();
    let exec; // the instruction body; next eip is set before it runs unless it branches
    const done = body => { const next = p >>> 0; c.lastNext = next; return () => { c.eip = next; body(); }; };
    const branch = body => body; // body sets c.eip itself

    // ALU block 00-3F
    if (op < 0x40 && (op & 7) < 6) {
      const aop = op >> 3, form = op & 7;
      if (form === 4 || form === 5) {
        const sz = form === 4 ? 8 : opsize, v = imm(sz), g = getReg(sz, EAX), s = setReg(sz, EAX);
        return done(aop === 7 ? () => { c.alu(7, g(), v, sz); } : () => { s(c.alu(aop, g(), v, sz)); });
      }
      const sz = (form & 1) ? opsize : 8, mr = modrm();
      if (form < 2) { // r/m, reg
        const src = getReg(sz, mr.reg);
        return done(rmw(mr, sz, aop === 7 ? old => { c.alu(7, old, src(), sz); } : old => c.alu(aop, old, src(), sz)));
      }
      const dst = getReg(sz, mr.reg), set = setReg(sz, mr.reg), src = getRM(mr, sz);
      return done(aop === 7 ? () => { c.alu(7, dst(), src(), sz); } : () => { set(c.alu(aop, dst(), src(), sz)); });
    }
    switch (op) {
      case 0x0f: return this.decode0F(start, p, opsize, rep, seg, { u8, s8, u16, s32, imm, modrm, getReg, setReg, getRM, setRM, rmw, rdm, wrm, done, sext, get p() { return p; } });
      case 0x27: return done(() => { // daa
        let al = r[EAX] & 0xff; const cf0 = c.getCF(), af0 = c.getAF(); c.materialize(); let f = c.lflags & ~(CF | AF);
        if ((al & 0xf) > 9 || af0) { al += 6; f |= AF; } if ((r[EAX] & 0xff) > 0x99 || cf0) { al += 0x60; f |= CF; }
        al &= 0xff; r[EAX] = (r[EAX] & ~0xff) | al; c.lflags = (f & ~(ZF | SF | PF)) | (al ? 0 : ZF) | (al & 0x80 ? SF : 0) | (PARITY[al] ? PF : 0);
      });
    }
    if (op >= 0x40 && op <= 0x47) { const i = op - 0x40, sz = opsize, g = getReg(sz, i), s = setReg(sz, i); return done(() => s(c.inc(g(), sz))); }
    if (op >= 0x48 && op <= 0x4f) { const i = op - 0x48, sz = opsize, g = getReg(sz, i), s = setReg(sz, i); return done(() => s(c.dec(g(), sz))); }
    if (op >= 0x50 && op <= 0x57) { const i = op - 0x50; return done(() => c.push(r[i])); }
    if (op >= 0x58 && op <= 0x5f) { const i = op - 0x58; return done(() => { r[i] = c.pop(); }); }
    if (op >= 0x70 && op <= 0x7f) {
      const cc = op - 0x70, d = s8(), next = p >>> 0, target = (next + d) >>> 0;
      return () => { c.eip = c.cond(cc) ? target : next; };
    }
    if (op >= 0x91 && op <= 0x97) { const i = op - 0x90, sz = opsize, g = getReg(sz, i), s = setReg(sz, i), ga = getReg(sz, EAX), sa = setReg(sz, EAX); return done(() => { const t = g(); s(ga()); sa(t); }); }
    if (op >= 0xb0 && op <= 0xb7) { const v = u8(), s = setReg(8, op - 0xb0); return done(() => s(v)); }
    if (op >= 0xb8 && op <= 0xbf) { const v = imm(opsize), s = setReg(opsize, op - 0xb8); return done(() => s(v)); }
    if (op >= 0xd8 && op <= 0xdf) return done(decodeFPU(c, op, modrm, () => p));

    switch (op) {
      case 0x60: return done(() => { const sp = r[ESP]; for (let i = 0; i < 8; i++) c.push(i === ESP ? sp : r[i]); });
      case 0x61: return done(() => { for (let i = 7; i >= 0; i--) { const v = c.pop(); if (i !== ESP) r[i] = v; } });
      case 0x68: { const v = s32(); return done(() => c.push(v)); }
      case 0x6a: { const v = s8(); return done(() => c.push(v)); }
      case 0x69: case 0x6b: {
        const sz = opsize, mr = modrm(), v = op === 0x6b ? s8() : imm(sz), src = getRM(mr, sz), s = setReg(sz, mr.reg), sx = sext(sz);
        return done(() => s(c.imul2(sx(src()), v, sz)));
      }
      case 0x80: case 0x82: case 0x81: case 0x83: {
        const sz = op === 0x81 || op === 0x83 ? opsize : 8, mr = modrm();
        const v = op === 0x83 ? s8() : imm(sz), aop = mr.reg;
        return done(rmw(mr, sz, aop === 7 ? old => { c.alu(7, old, v, sz); } : old => c.alu(aop, old, v, sz)));
      }
      case 0x84: case 0x85: { const sz = op === 0x84 ? 8 : opsize, mr = modrm(), a = getRM(mr, sz), b = getReg(sz, mr.reg); return done(() => { c.alu(4, a(), b(), sz); }); }
      case 0x86: case 0x87: {
        const sz = op === 0x86 ? 8 : opsize, mr = modrm(), g = getReg(sz, mr.reg), s = setReg(sz, mr.reg);
        return done(rmw(mr, sz, old => { const t = g(); s(old); return t; }));
      }
      case 0x88: case 0x89: { const sz = op === 0x88 ? 8 : opsize, mr = modrm(), g = getReg(sz, mr.reg), s = setRM(mr, sz); return done(() => s(g())); }
      case 0x8a: case 0x8b: { const sz = op === 0x8a ? 8 : opsize, mr = modrm(), g = getRM(mr, sz), s = setReg(sz, mr.reg); return done(() => s(g())); }
      case 0x8c: { const mr = modrm(), s = setRM(mr, 16); return done(() => s(0x23)); } // mov r/m, sreg
      case 0x8d: { const mr = modrm(), ea = mr.ea, s = setReg(opsize, mr.reg); return done(() => s(ea())); }
      case 0x8e: { modrm(); return done(() => {}); }
      case 0x8f: { const mr = modrm(), s = setRM(mr, 32); return done(() => s(c.pop())); }
      case 0x90: return done(() => {});
      case 0x98: return done(opsize === 16 ? () => { r[EAX] = (r[EAX] & ~0xffff) | (((r[EAX] << 24) >> 24) & 0xffff); } : () => { r[EAX] = (r[EAX] << 16) >> 16; });
      case 0x99: return done(opsize === 16 ? () => { r[EDX] = (r[EDX] & ~0xffff) | ((r[EAX] & 0x8000) ? 0xffff : 0); } : () => { r[EDX] = r[EAX] >> 31; });
      case 0x9b: return done(() => {});
      case 0x9c: return done(() => c.push(c.getEflags()));
      case 0x9d: return done(() => c.setEflags(c.pop()));
      case 0x9e: return done(() => { c.materialize(); c.lflags = (c.lflags & ~0xff) | ((r[EAX] >> 8) & (CF | PF | AF | ZF | SF)); });
      case 0x9f: return done(() => { const f = c.getEflags() & 0xff; r[EAX] = (r[EAX] & ~0xff00) | (f << 8); });
      case 0xa0: case 0xa1: case 0xa2: case 0xa3: {
        const sz = op & 1 ? opsize : 8, addr = s32() >>> 0, ea = seg ? () => (addr + c.fsBase) >>> 0 : () => addr;
        const rd = rdm(sz), wr = wrm(sz), g = getReg(sz, EAX), s = setReg(sz, EAX);
        return done(op < 0xa2 ? () => s(rd(ea())) : () => wr(ea(), g()));
      }
      case 0xa8: case 0xa9: { const sz = op === 0xa8 ? 8 : opsize, v = imm(sz), g = getReg(sz, EAX); return done(() => { c.alu(4, g(), v, sz); }); }
      case 0xa4: case 0xa5: case 0xa6: case 0xa7: case 0xaa: case 0xab: case 0xac: case 0xad: case 0xae: case 0xaf:
        return done(this.stringOp(op, op & 1 ? opsize : 8, rep));
      case 0xc0: case 0xc1: case 0xd0: case 0xd1: case 0xd2: case 0xd3: {
        const sz = op & 1 ? opsize : 8, mr = modrm(), sop = mr.reg;
        if (op <= 0xc1) { const n = u8() & 31; return done(rmw(mr, sz, old => c.shift(sop, old, n, sz))); }
        if (op <= 0xd1) return done(rmw(mr, sz, old => c.shift(sop, old, 1, sz)));
        return done(rmw(mr, sz, old => c.shift(sop, old, r[ECX] & 31, sz)));
      }
      case 0xc2: { const n = u16(); return () => { c.eip = c.pop() >>> 0; r[ESP] += n; }; }
      case 0xc3: return () => { c.eip = c.pop() >>> 0; };
      case 0xc6: case 0xc7: { const sz = op === 0xc6 ? 8 : opsize, mr = modrm(), v = imm(sz), s = setRM(mr, sz); return done(() => s(v)); }
      case 0xc8: { const n = u16(), lvl = u8(); if (lvl) throw new CpuFault('enter with nesting', start); return done(() => { c.push(r[EBP]); r[EBP] = r[ESP]; r[ESP] -= n; }); }
      case 0xc9: return done(() => { r[ESP] = r[EBP]; r[EBP] = c.pop(); });
      case 0xcc: return () => { throw new CpuFault('int3', start); };
      case 0xcd: { const n = u8(); return () => { throw new CpuFault(`int 0x${n.toString(16)}`, start); }; }
      case 0xe0: case 0xe1: case 0xe2: {
        const d = s8(), next = p >>> 0, target = (next + d) >>> 0;
        return () => { r[ECX] = (r[ECX] - 1) | 0; const z = op === 0xe2 ? true : op === 0xe1 ? c.getZF() : !c.getZF(); c.eip = r[ECX] !== 0 && z ? target : next; };
      }
      case 0xe3: { const d = s8(), next = p >>> 0, target = (next + d) >>> 0; return () => { c.eip = r[ECX] === 0 ? target : next; }; }
      case 0xe8: { const d = s32(), next = p >>> 0, target = (next + d) >>> 0; return () => { c.push(next); c.eip = target; }; }
      case 0xe9: { const d = s32(), target = ((p >>> 0) + d) >>> 0; return () => { c.eip = target; }; }
      case 0xeb: { const d = s8(), target = ((p >>> 0) + d) >>> 0; return () => { c.eip = target; }; }
      case 0xf4: return () => { throw new CpuFault('hlt', start); };
      case 0xf5: return done(() => c.setCFOnly(!c.getCF()));
      case 0xf8: return done(() => c.setCFOnly(false));
      case 0xf9: return done(() => c.setCFOnly(true));
      case 0xfa: case 0xfb: return done(() => {});
      case 0xfc: return done(() => { c.df = 0; });
      case 0xfd: return done(() => { c.df = 1; });
      case 0xf6: case 0xf7: {
        const sz = op === 0xf6 ? 8 : opsize, mr = modrm(), g = getRM(mr, sz);
        switch (mr.reg) {
          case 0: case 1: { const v = imm(sz); return done(() => { c.alu(4, g(), v, sz); }); }
          case 2: return done(rmw(mr, sz, old => ~old));
          case 3: return done(rmw(mr, sz, old => { const res = -old; c.setFlags(F_SUB, res, 0, old, sz); return res; }));
          case 4: return done(() => c.mul1(g(), sz, false));
          case 5: return done(() => c.mul1(g(), sz, true));
          case 6: return done(() => c.div1(g(), sz, false));
          default: return done(() => c.div1(g(), sz, true));
        }
      }
      case 0xfe: case 0xff: {
        const sz = op === 0xfe ? 8 : opsize, mr = modrm();
        switch (mr.reg) {
          case 0: return done(rmw(mr, sz, old => c.inc(old, sz)));
          case 1: return done(rmw(mr, sz, old => c.dec(old, sz)));
          case 2: { const g = getRM(mr, 32), next = p >>> 0; return () => { const t = g() >>> 0; c.push(next); c.eip = t; }; }
          case 4: { const g = getRM(mr, 32); return () => { c.eip = g() >>> 0; }; }
          case 6: { const g = getRM(mr, 32); return done(() => c.push(g())); }
        }
      }
    }
    throw new CpuFault(`unknown opcode 0x${op.toString(16)}`, start);
  }

  decode0F(start, p0, opsize, rep, seg, d) {
    const c = this, r = this.r;
    const { u8, s32, modrm, getReg, setReg, getRM, setRM, rmw, done, sext } = d;
    const op = u8();
    if (op >= 0x80 && op <= 0x8f) { const cc = op - 0x80, dd = s32(), next = d.p >>> 0, target = (next + dd) >>> 0; return () => { c.eip = c.cond(cc) ? target : next; }; }
    if (op >= 0x90 && op <= 0x9f) { const cc = op - 0x90, mr = modrm(), s = setRM(mr, 8); return done(() => s(c.cond(cc) ? 1 : 0)); }
    if (op >= 0x40 && op <= 0x4f) { const cc = op - 0x40, mr = modrm(), g = getRM(mr, opsize), s = setReg(opsize, mr.reg); return done(() => { const v = g(); if (c.cond(cc)) s(v); }); }
    if (op >= 0xc8 && op <= 0xcf) { const i = op - 0xc8; return done(() => { const v = r[i]; r[i] = ((v & 0xff) << 24) | ((v & 0xff00) << 8) | ((v >>> 8) & 0xff00) | (v >>> 24); }); }
    switch (op) {
      case 0x31: return done(() => { const t = Math.floor(performance.now() * 1e6); r[EAX] = t | 0; r[EDX] = Math.floor(t / 4294967296) | 0; });
      case 0xa2: return done(() => { // cpuid: Pentium-class, FPU + TSC + CX8 + CMOV, no MMX/SSE
        const leaf = r[EAX];
        if (leaf === 0) { r[EAX] = 1; r[EBX] = 0x756e6547; r[EDX] = 0x49656e69; r[ECX] = 0x6c65746e; }
        else { r[EAX] = 0x633; r[EBX] = 0; r[ECX] = 0; r[EDX] = 1 | 16 | 256 | 0x8000; }
      });
      case 0xaf: { const mr = modrm(), g = getRM(mr, opsize), s = setReg(opsize, mr.reg), gr = getReg(opsize, mr.reg), sx = sext(opsize); return done(() => s(c.imul2(sx(gr()), sx(g()), opsize))); }
      case 0xb6: case 0xb7: { const mr = modrm(), g = getRM(mr, op === 0xb6 ? 8 : 16), s = setReg(opsize, mr.reg); return done(() => s(g())); }
      case 0xbe: case 0xbf: { const ssz = op === 0xbe ? 8 : 16, mr = modrm(), g = getRM(mr, ssz), s = setReg(opsize, mr.reg), sx = sext(ssz); return done(() => s(sx(g()))); }
      case 0xa3: case 0xab: case 0xb3: case 0xbb: case 0xba: {
        const mr = modrm(); let bitSrc, kind;
        if (op === 0xba) { const n = u8(); bitSrc = () => n; kind = mr.reg - 4; }
        else { bitSrc = getReg(opsize, mr.reg); kind = { 0xa3: 0, 0xab: 1, 0xb3: 2, 0xbb: 3 }[op]; }
        if (mr.ea && op !== 0xba) { // memory bit string: bit offset may exceed the operand
          const ea = mr.ea;
          return done(() => {
            const bit = bitSrc() | 0, a = (ea() + (bit >> 3)) >>> 0, mask = 1 << (bit & 7), v = c.m8[a];
            c.setCFOnly((v & mask) !== 0);
            if (kind === 1) c.m8[a] = v | mask; else if (kind === 2) c.m8[a] = v & ~mask; else if (kind === 3) c.m8[a] = v ^ mask;
          });
        }
        return done(rmw(mr, opsize, old => {
          const mask = 1 << (bitSrc() & (opsize - 1)); c.setCFOnly((old & mask) !== 0);
          return kind === 0 ? undefined : kind === 1 ? old | mask : kind === 2 ? old & ~mask : old ^ mask;
        }));
      }
      case 0xa4: case 0xa5: case 0xac: case 0xad: {
        const mr = modrm(), src = getReg(32, mr.reg), left = op < 0xac;
        const cnt = op & 1 ? () => r[ECX] & 31 : (n => () => n)(u8() & 31);
        return done(rmw(mr, 32, old => {
          const n = cnt(); if (!n) return undefined;
          const res = left ? (old << n) | (src() >>> (32 - n)) : (old >>> n) | (src() << (32 - n));
          const cf = left ? (old >>> (32 - n)) & 1 : (old >>> (n - 1)) & 1;
          c.lop = F_SHIFT; c.lres = res >>> 0; c.lsz = 32; c.lcf = cf; c.lof = ((res ^ old) < 0) ? 1 : 0;
          return res;
        }));
      }
      case 0xbc: case 0xbd: {
        const mr = modrm(), g = getRM(mr, opsize), s = setReg(opsize, mr.reg);
        return done(() => {
          const v = g() >>> 0; c.materialize();
          if (!v) { c.lflags |= ZF; return; }
          c.lflags &= ~ZF; s(op === 0xbc ? 31 - Math.clz32(v & -v) : 31 - Math.clz32(v));
        });
      }
      case 0xb0: case 0xb1: {
        const sz = op === 0xb0 ? 8 : opsize, mr = modrm(), src = getReg(sz, mr.reg), ga = getReg(sz, EAX), sa = setReg(sz, EAX);
        return done(rmw(mr, sz, old => { c.alu(7, ga(), old, sz); if (c.getZF()) return src(); sa(old); return old; }));
      }
      case 0xc0: case 0xc1: {
        const sz = op === 0xc0 ? 8 : opsize, mr = modrm(), g = getReg(sz, mr.reg), s = setReg(sz, mr.reg);
        return done(rmw(mr, sz, old => { const sum = c.alu(0, old, g(), sz); s(old); return sum; }));
      }
    }
    throw new CpuFault(`unknown opcode 0x0f 0x${op.toString(16)}`, start);
  }

  imul2(a, b, sz) {
    const full = Math.imul(a, b), wide = a * b, m = MASK[sz];
    const sh = 32 - sz, res = sz === 32 ? full : (full << sh) >> sh;
    const of = sz === 32 ? (wide !== full) : (res !== wide);
    this.lop = F_MUL; this.lres = (res & m) >>> 0; this.lsz = sz; this.lcf = this.lof = of ? 1 : 0;
    return res;
  }
  // One-operand mul/imul into AX / DX:AX / EDX:EAX.
  mul1(v, sz, signed) {
    const r = this.r;
    if (sz === 8) {
      const a = signed ? (r[EAX] << 24) >> 24 : r[EAX] & 0xff, b = signed ? (v << 24) >> 24 : v & 0xff, res = a * b;
      r[EAX] = (r[EAX] & ~0xffff) | (res & 0xffff);
      const hi = signed ? res !== ((res << 24) >> 24) : (res >>> 8) !== 0;
      this.lop = F_MUL; this.lres = res & 0xff; this.lsz = 8; this.lcf = this.lof = hi ? 1 : 0; return;
    }
    if (sz === 16) {
      const a = signed ? (r[EAX] << 16) >> 16 : r[EAX] & 0xffff, b = signed ? (v << 16) >> 16 : v & 0xffff, res = a * b;
      r[EAX] = (r[EAX] & ~0xffff) | (res & 0xffff); r[EDX] = (r[EDX] & ~0xffff) | ((res >> 16) & 0xffff);
      const hi = signed ? res !== ((res << 16) >> 16) : (res >>> 16) !== 0;
      this.lop = F_MUL; this.lres = res & 0xffff; this.lsz = 16; this.lcf = this.lof = hi ? 1 : 0; return;
    }
    const a = signed ? BigInt(r[EAX]) : BigInt(r[EAX] >>> 0), b = signed ? BigInt(v | 0) : BigInt(v >>> 0);
    const res = a * b, lo = Number(BigInt.asIntN(32, res)), hi = Number(BigInt.asIntN(32, res >> 32n));
    r[EAX] = lo; r[EDX] = hi;
    const of = signed ? BigInt(lo) !== res : hi !== 0;
    this.lop = F_MUL; this.lres = lo >>> 0; this.lsz = 32; this.lcf = this.lof = of ? 1 : 0;
  }
  div1(v, sz, signed) {
    const r = this.r;
    if (sz === 32) {
      const n = (BigInt(r[EDX]) << 32n) | BigInt(r[EAX] >>> 0);
      const num = signed ? n : BigInt.asUintN(64, n), den = signed ? BigInt(v | 0) : BigInt(v >>> 0);
      if (den === 0n) throw new CpuFault('divide by zero', this.eip);
      const q = num / den, rem = num % den;
      if (signed ? (q > 0x7fffffffn || q < -0x80000000n) : q > 0xffffffffn) throw new CpuFault('divide overflow', this.eip);
      r[EAX] = Number(BigInt.asIntN(32, q)); r[EDX] = Number(BigInt.asIntN(32, rem)); return;
    }
    const bits = sz, m = MASK[sz];
    let num = bits === 8 ? r[EAX] & 0xffff : ((r[EDX] & 0xffff) << 16) | (r[EAX] & 0xffff);
    let den = v & m;
    if (signed) { num = bits === 8 ? (num << 16) >> 16 : num | 0; den = (den << (32 - bits)) >> (32 - bits); }
    else num >>>= 0;
    if (den === 0) throw new CpuFault('divide by zero', this.eip);
    const q = Math.trunc(num / den), rem = num - q * den;
    if (bits === 8) r[EAX] = (r[EAX] & ~0xffff) | (q & 0xff) | ((rem & 0xff) << 8);
    else { r[EAX] = (r[EAX] & ~0xffff) | (q & 0xffff); r[EDX] = (r[EDX] & ~0xffff) | (rem & 0xffff); }
  }

  // String instructions (movs/cmps/stos/lods/scas), with rep/repe/repne.
  stringOp(op, sz, rep) {
    const c = this, r = this.r, m8 = this.m8, dv = this.dv, n = sz >> 3;
    const rd = sz === 32 ? a => dv.getInt32(a, true) : sz === 16 ? a => dv.getUint16(a, true) : a => m8[a];
    const wr = sz === 32 ? (a, v) => dv.setInt32(a, v, true) : sz === 16 ? (a, v) => dv.setUint16(a, v, true) : (a, v) => { m8[a] = v; };
    const acc = sz === 32 ? () => r[EAX] : sz === 16 ? () => r[EAX] & 0xffff : () => r[EAX] & 0xff;
    const setAcc = sz === 32 ? v => { r[EAX] = v; } : sz === 16 ? v => { r[EAX] = (r[EAX] & ~0xffff) | v; } : v => { r[EAX] = (r[EAX] & ~0xff) | v; };
    const kind = op & 0xfe;
    const once = () => {
      const step = c.df ? -n : n;
      switch (kind) {
        case 0xa4: wr(r[EDI] >>> 0, rd(r[ESI] >>> 0)); r[ESI] += step; r[EDI] += step; return true;
        case 0xaa: wr(r[EDI] >>> 0, acc()); r[EDI] += step; return true;
        case 0xac: setAcc(rd(r[ESI] >>> 0)); r[ESI] += step; return true;
        case 0xa6: { c.alu(7, rd(r[ESI] >>> 0), rd(r[EDI] >>> 0), sz); r[ESI] += step; r[EDI] += step; return false; }
        default: { c.alu(7, acc(), rd(r[EDI] >>> 0), sz); r[EDI] += step; return false; }
      }
    };
    if (!rep) return once;
    const compare = kind === 0xa6 || kind === 0xae;
    return () => {
      // Fast paths for forward rep movs/stos.
      if (!compare && !c.df && r[ECX] !== 0) {
        const count = r[ECX] >>> 0, bytes = count * n, di = r[EDI] >>> 0;
        if (kind === 0xa4) {
          const si = r[ESI] >>> 0;
          if (di <= si || di >= si + bytes) { m8.copyWithin(di, si, si + bytes); r[ESI] = (si + bytes) | 0; r[EDI] = (di + bytes) | 0; r[ECX] = 0; return; }
        } else if (kind === 0xaa && n === 1) { m8.fill(r[EAX] & 0xff, di, di + bytes); r[EDI] = (di + bytes) | 0; r[ECX] = 0; return; }
        else if (kind === 0xaa && n === 4 && (di & 3) === 0) { new Int32Array(c.mem, di, count).fill(r[EAX]); r[EDI] = (di + bytes) | 0; r[ECX] = 0; return; }
      }
      while (r[ECX] !== 0) {
        once(); r[ECX] = (r[ECX] - 1) | 0;
        if (compare && (rep === 1 ? !c.getZF() : c.getZF())) break;
      }
    };
  }
}
