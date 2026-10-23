// Runs the game engine as the original Java client hosts it, with JS in
// place of Java: frame buffer, keys, sound and the SNAP bridge are JS objects behind the fake JNI.
import { Machine } from './machine.js';
import { JNI, JObject } from './jni.js';
import { installFastPaths } from './fast.js';
import { NET_BUFFER_SIZE, MTU, LOGIN_COULD_NOT_CONNECT } from '../snap-ids.js';

export const WIDTH = 240, HEIGHT = 320;
// Player mode, the engine's replay player (docs/re/re_replay.md): a wider battle view and no menus.
export const REPLAY_WIDTH = 420, REPLAY_HEIGHT = 378;
const HOME = 'C:\\RG';

// Java KeyEvent codes for the keys the game uses.
export const VK = { ENTER: 10, BACK_SPACE: 8, SHIFT: 16, CONTROL: 17, ESCAPE: 27, LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, SPACE: 32 };
export const CHAR_UNDEFINED = 0xffff; // KeyEvent.CHAR_UNDEFINED: the key types no character

// In-memory engine patches (docs/adr/0007). Each one is written only if the engine has the original bytes.
// Every story and hero playable from the start; nothing is marked finished. A story's badge (lock, 0%, 50%)
// counts its playable missions (FUN_100d7b70), so the story list is patched apart from the missions.
export const UNLOCKS = [
  { what: 'every mission playable', va: 0x100d7a70, from: '8b4424088b4c2404', to: 'b001c20800' }, // mov al, 1; ret 8
  { what: 'no story locked', va: 0x100c8a98, from: '8b570433c9', to: 'eb4c' }, // FUN_100c89c0: a story with no playable mission shows 0%
  { what: 'no hero grayed out', va: 0x100dc850, from: '8b41348b4c2404c6040101c20400', to: 'c20400' }, // ret 4
];
// A player alone in their friendly room can press Start, for a match the server fills with bots. The lobby
// otherwise shows and accepts Start only with another member listed (FUN_100eaaf0, FUN_100eadd0 key 4; docs/adr/0008).
export const LONE_START = [
  { what: 'Start shown when alone', va: 0x100eab1b, from: '8b463485c07462', to: '8b463485c09090' },
  { what: 'Start accepted when alone', va: 0x100eae95, from: '8b462c85c0762d', to: '8b462c85c09090' },
];
// A headless engine (a bot, server/bot.mjs, or the witness, server/witness.mjs) has no battle screen: FUN_1000f610, the
// battlefield's "busy" check, waits for its visual events, which only a local player's battle screen plays back. Without
// this, a bot's AI (FUN_100b1f00) waits forever and a witness's battle is never finished (docs/re/re_witness.md).
export const NEVER_BUSY = { what: 'battlefield never busy', va: 0x1000f610, from: '8b813c010000', to: '32c0c3' }; // xor al, al; ret

// The Full board (CONTEXT.md "Board view", docs/adr/0017, docs/re/re_screen.md): during a battle the engine's screen is the replay
// player's size, so the whole battlefield is on it. The engine is booted at that size, which fixes the frame buffer's size, and is
// given the phone's 240 x 320 straight away, so that everything outside a battle is laid out and drawn as on a stock engine.
// Hooks run their JavaScript just before the instruction at `va`; they are installed only if every site has these bytes, otherwise
// the engine boots stock and the page has no Full board. `hook` names the GameHost handler.
const BOARD_SITES = [
  { hook: 'setup', va: 0x10028f20, bytes: '83ec08568bf1e8c592fd' },     // FUN_10028f20: lays out the battle view and its corners
  { hook: 'draw', va: 0x1002c1a0, bytes: '53568bf18b869c020000' },      // FUN_1002c1a0: the battlefield is drawn
  { hook: 'phoneOnly', va: 0x100f94a0, bytes: '568bf1e8488df0ff8b48' }, // FUN_100f94a0: a menu screen takes the screen size
  { hook: 'phoneOnly', va: 0x100d5d90, bytes: '568bf1e858c4f2ff8b40' }, // FUN_100d5d90: the battle menu and its dialogs
  { hook: 'phoneOnly', va: 0x100b8570, bytes: '558bec83e4f86aff6848' }, // FUN_100b8570: a story dialog in a battle
];
const APP = 0x101b828c;             // the engine's app object; +0x2c its display, +0x9c the battle view while a battle is on
const DISPLAY_VTABLE = 0x1017b130;  // the display's surface: width at +0x18, height at +0x1c
const CURTAIN_FADES = [0x32c, 0x330]; // the battle view's curtain fade-in and fade-out counters

// The n bytes at the engine's address va, as hex.
const bytesAt = (m, va, n) => [...m.cpu.m8.subarray(m.addr(va), m.addr(va) + n)].map(b => b.toString(16).padStart(2, '0')).join('');

export class GameHost {
  // files: { name: Uint8Array } for the DLL and everything in the ResetGeneration folder.
  // patches: entries like UNLOCKS, applied after the DLL loads.
  // replay: the text of a replay (server/replay.js) to start the engine in player mode, which plays that battle and nothing else.
  // board: boot able to show a battle on the Full board; `fullBoard` (settable at any time) says whether the next battle does.
  constructor(files, { log = () => {}, warn = console.warn, language = 'en', snap = null, jit = true, fast = true, patches = [], replay = null, board = false } = {}) {
    this.jit = jit; this.fast = fast; this.patches = patches; this.warn = warn;
    this.files = files; this.log = log; this.language = language;
    this.snapMethods = snap; // JS implementation of NativeSNAPMobileInterface (online play)
    this.replay = replay;
    this.board = board && replay === null;
    this.fullBoard = true;
    // The engine's screen now (width, height), and the row length of `pixels` (pitch), which can be wider.
    [this.width, this.height] = replay === null && !this.board ? [WIDTH, HEIGHT] : [REPLAY_WIDTH, REPLAY_HEIGHT];
    this.pitch = this.width;
  }

  boot() {
    const m = this.m = new Machine({ log: this.log });
    m.cpu.jit = this.jit;
    for (const [name, data] of Object.entries(this.files)) if (!name.endsWith('.dll') && !name.endsWith('.dylib')) m.vfs.put(`${HOME}\\${name}`, data);
    m.loadDll(this.files['ResetGeneration-Win32-Web.dll']);
    for (const p of this.patches) {
      if (bytesAt(m, p.va, p.from.length / 2) !== p.from) { this.warn(`engine patch skipped (${p.what}): unexpected bytes at ${p.va.toString(16)}`); continue; }
      m.cpu.m8.set(p.to.match(/../g).map(h => parseInt(h, 16)), m.addr(p.va));
    }
    if (this.board && !BOARD_SITES.every(s => bytesAt(m, s.va, s.bytes.length / 2) === s.bytes)) return this.#bootStock('unexpected engine bytes');
    if (this.fast) installFastPaths(m.cpu, va => m.addr(va));
    const jni = this.jni = new JNI(m, { log: this.log }), env = jni.env;
    const ex = n => m.addr(n);
    const call = (name, ...args) => m.cpu.call(ex(name), [env, ...args]);

    this.engine = new JObject('rg/natives/NativeGameEngine');
    this.frame = jni.directBuffer('java/nio/DirectIntBufferU', this.width * (this.height + 1) * 4);
    this.input = new JObject('rg/natives/NativeInputEventListener');
    this.sound = new JObject('rg/natives/NativeSoundOutputDevice');
    this.soundBuf = jni.directBuffer('java/nio/DirectByteBuffer', 1024);
    this.netBuf = jni.directBuffer('java/nio/DirectByteBuffer', NET_BUFFER_SIZE);
    this.bridge = new JObject('com/redlynx/mt/snapmobile/NativeSNAPMobileInterface', { methods: this.snapMethods || offlineSnap() });
    this.events = new JObject('com/redlynx/mt/snapmobile/NativeSNAPMobileEventListener');

    this.call = call;
    const ref = o => jni.ref(o);
    call('_Java_rg_natives_NativeGameEngine_setHomeDirectory@12', ref(this.engine), jni.str(HOME));
    // The engine reads the replay text only during init, which then picks player mode (1) over the game (0).
    if (this.replay !== null) call('_Java_rg_natives_NativeGameEngine_setReplayData@12', ref(this.engine), jni.str(this.replay));
    call('_Java_rg_natives_NativeGameEngine_init@44', ref(this.engine), ref(this.frame), jni.str(this.language), this.replay === null ? 0 : 1,
      this.width, this.height, jni.str(''), 0, 0, 0);
    call('_Java_com_redlynx_mt_snapmobile_NativeSNAPMobileInterface_initNative@20', ref(this.bridge), ref(this.netBuf), NET_BUFFER_SIZE, MTU);
    for (const name of Object.keys(this.files).filter(n => n.endsWith('.pak')).sort()) {
      call('_Java_rg_natives_NativeGameEngine_notifyDataPackageReady@12', ref(this.engine), jni.str(name));
    }
    this.pixels = new Int32Array(m.cpu.mem, this.frame.address, this.pitch * this.height);
    this.clock0 = m.win.now;
    if (this.board) this.#hookBoard();
  }

  // The Full board can't be had from this engine copy: boot it as a stock one, at the phone's size.
  #bootStock(why) {
    this.warn(`Full board unavailable: ${why}`);
    this.board = false;
    [this.width, this.height] = [WIDTH, HEIGHT];
    this.pitch = WIDTH;
    return this.boot();
  }

  // Finds the display's surface, gives the engine the phone's screen, and installs the hooks of BOARD_SITES (docs/re/re_screen.md).
  // The frame buffer's rows are 420 pixels long only while a battle is on the Full board; everywhere else the engine draws exactly
  // as a stock one, rows included (a Classic battle at a 420-pixel row draws an edge marker differently).
  #hookBoard() {
    const cpu = this.m.cpu, rd = a => cpu.rd32(a) >>> 0, app = rd(this.m.addr(APP));
    const surface = app && rd(rd(app + 0x2c) + 0xc), rowInfo = surface && rd(rd(surface + 0x24) + 4);
    if (!rowInfo || rd(surface) !== this.m.addr(DISPLAY_VTABLE) || rd(surface + 0x18) !== REPLAY_WIDTH || rd(surface + 0x1c) !== REPLAY_HEIGHT
      || rd(rowInfo + 4) !== REPLAY_WIDTH) return this.#bootStock('display not found');
    this.#app = app;
    this.#surface = surface;
    this.#rowInfo = rowInfo;
    this.#screen(WIDTH, HEIGHT, WIDTH);
    const hooks = {
      // The battle lays its view and corners out once, here, so this is where a battle becomes Full board.
      setup: () => {
        this.battleFull = this.fullBoard;
        this.#drawn = false;
        if (this.battleFull) this.#screen(REPLAY_WIDTH, REPLAY_HEIGHT, REPLAY_WIDTH);
      },
      // An online battle sets its view up while the lobby's "Game starting" is still on screen; tick() narrows the screen for the
      // lobby until the battlefield is first drawn.
      draw: () => {
        if (!this.battleFull || this.#drawn) return;
        this.#drawn = true;
        this.#screen(REPLAY_WIDTH, REPLAY_HEIGHT, REPLAY_WIDTH);
      },
      // The battle menu and story dialogs are laid out for the phone: while one is up the screen is the phone's, and the page puts
      // it inside the curtain. tick() widens it again once none of them was built or drawn in a tick.
      phoneOnly: () => {
        if (!this.battleFull || !this.#drawn) return;
        this.#phoneSeen = true;
        if (this.width !== WIDTH) this.#screen(WIDTH, HEIGHT, REPLAY_WIDTH);
      },
    };
    for (const s of BOARD_SITES) this.watch(s.va, hooks[s.hook]);
  }

  #app = 0; #surface = 0; #rowInfo = 0; #drawn = false; #phoneSeen = false;
  battleFull = false; // the battle now on is shown on the Full board

  // Gives the engine a screen of w x h in the top-left corner of the frame buffer, whose rows are `pitch` pixels long.
  #screen(w, h, pitch) {
    const cpu = this.m.cpu;
    cpu.wr32(this.#surface + 0x18, w); cpu.wr32(this.#surface + 0x1c, h); cpu.wr32(this.#rowInfo + 4, pitch);
    this.width = w; this.height = h; this.pitch = pitch;
  }

  // The battle view while a battle is on, else 0.
  get #battleView() { return this.m.cpu.rd32(this.#app + 0x9c) >>> 0; }
  get inBattle() { return this.board && this.#battleView !== 0; }

  // After each tick of a Full board battle: back to the phone's screen when the battle is over (the results' backdrop, taken in that
  // tick, keeps the battle's 420-pixel rows) or its battlefield isn't drawn yet, back to the Full board when no phone-only screen is
  // up, and no curtain fades, which would hold up this player's battle at every rescue or fight (docs/adr/0017).
  #afterTick() {
    if (!this.battleFull) return;
    const bv = this.#battleView, cpu = this.m.cpu;
    if (!bv) { this.battleFull = false; this.#screen(WIDTH, HEIGHT, WIDTH); return; }
    if (!this.#drawn) { if (this.width !== WIDTH) this.#screen(WIDTH, HEIGHT, REPLAY_WIDTH); return; }
    if (!this.#phoneSeen && this.width !== REPLAY_WIDTH) this.#screen(REPLAY_WIDTH, REPLAY_HEIGHT, REPLAY_WIDTH);
    this.#phoneSeen = false;
    for (const o of CURTAIN_FADES) if (cpu.rd32(bv + o) !== 0) cpu.wr32(bv + o, 0);
  }

  // One game step. The engine paces itself: its frame limiter (FUN_100eddc0) runs a frame only while
  // the clock is before the next frame deadline, then Sleeps to it. Time therefore advances only
  // through Sleep; the host keeps calling tick() until `time` catches up with real time.
  tick() {
    const running = this.call('_Java_rg_natives_NativeGameEngine_tick@8', this.jni.ref(this.engine)) & 0xff;
    if (this.board) this.#afterTick();
    return running;
  }
  get time() { return this.m.win.now - this.clock0; }

  // The replay player's controls, in player mode only (docs/re/re_replay.md "Playback"). Times are whole seconds from BattleBegin.
  // None may be called before replayLoaded: they reach the replay's battle logic, which the engine builds a few frames in.
  get replayLogic() { const app = this.m.cpu.rd32(this.m.addr(APP)) >>> 0; return app ? this.m.cpu.rd32(app + 0x110) >>> 0 : 0; }
  get replayLoaded() { return this.replayLogic !== 0; }
  #replayCall(name, ...args) { return this.call(`_Java_rg_natives_NativeGameEngine_${name}`, this.jni.ref(this.engine), ...args); }
  get replayTime() { return this.#replayCall('getTime@8') | 0; }
  get replayLength() { return this.#replayCall('getTotalTime@8') | 0; }
  // Whether the battlefield is still animating; at the end, the replay is over once it stops.
  get replayAnimating() { return (this.#replayCall('isReplayVisualizationInProgress@8') & 0xff) !== 0; }
  playReplay() { this.#replayCall('playReplay@8'); }
  pauseReplay() { this.#replayCall('pauseReplay@8'); }
  seekReplay(seconds) { this.#replayCall('setTime@12', seconds | 0); }
  setReplayMode({ skipEmpty, doubleSpeed }) { this.#replayCall('setReplayMode@16', skipEmpty ? 1 : 0, doubleSpeed ? 1 : 0); }

  // Calls fn(cpu) each time the guest reaches the original address `va`, then runs the instruction there as
  // usual. A watch for debugging only reads; the Full board's hooks (ADR 0017) also change engine memory, which
  // ADR 0007's byte patches don't cover. Call it after boot().
  watch(va, fn) {
    const cpu = this.m.cpu, at = this.m.addr(va), step = cpu.decode(at);
    cpu.traps.set(at, c => { fn(c); return step(); });
    cpu.codeCache[at - cpu.codeBase] = undefined;
  }

  key(down, code, ch = CHAR_UNDEFINED, location = 1) {
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
  // The direct buffer shared by send and onDataReceived.
  readNet(len) { return this.m.cpu.m8.slice(this.netBuf.address, this.netBuf.address + len); }
  writeNet(bytes) { this.m.cpu.m8.set(bytes.subarray(0, NET_BUFFER_SIZE), this.netBuf.address); }
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
    getLoginScreenStatus: () => LOGIN_COULD_NOT_CONNECT, loginWasCancelled: () => false,
    startLoginScreen: () => {}, stopLoginScreen: () => {}, send: n => n,
  };
}
