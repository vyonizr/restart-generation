// A fake JNIEnv for the game DLL. Java objects are JS objects behind opaque handles; method calls
// from native code dispatch by method name to `obj.methods[name](...args)`.
const FN_COUNT = 232;
const HANDLE_BASE = 0x7f000000;

// Method signature -> argument kinds ('I' int-like, 'J' long, 'F' float, 'D' double, 'L' object).
function argKinds(sig) {
  const out = []; let i = 1;
  while (sig[i] !== ')') {
    let k = sig[i];
    if (k === '[') { while (sig[i] === '[') i++; if (sig[i] === 'L') i = sig.indexOf(';', i); k = 'L'; }
    else if (k === 'L') { i = sig.indexOf(';', i); }
    out.push('ZBCSI'.includes(k) ? 'I' : k);
    i++;
  }
  return out;
}

export class JObject {
  constructor(cls, props = {}) { this.cls = cls; Object.assign(this, props); }
}

export class JNI {
  constructor(machine, { log = () => {} } = {}) {
    this.m = machine; this.cpu = machine.cpu; this.log = log;
    this.objs = [null];
    this.byObj = new Map();
    this.methods = [null];
    this.warned = new Set();
    const heap = machine.heap, dv = this.cpu.dv;
    this.env = heap.alloc(8);
    const table = heap.alloc(FN_COUNT * 4);
    dv.setUint32(this.env, table, true);
    const impl = this.impl();
    for (let i = 0; i < FN_COUNT; i++) {
      const f = impl[i];
      const addr = f ? machine.traps.add(f[0], f[1], f[2]) : machine.traps.add(0, () => { throw new Error(`unimplemented JNI function ${i}`); });
      dv.setUint32(table + i * 4, addr, true);
    }
  }
  ref(o) {
    if (o === null || o === undefined) return 0;
    let h = this.byObj.get(o);
    if (!h) { h = HANDLE_BASE + this.objs.length * 4; this.objs.push(o); this.byObj.set(o, h); }
    return h;
  }
  obj(h) { return h ? this.objs[((h >>> 0) - HANDLE_BASE) / 4] : null; }
  str(s) { return s === null || s === undefined ? 0 : this.ref(new JObject('java/lang/String', { value: String(s) })); }

  // Arguments of Call<T>MethodV (va_list) or ...A (jvalue array).
  readArgs(kinds, p, jvalues) {
    const dv = this.cpu.dv, out = [];
    p >>>= 0;
    for (const k of kinds) {
      if (jvalues) {
        out.push(k === 'J' ? dv.getBigInt64(p, true) : k === 'F' ? dv.getFloat32(p, true) : k === 'D' ? dv.getFloat64(p, true)
          : k === 'L' ? this.obj(dv.getInt32(p, true)) : dv.getInt32(p, true));
        p += 8;
      } else if (k === 'J' || k === 'D') { out.push(k === 'J' ? dv.getBigInt64(p, true) : dv.getFloat64(p, true)); p += 8; }
      else if (k === 'F') { out.push(dv.getFloat64(p, true)); p += 8; } // floats are promoted in varargs
      else { out.push(k === 'L' ? this.obj(dv.getInt32(p, true)) : dv.getInt32(p, true)); p += 4; }
    }
    return out;
  }
  invoke(target, mid, args) {
    const m = this.methods[mid];
    const fn = target && target.methods && target.methods[m.name];
    if (!fn) {
      const key = `${target ? target.cls : '?'}.${m.name}`;
      if (!this.warned.has(key)) { this.warned.add(key); this.log(`JNI: no Java method ${key}${m.sig}`); }
      return m.ret === 'L' ? null : 0;
    }
    return fn(...args);
  }
  wrapRet(m, v) {
    if (m.ret === 'L') return this.ref(typeof v === 'string' ? new JObject('java/lang/String', { value: v }) : v);
    if (m.ret === 'Z') return v ? 1 : 0;
    if (m.ret === 'V') return 0;
    return v;
  }

  impl() {
    const self = this, cpu = this.cpu, dv = cpu.dv, heap = this.m.heap;
    const t = {};
    const call = (variadic, jvalues) => (env, objOrCls, mid, ap) => {
      const m = self.methods[mid];
      const p = variadic ? (cpu.r[4] >>> 0) + 12 : ap; // the trap already popped the return address; varargs follow env, obj, mid
      return self.wrapRet(m, self.invoke(self.obj(objOrCls), mid, self.readArgs(m.kinds, p, jvalues)));
    };
    // Call<Type>Method / V / A for instance (34..63), nonvirtual (64..93, extra class arg), static (114..143).
    for (let k = 0; k < 10; k++) {
      t[34 + k * 3] = [3, call(true, false), true];
      t[35 + k * 3] = [4, call(false, false)];
      t[36 + k * 3] = [4, call(false, true)];
      t[114 + k * 3] = [3, call(true, false), true];
      t[115 + k * 3] = [4, call(false, false)];
      t[116 + k * 3] = [4, call(false, true)];
    }
    const methodId = (cls, name, sig, isStatic) => {
      const n = cpu.readCString(name >>> 0), s = cpu.readCString(sig >>> 0);
      self.methods.push({ name: n, sig: s, kinds: argKinds(s), ret: s[s.indexOf(')') + 1], isStatic });
      return self.methods.length - 1;
    };
    t[4] = [1, () => 0x00010004];
    t[6] = [2, (env, name) => self.ref(self.classFor(cpu.readCString(name >>> 0)))];
    t[15] = [1, () => 0];                // ExceptionOccurred
    t[16] = [1, () => {}];               // ExceptionDescribe
    t[17] = [1, () => {}];               // ExceptionClear
    t[19] = [2, () => 0];                // PushLocalFrame
    t[20] = [2, (env, res) => res];      // PopLocalFrame
    t[21] = [2, (env, o) => o];          // NewGlobalRef: handles are already global
    t[22] = [2, () => {}];               // DeleteGlobalRef
    t[23] = [2, () => {}];               // DeleteLocalRef
    t[24] = [3, (env, a, b) => (a === b ? 1 : 0)];
    t[25] = [2, (env, o) => o];
    t[26] = [2, () => 0];
    t[31] = [2, (env, o) => { const ob = self.obj(o); return self.ref(self.classFor(ob ? ob.cls : 'java/lang/Object')); }];
    t[32] = [3, () => 1];
    t[33] = [4, (env, cls, name, sig) => methodId(cls, name, sig, false)];
    t[113] = [4, (env, cls, name, sig) => methodId(cls, name, sig, true)];
    t[167] = [2, (env, p) => self.str(cpu.readCString(p >>> 0))];          // NewStringUTF
    t[164] = [2, (env, s) => self.obj(s).value.length];                    // GetStringLength
    t[168] = [2, (env, s) => self.obj(s).value.length];                    // GetStringUTFLength
    t[169] = [3, (env, s, isCopy) => {                                     // GetStringUTFChars
      const v = self.obj(s).value, a = heap.alloc(v.length + 1);
      cpu.writeCString(a, v); if (isCopy) cpu.m8[isCopy >>> 0] = 1; return a;
    }];
    t[170] = [3, (env, s, p) => { heap.free(p >>> 0); }];                  // ReleaseStringUTFChars
    t[165] = [3, (env, s, isCopy) => {                                     // GetStringChars
      const v = self.obj(s).value, a = heap.alloc(v.length * 2 + 2);
      for (let i = 0; i < v.length; i++) dv.setUint16(a + i * 2, v.charCodeAt(i), true);
      if (isCopy) cpu.m8[isCopy >>> 0] = 1; return a;
    }];
    t[166] = [3, (env, s, p) => { heap.free(p >>> 0); }];
    t[163] = [3, (env, p, n) => { let v = ''; for (let i = 0; i < n; i++) v += String.fromCharCode(dv.getUint16((p >>> 0) + i * 2, true)); return self.str(v); }];
    t[171] = [2, (env, a) => self.obj(a).items.length];                   // GetArrayLength
    t[172] = [4, (env, n, cls, init) => self.ref(new JObject('[Ljava/lang/Object;', { items: new Array(n).fill(self.obj(init)) }))];
    t[173] = [3, (env, a, i) => self.ref(self.obj(a).items[i])];
    t[174] = [4, (env, a, i, v) => { self.obj(a).items[i] = self.obj(v); }];
    t[179] = [2, (env, n) => self.ref(new JObject('[I', { items: new Array(n).fill(0) }))]; // NewIntArray
    t[211] = [5, (env, a, start, n, buf) => {                              // SetIntArrayRegion
      const items = self.obj(a).items; for (let i = 0; i < n; i++) items[start + i] = dv.getInt32((buf >>> 0) + i * 4, true);
    }];
    t[187] = [3, (env, a, isCopy) => {                                     // GetIntArrayElements
      const items = self.obj(a).items, p = heap.alloc(items.length * 4 + 4);
      items.forEach((v, i) => dv.setInt32(p + i * 4, v, true)); if (isCopy) cpu.m8[isCopy >>> 0] = 1; return p;
    }];
    t[195] = [4, (env, a, p) => { heap.free(p >>> 0); }];                 // ReleaseIntArrayElements
    t[203] = [5, (env, a, start, n, buf) => {                              // GetIntArrayRegion
      const items = self.obj(a).items; for (let i = 0; i < n; i++) dv.setInt32((buf >>> 0) + i * 4, items[start + i], true);
    }];
    t[217] = [2, () => 0]; t[218] = [2, () => 0];                         // MonitorEnter/Exit
    t[228] = [1, () => 0];                                                 // ExceptionCheck
    t[230] = [2, (env, b) => self.obj(b).address];                         // GetDirectBufferAddress
    t[231] = [2, (env, b) => self.obj(b).capacity];
    return t;
  }

  classes = new Map();
  classFor(name) {
    let c = this.classes.get(name);
    if (!c) { c = new JObject('java/lang/Class', { name }); this.classes.set(name, c); }
    return c;
  }
  // A direct buffer backed by emulated memory.
  directBuffer(cls, bytes) { return new JObject(cls, { address: this.m.heap.alloc(bytes), capacity: bytes }); }
}
