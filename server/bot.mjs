// One bot (server/bots.js): the original engine, headless in a worker thread, playing online like a person
// with the browser client's SNAP code. It steers the menus by key presses into a ranked Quick Match with a
// random hero and waits there; the server seats it at a friendly table and stops it after the battle.
import { workerData, parentPort } from 'worker_threads';
import { loadGame } from '../web/tools/game.mjs';
import { GameHost, VK, UNLOCKS } from '../web/emu/host.js';
import { SnapClient } from '../web/snap.js';
import aiProfiles from './aiprofiles.js';

// deltas, hero, report and speed are for tools/selfplay.mjs: AI profile changes to run instead of server/bot-ai.json,
// a fixed hero (0 to 9), posting the battle's result to the parent, and how many times faster than real time the
// engine's clock runs (default 1). pool is a list of heroes (0 to 9) to draw the hero from, for the Expert level.
const { name, password, url, deltas, hero, report, speed = 1, pool } = workerData;
// The bot's own seat is an AI player (docs/adr/0008).
const AI = [
  // The lobby (FUN_100ebed0) builds the bot's JoinInfo with type 2, AIPlayer, instead of 0, LocalPlayer.
  { what: 'own seat is an AI player', va: 0x100ec08c, from: '8b4e488941088b56488b4208c70000000000', to: '8b4e488941088b56488b4208c70002000000' },
  // FUN_100067b0 ends a battle whose players are all AI players, as the bot is right after its own PlayerJoined.
  { what: 'battle goes on when every player is an AI', va: 0x1000680d, from: '750c', to: 'eb0c' }, // jne -> jmp
  // FUN_1000f610, the game's "busy" check, waits for the battlefield's visual events, which only a local
  // player's battle screen plays back. With none, the AI (FUN_100b1f00) would wait forever.
  { what: 'battlefield never busy', va: 0x1000f610, from: '8b813c010000', to: '32c0c3' }, // xor al, al; ret
];
// Game-time seconds: skip the intro and open Quick Match from the main menu. After the login, pick a random
// hero: the list starts at Plumber, and 0 to 9 steps right reach each of the 10 heroes. The engine's own Random
// entry would pick the same hero every time, since a headless engine with the same inputs runs the same way.
const MENU = [[3, 'ESCAPE'], [6, 'ESCAPE'], [9, 'ESCAPE'], [13, 'DOWN'], [14, 'DOWN'], [15, 'CONTROL']];
const steps = hero ?? (pool?.length ? pool[Math.floor(Math.random() * pool.length)] : Math.floor(Math.random() * 10));
const HERO = [...Array.from({ length: steps }, (_, i) => [5 + i * 0.3, 'RIGHT']), [6 + steps * 0.3, 'CONTROL']];
const LOGIN_AT = 15000;

const ui = { startLogin(ready) { ready(); }, stopLogin() {}, visible: () => false, attempting() {}, rejected() {},
  credentials: () => ({ username: name, password }) };
const snap = new SnapClient({ url, ui });
const game = new GameHost(aiProfiles.apply(await loadGame(), deltas), { snap: snap.methods(), patches: [...UNLOCKS, ...AI] });
snap.attach(game);
game.boot();
// FUN_10006840 runs once the battle is over, after the engine has ranked every player (rank 1 won) and
// before it leaves the table. Its ECX is the ClientBattleLogic: +0x14 the Game (+0x9c turn), +0x1c the stats
// list (count at +0xc, entry pointers at +0x10, rank at entry +0x134), +0x28 finished, +0x84 own player index.
if (report) game.watch(0x10006840, c => {
  const at = a => c.dv.getInt32(a >>> 0, true), logic = c.r[1] >>> 0;
  if (!c.m8[logic + 0x28]) return;
  const stats = at(logic + 0x1c), list = at(stats + 0x10), ranks = {};
  for (let i = 0; i < at(stats + 0xc); i++) { const e = at(list + 4 * i); if (e) ranks[i] = at(e + 0x134); }
  parentPort.postMessage({ ended: { me: at(logic + 0x84), turn: at(at(logic + 0x14) + 0x9c), ranks } });
});

const press = k => { game.key(true, VK[k]); game.tick(); snap.pump(); game.key(false, VK[k]); };
const keys = [...MENU.map(([t, k]) => [t * 1000, k]), ...HERO.map(([t, k]) => [LOGIN_AT + t * 1000, k])];
// Before the login there is nothing to wait for, so the menus run as fast as the CPU allows; from the login
// on, the engine keeps to real time like the page does.
const keyed = () => { while (keys.length && keys[0][0] <= game.time) press(keys.shift()[1]); };
while (game.time < LOGIN_AT) { keyed(); game.tick(); }
const t0 = performance.now() - game.time / speed;
const clock = () => (performance.now() - t0) * speed; // the engine's time it should have reached by now
const loop = () => {
  keyed();
  if (game.time < clock()) { game.tick(); snap.pump(); }
  setTimeout(loop, Math.max(0, (game.time - clock()) / speed));
};
loop();
