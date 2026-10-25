// The slice of Windows that ResetGeneration-Win32-Web.dll imports: 95 KERNEL32 functions (C runtime
// support, heap, files, sync) and WINMM timeGetTime. Single-threaded, so sync objects are no-ops.
import { EAX, ESP } from './cpu.js';

// Windows SDK constants, grouped by the API that uses them.
const WAIT_OBJECT_0 = 0;
const TIME_ZONE_ID_UNKNOWN = 0;
const VER_PLATFORM_WIN32_NT = 2;
const HEAP_ZERO_MEMORY = 0x8;
const MEM_COMMIT = 0x1000, MEM_RELEASE = 0x8000, MEM_PRIVATE = 0x20000;
const PAGE_READWRITE = 0x04;
const PROCESSOR_INTEL_PENTIUM = 586;
const LCMAP_LOWERCASE = 0x100, LCMAP_UPPERCASE = 0x200;
const NORM_IGNORECASE = 0x1;
const CSTR_LESS_THAN = 1, CSTR_EQUAL = 2, CSTR_GREATER_THAN = 3;
const C1_UPPER = 0x01, C1_LOWER = 0x02, C1_DIGIT = 0x04, C1_SPACE = 0x08, C1_PUNCT = 0x10;
const C1_CNTRL = 0x20, C1_BLANK = 0x40, C1_XDIGIT = 0x80, C1_ALPHA = 0x100;
const STD_INPUT_HANDLE = -10;
const FILE_TYPE_UNKNOWN = 0, FILE_TYPE_DISK = 1, FILE_TYPE_CHAR = 2;
const GENERIC_WRITE = 0x40000000;
const CREATE_NEW = 1, CREATE_ALWAYS = 2, OPEN_ALWAYS = 4, TRUNCATE_EXISTING = 5;
const INVALID_HANDLE_VALUE = -1;
const FILE_BEGIN = 0, FILE_CURRENT = 1;
const INVALID_SET_FILE_POINTER = -1; // 0xffffffff
const ERROR_FILE_NOT_FOUND = 2, ERROR_INVALID_HANDLE = 6, ERROR_NO_MORE_FILES = 18;

const PAGE_SIZE = 0x1000;
const ALLOCATION_GRANULARITY = 0x10000;              // VirtualAlloc reservations start on this boundary
const DEFAULT_CHAR = 0x3f;                           // '?': what unmappable characters become
const STD_HANDLE_BASE = 0x10;                        // stdin, stdout and stderr are STD_HANDLE_BASE + 0, 1, 2
const FILETIME_UNIX_EPOCH = 116444736000000000n;     // 1970-01-01 as a FILETIME (100 ns ticks since 1601)
const FILETIME_TICKS_PER_MS = 10000n;

// ---- traps: an address the CPU "calls" that runs a JS function ----
export class Traps {
  constructor(cpu, base, size) { this.cpu = cpu; this.next = base; this.end = base + size; }
  // stdcall: callee pops nargs. cdecl: caller pops. fn receives the args and returns EAX.
  add(nargs, fn, cdecl = false) {
    const cpu = this.cpu, addr = this.next;
    this.next += 4;
    if (this.next > this.end) throw new Error('out of trap space');
    cpu.traps.set(addr, () => {
      const sp = cpu.r[ESP] >>> 0, ret = cpu.dv.getUint32(sp, true), args = new Array(nargs);
      for (let i = 0; i < nargs; i++) args[i] = cpu.dv.getInt32(sp + 4 + i * 4, true);
      cpu.r[ESP] = (sp + 4 + (cdecl ? 0 : nargs * 4)) | 0;
      cpu.eip = ret;
      const v = fn(...args);
      if (v !== undefined) cpu.r[EAX] = typeof v === 'bigint' ? Number(BigInt.asIntN(32, v)) : v | 0;
    });
    return addr;
  }
}

// ---- heap: power-of-two bins for small blocks, first fit for big ones; no coalescing ----
export class Heap {
  constructor(cpu, start, end) {
    this.cpu = cpu; this.top = start; this.end = end;
    this.sizes = new Map(); this.bins = new Map(); this.big = [];
  }
  static cls(n) { return n <= 16 ? 16 : 2 ** Math.ceil(Math.log2(n)); }
  alloc(n, zero = true) {
    n = Math.max(n, 1);
    const c = Heap.cls(n);
    let a;
    if (c <= 1 << 20) {
      const bin = this.bins.get(c);
      a = bin && bin.length ? bin.pop() : this.bump(c, 16);
    } else {
      const i = this.big.findIndex(b => b.size >= c);
      a = i >= 0 ? this.big.splice(i, 1)[0].addr : this.bump(c, 4096);
    }
    this.sizes.set(a, { req: n, cap: c });
    if (zero) this.cpu.m8.fill(0, a, a + c);
    return a;
  }
  bump(n, align) {
    const a = (this.top + align - 1) & ~(align - 1);
    if (a + n > this.end) throw new Error(`out of emulated memory allocating ${n} bytes`);
    this.top = a + n;
    return a;
  }
  free(a) {
    const s = this.sizes.get(a);
    if (!s) return false;
    this.sizes.delete(a);
    if (s.cap <= 1 << 20) { let bin = this.bins.get(s.cap); if (!bin) this.bins.set(s.cap, bin = []); bin.push(a); }
    else this.big.push({ addr: a, size: s.cap });
    return true;
  }
  realloc(a, n, zero) {
    if (!a) return this.alloc(n, zero);
    const s = this.sizes.get(a);
    if (!s) return 0;
    if (n <= s.cap) { if (zero && n > s.req) this.cpu.m8.fill(0, a + s.req, a + n); s.req = n; return a; }
    const b = this.alloc(n, zero);
    this.cpu.m8.copyWithin(b, a, a + s.req);
    this.free(a);
    return b;
  }
  size(a) { const s = this.sizes.get(a); return s ? s.req : -1; }
}

// ---- in-memory file system; paths are case-insensitive and use backslashes ----
export class VFS {
  constructor() { this.files = new Map(); this.dirs = new Set(); this.deleted = new Set(); } // deleted: names, for saving
  norm(p) { return p.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase(); }
  put(path, data) { const name = path.split(/[\\/]/).pop(); this.deleted.delete(name); this.files.set(this.norm(path), { name, data }); }
  delete(path) { const f = this.get(path); if (f) { this.files.delete(this.norm(path)); this.deleted.add(f.name); } }
  get(path) { return this.files.get(this.norm(path)); }
  // Glob with * and ? in the last path component.
  find(pattern) {
    const p = this.norm(pattern), dir = p.slice(0, p.lastIndexOf('\\')), mask = p.slice(p.lastIndexOf('\\') + 1);
    const re = new RegExp('^' + mask.replace(/[.+^${}()|[\]]/g, '\\$&').replace(/\*/g, '.*').replace(/\?/g, '.') + '$');
    return [...this.files.entries()].filter(([k]) => k.slice(0, k.lastIndexOf('\\')) === dir && re.test(k.slice(k.lastIndexOf('\\') + 1))).map(([, f]) => f);
  }
}

export class Win32 {
  constructor(cpu, traps, heap, vfs, opts = {}) {
    this.cpu = cpu; this.traps = traps; this.heap = heap; this.vfs = vfs;
    this.log = opts.log || (() => {});
    this.now = 0;              // virtual milliseconds; Sleep advances it, the host syncs it to real time
    this.lastError = 0;
    this.handles = new Map(); this.nextHandle = 0x100;
    this.tls = [];
    this.modulePath = opts.modulePath || 'C:\\RG\\ResetGeneration-Win32-Web.dll';
    this.moduleBase = 0;
    this.statics = {};
    this.fns = this.buildTable();
  }
  handle(obj) { const h = this.nextHandle; this.nextHandle += 4; this.handles.set(h, obj); return h; }
  staticString(key, s, wide = false) {
    if (!this.statics[key]) {
      const n = wide ? (s.length + 1) * 2 : s.length + 1, a = this.heap.alloc(n + 2);
      if (wide) for (let i = 0; i < s.length; i++) this.cpu.dv.setUint16(a + i * 2, s.charCodeAt(i), true);
      else this.cpu.writeCString(a, s);
      this.statics[key] = a;
    }
    return this.statics[key];
  }
  // Binds an import by name; unknown imports trap with an error naming them.
  bind(dll, name) {
    const fn = this.fns[name];
    if (!fn) return this.traps.add(0, () => { throw new Error(`unimplemented import ${dll}!${name}`); });
    return this.traps.add(fn[0], fn[1], fn[2]);
  }
  fileTime(ms) { return BigInt(Math.round(ms)) * FILETIME_TICKS_PER_MS + FILETIME_UNIX_EPOCH; }

  buildTable() {
    const c = this.cpu, dv = c.dv, m8 = c.m8, heap = this.heap, vfs = this.vfs;
    const str = a => a ? c.readCString(a >>> 0) : null;
    const wstr = a => { let s = ''; for (let p = a >>> 0, ch; (ch = dv.getUint16(p, true)); p += 2) s += String.fromCharCode(ch); return s; };
    const u = v => v >>> 0;
    const ok = 1;
    const noop = n => [n, () => ok];
    const self = this;
    const systemTime = (p, d) => { // SYSTEMTIME from a Date
      dv.setUint16(p, d.getUTCFullYear(), true); dv.setUint16(p + 2, d.getUTCMonth() + 1, true);
      dv.setUint16(p + 4, d.getUTCDay(), true); dv.setUint16(p + 6, d.getUTCDate(), true);
      dv.setUint16(p + 8, d.getUTCHours(), true); dv.setUint16(p + 10, d.getUTCMinutes(), true);
      dv.setUint16(p + 12, d.getUTCSeconds(), true); dv.setUint16(p + 14, d.getUTCMilliseconds(), true);
    };
    const findData = (p, f) => {
      m8.fill(0, p, p + 320);
      dv.setUint32(p, 0x80, true);                     // FILE_ATTRIBUTE_NORMAL
      dv.setUint32(p + 32, f.data.length, true);        // nFileSizeLow
      c.writeCString(p + 44, f.name);
    };
    return {
      // time
      timeGetTime: [0, () => self.now],
      GetTickCount: [0, () => self.now],
      Sleep: [1, ms => { self.now += u(ms); }],
      QueryPerformanceCounter: [1, p => { dv.setBigInt64(u(p), BigInt(Math.round(self.now * 1000)), true); return ok; }],
      GetSystemTimeAsFileTime: [1, p => { dv.setBigUint64(u(p), self.fileTime(Date.now()), true); }],
      FileTimeToLocalFileTime: [2, (a, b) => { dv.setBigUint64(u(b), dv.getBigUint64(u(a), true), true); return ok; }],
      FileTimeToSystemTime: [2, (a, b) => { const t = dv.getBigUint64(u(a), true); systemTime(u(b), new Date(Number((t - FILETIME_UNIX_EPOCH) / FILETIME_TICKS_PER_MS))); return ok; }],
      GetTimeZoneInformation: [1, p => { m8.fill(0, u(p), u(p) + 172); return TIME_ZONE_ID_UNKNOWN; }],
      // process and environment
      GetCurrentThreadId: [0, () => 1], GetCurrentProcessId: [0, () => 1], GetCurrentProcess: [0, () => -1],
      ExitProcess: [1, code => { throw new Error(`ExitProcess(${code})`); }],
      TerminateProcess: [2, (h, code) => { throw new Error(`TerminateProcess(${code})`); }],
      GetCommandLineA: [0, () => self.staticString('cmd', 'java.exe')],
      GetEnvironmentStrings: [0, () => self.staticString('envA', '\0')],
      GetEnvironmentStringsW: [0, () => self.staticString('envW', '\0', true)],
      FreeEnvironmentStringsA: noop(1), FreeEnvironmentStringsW: noop(1),
      SetEnvironmentVariableA: noop(2),
      GetVersionExA: [1, p => { // Windows XP SP2
        p = u(p); dv.setUint32(p + 4, 5, true); dv.setUint32(p + 8, 1, true); dv.setUint32(p + 12, 2600, true);
        dv.setUint32(p + 16, VER_PLATFORM_WIN32_NT, true); c.writeCString(p + 20, 'Service Pack 2'); return ok;
      }],
      GetStartupInfoA: [1, p => { m8.fill(0, u(p), u(p) + 68); dv.setUint32(u(p), 68, true); }], // cb = sizeof(STARTUPINFOA)
      GetModuleHandleA: [1, name => {
        const n = (str(name) || '').toLowerCase();
        return !n ? self.moduleBase : n.includes('kernel32') ? 0x7c800000 : 0;
      }],
      GetModuleFileNameA: [3, (h, buf, n) => { const s = self.modulePath.slice(0, n - 1); c.writeCString(u(buf), s); return s.length; }],
      LoadLibraryA: [1, () => 0],
      GetProcAddress: [2, (h, name) => {
        const n = str(name), fn = self.fns[n];
        return fn ? self.traps.add(fn[0], fn[1], fn[2]) : 0;
      }],
      GetLastError: [0, () => self.lastError],
      SetLastError: [1, e => { self.lastError = e; }],
      SetUnhandledExceptionFilter: [1, () => 0],
      UnhandledExceptionFilter: [1, () => 0],
      RaiseException: [4, code => { throw new Error(`RaiseException(0x${u(code).toString(16)})`); }],
      RtlUnwind: [4, () => { throw new Error('RtlUnwind'); }],
      IsBadReadPtr: noop(2), IsBadWritePtr: noop(2), IsBadCodePtr: noop(1),
      IsBadReadPtrFalse: [2, () => 0],
      // sync: one thread, so locks always succeed
      InitializeCriticalSection: [1, () => {}], DeleteCriticalSection: [1, () => {}],
      EnterCriticalSection: [1, () => {}], LeaveCriticalSection: [1, () => {}],
      InitializeCriticalSectionAndSpinCount: [2, () => ok],
      CreateMutexA: [3, () => self.handle({ kind: 'sync' })],
      CreateSemaphoreA: [4, () => self.handle({ kind: 'sync' })],
      ReleaseMutex: noop(1), ReleaseSemaphore: noop(3),
      WaitForSingleObject: [2, () => WAIT_OBJECT_0],
      InterlockedExchange: [2, (p, v) => { const old = dv.getInt32(u(p), true); dv.setInt32(u(p), v, true); return old; }],
      // thread local storage
      TlsAlloc: [0, () => { self.tls.push(0); return self.tls.length - 1; }],
      TlsFree: noop(1),
      TlsSetValue: [2, (i, v) => { self.tls[i] = v; return ok; }],
      TlsGetValue: [1, i => { self.lastError = 0; return self.tls[i] || 0; }],
      // memory
      HeapCreate: [3, () => 0x500000],
      HeapDestroy: noop(1),
      HeapAlloc: [3, (h, flags, n) => heap.alloc(u(n), (flags & HEAP_ZERO_MEMORY) !== 0)],
      HeapFree: [3, (h, flags, p) => (heap.free(u(p)) ? 1 : 0)],
      HeapReAlloc: [4, (h, flags, p, n) => heap.realloc(u(p), u(n), (flags & HEAP_ZERO_MEMORY) !== 0)],
      HeapSize: [3, (h, flags, p) => heap.size(u(p))],
      VirtualAlloc: [4, (addr, size, type) => {
        // A commit inside a block we already handed out is free: the memory is already there.
        if (addr && heap.sizes.has(u(addr) & ~(ALLOCATION_GRANULARITY - 1))) return addr;
        if (addr) for (const [a, s] of heap.sizes) if (u(addr) >= a && u(addr) < a + s.cap) return addr;
        return heap.alloc(u(size));
      }],
      VirtualFree: [3, (addr, size, type) => { if (type & MEM_RELEASE) heap.free(u(addr)); return ok; }],
      VirtualProtect: [4, (a, n, prot, old) => { if (old) dv.setUint32(u(old), PAGE_READWRITE, true); return ok; }],
      VirtualQuery: [3, (addr, info, n) => {
        info = u(info); m8.fill(0, info, info + 28);  // MEMORY_BASIC_INFORMATION
        const a = u(addr) & ~(PAGE_SIZE - 1);
        dv.setUint32(info, a, true);                   // BaseAddress
        dv.setUint32(info + 4, a, true);               // AllocationBase
        dv.setUint32(info + 8, PAGE_READWRITE, true);  // AllocationProtect
        dv.setUint32(info + 12, PAGE_SIZE, true);      // RegionSize
        dv.setUint32(info + 16, MEM_COMMIT, true);     // State
        dv.setUint32(info + 20, PAGE_READWRITE, true); // Protect
        dv.setUint32(info + 24, MEM_PRIVATE, true);    // Type
        return 28;
      }],
      GetSystemInfo: [1, p => {
        p = u(p); m8.fill(0, p, p + 36);                     // SYSTEM_INFO
        dv.setUint32(p + 4, PAGE_SIZE, true);                // dwPageSize
        dv.setUint32(p + 8, 0x10000, true);                  // lpMinimumApplicationAddress
        dv.setUint32(p + 12, 0x7ffeffff, true);              // lpMaximumApplicationAddress
        dv.setUint32(p + 16, 1, true);                       // dwActiveProcessorMask
        dv.setUint32(p + 20, 1, true);                       // dwNumberOfProcessors
        dv.setUint32(p + 24, PROCESSOR_INTEL_PENTIUM, true); // dwProcessorType
        dv.setUint32(p + 28, ALLOCATION_GRANULARITY, true);  // dwAllocationGranularity
      }],
      // strings and locale (ASCII is all the game uses)
      GetACP: [0, () => 1252], GetOEMCP: [0, () => 437],
      GetCPInfo: [2, (cp, p) => { p = u(p); m8.fill(0, p, p + 20); dv.setUint32(p, 1, true); m8[p + 4] = DEFAULT_CHAR; return ok; }],
      GetLocaleInfoA: [4, () => 0],
      MultiByteToWideChar: [6, (cp, flags, src, n, dst, cap) => {
        const s = n === -1 ? str(src) + '\0' : String.fromCharCode(...m8.subarray(u(src), u(src) + n));
        if (!cap) return s.length;
        const k = Math.min(s.length, cap);
        for (let i = 0; i < k; i++) dv.setUint16(u(dst) + i * 2, s.charCodeAt(i), true);
        return k;
      }],
      WideCharToMultiByte: [8, (cp, flags, src, n, dst, cap) => {
        let s = n === -1 ? wstr(src) + '\0' : ''; if (n !== -1) for (let i = 0; i < n; i++) s += String.fromCharCode(dv.getUint16(u(src) + i * 2, true));
        if (!cap) return s.length;
        const k = Math.min(s.length, cap);
        for (let i = 0; i < k; i++) { const ch = s.charCodeAt(i); m8[u(dst) + i] = ch < 256 ? ch : DEFAULT_CHAR; }
        return k;
      }],
      LCMapStringA: [6, (lcid, flags, src, n, dst, cap) => {
        let s = n === -1 ? str(src) + '\0' : String.fromCharCode(...m8.subarray(u(src), u(src) + n));
        if (flags & LCMAP_LOWERCASE) s = s.toLowerCase(); else if (flags & LCMAP_UPPERCASE) s = s.toUpperCase();
        if (!cap) return s.length;
        for (let i = 0; i < Math.min(s.length, cap); i++) m8[u(dst) + i] = s.charCodeAt(i);
        return Math.min(s.length, cap);
      }],
      LCMapStringW: [6, (lcid, flags, src, n, dst, cap) => {
        let s = ''; const len = n === -1 ? wstr(src).length + 1 : n;
        for (let i = 0; i < len; i++) s += String.fromCharCode(dv.getUint16(u(src) + i * 2, true));
        if (flags & LCMAP_LOWERCASE) s = s.toLowerCase(); else if (flags & LCMAP_UPPERCASE) s = s.toUpperCase();
        if (!cap) return s.length;
        for (let i = 0; i < Math.min(s.length, cap); i++) dv.setUint16(u(dst) + i * 2, s.charCodeAt(i), true);
        return Math.min(s.length, cap);
      }],
      GetStringTypeA: [5, (lcid, type, src, n, out) => { // CT_CTYPE1 bits for ASCII
        const len = n === -1 ? str(src).length + 1 : n;
        for (let i = 0; i < len; i++) dv.setUint16(u(out) + i * 2, ctype(m8[u(src) + i]), true);
        return ok;
      }],
      GetStringTypeW: [4, (type, src, n, out) => {
        const len = n === -1 ? wstr(src).length + 1 : n;
        for (let i = 0; i < len; i++) dv.setUint16(u(out) + i * 2, ctype(dv.getUint16(u(src) + i * 2, true)), true);
        return ok;
      }],
      CompareStringA: [6, (lcid, flags, a, na, b, nb) => {
        const sa = na === -1 ? str(a) : String.fromCharCode(...m8.subarray(u(a), u(a) + na));
        const sb = nb === -1 ? str(b) : String.fromCharCode(...m8.subarray(u(b), u(b) + nb));
        const x = flags & NORM_IGNORECASE ? sa.toLowerCase() : sa, y = flags & NORM_IGNORECASE ? sb.toLowerCase() : sb;
        return x < y ? CSTR_LESS_THAN : x > y ? CSTR_GREATER_THAN : CSTR_EQUAL;
      }],
      CompareStringW: [6, (lcid, flags, a, na, b, nb) => {
        const rd = (p, n) => { if (n === -1) return wstr(p); let s = ''; for (let i = 0; i < n; i++) s += String.fromCharCode(dv.getUint16(u(p) + i * 2, true)); return s; };
        const x = rd(a, na), y = rd(b, nb);
        return x < y ? CSTR_LESS_THAN : x > y ? CSTR_GREATER_THAN : CSTR_EQUAL;
      }],
      // files
      GetStdHandle: [1, n => STD_HANDLE_BASE + (STD_INPUT_HANDLE - n)],
      SetStdHandle: noop(2),
      SetHandleCount: [1, n => n],
      GetFileType: [1, h => (h >= STD_HANDLE_BASE && h < STD_HANDLE_BASE + 3 ? FILE_TYPE_CHAR : self.handles.has(h) ? FILE_TYPE_DISK : FILE_TYPE_UNKNOWN)],
      CreateFileA: [7, (name, access, share, sec, disp) => {
        const path = str(name);
        let f = vfs.get(path);
        const write = (access & GENERIC_WRITE) !== 0;
        if (!f && (disp === CREATE_NEW || disp === CREATE_ALWAYS || disp === OPEN_ALWAYS)) { vfs.put(path, new Uint8Array(0)); f = vfs.get(path); }
        else if (f && (disp === CREATE_ALWAYS || disp === TRUNCATE_EXISTING)) f.data = new Uint8Array(0);
        if (!f) { self.log(`CreateFileA miss: ${path}`); self.lastError = ERROR_FILE_NOT_FOUND; return INVALID_HANDLE_VALUE; }
        self.log(`CreateFileA ${path}${write ? ' (write)' : ''}`);
        return self.handle({ kind: 'file', f, pos: 0 });
      }],
      ReadFile: [5, (h, buf, n, readp, ovl) => {
        const o = self.handles.get(h);
        if (!o || o.kind !== 'file') { self.lastError = ERROR_INVALID_HANDLE; return 0; }
        const k = Math.max(0, Math.min(u(n), o.f.data.length - o.pos));
        m8.set(o.f.data.subarray(o.pos, o.pos + k), u(buf));
        o.pos += k;
        if (readp) dv.setUint32(u(readp), k, true);
        return ok;
      }],
      WriteFile: [5, (h, buf, n, wrp, ovl) => {
        const bytes = m8.slice(u(buf), u(buf) + u(n));
        if (h >= STD_HANDLE_BASE && h < STD_HANDLE_BASE + 3) self.log(`stdout: ${new TextDecoder().decode(bytes)}`);
        else {
          const o = self.handles.get(h);
          if (!o) return 0;
          const end = o.pos + bytes.length;
          if (end > o.f.data.length) { const d = new Uint8Array(end); d.set(o.f.data); o.f.data = d; }
          o.f.data.set(bytes, o.pos); o.pos = end; o.f.dirty = true;
        }
        if (wrp) dv.setUint32(u(wrp), u(n), true);
        return ok;
      }],
      SetFilePointer: [4, (h, lo, hip, method) => {
        const o = self.handles.get(h);
        if (!o) return INVALID_SET_FILE_POINTER;
        const origin = method === FILE_BEGIN ? 0 : method === FILE_CURRENT ? o.pos : o.f.data.length;
        o.pos = Math.max(0, origin + lo);
        if (hip) dv.setInt32(u(hip), 0, true);
        return o.pos;
      }],
      SetEndOfFile: [1, h => { const o = self.handles.get(h); if (o) { o.f.data = o.f.data.slice(0, o.pos); o.f.dirty = true; } return ok; }],
      FlushFileBuffers: noop(1),
      CloseHandle: [1, h => { self.handles.delete(h); return ok; }],
      DeleteFileA: [1, name => { vfs.delete(str(name)); return ok; }],
      CreateDirectoryA: [2, name => { vfs.dirs.add(vfs.norm(str(name))); return ok; }],
      RemoveDirectoryA: noop(1),
      FindFirstFileA: [2, (pat, data) => {
        const list = vfs.find(str(pat));
        self.log(`FindFirstFileA ${str(pat)} -> ${list.length}`);
        if (!list.length) { self.lastError = ERROR_FILE_NOT_FOUND; return INVALID_HANDLE_VALUE; }
        findData(u(data), list[0]);
        return self.handle({ kind: 'find', list, i: 1 });
      }],
      FindNextFileA: [2, (h, data) => {
        const o = self.handles.get(h);
        if (!o || o.i >= o.list.length) { self.lastError = ERROR_NO_MORE_FILES; return 0; }
        findData(u(data), o.list[o.i++]);
        return ok;
      }],
      FindClose: [1, h => { self.handles.delete(h); return ok; }],
    };
  }
}

function ctype(ch) {
  let t = 0;
  if (ch >= 0x41 && ch <= 0x5a) t |= C1_ALPHA | C1_UPPER; else if (ch >= 0x61 && ch <= 0x7a) t |= C1_ALPHA | C1_LOWER;
  if (ch >= 0x30 && ch <= 0x39) t |= C1_XDIGIT | C1_DIGIT;
  if (ch === 0x20 || (ch >= 9 && ch <= 13)) t |= C1_SPACE;
  if (ch === 0x20) t |= C1_BLANK;
  if ((ch >= 0x21 && ch <= 0x2f) || (ch >= 0x3a && ch <= 0x40) || (ch >= 0x5b && ch <= 0x60) || (ch >= 0x7b && ch <= 0x7e)) t |= C1_PUNCT;
  if (ch < 0x20 || ch === 0x7f) t |= C1_CNTRL;
  if ((ch >= 0x30 && ch <= 0x39) || (ch >= 0x41 && ch <= 0x46) || (ch >= 0x61 && ch <= 0x66)) t |= C1_XDIGIT;
  return t;
}
