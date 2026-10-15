// Emulated process for the game DLL. Memory map:
//   0x00007000         return sentinel for host->guest calls
//   0x00008000-0xffff  trap addresses (imports, JNI functions)
//   0x00010000         TEB (FS points here), 0x00011000 PEB
//   0x00100000-0x3fffff stack
//   0x00400000         DLL image (relocated from 0x10000000)
//   0x00600000-end     heap
import { CPU, ESP } from './cpu.js';
import { loadPE } from './pe.js';
import { Traps, Heap, VFS, Win32 } from './win32.js';

export const IMAGE_BASE = 0x400000;

export class Machine {
  constructor({ memSize = 384 << 20, log = () => {} } = {}) {
    const cpu = this.cpu = new CPU(memSize);
    cpu.sentinel = 0x7000;
    this.traps = new Traps(cpu, 0x8000, 0x8000);
    this.heap = new Heap(cpu, 0x600000, memSize);
    this.vfs = new VFS();
    this.win = new Win32(cpu, this.traps, this.heap, this.vfs, { log });
    this.log = log;
    const teb = 0x10000, dv = cpu.dv;
    dv.setInt32(teb, -1, true);              // SEH ExceptionList: empty
    dv.setUint32(teb + 4, 0x400000, true);   // stack base
    dv.setUint32(teb + 8, 0x100000, true);   // stack limit
    dv.setUint32(teb + 0x18, teb, true);     // self
    dv.setUint32(teb + 0x30, 0x11000, true); // PEB
    cpu.fsBase = teb;
    cpu.r[ESP] = 0x3ffff0;
  }
  loadDll(bytes) {
    const pe = this.pe = loadPE(this.cpu, bytes, IMAGE_BASE, (dll, name) => this.win.bind(dll, name));
    this.cpu.setCodeRange(pe.base, pe.size);
    this.win.moduleBase = pe.base;
    return this.cpu.call(pe.entry, [pe.base, 1, 0]); // DllMain(DLL_PROCESS_ATTACH)
  }
  // Address of an export by name, or of a DLL address given as in the original image (0x10xxxxxx).
  addr(nameOrVa) {
    if (typeof nameOrVa === 'number') return nameOrVa - 0x10000000 + this.pe.base;
    const a = this.pe.exports.get(nameOrVa);
    if (a === undefined) throw new Error(`no export ${nameOrVa}`);
    return a;
  }
}
