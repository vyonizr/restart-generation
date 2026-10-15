// Basic-block compiler for cpu.js. Common instructions become inline JavaScript; everything else
// calls the interpreter's closure for that instruction. A block ends at the first control transfer
// (or after MAX_BLOCK instructions) and returns how many instructions it executed.
const MAX_BLOCK = 64;
const REG8 = ['(r[0]&255)', '(r[1]&255)', '(r[2]&255)', '(r[3]&255)', '((r[0]>>8)&255)', '((r[1]>>8)&255)', '((r[2]>>8)&255)', '((r[3]>>8)&255)'];
const setReg8 = (i, v) => i < 4 ? `r[${i}]=(r[${i}]&~255)|((${v})&255);` : `r[${i - 4}]=(r[${i - 4}]&~65280)|(((${v})&255)<<8);`;

// Instructions that transfer control; the interpreter fallback for these ends the block.
function isBranch(m8, p) {
  let b = m8[p];
  while (b === 0x66 || b === 0xf2 || b === 0xf3 || b === 0x64 || b === 0x65 || b === 0x2e || b === 0x3e || b === 0x26 || b === 0x36 || b === 0xf0) b = m8[++p];
  if (b === 0x0f) { const b2 = m8[p + 1]; return b2 >= 0x80 && b2 <= 0x8f; }
  if (b >= 0x70 && b <= 0x7f) return true;
  if (b === 0xe8 || b === 0xe9 || b === 0xeb || b === 0xc2 || b === 0xc3 || b === 0xcc || b === 0xcd || b === 0xf4) return true;
  if (b >= 0xe0 && b <= 0xe3) return true;
  if (b === 0xff) { const reg = (m8[p + 1] >> 3) & 7; return reg >= 2 && reg <= 5; }
  return false;
}

export function compileBlock(cpu, start) {
  const m8 = cpu.m8, dv = cpu.dv;
  const fallbacks = [];
  let src = 'let fa=0,fb=0,fr=0;\n';
  let pc = start >>> 0, n = 0;
  let flags = null; // what the last inline instruction left in fa/fb/fr: 'sub' | 'logic' | null

  for (;;) {
    const g = gen(pc);
    n++;
    if (g) {
      src += g.code + '\n';
      flags = g.flags === undefined ? flags : g.flags;
      if (g.end) break;
      pc = g.next;
    } else {
      cpu.lastNext = undefined;
      const f = cpu.decode(pc);
      const k = fallbacks.push(f) - 1;
      flags = null;
      if (isBranch(m8, pc) || cpu.lastNext === undefined) { src += `F[${k}]();return ${n};\n`; break; }
      src += `F[${k}]();\n`;
      pc = cpu.lastNext;
    }
    if (n >= MAX_BLOCK || cpu.traps.has(pc)) { src += `c.eip=${pc};return ${n};\n`; break; }
  }
  // The outer function binds the block's context once, so each run is a single call.
  return new Function('c', 'r', 'dv', 'm8', 'F', `return()=>{${src}}`)(cpu, cpu.r, dv, m8, fallbacks);

  // ---- per-instruction code generation; returns null to fall back to the interpreter ----
  function gen(start) {
    let p = start, seg = '';
    if (m8[p] === 0x64) { seg = '+c.fsBase'; p++; }
    const op = m8[p++];
    const s8 = () => (m8[p++] << 24) >> 24;
    const s32 = () => { const v = dv.getInt32(p, true); p += 4; return v; };
    const modrm = () => {
      const b = m8[p++], mod = b >> 6, reg = (b >> 3) & 7, rm = b & 7;
      if (mod === 3) return { reg, rm, ea: null };
      let base = -1, index = -1, scale = 0, disp = 0;
      if (rm === 4) {
        const sib = m8[p++]; scale = sib >> 6; index = (sib >> 3) & 7; base = sib & 7;
        if (index === 4) index = -1;
        if (base === 5 && mod === 0) { base = -1; disp = s32(); }
      } else if (rm === 5 && mod === 0) disp = s32();
      else base = rm;
      if (mod === 1) disp = s8(); else if (mod === 2) disp = s32();
      const parts = [];
      if (base >= 0) parts.push(`r[${base}]`);
      if (index >= 0) parts.push(scale ? `r[${index}]*${1 << scale}` : `r[${index}]`);
      if (disp || !parts.length) parts.push(String(disp));
      return { reg, rm, ea: `((${parts.join('+')}${seg})>>>0)` };
    };
    const rm32 = mr => mr.ea ? `dv.getInt32(${mr.ea},true)` : `r[${mr.rm}]`;
    const setRm32 = (mr, v) => mr.ea ? `dv.setInt32(${mr.ea},${v},true);` : `r[${mr.rm}]=${v};`;
    const rm8 = mr => mr.ea ? `m8[${mr.ea}]` : REG8[mr.rm];
    const setRm8 = (mr, v) => mr.ea ? `m8[${mr.ea}]=${v};` : setReg8(mr.rm, v);
    const done = (code, f) => ({ code, next: p >>> 0, flags: f });
    const end = code => ({ code, end: true });
    // The operand is read before ESP moves (push esp, push [esp+8]).
    const push = v => `{const v=${v};const s=(r[4]-4)|0;r[4]=s;dv.setInt32(s>>>0,v,true);}`;
    // ALU on 32-bit values. Writes the lazy flag state and the fa/fb/fr locals used by fused jcc.
    const alu = (aop, a, b, dst) => {
      const w = dst && aop !== 7;
      switch (aop) {
        case 0: return `fa=(${a})>>>0;fb=(${b})>>>0;fr=(fa+fb)>>>0;c.lop=1;c.la=fa;c.lb=fb;c.lres=fr;c.lsz=32;c.lcin=0;${w ? dst('fr|0') : ''}`;
        case 5: case 7: return `fa=(${a})>>>0;fb=(${b})>>>0;fr=(fa-fb)>>>0;c.lop=2;c.la=fa;c.lb=fb;c.lres=fr;c.lsz=32;c.lcin=0;${w ? dst('fr|0') : ''}`;
        case 1: return `fr=((${a})|(${b}))>>>0;c.lop=3;c.lres=fr;c.lsz=32;${w ? dst('fr|0') : ''}`;
        case 4: return `fr=((${a})&(${b}))>>>0;c.lop=3;c.lres=fr;c.lsz=32;${w ? dst('fr|0') : ''}`;
        case 6: return `fr=((${a})^(${b}))>>>0;c.lop=3;c.lres=fr;c.lsz=32;${w ? dst('fr|0') : ''}`;
      }
      return null; // adc/sbb
    };
    const aluFlags = aop => (aop === 0 ? 'add' : aop === 5 || aop === 7 ? 'sub' : 'logic');
    const cond = cc => {
      if (flags === 'sub') {
        switch (cc) {
          case 2: return 'fa<fb'; case 3: return 'fa>=fb'; case 4: return 'fa===fb'; case 5: return 'fa!==fb';
          case 6: return 'fa<=fb'; case 7: return 'fa>fb';
          case 12: return '(fa|0)<(fb|0)'; case 13: return '(fa|0)>=(fb|0)'; case 14: return '(fa|0)<=(fb|0)'; case 15: return '(fa|0)>(fb|0)';
          case 8: return '(fr|0)<0'; case 9: return '(fr|0)>=0';
        }
      } else if (flags === 'logic') {
        switch (cc) {
          case 2: return 'false'; case 3: return 'true'; case 4: return 'fr===0'; case 5: return 'fr!==0';
          case 6: return 'fr===0'; case 7: return 'fr!==0';
          case 8: case 12: return '(fr|0)<0'; case 9: case 13: return '(fr|0)>=0';
          case 14: return '(fr|0)<=0'; case 15: return '(fr|0)>0';
        }
      }
      return `c.cond(${cc})`;
    };

    if (op === 0x66 && m8[p] === 0x8b) { // mov r16, r/m16
      p++;
      const mr = modrm(), v = mr.ea ? `dv.getUint16(${mr.ea},true)` : `(r[${mr.rm}]&65535)`;
      return done(`r[${mr.reg}]=(r[${mr.reg}]&~65535)|${v};`);
    }
    if (op < 0x40 && (op & 7) < 6 && op !== 0x0f) {
      const aop = op >> 3, form = op & 7;
      if (aop === 2 || aop === 3) return null;
      if (form === 5) { const v = s32(); return done(alu(aop, 'r[0]', v, x => `r[0]=${x};`), aluFlags(aop)); }
      if (form === 1) { const mr = modrm(); return done(alu(aop, rm32(mr), `r[${mr.reg}]`, x => setRm32(mr, x)), aluFlags(aop)); }
      if (form === 3) { const mr = modrm(); return done(alu(aop, `r[${mr.reg}]`, rm32(mr), x => `r[${mr.reg}]=${x};`), aluFlags(aop)); }
      if (aop === 7 && form === 0) { const mr = modrm(); return done(`fa=${rm8(mr)};fb=${REG8[mr.reg]};fr=(fa-fb)&255;c.lop=2;c.la=fa;c.lb=fb;c.lres=fr;c.lsz=8;c.lcin=0;`, null); }
      if (aop === 7 && form === 2) { const mr = modrm(); return done(`fa=${REG8[mr.reg]};fb=${rm8(mr)};fr=(fa-fb)&255;c.lop=2;c.la=fa;c.lb=fb;c.lres=fr;c.lsz=8;c.lcin=0;`, null); }
      if (aop === 7 && form === 4) { const v = m8[p++]; return done(`fa=r[0]&255;fb=${v};fr=(fa-fb)&255;c.lop=2;c.la=fa;c.lb=fb;c.lres=fr;c.lsz=8;c.lcin=0;`, null); }
      return null;
    }
    if (op >= 0x40 && op <= 0x47) { const i = op - 0x40; return done(`c.lcf=c.getCF()?1:0;fa=r[${i}]>>>0;r[${i}]=(r[${i}]+1)|0;c.lop=4;c.la=fa;c.lb=1;c.lres=r[${i}]>>>0;c.lsz=32;`, null); }
    if (op >= 0x48 && op <= 0x4f) { const i = op - 0x48; return done(`c.lcf=c.getCF()?1:0;fa=r[${i}]>>>0;r[${i}]=(r[${i}]-1)|0;c.lop=5;c.la=fa;c.lb=1;c.lres=r[${i}]>>>0;c.lsz=32;`, null); }
    if (op >= 0x50 && op <= 0x57) return done(push(`r[${op - 0x50}]`));
    if (op >= 0x58 && op <= 0x5f) { const i = op - 0x58; return done(`{const s=r[4];const v=dv.getInt32(s>>>0,true);r[4]=(s+4)|0;r[${i}]=v;}`); }
    if (op >= 0x70 && op <= 0x7f) {
      const d = s8(), next = p >>> 0, t = (next + d) >>> 0;
      return end(`if(${cond(op - 0x70)}){c.eip=${t};}else{c.eip=${next};}return ${n};`);
    }
    if (op >= 0xb8 && op <= 0xbf) return done(`r[${op - 0xb8}]=${s32()};`);
    if (op >= 0xb0 && op <= 0xb7) return done(setReg8(op - 0xb0, m8[p++]));
    switch (op) {
      case 0x0f: {
        const op2 = m8[p++];
        if (op2 >= 0x80 && op2 <= 0x8f) {
          const d = s32(), next = p >>> 0, t = (next + d) >>> 0;
          return end(`if(${cond(op2 - 0x80)}){c.eip=${t};}else{c.eip=${next};}return ${n};`);
        }
        if (op2 >= 0x90 && op2 <= 0x9f) { const cc = op2 - 0x90, mr = modrm(); return done(setRm8(mr, `(${cond(cc)}?1:0)`)); }
        if (op2 === 0xb6) { const mr = modrm(); return done(`r[${mr.reg}]=${rm8(mr)};`); }
        if (op2 === 0xbe) { const mr = modrm(); return done(`r[${mr.reg}]=(${rm8(mr)}<<24)>>24;`); }
        if (op2 === 0xb7) { const mr = modrm(); return done(`r[${mr.reg}]=${mr.ea ? `dv.getUint16(${mr.ea},true)` : `(r[${mr.rm}]&65535)`};`); }
        if (op2 === 0xbf) { const mr = modrm(); return done(`r[${mr.reg}]=${mr.ea ? `dv.getInt16(${mr.ea},true)` : `((r[${mr.rm}]<<16)>>16)`};`); }
        if (op2 === 0xaf) { const mr = modrm(); return done(`r[${mr.reg}]=c.imul2(r[${mr.reg}],${rm32(mr)},32);`, null); }
        return null;
      }
      case 0x68: return done(push(s32()));
      case 0x6a: return done(push(s8()));
      case 0x69: { const mr = modrm(), v = s32(); return done(`r[${mr.reg}]=c.imul2(${rm32(mr)},${v},32);`, null); }
      case 0x6b: { const mr = modrm(), v = s8(); return done(`r[${mr.reg}]=c.imul2(${rm32(mr)},${v},32);`, null); }
      case 0x81: case 0x83: {
        const mr = modrm(), v = op === 0x83 ? s8() : s32();
        if (mr.reg === 2 || mr.reg === 3) return null;
        if (mr.ea && mr.reg !== 7) { // read-modify-write memory: compute the address once
          return done(`{const a=${mr.ea};${alu(mr.reg, 'dv.getInt32(a,true)', v, x => `dv.setInt32(a,${x},true);`)}}`, aluFlags(mr.reg));
        }
        return done(alu(mr.reg, rm32(mr), v, x => setRm32(mr, x)), aluFlags(mr.reg));
      }
      case 0x80: {
        const mr = modrm(), v = m8[p++];
        if (mr.reg !== 7) return null;
        return done(`fa=${rm8(mr)};fb=${v};fr=(fa-fb)&255;c.lop=2;c.la=fa;c.lb=fb;c.lres=fr;c.lsz=8;c.lcin=0;`, null);
      }
      case 0x84: { const mr = modrm(); return done(`fr=(${rm8(mr)}&${REG8[mr.reg]})>>>0;c.lop=3;c.lres=fr;c.lsz=8;`, null); }
      case 0x85: { const mr = modrm(); return done(alu(4, rm32(mr), `r[${mr.reg}]`, null), 'logic'); }
      case 0xf6: {
        const mr = modrm();
        if (mr.reg !== 0) return null;
        const v = m8[p++];
        return done(`fr=(${rm8(mr)}&${v})>>>0;c.lop=3;c.lres=fr;c.lsz=8;`, null);
      }
      case 0xa8: { const v = m8[p++]; return done(`fr=(r[0]&${v})>>>0;c.lop=3;c.lres=fr;c.lsz=8;`, null); }
      case 0xa9: { const v = s32(); return done(alu(4, 'r[0]', v, null), 'logic'); }
      case 0x88: { const mr = modrm(); return done(setRm8(mr, REG8[mr.reg])); }
      case 0x8a: { const mr = modrm(); return done(setReg8(mr.reg, rm8(mr))); }
      case 0x89: { const mr = modrm(); return done(setRm32(mr, `r[${mr.reg}]`)); }
      case 0x8b: { const mr = modrm(); return done(`r[${mr.reg}]=${rm32(mr)};`); }
      case 0x8d: { const mr = modrm(); if (!mr.ea || seg) return null; return done(`r[${mr.reg}]=${mr.ea}|0;`); }
      case 0xa1: { const a = s32() >>> 0; return done(`r[0]=dv.getInt32((${a}${seg})>>>0,true);`); }
      case 0xa3: { const a = s32() >>> 0; return done(`dv.setInt32((${a}${seg})>>>0,r[0],true);`); }
      case 0x90: return done('');
      case 0x99: return done('r[2]=r[0]>>31;');
      case 0xc6: { const mr = modrm(), v = m8[p++]; return done(setRm8(mr, v)); }
      case 0xc7: { const mr = modrm(), v = s32(); return done(setRm32(mr, v)); }
      case 0xc9: return done('r[4]=r[5];{const s=r[4];r[5]=dv.getInt32(s>>>0,true);r[4]=(s+4)|0;}');
      case 0xc1: case 0xd1: case 0xd3: {
        const mr = modrm();
        if (mr.reg === 2 || mr.reg === 3) return null;
        const cnt = op === 0xc1 ? String(m8[p++] & 31) : op === 0xd1 ? '1' : '(r[1]&31)';
        if (mr.reg >= 4) { // shl/shr/sar inline, with the same lazy flags as cpu.shift
          const k = op === 0xd3 ? 'k' : cnt;
          if (k === '0') return done('');
          const x = mr.reg === 5 ? `v>>>${k}` : mr.reg === 7 ? `v>>${k}` : `v<<${k}`;
          const cf = mr.reg === 5 ? `(v>>>(${k}-1))&1` : mr.reg === 7 ? `(v>>(${k}-1))&1` : `(v>>>(32-${k}))&1`;
          const of = mr.reg === 5 ? 'v>>>31' : mr.reg === 7 ? '0' : '(x>>>31)^cf';
          const at = mr.ea ? { ...mr, ea: 'a' } : mr; // memory operand: compute the address once
          const body = `{const v=${rm32(at)},x=${x},cf=${cf};c.lop=6;c.lres=x>>>0;c.lsz=32;c.lcf=cf;c.lof=${of};${setRm32(at, 'x')}}`;
          return done(`{${mr.ea ? `const a=${mr.ea};` : ''}${op === 0xd3 ? `const k=${cnt};if(k!==0)` : ''}${body}}`, null);
        }
        if (mr.ea)return done(`{const a=${mr.ea};dv.setInt32(a,c.shift(${mr.reg},dv.getInt32(a,true),${cnt},32)|0,true);}`, null);
        return done(`r[${mr.rm}]=c.shift(${mr.reg},r[${mr.rm}],${cnt},32)|0;`, null);
      }
      case 0xe8: { const d = s32(), next = p >>> 0, t = (next + d) >>> 0; return end(`${push(next)}c.eip=${t};return ${n};`); }
      case 0xe9: { const d = s32(), t = ((p >>> 0) + d) >>> 0; return end(`c.eip=${t};return ${n};`); }
      case 0xeb: { const d = s8(), t = ((p >>> 0) + d) >>> 0; return end(`c.eip=${t};return ${n};`); }
      case 0xc3: return end(`{const s=r[4];c.eip=dv.getUint32(s>>>0,true);r[4]=(s+4)|0;}return ${n};`);
      case 0xc2: { const k = dv.getUint16(p, true); p += 2; return end(`{const s=r[4];c.eip=dv.getUint32(s>>>0,true);r[4]=(s+4+${k})|0;}return ${n};`); }
      case 0xf7: {
        const mr = modrm();
        if (mr.reg === 0) { const v = s32(); return done(alu(4, rm32(mr), v, null), 'logic'); }
        if (mr.reg === 2) return done(setRm32(mr, `~${rm32(mr)}`));
        return null;
      }
      case 0xff: {
        const mr = modrm();
        if (mr.reg === 2) { const next = p >>> 0; return end(`{const t=${rm32(mr)}>>>0;${push(next)}c.eip=t;}return ${n};`); }
        if (mr.reg === 4) return end(`c.eip=${rm32(mr)}>>>0;return ${n};`);
        if (mr.reg === 6) return done(push(rm32(mr)));
        return null;
      }
    }
    return null;
  }
}
