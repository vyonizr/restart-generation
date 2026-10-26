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
// A headless engine (a bot, server/bot.mjs, or the witness, server/witness.mjs) has no battle screen: FUN_1000f610, the
// battlefield's "busy" check, waits for its visual events, which only a local player's battle screen plays back. Without
// this, a bot's AI (FUN_100b1f00) waits forever and a witness's battle is never finished (docs/re/re_witness.md).
export const NEVER_BUSY = { what: 'battlefield never busy', va: 0x1000f610, from: '8b813c010000', to: '32c0c3' }; // xor al, al; ret
// Every engine gets this one, whatever its caller's patches. Adding a battlefield effect (FUN_1002ea10) also copies it into every
// free entry of the battle view's effect list, which never shrinks, and each set entry draws the whole list: an egg's splat late
// in a battle was drawn 4,096 times a frame. The add now skips the free entries and only appends, as it also does; frames and
// sound stay identical (docs/re/re_render.md "The battle view's effects").
const EFFECT_ONCE = { what: 'a battle effect added once', va: 0x1002ea2b, from: '33c03bc8894424107e79', to: '33c03bc889442410eb79' }; // jle -> jmp

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
  { hook: 'curtain', va: 0x10028ae0, bytes: '83ec1853568bf18a8628' },   // FUN_10028ae0: draws the curtain at a level (0 to 255)
  { hook: 'margin', va: 0x10028360, bytes: '8b41088b10568b70102b' },    // FUN_10028360: the camera's bounds, with a margin around the map
  { hook: 'focus', va: 0x10073e00, bytes: '83ec0c535533c056578b' },     // FUN_10073e00: the camera turns to a cell
  { hook: 'ease', va: 0x100290e0, bytes: '83ec085355568bf18d9e' },      // FUN_100290e0: the camera glides 1/8 of the way to its target
  { hook: 'eased', va: 0x1002be45, bytes: '8b8eac0200008b49' },         // FUN_1002be10, just after it called FUN_100290e0
];
// A princess's rescue and a fight play over a backdrop, a picture of the whole screen taken as they start, which FUN_100831a0 and
// FUN_100828a0 draw at (0, 0) of the context they are given. In the battle view's large-screen mode that context is the 240 x 320
// offscreen that the curtain's hole shows, so a 420 x 378 picture put the board's top-left corner in the hole (docs/re/re_screen.md
// "The rescue's backdrop", docs/adr/0029). These are the backdrop's draws: a call through the context's vtable +0x14 with ECX the
// context, the picture at [esp] and its position at [[esp+4]]. The hook draws the picture where the hole lies over it, on the Full
// board and in the replay player; it is installed only if every site has these bytes.
const BACKDROP_SITES = [
  { va: 0x10083211, bytes: 'ff50148b561c8d6e' }, // a princess rescued
  { va: 0x100832bc, bytes: 'ff52148b4e1c518b' }, // a princess not rescued
  { va: 0x1008294a, bytes: 'ff50148d86940000' }, // a fight, the picture grayed under its two fighters
  { va: 0x100828f8, bytes: 'ff5014896e345e32' }, // a fight's ending, the picture fading back to its colors alone
];
const LARGE_SCREEN = 0x328, OFFSCREEN_CONTEXT = 0x338; // the battle view's large-screen flag and its offscreen's graphics context
// Where FUN_10028a70 puts the offscreen on the 420 x 378 screen: (90, 29), the middle.
const INSET_X = (REPLAY_WIDTH - WIDTH) >> 1, INSET_Y = (REPLAY_HEIGHT - HEIGHT) >> 1;
// The curtain image (CONTEXT.md "Curtain"), and where FUN_1002e3f0 keeps the pointer to its name: the operand of the push at 0x1002e9a4.
export const CURTAIN_PATH = 'data/gameplay/ui/animframe.gfx';
const CURTAIN_NAME_PUSH = 0x1002e9a5;
const APP = 0x101b828c;             // the engine's app object; +0x2c its display, +0x9c the battle view while a battle is on
const DISPLAY_VTABLE = 0x1017b130;  // the display's surface: width at +0x18, height at +0x1c
const CURTAIN_FADE_IN = 0x32c; // the battle view's curtain fade-in counter
const CURTAIN_FADE_STEPS = 8;  // frames the curtain takes to fade in or out, half the engine's own 16

// The n bytes at the engine's address va, as hex.
const bytesAt = (m, va, n) => [...m.cpu.m8.subarray(m.addr(va), m.addr(va) + n)].map(b => b.toString(16).padStart(2, '0')).join('');

export class GameHost {
  // files: { name: Uint8Array } for the DLL and everything in the ResetGeneration folder.
  // patches: entries like UNLOCKS, applied after the DLL loads.
  // replay: the text of a replay (server/replay.js) to start the engine in player mode, which plays that battle and nothing else.
  // board: boot able to show a battle on the Full board; `fullBoard` (settable at any time) says whether battles do, the one on included.
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
    this.m = null; // booted again (web/src/lib/replay/footage.js): the old machine's memory can go before the new one takes as much
    const m = this.m = new Machine({ log: this.log });
    m.cpu.jit = this.jit;
    for (const [name, data] of Object.entries(this.files)) if (!name.endsWith('.dll') && !name.endsWith('.dylib')) m.vfs.put(`${HOME}\\${name}`, data);
    m.loadDll(this.files['ResetGeneration-Win32-Web.dll']);
    for (const p of [EFFECT_ONCE, ...this.patches]) {
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
    if (this.board || this.replay !== null) this.#hookBackdrop();
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
    // The curtain a switch to the Full board loads in the middle of a battle (#largeScreen) is named where FUN_1002e3f0 names it.
    if (cpu.readCString(rd(this.m.addr(CURTAIN_NAME_PUSH))) !== CURTAIN_PATH) return this.#bootStock('curtain not found');
    this.#screen(WIDTH, HEIGHT, WIDTH);
    const hooks = {
      // The battle lays its view and corners out here as it starts, taking the board view then; a change of view in the battle
      // (#switchBoard) calls it again, which this hook leaves alone.
      setup: () => {
        if (this.#switching) return;
        this.battleFull = this.fullBoard;
        this.#drawn = false;
        this.#focus = null;
        this.#other = null;
        this.#margin = [0, 0];
        if (this.battleFull) this.#screen(REPLAY_WIDTH, REPLAY_HEIGHT, REPLAY_WIDTH);
      },
      // An online battle sets its view up while the lobby's "Game starting" is still on screen; tick() narrows the screen for the
      // lobby until the battlefield is first drawn.
      draw: () => {
        if (this.#drawn) return;
        this.#drawn = true;
        if (this.battleFull) this.#screen(REPLAY_WIDTH, REPLAY_HEIGHT, REPLAY_WIDTH);
      },
      // The battle menu and story dialogs are laid out for the phone: while one is up the screen is the phone's, and the page puts
      // it inside the curtain. tick() widens it again once none of them was built or drawn in a tick.
      phoneOnly: () => {
        if (!this.#drawn) return;
        this.#phoneSeen = true;
        if (this.battleFull && this.width !== WIDTH) this.#screen(WIDTH, HEIGHT, REPLAY_WIDTH);
      },
      // The playfield widens the camera's bounds by a margin around the map once its battle is set up; a change of board view
      // must widen them again. FUN_10028f20 itself passes no margin.
      margin: c => {
        if (this.#switching) return;
        const esp = c.r[4] >>> 0, ret = c.rd32(esp) >>> 0, p = c.rd32(esp + 4) >>> 0;
        if (ret >= this.m.addr(0x10028f20) && ret < this.m.addr(0x10029080)) return;
        this.#margin = [c.rd32(p) | 0, c.rd32(p + 4) | 0];
      },
      // The point of the battlefield the camera was last turned to, in pixels; its target depends on the screen size.
      focus: c => {
        const o = c.r[1] >>> 0, view = c.rd32(this.#battleView + 8) >>> 0;
        this.#focus = [c.rd32(o + 0x24) * c.rd32(view + 0x20) + c.rd32(o + 0x14), c.rd32(o + 0x28) * c.rd32(view + 0x24) + c.rd32(o + 0x18)];
        if (this.#other) [this.#other.tx, this.#other.ty] = this.#otherTarget();
      },
      // The camera the battle would have at the other view's size, kept in step with the engine's (FUN_100290e0: 1/8 of the way
      // to the target, plus the same shake), so that a change of view can swap the two.
      ease: c => {
        const bv = c.r[1] >>> 0, ri = a => c.rd32(a) | 0;
        this.#eased = [ri(bv + 0x2b0), ri(bv + 0x2b4), ri(bv + 0x2b8), ri(bv + 0x2bc)];
        if (!this.#other) {
          const [tx, ty] = this.#focus ? this.#otherTarget() : this.#otherTarget(true);
          this.#other = { x: this.#eased[0], y: this.#eased[1], tx, ty };
        }
      },
      eased: c => {
        const bv = this.#battleView, o = this.#other, e = this.#eased;
        if (!o || !e) return;
        const sx = (c.rd32(bv + 0x2b0) | 0) - e[0] - ((e[2] - e[0]) >> 3), sy = (c.rd32(bv + 0x2b4) | 0) - e[1] - ((e[3] - e[1]) >> 3);
        o.x = (o.x + ((o.tx - o.x) >> 3) + sx) | 0; o.y = (o.y + ((o.ty - o.y) >> 3) + sy) | 0;
        this.#eased = null;
      },
      // The curtain fades in and out over 8 frames. In, by its level alone: the engine's own fade-in holds the animation back, and
      // with it this player's battle (tick() clears it). Out, by stepping the level the engine's own fade-out gives (255 down to 0
      // by 16 a frame) down twice as fast. A curtain that comes up while the page already shows its own around a phone-only
      // screen is there at once.
      curtain: c => {
        if (!this.battleFull) return;
        if (this.#curtainTick !== this.#ticks) {
          this.#curtainStep = this.#curtainTick === this.#ticks - 1 ? Math.min(this.#curtainStep + 1, CURTAIN_FADE_STEPS)
            : this.#wasNarrow ? CURTAIN_FADE_STEPS : 1;
          this.#curtainTick = this.#ticks;
        }
        const at = (c.r[4] >>> 0) + 4, level = c.rd32(at); // the level argument, above the return address
        const out = level >= 255 ? 255 : Math.max(0, 2 * level - 255);
        c.wr32(at, Math.min(out, Math.round(255 * this.#curtainStep / CURTAIN_FADE_STEPS)));
      },
    };
    for (const s of BOARD_SITES) this.watch(s.va, hooks[s.hook]);
  }

  // Installs the hook of BACKDROP_SITES. It moves only a 420 x 378 backdrop drawn into the large-screen offscreen: a rescue or a fight
  // that starts while a phone-only screen has narrowed the screen takes a 240 x 320 picture, which already fits the hole, and on
  // Classic there is no offscreen.
  #hookBackdrop() {
    const m = this.m, cpu = m.cpu, rd = a => cpu.rd32(a) >>> 0, picture = m.addr(DISPLAY_VTABLE);
    if (!BACKDROP_SITES.every(s => bytesAt(m, s.va, s.bytes.length / 2) === s.bytes)) { this.warn('rescue and fight backdrops left in the corner: unexpected engine bytes'); return; }
    const shift = c => {
      const app = rd(m.addr(APP)), bv = app && rd(app + 0x9c);
      if (!bv || !cpu.m8[bv + LARGE_SCREEN] || (c.r[1] >>> 0) !== rd(bv + OFFSCREEN_CONTEXT)) return;
      const esp = c.r[4] >>> 0, image = rd(esp), at = rd(esp + 4);
      if (rd(image) !== picture || rd(image + 0x18) !== REPLAY_WIDTH || rd(image + 0x1c) !== REPLAY_HEIGHT) return;
      cpu.wr32(at, -INSET_X); cpu.wr32(at + 4, -INSET_Y);
    };
    for (const s of BACKDROP_SITES) this.watch(s.va, shift);
  }

  #app = 0; #surface = 0; #rowInfo = 0; #drawn = false; #phoneSeen = false; #phoneUp = false;
  #ticks = 0; #wasNarrow = true; #curtainTick = -2; #curtainStep = 0; // the curtain's fade-in
  #switching = false; #margin = [0, 0]; #focus = null; #other = null; #eased = null; #animTick = -100;
  battleFull = false; // the battle now on is shown on the Full board

  // The camera's target at the other view's size: FUN_10073e00's target for the last focus, inside FUN_10028360's bounds for
  // the playfield's margin, clamped as FUN_10029080 does; `initial`: FUN_1002e3f0's first target, inside bounds with no margin.
  #otherTarget(initial = false) {
    const cpu = this.m.cpu, ri = a => cpu.rd32(a) | 0, view = cpu.rd32(this.#battleView + 8) >>> 0;
    const size = this.battleFull ? [WIDTH, HEIGHT] : [REPLAY_WIDTH, REPLAY_HEIGHT];
    return [0, 1].map(i => {
      const s = size[i], map = ri(view + 0x10 + i * 4), tile = ri(view + 0x20 + i * 4), m = initial ? 0 : this.#margin[i];
      let lo = -m * 0x10000, hi = (map - s + m) * 0x10000;
      if (map + 2 * m < s) lo = hi = -((s - map) >> 1) * 0x10000;
      let t;
      if (initial) { t = 0; if (hi < 1) t = hi; } else { t = ((tile >> 1) - (s >> 1) + (this.#focus?.[i] ?? 0)) * 0x10000; if (hi <= t) t = hi; }
      if (t < lo) t = lo;
      return t | 0;
    });
  }

  // Calls the engine's thiscall at the original address va (or, with `at`, the loaded address) with ECX = self.
  #thiscall(va, self, ...args) { return this.#callAt(this.m.addr(va), self, ...args); }
  #callAt(at, self, ...args) {
    const cpu = this.m.cpu, ecx = cpu.r[1];
    cpu.r[1] = self;
    try { return cpu.call(at, args) >>> 0; } finally { cpu.r[1] = ecx; }
  }
  // Runs fn(p) with p the address of these dwords in scratch space below the guest's stack.
  #scratch(dwords, fn) {
    const cpu = this.m.cpu, esp = cpu.r[4];
    cpu.r[4] = (esp - 64) | 0;
    const p = (cpu.r[4] >>> 0) + 16;
    dwords.forEach((v, i) => cpu.wr32(p + i * 4, v));
    try { return fn(p); } finally { cpu.r[4] = esp; }
  }

  // Changes the board view of the battle that is on, between two ticks: lays the battle view out again for the new screen size
  // the way its setup (FUN_1002e3f0) does, keeping what that setup would lose (cell highlights, the playfield's camera margin, the
  // camera's and the corner panels' motion), and makes or drops the large-screen mode with the curtain.
  #switchBoard(full) {
    const cpu = this.m.cpu, rd = a => cpu.rd32(a) >>> 0, ri = a => cpu.rd32(a) | 0, wr = (a, v) => cpu.wr32(a, v);
    const bv = this.#battleView, game = rd(bv + 4), renderer = rd(bv + 0xc), view = rd(bv + 8);
    const [w, h] = full ? [REPLAY_WIDTH, REPLAY_HEIGHT] : [WIDTH, HEIGHT];
    this.#switching = true;
    try {
      this.battleFull = full;
      this.#screen(w, h, w);
      // FUN_10028f20 clears the cell highlights (bv+0x288, one dword a cell; bv+0x290 their count; renderer+0x28 the shown ones).
      const cells = ri(bv + 0x284), marks = rd(bv + 0x288), saved = cpu.m8.slice(marks, marks + cells * 4);
      const marked = rd(bv + 0x290), shown = rd(renderer + 0x28);
      this.#thiscall(0x10028f20, bv, game);
      cpu.m8.set(saved, marks); wr(bv + 0x290, marked); wr(renderer + 0x28, shown);
      this.#scratch(this.#margin, p => this.#thiscall(0x10028360, bv, p));
      this.#thiscall(0x10087440, renderer, view); // the tile renderer's copy of the view
      // The camera: the one kept for this size (see the ease hook); before the battle's first glide there is none, and the camera
      // goes straight to its target for the new size, as FUN_10073e00 sets it from the last focus.
      const mine = { x: ri(bv + 0x2b0), y: ri(bv + 0x2b4), tx: ri(bv + 0x2b8), ty: ri(bv + 0x2bc) };
      if (this.#other) {
        const o = this.#other;
        wr(bv + 0x2b0, o.x); wr(bv + 0x2b4, o.y); wr(bv + 0x2b8, o.tx); wr(bv + 0x2bc, o.ty);
      } else {
        const [fx, fy] = this.#focus ? [(ri(view + 0x20) >> 1) - (w >> 1) + this.#focus[0], (ri(view + 0x24) >> 1) - (h >> 1) + this.#focus[1]] : [0, 0];
        this.#thiscall(0x10029080, bv, fx, fy);
        wr(bv + 0x2b0, ri(bv + 0x2b8)); wr(bv + 0x2b4, ri(bv + 0x2bc));
      }
      this.#other = mine;
      // The four corner panels (FUN_1008a500), each as far from its place as before.
      const panels = rd(rd(bv + 0x1b8) + 8);
      for (let i = 0; i < 4; i++) {
        const p = panels + i * 0x6c, ox = ri(p + 0x3c) - ri(p + 0xc), oy = ri(p + 0x40) - ri(p + 0x10);
        this.#thiscall(0x1008a500, p, i + 1, game);
        wr(p + 0x3c, ri(p + 0xc) + ox); wr(p + 0x40, ri(p + 0x10) + oy);
      }
      this.#largeScreen(bv, full);
      if (full && this.#phoneUp) this.#screen(WIDTH, HEIGHT, REPLAY_WIDTH); // a battle menu or story dialog stays on the phone's screen
    } finally { this.#switching = false; }
  }

  // The end of FUN_1002e3f0 above a 240-pixel screen: the large-screen flag, a 240 x 320 offscreen with its graphics context, and
  // the curtain image; dropped the way the battle view's teardown (FUN_1002bc10) drops them. The image store (app+0x34) releases an
  // image through its vtable's +0 and loads one by name through +0xc; a graphics context releases itself through its vtable's +0.
  #largeScreen(bv, on) {
    const cpu = this.m.cpu, rd = a => cpu.rd32(a) >>> 0, wr = (a, v) => cpu.wr32(a, v), app = this.#app, images = rd(app + 0x34);
    for (const at of [0x1b4, 0x334]) if (rd(bv + at)) { this.#callAt(rd(rd(images)), images, rd(bv + at), 1); wr(bv + at, 0); }
    const gc = rd(bv + 0x338);
    if (gc) { this.#callAt(rd(rd(gc)), gc, 1); wr(bv + 0x338, 0); }
    cpu.m8[bv + 0x328] = on ? 1 : 0;
    if (!on) return;
    // The curtain fades out over 16 engine frames after an animation (FUN_1002b5a0); a Full board battle would be that far into it.
    wr(bv + CURTAIN_FADE_IN, 0); wr(bv + 0x330, Math.max(0, 16 - (this.#ticks - 1 - this.#animTick)));
    // FUN_1004ad50 makes an image of a size; FUN_1004a000 sets a mode on an image, 2 on the offscreen and 1 on the curtain as the
    // setup does (what the modes mean wasn't looked into); FUN_1000a2e0 makes the graphics context.
    const offscreen = this.#scratch([WIDTH, HEIGHT], p => cpu.call(this.m.addr(0x1004ad50), [p, 0]) >>> 0);
    wr(bv + 0x334, offscreen);
    this.#thiscall(0x1004a000, offscreen, 2);
    wr(bv + 0x338, this.#thiscall(0x1000a2e0, rd(app + 0x40), 1, rd(rd(app + 0x2c) + 4)));
    const name = rd(this.m.addr(CURTAIN_NAME_PUSH));
    // The name goes to the store as one of the engine's strings, built by FUN_100f0e10 and freed by FUN_100ef720.
    this.#scratch([0], s => {
      this.#thiscall(0x100f0e10, s, name, 0);
      const curtain = this.#callAt(rd(rd(images) + 0xc), images, s, 0);
      wr(bv + 0x1b4, curtain);
      this.#thiscall(0x100ef720, s);
      this.#thiscall(0x1004a000, curtain, 1);
    });
  }

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
  // up, and no fade-in held by the engine, which would hold up this player's battle at every rescue or fight (docs/adr/0017).
  #afterTick() {
    if (!this.battleFull) return;
    const bv = this.#battleView, cpu = this.m.cpu;
    if (!bv) { this.battleFull = false; this.#screen(WIDTH, HEIGHT, WIDTH); return; }
    if (!this.#drawn) { if (this.width !== WIDTH) this.#screen(WIDTH, HEIGHT, REPLAY_WIDTH); return; }
    if (!this.#phoneSeen && this.width !== REPLAY_WIDTH) this.#screen(REPLAY_WIDTH, REPLAY_HEIGHT, REPLAY_WIDTH);
    if (cpu.rd32(bv + CURTAIN_FADE_IN) !== 0) cpu.wr32(bv + CURTAIN_FADE_IN, 0);
  }

  // A rescue (bv+0x2a0, state +8) or a fight (bv+0x29c, state +0x14 at 1) plays over a backdrop snapshot taken at its start, at the
  // size then: a change of board view waits for it to end.
  get #cutIn() {
    const cpu = this.m.cpu, bv = this.#battleView, rd = a => cpu.rd32(a) >>> 0;
    return rd(rd(bv + 0x2a0) + 8) !== 0 || rd(rd(bv + 0x29c) + 0x14) === 1;
  }

  // One game step. The engine paces itself: its frame limiter (FUN_100eddc0) runs a frame only while
  // the clock is before the next frame deadline, then Sleeps to it. Time therefore advances only
  // through Sleep; the host keeps calling tick() until `time` catches up with real time.
  // A change of board view in a battle is made here, between two ticks, where no frame is half drawn (docs/adr/0017).
  tick() {
    this.#ticks++;
    if (this.#drawn && this.inBattle && this.battleFull !== this.fullBoard && !this.#cutIn) this.#switchBoard(this.fullBoard);
    const running = this.call('_Java_rg_natives_NativeGameEngine_tick@8', this.jni.ref(this.engine)) & 0xff;
    if (this.board) {
      this.#afterTick(); this.#wasNarrow = this.width === WIDTH; this.#phoneUp = this.#phoneSeen; this.#phoneSeen = false;
      const bv = this.#battleView, rd = a => this.m.cpu.rd32(a) >>> 0;
      // the last tick an animation that goes inside the curtain played: the chain (intro, banners, ...), a rescue or a fight
      if (bv && (this.m.cpu.m8[rd(bv + 0x2a4) + 0x50] || this.#cutIn)) this.#animTick = this.#ticks;
    }
    return running;
  }
  get time() { return this.m.win.now - this.clock0; }

  // The replay player's controls, in player mode only (docs/re/re_replay.md "Playback"). Times are whole seconds from BattleBegin.
  // None may be called before replayLoaded: they reach the replay's battle logic, which the engine builds a few frames in.
  get replayLogic() { const app = this.m.cpu.rd32(this.m.addr(APP)) >>> 0; return app ? this.m.cpu.rd32(app + 0x110) >>> 0 : 0; }
  get replayLoaded() { return this.replayLogic !== 0; }
  #replayCall(name, ...args) { return this.call(`_Java_rg_natives_NativeGameEngine_${name}`, this.jni.ref(this.engine), ...args); }
  get replayTime() { return this.#replayCall('getTime@8') | 0; }
  // The same clock in ms, as the logic keeps it (logic+0xb8), for a slider that moves between whole seconds; past the end it runs on.
  get replayClock() { return this.m.cpu.rd32(this.replayLogic + 0xb8) >>> 0; }
  get replayLength() { return this.#replayCall('getTotalTime@8') | 0; }
  // Whether the battlefield is still animating; at the end, the replay is over once it stops and the logic has finished.
  get replayAnimating() { return (this.#replayCall('isReplayVisualizationInProgress@8') & 0xff) !== 0; }
  // Whether the replay's battle logic has finished the battle (its byte at +0x28, docs/re/re_witness.md "Ranks").
  get replayFinished() { return this.m.cpu.m8[this.replayLogic + 0x28] !== 0; }
  playReplay() { this.#replayCall('playReplay@8'); }
  pauseReplay() { this.#replayCall('pauseReplay@8'); }
  seekReplay(seconds) { this.#replayCall('setTime@12', seconds | 0); }
  setReplayMode({ skipEmpty, doubleSpeed }) { this.#replayCall('setReplayMode@16', skipEmpty ? 1 : 0, doubleSpeed ? 1 : 0); }
  // Each seat of the replay's battle, once BattleBegin has been processed, as { seat, defeated, princesses }: a seat is defeated once
  // its Commander's defeated flag is set or its slot cleared, both in the defeating message, and `princesses` are the ones it holds
  // (docs/re/re_replay.md "Defeats"). Seats nobody took read as defeated: the caller keeps the replay's own.
  get replaySeats() {
    const cpu = this.m.cpu, rd = a => cpu.rd32(a) >>> 0, ri = a => cpu.rd32(a) | 0, logic = this.replayLogic;
    const bf = logic && rd(logic + 0x14);
    if (!bf || ri(bf + 0x94) < 1) return [];
    const slots = rd(bf + 0x2c), seats = [];
    for (let seat = 1; seat < ri(bf + 0x28); seat++) {
      const c = rd(slots + 4 * seat);
      seats.push({ seat, defeated: !c || cpu.m8[c + 0x1c] !== 0, princesses: c ? ri(c + 0x24) : 0 });
    }
    return seats;
  }
  // Whether the battle view is playing a princess's rescue (docs/re/re_screen.md: its state is nonzero while it runs and ends).
  get rescuePlaying() {
    const rd = a => this.m.cpu.rd32(a) >>> 0, app = rd(this.m.addr(APP)), bv = app && rd(app + 0x9c), rescue = bv && rd(bv + 0x2a0);
    return Boolean(rescue) && rd(rescue + 8) !== 0;
  }

  // Calls fn(cpu) each time the guest reaches the original address `va`, then whatever was there before: an earlier watch, or
  // the instruction itself. A watch for debugging only reads; the Full board's hooks (ADR 0017) also change engine memory, which
  // ADR 0007's byte patches don't cover. Call it after boot().
  watch(va, fn) {
    const cpu = this.m.cpu, at = this.m.addr(va), next = cpu.traps.get(at) ?? cpu.decode(at);
    cpu.traps.set(at, c => { fn(c); return next(c); });
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
