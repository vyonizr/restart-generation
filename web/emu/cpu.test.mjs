// Self-check for the CPU's one-operand 32-bit multiply and divide (mul, imul, div, idiv on EDX:EAX): node web/emu/cpu.test.mjs
// Compares the registers, the flags as the CPU materializes them, and the faults against a BigInt reference, for edge operands and
// seeded random ones.
import { CPU, CpuFault, EAX, EDX } from './cpu.js';

const CF = 1, PF = 4, ZF = 64, SF = 128, OF = 2048, FLAGS = CF | PF | ZF | SF | OF;
const c = new CPU(4096);
const h = v => '0x' + (v >>> 0).toString(16);
const show = o => (o.fault ? o.fault : `edx:eax ${h(o.edx)}:${h(o.eax)}${o.flags === undefined ? '' : ` flags ${h(o.flags)}`}`);
let checked = 0;
function expect(what, got, want) {
  if (got.fault !== want.fault || got.eax !== want.eax || got.edx !== want.edx || got.flags !== want.flags) {
    console.error(`${what}: got ${show(got)}, want ${show(want)}`);
    process.exit(1);
  }
  checked++;
}

// mul/imul: the 64-bit product split into EDX:EAX; CF and OF set when the high word carries more than the low word's (zero- or
// sign-) extension. The emulator derives SF, ZF and PF from the low word, so those come out of EAX too.
function mulReference(a, b, signed) {
  const p = signed ? BigInt(a | 0) * BigInt(b | 0) : BigInt(a >>> 0) * BigInt(b >>> 0);
  const lo = Number(BigInt.asIntN(32, p)), hi = Number(BigInt.asIntN(32, p >> 32n));
  const over = signed ? BigInt(lo) !== p : hi !== 0;
  let parity = 1; for (let x = lo & 0xff; x; x >>= 1) parity ^= x & 1;
  return { eax: lo, edx: hi, flags: (over ? CF | OF : 0) | (parity ? PF : 0) | (lo === 0 ? ZF : 0) | (lo < 0 ? SF : 0) };
}
function checkMul(a, b, signed) {
  c.r[EAX] = a; c.r[EDX] = 0x5a5a5a5a; c.setEflags(FLAGS);
  c.mul1(b, 32, signed);
  expect(`${signed ? 'imul' : 'mul'} ${h(a)} * ${h(b)}`, { eax: c.r[EAX], edx: c.r[EDX], flags: c.getEflags() & FLAGS }, mulReference(a, b, signed));
}

// div/idiv: EDX:EAX over the operand, the quotient truncated toward zero into EAX and the remainder, with the dividend's sign, into
// EDX. A zero divisor faults, and so does a quotient that doesn't fit EAX; both leave the registers as they were.
function divReference(edx, eax, d, signed) {
  const u = (BigInt(edx >>> 0) << 32n) | BigInt(eax >>> 0), n = signed ? BigInt.asIntN(64, u) : u, den = signed ? BigInt(d | 0) : BigInt(d >>> 0);
  if (den === 0n) return { fault: 'divide by zero', eax: eax | 0, edx: edx | 0 };
  const q = n / den, rem = n % den;
  if (signed ? q > 0x7fffffffn || q < -0x80000000n : q > 0xffffffffn) return { fault: 'divide overflow', eax: eax | 0, edx: edx | 0 };
  return { eax: Number(BigInt.asIntN(32, q)), edx: Number(BigInt.asIntN(32, rem)) };
}
function checkDiv(edx, eax, d, signed) {
  c.r[EAX] = eax; c.r[EDX] = edx;
  let fault;
  try { c.div1(d, 32, signed); } catch (e) {
    if (!(e instanceof CpuFault)) throw e;
    fault = e.message.replace(/ at eip=.*/, '');
  }
  expect(`${signed ? 'idiv' : 'div'} ${h(edx)}:${h(eax)} / ${h(d)}`, { fault, eax: c.r[EAX], edx: c.r[EDX] }, divReference(edx, eax, d, signed));
}

const EDGE = [0, 1, -1, 2, -2, 0x7fffffff, 0x80000000 | 0, 0x80000001 | 0, 0xffffffff | 0, 0x10000, 0xffff, 0x8000, 0x7fff, 0x10001, 0xfffe0001 | 0];
for (const s of [false, true]) {
  for (const a of EDGE) for (const b of EDGE) checkMul(a, b, s);
  for (const hi of EDGE) for (const lo of EDGE) for (const d of EDGE) checkDiv(hi, lo, d, s);
}

// mulberry32: a fixed seed, so every run checks the same operands. Half of them are full 32-bit words; the rest are shortened to a
// random width and maybe negated, so small products, which neither overflow nor carry into EDX, come up too. Random dividends mostly
// overflow, so the divide also gets dividends built as quotient * divisor + remainder, whose quotient mostly fits.
let seed = 0x1badb002;
const next = () => { seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), seed | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return (t ^ (t >>> 14)) | 0; };
const operand = () => { const v = next(), k = next(); if (k & 1) return v; const w = (v >>> (k >>> 27)) | 0; return k & 2 ? -w | 0 : w; };
for (let i = 0; i < 100000; i++) {
  const a = operand(), b = operand();
  checkMul(a, b, false); checkMul(a, b, true);
  const hi = operand(), lo = operand();
  checkDiv(hi, lo, b, false); checkDiv(hi, lo, b, true);
  for (const s of [false, true]) {
    const big = x => (s ? BigInt(x | 0) : BigInt(x >>> 0)), d = big(b) || 1n;
    const n = BigInt.asUintN(64, big(a) * d + big(operand()) % d);
    checkDiv(Number(n >> 32n) | 0, Number(n & 0xffffffffn) | 0, Number(d) | 0, s);
  }
}

console.log(`cpu mul ok (${checked} cases)`);
