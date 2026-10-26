// Self-check for a rejoin's drive of the menus: node web/src/lib/game/rejoin-drive.test.js
import assert from 'node:assert';
import { createDrive, GIVE_UP } from './rejoin-drive.js';

// Runs a drive in 100 ms ticks of engine time until `until` ms. `at(time)` gives what the SNAP client shows then; the engine runs at
// `speed` times real time. Returns each press with the time it came, the steps in the order they were shown, and when it gave up.
function drive(until, at = () => ({}), speed = 1) {
  const d = createDrive(), presses = [], steps = [];
  for (let time = 0; time <= until; time += 100) {
    const s = d.step({ time, wall: time / speed, loggedIn: false, room: '', problem: 0, asking: false, ...at(time) });
    for (const p of s.press) presses.push(`${p} ${time}`);
    if (steps.at(-1) !== s.step) steps.push(s.step);
    if (s.failed) return { presses, steps, failed: time };
  }
  return { presses, steps, failed: null };
}
const MENU = ['back 3000', 'back 6000', 'back 9000', 'down 13000', 'down 14000', 'select 15000'];

// The menus' keys at bot.mjs's times; the hero's Select 5 s after the engine is in CasinoSystem, never before, and once.
const online = t => ({ loggedIn: t >= 15800, room: t >= 16300 ? 'CasinoSystem' : '' });
assert.deepStrictEqual(drive(40000, online), { presses: [...MENU, 'select 21300'], steps: [0, 1, 2, 3, 4], failed: null });

// A login that takes long only delays the hero, and logged in without the casino room yet, nothing is pressed.
assert.deepStrictEqual(drive(40000, t => ({ loggedIn: t >= 15800, room: t >= 30000 ? 'casinosystem' : '' })).presses, [...MENU, 'select 35000']);

// A refused login, or a name to type, hands the player the strip at once. So does GIVE_UP of wall time without the battle, however
// slowly the engine runs and whatever it has pressed by then.
assert.strictEqual(drive(40000, t => ({ problem: t >= 17000 ? 1 : 0 })).failed, 17000);
assert.strictEqual(drive(40000, t => ({ asking: t >= 16000 })).failed, 16000);
assert.deepStrictEqual(drive(60000, online, 0.5), { presses: [...MENU, 'select 21300'], steps: [0, 1, 2, 3, 4], failed: GIVE_UP / 2 });

console.log('rejoin drive ok');
