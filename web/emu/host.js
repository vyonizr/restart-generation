// Runs the game engine as the original Java client hosts it, with JS in
// place of Java: frame buffer, keys, sound and the SNAP bridge are JS objects behind the fake JNI.
import { Machine } from './machine.js';
import { JNI, JObject } from './jni.js';
import { installFastPaths } from './fast.js';

export const WIDTH = 240, HEIGHT = 320;
const HOME = 'C:\\RG';

// Java KeyEvent codes for the keys the game uses.
export const VK = { ENTER: 10, BACK_SPACE: 8, SHIFT: 16, CONTROL: 17, ESCAPE: 27, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, SPACE: 32 };

// In-memory engine patches (docs/adr/0007). Each one is written only if the engine has the original bytes.
// Every story and hero playable from the start; nothing is marked finished. A story's badge (lock, 0%, 50%)
// counts its playable missions (FUN_100d7b70), so the story list is patched apart from the missions.
export const UNLOCKS = [
  { what: 'every mission playable', va: 0x100d7a70, from: '8b4424088b4c2404', to: 'b001c20800' }, // mov al, 1; ret 8
  { what: 'no story locked', va: 0x100c8a98, from: '8b570433c9', to: 'eb4c' }, // FUN_100c89c0: a story with no playable mission shows 0%
  { what: 'no hero grayed out', va: 0x100dc850, from: '8b41348b4c2404c6040101c20400', to: 'c20400' }, // ret 4
];
// A player alone in their friendly room can press Start, for a match the server fills with bots. The lobby
// otherwise shows and accepts Start only with another member listed (FUN_100eaaf0, FUN_100eadd0 key 4).
export const LONE_START = [
  { what: 'Start shown when alone', va: 0x100eab1b, from: '8b463485c07462', to: '8b463485c09090' },
  { what: 'Start accepted when alone', va: 0x100eae95, from: '8b462c85c0762d', to: '8b462c85c09090' },
];

export class GameHost {
  // files: { name: Uint8Array } for the DLL and everything in the ResetGeneration folder.
  // patches: entries like UNLOCKS, applied after the DLL loads.
  constructor(files, { log = () => {}, warn = console.warn, language = 'en', snap = null, jit = true, fast = true, patches = [] } = {}) {
    this.jit = jit; this.fast = fast; this.patches = patches; this.warn = warn;
    this.files = files; this.log = log; this.language = language;
    this.snapMethods = snap; // JS implementation of NativeSNAPMobileInterface (online play)
  }

  boot() {
    const m = this.m = new Machine({ log: this.log });
    m.cpu.jit = this.jit;
    for (const [name, data] of Object.entries(this.files)) if (!name.endsWith('.dll') && !name.endsWith('.dylib')) m.vfs.put(`${HOME}\\${name}`, data);
    m.loadDll(this.files['ResetGeneration-Win32-Web.dll']);
    for (const p of this.patches) {
      const at = m.addr(p.va);
      const now = [...m.cpu.m8.subarray(at, at + p.from.length / 2)].map(b => b.toString(16).padStart(2, '0')).join('');
      if (now !== p.from) { this.warn(`engine patch skipped (${p.what}): unexpected bytes at ${p.va.toString(16)}`); continue; }
      m.cpu.m8.set(p.to.match(/../g).map(h => parseInt(h, 16)), at);
    }
    if (this.fast) installFastPaths(m.cpu, va => m.addr(va));
    const jni = this.jni = new JNI(m, { log: this.log }), env = jni.env;
    const ex = n => m.addr(n);
    const call = (name, ...args) => m.cpu.call(ex(name), [env, ...args]);

    this.engine = new JObject('rg/natives/NativeGameEngine');
    this.frame = jni.directBuffer('java/nio/DirectIntBufferU', WIDTH * (HEIGHT + 1) * 4);
    this.input = new JObject('rg/natives/NativeInputEventListener');
    this.sound = new JObject('rg/natives/NativeSoundOutputDevice');
    this.soundBuf = jni.directBuffer('java/nio/DirectByteBuffer', 1024);
    this.netBuf = jni.directBuffer('java/nio/DirectByteBuffer', 2048);
    this.bridge = new JObject('com/redlynx/mt/snapmobile/NativeSNAPMobileInterface', { methods: this.snapMethods || offlineSnap() });
    this.events = new JObject('com/redlynx/mt/snapmobile/NativeSNAPMobileEventListener');

    this.call = call;
    const ref = o => jni.ref(o);
    call('_Java_rg_natives_NativeGameEngine_setHomeDirectory@12', ref(this.engine), jni.str(HOME));
    call('_Java_rg_natives_NativeGameEngine_init@44', ref(this.engine), ref(this.frame), jni.str(this.language), 0,
      WIDTH, HEIGHT, jni.str(''), 0, 0, 0);
    call('_Java_com_redlynx_mt_snapmobile_NativeSNAPMobileInterface_initNative@20', ref(this.bridge), ref(this.netBuf), 2048, 876);
    for (const name of Object.keys(this.files).filter(n => n.endsWith('.pak')).sort()) {
      call('_Java_rg_natives_NativeGameEngine_notifyDataPackageReady@12', ref(this.engine), jni.str(name));
    }
    this.pixels = new Int32Array(m.cpu.mem, this.frame.address, WIDTH * HEIGHT);
    this.clock0 = m.win.now;
  }

  // One game step. The engine paces itself: its frame limiter (FUN_100eddc0) runs a frame only while
  // the clock is before the next frame deadline, then Sleeps to it. Time therefore advances only
  // through Sleep; the host keeps calling tick() until `time` catches up with real time.
  tick() {
    return this.call('_Java_rg_natives_NativeGameEngine_tick@8', this.jni.ref(this.engine)) & 0xff;
  }
  get time() { return this.m.win.now - this.clock0; }

  // Calls fn(cpu) each time the guest reaches the original address `va`, then runs the instruction there as
  // usual. It only reads: nothing in the engine changes (ADR 0007's patch rules are about writes). Call it
  // after boot().
  watch(va, fn) {
    const cpu = this.m.cpu, at = this.m.addr(va), step = cpu.decode(at);
    cpu.traps.set(at, c => { fn(c); return step(); });
    cpu.codeCache[at - cpu.codeBase] = undefined;
  }

  key(down, code, ch = 0xffff, location = 1) {
    const name = down ? '_Java_rg_natives_NativeInputEventListener_onKeyPressed@24' : '_Java_rg_natives_NativeInputEventListener_onKeyReleased@24';
    this.call(name, this.jni.ref(this.input), this.m.win.now | 0, code, ch, location);
  }
  typed(ch) { this.call('_Java_rg_natives_NativeInputEventListener_onKeyTyped@16', this.jni.ref(this.input), this.m.win.now | 0, ch); }
  releaseAll() { this.call('_Java_rg_natives_NativeInputEventListener_releaseAllControls@8', this.jni.ref(this.input)); }

  // 1024 bytes of 8 kHz mono signed 16-bit PCM (SoundOutput.java).
  pullSound() {
    this.call('_Java_rg_natives_NativeSoundOutputDevice_onSoundBufferEmpty@16', this.jni.ref(this.sound), this.jni.ref(this.soundBuf), 1024);
    return new Int16Array(this.m.cpu.mem.slice(this.soundBuf.address, this.soundBuf.address + 1024));
  }

  // Engine callbacks of NativeSNAPMobileEventListener, e.g. snapEvent('onConnected@8').
  snapEvent(name, ...args) {
    this.call(`_Java_com_redlynx_mt_snapmobile_NativeSNAPMobileEventListener_${name}`, this.jni.ref(this.events), ...args);
  }
  // The 2048-byte direct buffer shared by send and onDataReceived.
  readNet(len) { return this.m.cpu.m8.slice(this.netBuf.address, this.netBuf.address + len); }
  writeNet(bytes) { this.m.cpu.m8.set(bytes.subarray(0, 2048), this.netBuf.address); }
  javaArray(strings) { return new JObject('[Ljava/lang/String;', { items: strings.map(s => new JObject('java/lang/String', { value: s })) }); }
  javaIntArray(ints) { return new JObject('[I', { items: ints }); }

  // Files the game wrote or deleted since the last call (settings, achievements, saves), for saving.
  // A deleted file comes back with data null.
  dirtyFiles() {
    const vfs = this.m.vfs, out = [...vfs.deleted].map(name => ({ name, data: null }));
    vfs.deleted.clear();
    for (const f of vfs.files.values()) if (f.dirty) { out.push(f); f.dirty = false; }
    return out;
  }
  // Whether the game wrote the file `name` since the last dirtyFiles().
  unsaved(name) { return Boolean(this.m.vfs.get(`${HOME}\\${name}`)?.dirty); }
}

// NativeSNAPMobileInterface when there is no server: logins fail with "could not connect".
function offlineSnap() {
  return {
    init: () => true, login: () => true, logout: () => {}, isLoggedIn: () => false,
    getLoginScreenStatus: () => 7, loginWasCancelled: () => false,
    startLoginScreen: () => {}, stopLoginScreen: () => {}, send: n => n,
  };
}
