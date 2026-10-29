// The Full board (docs/adr/0017, docs/re/re_screen.md) against a stock engine: npm run test:wide   (needs RG_GAME; about four minutes)
// Plays one Arcade battle with the same keys in four engines: a stock one, one on the Full board, one on Classic, and one whose view
// is changed back and forth during the battle. Outside the battle the board engines must draw exactly what the stock one draws, at
// the phone's size; Classic must draw the battle as the stock engine does; the Full board must show the battle at 420 x 378, go back
// to the phone's size while the battle menu is open, and change phase and turn on the same frames as the stock engine, a princess's
// rescue included. The switched engine must draw each frame exactly as the stock engine while it is on Classic and as the Full board
// engine while it is on the Full board, and keep their timeline.
// During a rescue or a fight, the curtain's hole must show the board that lay under it (docs/adr/0029), on the Full board and in the
// engine's replay player, which plays the seed's played replays from data/e2e/ or data/dev/. The Full board's fight is on other keys
// in the same battle, played on the Full board and on a stock engine, which must play the fight on the same frames.
// check-paths: shared/emu/host.js web/src/lib/game/board.js shared/emu/{cpu,fpu,jit,machine,fast,win32,jni,pe}.js shared/game.mjs
// check-paths: server/replays.js
import assert from 'assert';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { loadGame } from '../../shared/game.mjs';
import { GameHost, VK, UNLOCKS, WIDTH, HEIGHT, REPLAY_WIDTH, REPLAY_HEIGHT } from '../../shared/emu/host.js';
import replays from '../../server/replays.js';

// Engine frames: into a 4-player Arcade battle (720), the battle menu opened and closed (1280, 1330), then left alone until a
// princess has been rescued (about 6800); Exit from the battle menu (7400 to 7560), and the menus after it.
const KEYS = new Map([[100, 'ESCAPE'], [150, 'CONTROL'], [190, 'DOWN'], [220, 'DOWN'], [250, 'CONTROL'], [320, 'CONTROL'], [380, 'CONTROL'],
  [440, 'CONTROL'], [500, 'CONTROL'], [560, 'CONTROL'], [600, 'UP'], [640, 'CONTROL'], [720, 'CONTROL'], [780, 'CONTROL'], [840, 'CONTROL'],
  [900, 'CONTROL'], [1280, 'ESCAPE'], [1330, 'ESCAPE'], [7400, 'ESCAPE'], [7440, 'UP'], [7480, 'CONTROL'], [7520, 'UP'], [7560, 'CONTROL']]);
const END = 8000;
// The switched engine's changes of view: to Classic and back with the battle menu open, to Classic in a hero's turn, back to the
// Full board, to Classic during a phase banner, back, to Classic during the rescue (it waits for the rescue to end), and back.
const SWITCHES = new Map([[1300, false], [1320, true], [1714, false], [2000, true], [3420, false], [3700, true], [6850, false], [7000, true]]);
// The tick after the battle menu closes is the first drawn wide again; the right-hand part of it that the narrow tick left alone
// still shows the board as it was when the menu opened, on Classic in the switched engine (docs/re/re_screen.md "The battle UI states").
const STALE = 1335;
// The same battle on other keys, as far as a fight (CONTEXT.md): the local hero walks three cells right on its first move (1676 to
// 1717), red's hero comes next to it, and on the second move the local player stays (4450), so red's hero attacks it (about 4600).
// These keys lose the rescue, so they are played apart.
const FIGHT_KEYS = new Map([...[...KEYS].filter(([tick]) => tick <= 900), [1676, 'RIGHT'], [1687, 'RIGHT'], [1692, 'RIGHT'], [1717, 'CONTROL'], [4450, 'CONTROL']]);
const FIGHT_END = 5500; // the fight is over by then
const files = await loadGame();

function engine(options, fullBoard) {
  const game = new GameHost(files, { patches: UNLOCKS, log: () => {}, warn: m => { throw new Error(m); }, ...options });
  game.boot();
  game.fullBoard = fullBoard;
  const cpu = game.m.cpu, app = cpu.rd32(game.m.addr(0x101b828c)) >>> 0;
  // The local battle's Game: its phase (+0x94) and turn (+0x9c), as tools/selfplay.mjs reads them.
  game.clock = () => { const logic = cpu.rd32(app + 0x114) >>> 0, g = logic && cpu.rd32(logic + 0x14) >>> 0; return g ? `${cpu.rd32(g + 0x94)}/${cpu.rd32(g + 0x9c)}` : ''; };
  game.changes = [];
  game.pulled = 0;
  return game;
}
// One frame of an engine on the keys `keys`, then its phase and turn if they changed.
function step(g, keys, tick) {
  const k = keys.get(tick);
  if (k) { g.key(true, VK[k]); g.tick(); g.key(false, VK[k]); }
  g.tick();
  while (g.pulled * 64 < g.time) { g.pullSound(); g.pulled++; }
  const c = g.clock();
  if (c !== (g.changes.at(-1)?.[1] ?? '')) g.changes.push([tick, c]);
}
const stock = engine({}, true), full = engine({ board: true }, true), classic = engine({ board: true }, false), switched = engine({ board: true }, true);
assert.ok(full.board && classic.board, 'this engine copy has no Full board');
// From the end of a Full board battle until the next menu screen is built (FUN_100f94a0), the fade to gray and the results have the
// battle's last frame behind them: the Full board's top-left corner rather than the phone camera's view (docs/adr/0017).
// FUN_100831a0 draws a princess's rescue (docs/re/re_screen.md). These watches only read.
let afterBattle = false, rescues = 0;
full.watch(0x100f94a0, () => { if (!full.inBattle) afterBattle = false; });
stock.watch(0x100831a0, () => { rescues++; });

// The colors of the engine's w x h screen: its alpha byte isn't part of the picture.
const screen = g => { const out = new Int32Array(g.width * g.height); for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) out[y * g.width + x] = g.pixels[y * g.pitch + x] & 0xffffff; return out; };
const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// The curtain's hole on the 420 x 378 screen, less its 2 to 4 pixel bevel, which overlaps the inset (docs/re/re_screen.md).
const HOLE = { x: 94, y: 33, w: 232, h: 312 };
const hole = g => { const out = new Int32Array(HOLE.w * HOLE.h); for (let y = 0; y < HOLE.h; y++) for (let x = 0; x < HOLE.w; x++) out[y * HOLE.w + x] = g.pixels[(HOLE.y + y) * g.pitch + HOLE.x + x] & 0xffffff; return out; };
// Whether two colors are within d levels of each other in each channel.
const near = d => (v, u) => Math.abs((v & 255) - (u & 255)) <= d && Math.abs(((v >> 8) & 255) - ((u >> 8) & 255)) <= d && Math.abs((v >> 16) - (u >> 16)) <= d;
// The curtain animations that play over a picture of the whole screen taken as they start (docs/re/re_screen.md "The rescue's
// backdrop"). `site` draws the picture; `on(rd, bv)` says whether one plays in the battle view bv; `like(v, u)` whether a pixel v of
// the hole shows the pixel u of the board under it; `kept(v, u)`, if given, whether a pixel v of the first frame after the animation
// still shows the pixel u of its last frame, as it does when the board doesn't jump as the curtain lifts.
const RESCUE = { site: 0x10083211, on: (rd, bv) => rd(rd(bv + 0x2a0) + 8) !== 0, like: (v, u) => v === u };
// A fight moves each channel of its picture 3 levels toward the pixel's gray on each of its first 32 frames, its first included, and
// 9 levels back toward its color on each of its last 7, which leaves it within 96 - 63 = 33 levels of the board.
const FIGHT = { site: 0x1008294a, on: (rd, bv) => rd(rd(bv + 0x29c) + 0x14) === 1, like: near(3), kept: near(33) };
// Watches the curtain animations `cut` of an engine with a 420 x 378 screen. They draw their backdrop from their first frame on the
// Full board, and once the curtain has faded in in the replay player; on that frame the hole must show what lay under it on the frame
// before the animation began, not the screen's top-left corner. after() goes after each tick; `shown` gets, for each animation, the
// share of the hole's pixels like that frame's, and `kept` the share of the first frame after it that still shows its last frame.
function holeWatch(g, cut = RESCUE) {
  const cpu = g.m.cpu, rd = a => cpu.rd32(a) >>> 0, app = rd(g.m.addr(0x101b828c));
  const share = (now, then, like) => now.reduce((n, v, i) => n + like(v, then[i]), 0) / now.length;
  let before = null, last = null, drawn = false, playing = false, checked = false;
  const shown = [], kept = [];
  g.watch(cut.site, () => { drawn = true; });
  return {
    shown, kept,
    get playing() { return playing; },
    after() {
      const bv = rd(app + 0x9c), now = g.width === REPLAY_WIDTH ? hole(g) : null;
      if (!bv || !cut.on(rd, bv)) {
        if (last && now) kept.push(share(now, last, cut.kept));
        playing = drawn = false; before = now; last = null; return;
      }
      if (!playing) { playing = true; checked = false; }
      if (cut.kept) last = now;
      if (!drawn || checked || !before || !now) return;
      checked = true;
      shown.push(share(now, before, cut.like));
    },
  };
}
const fullHole = holeWatch(full);

let battleTicks = 0, menuNarrow = 0, outside = 0, switchedClassic = 0, switchedFull = 0, deferred = 0, afterRescue = 0;
for (let tick = 1; tick <= END; tick++) {
  if (SWITCHES.has(tick)) switched.fullBoard = SWITCHES.get(tick);
  for (const g of [stock, full, classic, switched]) step(g, KEYS, tick);
  fullHole.after();
  const s = screen(stock);
  assert.ok(same(screen(classic), s), `Classic draws something else than the stock engine at frame ${tick}`);
  if (switched.fullBoard !== switched.battleFull && switched.inBattle) deferred++;
  if (switched.inBattle && !switched.battleFull) {
    switchedClassic++;
    if (tick > 6850 && tick < 7000) afterRescue++;
    assert.ok(same(screen(switched), s), `the engine switched to Classic draws something else than the stock engine at frame ${tick}`);
  } else {
    if (switched.inBattle) switchedFull++;
    assert.ok(tick === STALE || same(screen(switched), screen(full)), `the engine switched to the Full board draws something else than the Full board engine at frame ${tick}`);
  }
  if (!full.inBattle) {
    outside++;
    assert.deepStrictEqual([full.width, full.height], [WIDTH, HEIGHT], `outside a battle the Full board engine has a ${full.width} x ${full.height} screen at frame ${tick}`);
    assert.ok(afterBattle || same(screen(full), s), `outside a battle the Full board engine draws something else than the stock engine at frame ${tick}`);
    continue;
  }
  afterBattle = true;
  battleTicks++;
  if (tick > 1290 && tick < 1330) { assert.strictEqual(full.width, WIDTH, `the battle menu isn't on the phone's screen at frame ${tick}`); menuNarrow++; continue; }
  if (tick > 740 && tick < 1280) assert.deepStrictEqual([full.width, full.height], [REPLAY_WIDTH, REPLAY_HEIGHT], `the battle isn't on the Full board at frame ${tick}`);
}
assert.ok(switchedClassic > 500 && switchedFull > 5000, `the switches missed a part: ${switchedClassic} Classic frames, ${switchedFull} Full board`);
assert.ok(deferred > 20 && afterRescue > 20, `the switch asked for during the rescue waited ${deferred} frames and then lasted ${afterRescue}`);
assert.deepStrictEqual(switched.changes, stock.changes, 'the switched battle changed phase or turn on other frames than the stock one');
assert.ok(battleTicks > 6000 && menuNarrow > 0 && outside > 1000, `the run missed a part: ${battleTicks} battle frames, ${menuNarrow} with the menu, ${outside} outside`);
assert.ok(rescues > 0, 'no princess was rescued, so the curtain was never tested');
assert.ok(stock.changes.some(([, c]) => c.startsWith('5/')), 'the battle never reached its cannons');
assert.deepStrictEqual(full.changes, stock.changes, 'the Full board battle changed phase or turn on other frames than the stock one');
assert.deepStrictEqual(classic.changes, stock.changes, 'the Classic battle changed phase or turn on other frames than the stock one');
const LIKE_UNDER = 0.99; // the rescue's art covers almost none of the hole on its first frame; the corner matched under 20 %
assert.ok(fullHole.shown.length > 0 && fullHole.shown.every(r => r > LIKE_UNDER), `on the Full board the curtain's hole doesn't show the board under it during a rescue: ${fullHole.shown}`);

// The fight, on the Full board and on a stock engine, which has no hooks: it must play on the same frames, and on the Full board the
// curtain's hole must show the board under it, from the fight's first frame to the first frame after it.
const fightFull = engine({ board: true }, true), fightStock = engine({}, true), fightHole = holeWatch(fightFull, FIGHT);
const fighting = g => { const rd = a => g.m.cpu.rd32(a) >>> 0, bv = rd(rd(g.m.addr(0x101b828c)) + 0x9c); return bv !== 0 && FIGHT.on(rd, bv); };
for (const g of [fightFull, fightStock]) g.fights = [];
for (let tick = 1; tick <= FIGHT_END && !fightHole.kept.length; tick++) {
  for (const g of [fightFull, fightStock]) { step(g, FIGHT_KEYS, tick); if (fighting(g)) g.fights.push(tick); }
  fightHole.after();
}
assert.ok(fightStock.fights.length > 0, 'the fight keys led to no fight, so the fight was never tested');
assert.deepStrictEqual(fightFull.fights, fightStock.fights, 'the Full board fight played on other frames than the stock one');
assert.deepStrictEqual(fightFull.changes, fightStock.changes, 'the Full board battle with the fight changed phase or turn on other frames than the stock one');
// The fighters cover almost none of the hole on the fight's first frame, where the corner matched the board under it on 17 %. As the
// curtain lifts, the board changes where the fight left it, a knocked-out hero gone from its cell; a jump from the corner kept a fifth.
const KEPT = 0.95;
assert.ok(fightHole.shown.length === 1 && fightHole.shown[0] > LIKE_UNDER, `on the Full board the curtain's hole doesn't show the board under it during a fight: ${fightHole.shown}`);
assert.ok(fightHole.kept.length === 1 && fightHole.kept[0] > KEPT, `on the Full board the board jumps in the curtain's hole as the fight ends: ${fightHole.kept}`);

// The seed's played replays (CONTEXT.md "Seed account"), as the e2e tests' setup or `npm run seed -- --play` played them, in the
// engine's replay player: each rescue and fight in them must show the board under the hole too, on the first frame drawn.
const store = ['data/e2e/replays.db', 'data/dev/replays.db'].map(f => fileURLToPath(new URL(`../../${f}`, import.meta.url))).find(f => fs.existsSync(f));
assert.ok(store, 'no played replays: run `npm run seed -- --play` once (or the engine e2e tests, which play them into data/e2e/)');
const { played } = JSON.parse(fs.readFileSync(new URL('../../server/seed.json', import.meta.url), 'utf8'));
const kept = replays.open(store), replayHoles = [], replayFights = [];
for (const { id } of played) {
  const text = kept.get(id)?.text;
  if (!text) continue;
  const g = new GameHost(files, { replay: text, warn: m => { throw new Error(m); } });
  g.boot();
  const watch = holeWatch(g), fights = holeWatch(g, FIGHT);
  let pulled = 0, moded = false;
  for (let tick = 1; tick <= 20000 && !(watch.shown.length && !watch.playing); tick++) {
    g.tick();
    while (pulled * 64 < g.time) { g.pullSound(); pulled++; }
    if (!moded && g.replayLoaded) { g.setReplayMode({ skipEmpty: true, doubleSpeed: true }); moded = true; }
    watch.after(); fights.after();
  }
  replayHoles.push(...watch.shown.map(r => `${id} ${r.toFixed(4)}`));
  replayFights.push(...fights.shown.map(r => `${id} ${r.toFixed(4)}`));
  assert.ok(watch.shown.every(r => r > LIKE_UNDER), `in replay ${id} the curtain's hole doesn't show the board under it during a rescue: ${watch.shown}`);
  assert.ok(fights.shown.every(r => r > LIKE_UNDER), `in replay ${id} the curtain's hole doesn't show the board under it during a fight: ${fights.shown}`);
}
assert.ok(replayHoles.length > 0, `no played replay in ${store} has a princess's rescue, so the replay player's curtain was never tested`);
assert.ok(replayFights.length > 0, `no played replay in ${store} has a fight before its first rescue ends, so the replay player's fight was never tested`);
console.log(`Full board ok: ${outside} frames outside the battle identical to stock, ${battleTicks} battle frames, ${stock.changes.length} phase and turn changes on the same frames; switched in the battle: ${switchedClassic} Classic and ${switchedFull} Full board frames as drawn without switching, ${deferred} waiting for the rescue; the curtain's hole showed the board under it in ${fullHole.shown.length} Full board rescues and in replays (${replayHoles.join(', ')}), and in a Full board fight on frames ${fightFull.fights[0]} to ${fightFull.fights.at(-1)} (${fightHole.shown[0].toFixed(4)} on its first, ${fightHole.kept[0].toFixed(4)} kept after it) and in replays (${replayFights.join(', ')})`);
