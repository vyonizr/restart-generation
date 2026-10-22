// Self-check for the gamepad's held direction and the press count every input shares: node web/ui/gamepad.test.mjs
import assert from 'node:assert';
import { NO_DIRECTION, nextDirection } from './direction.js';
import { createPresses } from './presses.js';

// Feeds frames of the D-pad (up, down, left, right) and the left stick (x, y) through nextDirection, and lists the direction held
// after each frame.
function play(frames) {
  let state = NO_DIRECTION;
  return frames.map(f => (state = nextDirection(state, { x: 0, y: 0, ...f })).held);
}

// On the D-pad the latest press wins, and letting it go hands back to a direction still held.
assert.deepStrictEqual(play([{ left: true }, { left: true, up: true }, { left: true }, {}]), ['left', 'up', 'left', null]);

// The stick at full tilt, `deg` degrees anticlockwise from right (its y axis points down).
const at = deg => ({ x: Math.cos(deg * Math.PI / 180), y: -Math.sin(deg * Math.PI / 180) });

// The stick presses its nearer direction, and a held one keeps its sector widened by 10° each side, so resting near 45° never
// flips between two directions; it changes once the stick is 10° past the line.
assert.deepStrictEqual(play([at(30), at(44), at(46), at(54), at(44), at(56), at(44)]), ['right', 'right', 'right', 'right', 'right', 'up', 'up']);
assert.deepStrictEqual(play([at(46)]), ['up']);
assert.deepStrictEqual(play([at(170), at(226), at(236)]), ['left', 'left', 'down']);

// The stick presses past half its travel and lets go below 0.3; in between, it keeps what it had.
assert.deepStrictEqual(play([{ x: 0.45 }, { x: 0.6 }, { x: 0.35 }, { x: 0.25 }, { x: 0.45 }]), [null, 'right', 'right', null, null]);

// The D-pad and the stick are one input: the latest press wins, and letting it go hands back to the other.
assert.deepStrictEqual(play([{ x: 1 }, { x: 1, up: true }, { x: 1 }]), ['right', 'up', 'right']);
assert.deepStrictEqual(play([{ left: true }, { left: true, y: -1 }, { left: true }, {}]), ['left', 'up', 'left', null]);
assert.deepStrictEqual(play([{ up: true }, { up: true, y: -1 }, { y: -1 }, {}]), ['up', 'up', 'up', null]);

// The press count the keyboard, the touch pad and the gamepad share. `run` applies the input queue as a tick does and returns the
// key events the engine saw.
const events = [], input = [];
const presses = createPresses({ key: (down, code) => events.push(`${down ? 'down' : 'up'} ${code}`), releaseAll: () => events.push('all up') }, input);
const run = () => { while (input.length) input.shift()(); return events.splice(0); };
const ENTER = 10;

// Enter held on the keyboard and on the gamepad is one press: letting go of one doesn't release it, letting go of both does.
assert.strictEqual(presses.press(ENTER), true);
assert.strictEqual(presses.press(ENTER), false);
assert.deepStrictEqual(run(), ['down 10']);
presses.release(ENTER);
assert.deepStrictEqual(run(), []);
presses.release(ENTER);
assert.deepStrictEqual(run(), ['up 10']);

// releaseAll() (the page lost focus) lets go of every key in the engine; a late release then sends nothing, and the next press
// counts.
presses.press(ENTER); presses.press(ENTER); run();
presses.releaseAll();
presses.release(ENTER);
assert.deepStrictEqual(run(), ['all up']);
presses.press(ENTER);
assert.deepStrictEqual(run(), ['down 10']);

console.log('gamepad ok');
