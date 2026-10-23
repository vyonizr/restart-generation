// The Full board (docs/adr/0017, docs/re/re_screen.md) against a stock engine: npm run test:wide   (needs RG_GAME; about three minutes)
// Plays one Arcade battle with the same keys in four engines: a stock one, one on the Full board, one on Classic, and one whose view
// is changed back and forth during the battle. Outside the battle the board engines must draw exactly what the stock one draws, at
// the phone's size; Classic must draw the battle as the stock engine does; the Full board must show the battle at 420 x 378, go back
// to the phone's size while the battle menu is open, and change phase and turn on the same frames as the stock engine, a princess's
// rescue included. The switched engine must draw each frame exactly as the stock engine while it is on Classic and as the Full board
// engine while it is on the Full board, and keep their timeline.
import assert from 'assert';
import { loadGame } from './game.mjs';
import { GameHost, VK, UNLOCKS, WIDTH, HEIGHT, REPLAY_WIDTH, REPLAY_HEIGHT } from '../emu/host.js';

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
console.log(`Full board ok: ${outside} frames outside the battle identical to stock, ${battleTicks} battle frames, ${stock.changes.length} phase and turn changes on the same frames; switched in the battle: ${switchedClassic} Classic and ${switchedFull} Full board frames as drawn without switching, ${deferred} waiting for the rescue`);
