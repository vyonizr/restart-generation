// x87 FPU for cpu.js. Values are held as JS doubles (64-bit), which is what MSVC-compiled code
// observes in practice (it sets 53-bit precision). 80-bit loads/stores are converted.
const C0 = 0x100, C1 = 0x200, C2 = 0x400, C3 = 0x4000;
const EFL_CF = 1, EFL_PF = 4, EFL_ZF = 64;

export class FPU {
  constructor(cpu) {
    this.cpu = cpu;
    this.st = new Float64Array(8);
    this.empty = new Uint8Array(8).fill(1);
    this.top = 0;
    this.cw = 0x37f;
    this.sw = 0;
  }
  idx(i) { return (this.top + i) & 7; }
  get(i) { return this.st[(this.top + i) & 7]; }
  set(i, v) { const k = (this.top + i) & 7; this.st[k] = v; this.empty[k] = 0; }
  push(v) { this.top = (this.top - 1) & 7; this.st[this.top] = v; this.empty[this.top] = 0; }
  pop() { const v = this.st[this.top]; this.empty[this.top] = 1; this.top = (this.top + 1) & 7; return v; }
  status() { return (this.sw & ~0x3800) | (this.top << 11); }
  setCC(c0, c2, c3) { this.sw = (this.sw & ~(C0 | C1 | C2 | C3)) | (c0 ? C0 : 0) | (c2 ? C2 : 0) | (c3 ? C3 : 0); }
  compare(a, b) {
    if (Number.isNaN(a) || Number.isNaN(b)) this.setCC(1, 1, 1);
    else this.setCC(a < b, 0, a === b);
  }
  // fcomi: result goes to ZF/PF/CF.
  compareEflags(a, b) {
    const cpu = this.cpu; cpu.materialize();
    let f = cpu.lflags & ~(EFL_CF | EFL_PF | EFL_ZF);
    if (Number.isNaN(a) || Number.isNaN(b)) f |= EFL_CF | EFL_PF | EFL_ZF;
    else if (a < b) f |= EFL_CF; else if (a === b) f |= EFL_ZF;
    cpu.lflags = f;
  }
  round(v) {
    switch ((this.cw >> 10) & 3) {
      case 0: { const f = Math.floor(v), d = v - f; return d > 0.5 ? f + 1 : d < 0.5 ? f : (f % 2 === 0 ? f : f + 1); }
      case 1: return Math.floor(v);
      case 2: return Math.ceil(v);
      default: return Math.trunc(v);
    }
  }
  // Integer conversion with x87 "integer indefinite" on overflow.
  toInt(v, bits, trunc) {
    const x = trunc ? Math.trunc(v) : this.round(v);
    const lim = 2 ** (bits - 1);
    if (!Number.isFinite(x) || x >= lim || x < -lim) return bits === 64 ? -(2n ** 63n) : -lim;
    return bits === 64 ? BigInt(x) : x;
  }
}

function readF80(dv, a) {
  const lo = dv.getUint32(a, true), hi = dv.getUint32(a + 4, true), se = dv.getUint16(a + 8, true);
  const sign = se & 0x8000 ? -1 : 1, exp = se & 0x7fff;
  const mant = hi * 4294967296 + lo; // 64-bit mantissa (rounded to double precision)
  if (exp === 0 && mant === 0) return sign * 0;
  if (exp === 0x7fff) return (hi & 0x7fffffff) || lo ? NaN : sign * Infinity;
  return sign * mant * 2 ** (exp - 16383 - 63);
}
function writeF80(dv, a, v) {
  let sign = 0, exp = 0, hi = 0, lo = 0;
  if (v < 0 || Object.is(v, -0)) { sign = 0x8000; v = -v; }
  if (Number.isNaN(v)) { exp = 0x7fff; hi = 0xc0000000; }
  else if (v === Infinity) { exp = 0x7fff; hi = 0x80000000; }
  else if (v !== 0) {
    let e = Math.floor(Math.log2(v));
    if (2 ** e > v) e--; else if (2 ** (e + 1) <= v) e++;
    const m = v / 2 ** e;            // in [1, 2); the integer bit is bit 63 of the mantissa
    exp = e + 16383;
    const scaled = m * 2 ** 31;
    hi = Math.floor(scaled) >>> 0;
    lo = Math.floor((scaled - Math.floor(scaled)) * 4294967296) >>> 0;
  }
  dv.setUint32(a, lo, true); dv.setUint32(a + 4, hi, true); dv.setUint16(a + 8, sign | exp, true);
}

// Decodes one D8-DF instruction. Returns the body closure (the caller sets eip).
export function decodeFPU(cpu, op, modrm) {
  const f = cpu.fpu, dv = cpu.dv, r = cpu.r;
  const mr = modrm();
  const reg = mr.reg, i = mr.rm;
  const arith = (k, a, b) => {
    switch (k) {
      case 0: return a + b; case 1: return a * b;
      case 4: return a - b; case 5: return b - a;
      case 6: return a / b; default: return b / a;
    }
  };
  if (mr.ea) {
    const ea = mr.ea;
    const m32 = () => dv.getFloat32(ea(), true), m64 = () => dv.getFloat64(ea(), true);
    const i16 = () => dv.getInt16(ea(), true), i32 = () => dv.getInt32(ea(), true);
    switch (op) {
      case 0xd8: case 0xdc: case 0xda: case 0xde: {
        const ld = op === 0xd8 ? m32 : op === 0xdc ? m64 : op === 0xda ? i32 : i16;
        if (reg === 2) return () => f.compare(f.get(0), ld());
        if (reg === 3) return () => { f.compare(f.get(0), ld()); f.pop(); };
        return () => f.set(0, arith(reg, f.get(0), ld()));
      }
      case 0xd9:
        switch (reg) {
          case 0: return () => f.push(m32());
          case 2: return () => dv.setFloat32(ea(), f.get(0), true);
          case 3: return () => { dv.setFloat32(ea(), f.get(0), true); f.pop(); };
          case 4: return () => {}; // fldenv: not needed
          case 5: return () => { f.cw = dv.getUint16(ea(), true); };
          case 6: return () => { const a = ea(); for (let k = 0; k < 28; k++) cpu.m8[a + k] = 0; dv.setUint16(a, f.cw, true); dv.setUint16(a + 4, f.status(), true); dv.setUint16(a + 8, 0xffff, true); };
          case 7: return () => dv.setUint16(ea(), f.cw, true);
        }
        break;
      case 0xdd:
        switch (reg) {
          case 0: return () => f.push(m64());
          case 1: return () => { dv.setBigInt64(ea(), f.toInt(f.pop(), 64, true), true); };
          case 2: return () => dv.setFloat64(ea(), f.get(0), true);
          case 3: return () => { dv.setFloat64(ea(), f.get(0), true); f.pop(); };
          case 7: return () => dv.setUint16(ea(), f.status(), true);
        }
        break;
      case 0xdb:
        switch (reg) {
          case 0: return () => f.push(i32());
          case 1: return () => dv.setInt32(ea(), f.toInt(f.pop(), 32, true), true);
          case 2: return () => dv.setInt32(ea(), f.toInt(f.get(0), 32, false), true);
          case 3: return () => dv.setInt32(ea(), f.toInt(f.pop(), 32, false), true);
          case 5: return () => f.push(readF80(dv, ea()));
          case 7: return () => writeF80(dv, ea(), f.pop());
        }
        break;
      case 0xdf:
        switch (reg) {
          case 0: return () => f.push(i16());
          case 1: return () => dv.setInt16(ea(), f.toInt(f.pop(), 16, true), true);
          case 2: return () => dv.setInt16(ea(), f.toInt(f.get(0), 16, false), true);
          case 3: return () => dv.setInt16(ea(), f.toInt(f.pop(), 16, false), true);
          case 5: return () => f.push(Number(dv.getBigInt64(ea(), true)));
          case 7: return () => dv.setBigInt64(ea(), f.toInt(f.pop(), 64, false), true);
        }
        break;
    }
    throw new Error(`unknown FPU op 0x${op.toString(16)} /${reg} (memory) at 0x${(cpu.eip >>> 0).toString(16)}`);
  }
  // Register forms.
  const code = 0xc0 | (reg << 3) | i;
  switch (op) {
    case 0xd8:
      if (reg === 2) return () => f.compare(f.get(0), f.get(i));
      if (reg === 3) return () => { f.compare(f.get(0), f.get(i)); f.pop(); };
      return () => f.set(0, arith(reg, f.get(0), f.get(i)));
    case 0xdc: // destination is st(i); the sub/div encodings are swapped relative to d8
      if (reg === 2) return () => f.compare(f.get(0), f.get(i));
      if (reg === 3) return () => { f.compare(f.get(0), f.get(i)); f.pop(); };
      return () => f.set(i, arith(reg ^ (reg >= 4 ? 1 : 0), f.get(i), f.get(0)));
    case 0xde:
      if (code === 0xd9) return () => { f.compare(f.get(0), f.get(1)); f.pop(); f.pop(); };
      return () => { f.set(i, arith(reg ^ (reg >= 4 ? 1 : 0), f.get(i), f.get(0))); f.pop(); };
    case 0xd9:
      if (reg === 0) return () => f.push(f.get(i));
      if (reg === 1) return () => { const t = f.get(0); f.set(0, f.get(i)); f.set(i, t); };
      switch (code) {
        case 0xd0: return () => {};
        case 0xe0: return () => f.set(0, -f.get(0));
        case 0xe1: return () => f.set(0, Math.abs(f.get(0)));
        case 0xe4: return () => f.compare(f.get(0), 0);
        case 0xe5: return () => {
          const v = f.get(0), k = f.idx(0), neg = v < 0 || Object.is(v, -0);
          let c0 = 0, c2 = 0, c3 = 0;
          if (f.empty[k]) { c3 = 1; c0 = 1; } else if (Number.isNaN(v)) c0 = 1;
          else if (!Number.isFinite(v)) { c2 = 1; c0 = 1; } else if (v === 0) c3 = 1; else c2 = 1;
          f.setCC(c0, c2, c3); f.sw = neg ? f.sw | C1 : f.sw & ~C1;
        };
        case 0xe8: return () => f.push(1);
        case 0xe9: return () => f.push(Math.log2(10));
        case 0xea: return () => f.push(Math.LOG2E);
        case 0xeb: return () => f.push(Math.PI);
        case 0xec: return () => f.push(Math.LOG10E * Math.LN2);
        case 0xed: return () => f.push(Math.LN2);
        case 0xee: return () => f.push(0);
        case 0xf0: return () => f.set(0, 2 ** f.get(0) - 1);
        case 0xf1: return () => { const v = f.get(1) * Math.log2(f.get(0)); f.pop(); f.set(0, v); };
        case 0xf2: return () => { f.set(0, Math.tan(f.get(0))); f.push(1); f.setCC(0, 0, 0); };
        case 0xf3: return () => { const v = Math.atan2(f.get(1), f.get(0)); f.pop(); f.set(0, v); };
        case 0xf5: return () => { const a = f.get(0), b = f.get(1); f.set(0, a - Math.round(a / b) * b); f.setCC(0, 0, 0); };
        case 0xf8: return () => { const a = f.get(0), b = f.get(1); f.set(0, a % b); f.setCC(0, 0, 0); };
        case 0xf9: return () => { const v = f.get(1) * Math.log2(f.get(0) + 1); f.pop(); f.set(0, v); };
        case 0xfa: return () => f.set(0, Math.sqrt(f.get(0)));
        case 0xfb: return () => { const v = f.get(0); f.set(0, Math.sin(v)); f.push(Math.cos(v)); f.setCC(0, 0, 0); };
        case 0xfc: return () => f.set(0, f.round(f.get(0)));
        case 0xfd: return () => f.set(0, f.get(0) * 2 ** Math.trunc(f.get(1)));
        case 0xfe: return () => { f.set(0, Math.sin(f.get(0))); f.setCC(0, 0, 0); };
        case 0xff: return () => { f.set(0, Math.cos(f.get(0))); f.setCC(0, 0, 0); };
        case 0xf6: return () => { f.top = (f.top - 1) & 7; };
        case 0xf7: return () => { f.top = (f.top + 1) & 7; };
      }
      break;
    case 0xda:
      if (code === 0xe9) return () => { f.compare(f.get(0), f.get(1)); f.pop(); f.pop(); };
      { const cc = [2, 4, 6, 10][reg]; if (reg < 4) return () => { if (cpu.cond(cc)) f.set(0, f.get(i)); }; }
      break;
    case 0xdb:
      if (code === 0xe2) return () => { f.sw &= 0x7f00; };
      if (code === 0xe3) return () => { f.cw = 0x37f; f.sw = 0; f.top = 0; f.empty.fill(1); };
      if (reg === 5 || reg === 6) return () => f.compareEflags(f.get(0), f.get(i));
      { const cc = [3, 5, 7, 11][reg]; if (reg < 4) return () => { if (cpu.cond(cc)) f.set(0, f.get(i)); }; }
      break;
    case 0xdd:
      if (reg === 0) return () => { f.empty[f.idx(i)] = 1; };
      if (reg === 2) return () => f.set(i, f.get(0));
      if (reg === 3) return () => { f.set(i, f.get(0)); f.pop(); };
      if (reg === 4) return () => f.compare(f.get(0), f.get(i));
      if (reg === 5) return () => { f.compare(f.get(0), f.get(i)); f.pop(); };
      break;
    case 0xdf:
      if (code === 0xe0) return () => { r[0] = (r[0] & ~0xffff) | f.status(); };
      if (reg === 5 || reg === 6) return () => { f.compareEflags(f.get(0), f.get(i)); f.pop(); };
      break;
  }
  throw new Error(`unknown FPU op 0x${op.toString(16)} 0x${code.toString(16)} at 0x${(cpu.eip >>> 0).toString(16)}`);
}
