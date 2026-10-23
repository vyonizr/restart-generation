// The Full board (docs/adr/0017, docs/re/re_screen.md) against a stock engine: npm run test:wide   (needs RG_GAME; about three minutes)
// Plays one Arcade battle with the same keys in four engines: a stock one, one on the Full board, one on Classic, and one whose view
// is changed back and forth during the battle. Outside the battle the board engines must draw exactly what the stock one draws, at
// the phone's size; Classic must draw the battle as the stock engine does; the Full board must show the battle at 420 x 378, go back
// to the phone's size while the battle menu is open, and change phase and turn on the same frames as the stock engine, a princess's
// rescue included. The switched engine must draw each frame exactly as the stock engine while it is on Classic and as the Full board
// engine while it is on the Full board, and keep their timeline.
// During a rescue, the curtain's hole must show the board that lay under it (docs/adr/0029), on the Full board and in the engine's
// replay player, which plays the seed's played replays from data/e2e/ or data/dev/.
import assert from 'assert';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { loadGame } from './game.mjs';
import { GameHost, VK, UNLOCKS, WIDTH, HEIGHT, REPLAY_WIDTH, REPLAY_HEIGHT } from '../emu/host.js';
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
// Watches the princess rescues of an engine with a 420 x 378 screen. A rescue draws its backdrop (at 0x10083211) from its first frame
// on the Full board, and once the curtain has faded in in the replay player; on that frame the hole must show what lay under it on
// the frame before the rescue began, not the screen's top-left corner. after() goes after each tick; `shown` gets, for each rescue,
// the share of the hole's pixels equal to that frame's.
function holeWatch(g) {
  const cpu = g.m.cpu, rd = a => cpu.rd32(a) >>> 0, app = rd(g.m.addr(0x101b828c));
  let before = null, drawn = false, rescuing = false, checked = false;
  const shown = [];
  g.watch(0x10083211, () => { drawn = true; });
  return {
    shown,
    get rescuing() { return rescuing; },
    after() {
      const bv = rd(app + 0x9c), wide = g.width === REPLAY_WIDTH;
      if (!bv || rd(rd(bv + 0x2a0) + 8) === 0) { rescuing = drawn = false; before = wide ? hole(g) : null; return; }
      if (!rescuing) { rescuing = true; checked = false; }
      if (!drawn || checked || !before || !wide) return;
      checked = true;
      const now = hole(g);
      shown.push(now.reduce((n, v, i) => n + (v === before[i]), 0) / now.length);
    },
  };
}
const fullHole = holeWatch(full);

let battleTicks = 0, menuNarrow = 0, outside = 0, switchedClassic = 0, switchedFull = 0, deferred = 0, afterRescue = 0;
for (let tick = 1; tick <= END; tick++) {
  if (SWITCHES.has(tick)) switched.fullBoard = SWITCHES.get(tick);
  for (const g of [stock, full, classic, switched]) {
    const k = KEYS.get(tick);
    if (k) { g.key(true, VK[k]); g.tick(); g.key(false, VK[k]); }
    g.tick();
    while (g.pulled * 64 < g.time) { g.pullSound(); g.pulled++; }
    const c = g.clock();
    if (c !== (g.changes.at(-1)?.[1] ?? '')) g.changes.push([tick, c]);
  }
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

// The seed's played replays (CONTEXT.md "Seed account"), as the e2e tests' setup or `npm run seed -- --play` played them, in the
// engine's replay player: each that has a rescue must show the board under the hole too.
const store = ['data/e2e/replays.db', 'data/dev/replays.db'].map(f => fileURLToPath(new URL(`../../${f}`, import.meta.url))).find(f => fs.existsSync(f));
assert.ok(store, 'no played replays: run `npm run seed -- --play` once (or the engine e2e tests, which play them into data/e2e/)');
const { played } = JSON.parse(fs.readFileSync(new URL('../../server/seed.json', import.meta.url), 'utf8'));
const kept = replays.open(store), replayHoles = [];
for (const { id } of played) {
  const text = kept.get(id, 0)?.text; // at any age
  if (!text) continue;
  const g = new GameHost(files, { replay: text, warn: m => { throw new Error(m); } });
  g.boot();
  const watch = holeWatch(g);
  let pulled = 0, moded = false;
  for (let tick = 1; tick <= 20000 && !(watch.shown.length && !watch.rescuing); tick++) {
    g.tick();
    while (pulled * 64 < g.time) { g.pullSound(); pulled++; }
    if (!moded && g.replayLoaded) { g.setReplayMode({ skipEmpty: true, doubleSpeed: true }); moded = true; }
    watch.after();
  }
  replayHoles.push(...watch.shown.map(r => `${id} ${r.toFixed(4)}`));
  assert.ok(watch.shown.every(r => r > LIKE_UNDER), `in replay ${id} the curtain's hole doesn't show the board under it during a rescue: ${watch.shown}`);
}
assert.ok(replayHoles.length > 0, `no played replay in ${store} has a princess's rescue, so the replay player's curtain was never tested`);
console.log(`Full board ok: ${outside} frames outside the battle identical to stock, ${battleTicks} battle frames, ${stock.changes.length} phase and turn changes on the same frames; switched in the battle: ${switchedClassic} Classic and ${switchedFull} Full board frames as drawn without switching, ${deferred} waiting for the rescue; the curtain's hole showed the board under it in ${fullHole.shown.length} Full board rescues and in replays (${replayHoles.join(', ')})`);
