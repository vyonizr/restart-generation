// Runs the game engine as the original Java client hosts it, with JS in
// place of Java: frame buffer, keys, sound and the SNAP bridge are JS objects behind the fake JNI.
import { Machine } from './machine.js';
import { JNI, JObject } from './jni.js';
import { installFastPaths } from './fast.js';

export const WIDTH = 240, HEIGHT = 320;
const HOME = 'C:\\RG';

// Java KeyEvent codes for the keys the game uses.
export const VK = { ENTER: 10, BACK_SPACE: 8, SHIFT: 16, CONTROL: 17, ESCAPE: 27, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, SPACE: 32 };

export class GameHost {
  // files: { name: Uint8Array } for the DLL and everything in the ResetGeneration folder.
  constructor(files, { log = () => {}, language = 'en', snap = null, jit = true, fast = true } = {}) {
    this.jit = jit; this.fast = fast;
    this.files = files; this.log = log; this.language = language;
    this.snapMethods = snap; // JS implementation of NativeSNAPMobileInterface (online play)
  }

  boot() {
    const m = this.m = new Machine({ log: this.log });
    m.cpu.jit = this.jit;
    for (const [name, data] of Object.entries(this.files)) if (!name.endsWith('.dll') && !name.endsWith('.dylib')) m.vfs.put(`${HOME}\\${name}`, data);
    m.loadDll(this.files['ResetGeneration-Win32-Web.dll']);
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

  // Files the game wrote (settings, achievements), for saving.
  dirtyFiles() {
    const out = [];
    for (const f of this.m.vfs.files.values()) if (f.dirty) { out.push(f); f.dirty = false; }
    return out;
  }
}

// NativeSNAPMobileInterface when there is no server: logins fail with "could not connect".
function offlineSnap() {
  return {
    init: () => true, login: () => true, logout: () => {}, isLoggedIn: () => false,
    getLoginScreenStatus: () => 7, loginWasCancelled: () => false,
    startLoginScreen: () => {}, stopLoginScreen: () => {}, send: n => n,
  };
}
