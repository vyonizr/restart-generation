// One bot (server/bots.js): the original engine, headless in a worker thread, playing online like a person
// with the browser client's SNAP code. It steers the menus by key presses into a ranked Quick Match with a
// random hero and waits there; the server seats it at a friendly table and stops it after the battle.
import { workerData } from 'worker_threads';
import { loadGame } from '../web/tools/game.mjs';
import { GameHost, VK, UNLOCKS } from '../web/emu/host.js';
import { SnapClient } from '../web/snap.js';

const { name, password, url } = workerData;
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
const steps = Math.floor(Math.random() * 10);
const HERO = [...Array.from({ length: steps }, (_, i) => [5 + i * 0.3, 'RIGHT']), [6 + steps * 0.3, 'CONTROL']];
const LOGIN_AT = 15000;

const ui = { startLogin(ready) { ready(); }, stopLogin() {}, visible: () => false, attempting() {}, rejected() {},
  credentials: () => ({ username: name, password }) };
const snap = new SnapClient({ url, ui });
const game = new GameHost(await loadGame(), { snap: snap.methods(), patches: [...UNLOCKS, ...AI] });
snap.attach(game);
game.boot();

const press = k => { game.key(true, VK[k]); game.tick(); snap.pump(); game.key(false, VK[k]); };
const keys = [...MENU.map(([t, k]) => [t * 1000, k]), ...HERO.map(([t, k]) => [LOGIN_AT + t * 1000, k])];
// Before the login there is nothing to wait for, so the menus run as fast as the CPU allows; from the login
// on, the engine keeps to real time like the page does.
const keyed = () => { while (keys.length && keys[0][0] <= game.time) press(keys.shift()[1]); };
while (game.time < LOGIN_AT) { keyed(); game.tick(); }
const t0 = performance.now() - game.time;
const loop = () => {
  keyed();
  if (game.time < performance.now() - t0) { game.tick(); snap.pump(); }
  setTimeout(loop, Math.max(0, game.time - (performance.now() - t0)));
};
loop();
