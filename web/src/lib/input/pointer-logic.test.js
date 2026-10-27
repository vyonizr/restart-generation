// Self-check for pointer play (docs/adr/0039), from a point on the game screen to the engine's cursor moves and Select presses:
// node web/src/lib/input/pointer-logic.test.js
import assert from 'node:assert';
import { screenPoint, boardCell, hovers, line, anchorFor, createPlay } from './pointer-logic.js';

// The Full board on the 11 × 11 Arcade map: the board centered by the camera, tiles of 30 × 27, a corner panel at the top left.
const FULL = { camera: { x: -45, y: -40 }, tile: { w: 30, h: 27 }, map: { cols: 11, rows: 11 }, screen: { w: 420, h: 378 },
  panels: [{ x: 0, y: 0, w: 60, h: 50 }] };

// The canvas is drawn larger than its pixels, and a smaller engine screen sits in its middle (the curtain's inset at 90, 29).
assert.deepStrictEqual(screenPoint(91, 81, { width: 840, height: 756 }, { width: 420, height: 378 }, { w: 420, h: 378 }), { x: 45, y: 40 });
assert.deepStrictEqual(screenPoint(839.9, 755.9, { width: 840, height: 756 }, { width: 420, height: 378 }, { w: 420, h: 378 }), { x: 419, y: 377 });
assert.strictEqual(screenPoint(840, 10, { width: 840, height: 756 }, { width: 420, height: 378 }, { w: 420, h: 378 }), null);
assert.deepStrictEqual(screenPoint(90, 29, { width: 420, height: 378 }, { width: 420, height: 378 }, { w: 240, h: 320 }), { x: 0, y: 0 });
assert.strictEqual(screenPoint(89, 29, { width: 420, height: 378 }, { width: 420, height: 378 }, { w: 240, h: 320 }), null);
assert.deepStrictEqual(screenPoint(4, 5, { width: 360, height: 480 }, { width: 240, height: 320 }, { w: 240, h: 320 }), { x: 2, y: 3 });

// A cell is where the player sees it: x as the engine's grid, y 4 px lower. The map's margin and the corner panels are no cell.
assert.deepStrictEqual(boardCell({ x: 100, y: 70 }, FULL), { x: 1, y: 0 });
assert.deepStrictEqual(boardCell({ x: 100, y: 71 }, FULL), { x: 1, y: 1 });
assert.deepStrictEqual(boardCell({ x: 374, y: 340 }, FULL), { x: 10, y: 10 });
assert.strictEqual(boardCell({ x: 375, y: 200 }, FULL), null);
assert.strictEqual(boardCell({ x: 80, y: 43 }, FULL), null);
assert.strictEqual(boardCell({ x: 50, y: 45 }, FULL), null); // cell 0, 0 under the panel
assert.deepStrictEqual(boardCell({ x: 60, y: 45 }, FULL), { x: 0, y: 0 });
assert.strictEqual(boardCell(null, FULL), null);

// Hover moves the cursor only on the Full board, and only for a pointer that can hover.
assert.deepStrictEqual(['mouse', 'pen', 'touch'].map(t => hovers('full', t)), [true, true, false]);
assert.deepStrictEqual(['mouse', 'pen', 'touch'].map(t => hovers('classic', t)), [false, false, false]);
assert.strictEqual(hovers(null, 'mouse'), false);

// One arrow per cell, along the straight line, so a route keeps the shape of the pointer's trail; a column first on a tie.
assert.deepStrictEqual(line({ x: 0, y: 0 }, { x: 3, y: 1 }), ['right', 'right', 'down', 'right']);
assert.deepStrictEqual(line({ x: 0, y: 0 }, { x: -2, y: -2 }), ['left', 'up', 'left', 'up']);
assert.deepStrictEqual(line({ x: 4, y: 4 }, { x: 4, y: 1 }), ['up', 'up', 'up']);
assert.deepStrictEqual(line({ x: 4, y: 4 }, { x: 4, y: 4 }), []);

// A piece's middle goes under the pointer, and its anchor stays where the whole piece is on the map, negative if need be.
const L = [{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }];
assert.deepStrictEqual(anchorFor({ x: 5, y: 5 }, { ...FULL, piece: L }), { x: 5, y: 5 });
assert.deepStrictEqual(anchorFor({ x: 10, y: 10 }, { ...FULL, piece: L }), { x: 9, y: 9 });
const RAISED = [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 1, y: 2 }, { x: 2, y: 2 }, { x: 3, y: 2 }];
assert.deepStrictEqual(anchorFor({ x: 0, y: 0 }, { ...FULL, piece: RAISED }), { x: -1, y: -1 });
assert.deepStrictEqual(anchorFor({ x: 6, y: 6 }, { ...FULL, piece: RAISED }), { x: 4, y: 5 });

// An engine that takes the page's presses as the real one does: a key event queued before a tick moves the cursor in the tick after
// it, every event queued between two ticks in that same tick. A tick is 33 ms of its time. `log` lists what it did: an arrow's
// press, `jump x,y`, `select`, and `select up after <ms held>`.
function battle(state, { cell, hero = null, targets = 'free', piece = null, cycle = [], canJump = true }) {
  const b = { state, cell, hero, targets, piece, choices: null, blocked: false, log: [] };
  const queue = [];
  let tick = 0, time = 0, selectAt = 0;
  const step = { left: [-1, 0], right: [1, 0], up: [0, -1], down: [0, 1] };
  const apply = (action, down) => {
    if (action === 'select') {
      if (down) { selectAt = time; b.log.push('select'); } else b.log.push(`select up after ${time - selectAt}`);
      return;
    }
    if (!down) return;
    b.log.push(action);
    const [dx, dy] = step[action];
    if (b.targets === 'cycle') b.cell = cycle[(cycle.findIndex(c => c.x === b.cell.x && c.y === b.cell.y) + 1) % cycle.length];
    else if (b.targets === 'direction') b.cell = { x: b.hero.x + 2 * dx, y: b.hero.y + 2 * dy }; // the cursor goes along the direction
    else {
      const offsets = b.piece ?? [{ x: 0, y: 0 }], fit = (v, d, k) => Math.max(-Math.min(...offsets.map(o => o[k])), Math.min(10 - Math.max(...offsets.map(o => o[k])), v + d));
      b.cell = { x: fit(b.cell.x, dx, 'x'), y: fit(b.cell.y, dy, 'y') };
    }
  };
  const read = () => b.state && { ...FULL, panels: [], state: b.state, cell: { ...b.cell }, hero: b.hero, piece: b.piece, targets: b.targets, choices: b.choices };
  b.play = createPlay({
    jump: (x, y) => { if (!canJump) return false; b.log.push(`jump ${x},${y}`); b.cell = { x, y }; return true; },
    press: action => queue.push([tick + 2, action, true]),
    release: action => queue.push([tick + 2, action, false]),
    blocked: () => b.blocked,
  });
  // Runs n ticks and returns what the engine did since the last call.
  b.run = (n = 1) => {
    for (let i = 0; i < n; i++) {
      tick++; time += 33;
      while (queue.length && queue[0][0] <= tick) apply(...queue.shift().slice(1));
      b.play.tick(read(), time);
    }
    return b.log.splice(0);
  };
  b.click = cell => { b.play.down(cell); b.play.up(cell); };
  b.run();
  return b;
}
const at = (x, y) => ({ x, y });

{
  // Full board, a hero's turn: the pointer coming onto the board jumps the cursor there, and from then on the cursor follows its
  // trail by arrows, a cell skipped included.
  const b = battle('move', { cell: at(5, 2), hero: at(5, 2) });
  b.play.hover(at(8, 6));
  assert.deepStrictEqual(b.log.splice(0), ['jump 8,6']);
  b.play.hover(at(9, 6));
  b.play.hover(at(9, 8));
  assert.deepStrictEqual(b.run(2), ['right', 'down', 'down']);
  assert.deepStrictEqual(b.cell, at(9, 8));

  // Back on the board elsewhere, the jump waits for the arrows still in flight, which would land after it.
  b.play.hover(at(9, 9));
  b.play.leave();
  b.play.hover(at(2, 2));
  assert.deepStrictEqual(b.run(1), []);
  assert.deepStrictEqual(b.run(1), ['down', 'jump 2,2']);

  // A click on the cursor's cell commits, once the cursor is there: one tap of Select.
  b.click(at(2, 2));
  assert.deepStrictEqual(b.run(5), ['select', 'select up after 33']);

  // A press released over another cell cancels, and so does one that went down off the battlefield.
  b.play.down(at(2, 2)); b.play.up(at(3, 2));
  b.play.down(null); b.play.up(at(2, 2));
  assert.deepStrictEqual(b.run(3), []);

  // Keys moved the cursor away from the pointer: the next hover jumps.
  b.cell = at(6, 6);
  b.run(); b.play.hover(at(3, 2));
  assert.deepStrictEqual(b.log.splice(0), ['jump 3,2']);
}

{
  // A click with no hover (Classic, a finger, a trackpad's tap): a click away from the cursor jumps it, one on a cell next to it
  // steps there by arrows, and a second click on the cursor's cell commits.
  const b = battle('move', { cell: at(5, 2), hero: at(5, 2) });
  b.click(at(8, 8));
  assert.deepStrictEqual(b.run(2), ['jump 8,8']);
  b.click(at(9, 9));
  assert.deepStrictEqual(b.run(2), ['right', 'down']);
  b.click(at(9, 9));
  assert.deepStrictEqual(b.run(4), ['select', 'select up after 33']);

  // The right button takes the cursor back to the hero.
  b.click(at(1, 1)); b.run(2);
  b.play.right(at(4, 4));
  assert.deepStrictEqual(b.run(2), ['jump 5,2']);
}

{
  // Where the state allows no jump, arrows take the cursor there, along the line.
  const b = battle('move', { cell: at(5, 2), hero: at(5, 2), canJump: false });
  b.click(at(7, 3));
  assert.deepStrictEqual(b.run(2), ['right', 'down', 'right']);
}

{
  // Cannons: a commit is one shot; the right button does nothing.
  const b = battle('cannon', { cell: at(5, 2) });
  b.click(at(5, 2));
  b.play.right(at(5, 2));
  assert.deepStrictEqual(b.run(4), ['select', 'select up after 33']);
}

{
  // Tile placement: the piece follows the pointer by arrows only, kept on the map; a commit holds Select past the engine's 500 ms,
  // so the piece drops, and the page lets go by itself. The pointer moves nothing while Select is held.
  const b = battle('tile', { cell: at(5, 5), piece: L });
  b.play.hover(at(8, 5));
  b.play.hover(at(10, 10));
  assert.deepStrictEqual(b.run(2), ['right', 'right', 'right', 'down', 'down', 'right', 'down', 'down']);
  assert.deepStrictEqual(b.cell, at(9, 9));
  b.click(at(10, 10));
  b.play.hover(at(2, 2));
  const held = b.run(30);
  assert.strictEqual(held.length, 2);
  assert.strictEqual(held[0], 'select');
  assert.ok(+held[1].match(/^select up after (\d+)$/)[1] > 500, held[1]);
  assert.deepStrictEqual(b.cell, at(9, 9));

  // The right button turns the piece: a tap of Select, let go a tick after its press, since the engine turns a piece only on a
  // release it takes in a later tick.
  b.play.leave();
  b.play.right(at(4, 4));
  assert.deepStrictEqual(b.run(4), ['select', 'select up after 33']);

  // With no hover, the first click brings the piece's middle to the cell and a second one drops it.
  b.click(at(3, 4));
  assert.deepStrictEqual(b.run(2), ['left', 'up', 'left', 'up', 'left', 'up', 'left', 'up', 'left', 'up', 'left']);
  assert.deepStrictEqual(b.cell, at(3, 4));
  b.click(at(3, 4));
  assert.strictEqual(b.run(3)[0], 'select');
}

{
  // A state whose arrows cycle through targets: a click presses the cycle's key until the cursor is on the cell, and a second click
  // there commits. A cell that is no target comes round once and stops where it began, unless the engine listed its targets.
  const targets = [at(3, 3), at(6, 2), at(8, 8)];
  const b = battle('item', { cell: at(3, 3), hero: at(3, 3), targets: 'cycle', cycle: targets });
  b.play.hover(at(6, 2));
  assert.deepStrictEqual(b.run(2), []); // no hover in a cycle
  b.click(at(8, 8));
  assert.deepStrictEqual(b.run(6), ['down', 'down']);
  assert.deepStrictEqual(b.cell, at(8, 8));
  b.click(at(1, 1));
  assert.deepStrictEqual(b.run(10), ['down', 'down', 'down']);
  assert.deepStrictEqual(b.cell, at(8, 8));
  b.click(at(8, 8));
  assert.deepStrictEqual(b.run(4), ['select', 'select up after 33']);
  b.choices = targets; b.run();
  b.click(at(1, 1));
  assert.deepStrictEqual(b.run(6), []);
}

{
  // A direction state: a cell next to the hero picks that direction, other cells do nothing, and a click on the picked direction's
  // cell, or on the cursor along it, commits.
  const b = battle('skill', { cell: at(5, 5), hero: at(5, 5), targets: 'direction' });
  b.click(at(6, 5));
  assert.deepStrictEqual(b.run(2), ['right']);
  assert.deepStrictEqual(b.cell, at(7, 5));
  b.click(at(8, 8));
  b.click(at(6, 6));
  assert.deepStrictEqual(b.run(2), []);
  b.click(at(7, 5));
  assert.deepStrictEqual(b.run(4), ['select', 'select up after 33']);
  b.play.hover(at(5, 4));
  assert.deepStrictEqual(b.run(2), ['up']);
}

{
  // While a rejoin drives the keys, and where the battle has no pointer state, the pointer does nothing.
  const b = battle('move', { cell: at(5, 2), hero: at(5, 2) });
  b.blocked = true;
  b.play.hover(at(8, 8)); b.click(at(8, 8)); b.click(at(5, 2)); b.play.right(at(5, 2));
  assert.deepStrictEqual(b.run(3), []);
  b.blocked = false;
  b.state = null;
  b.run();
  b.play.hover(at(1, 1)); b.click(at(1, 1));
  assert.deepStrictEqual(b.run(3), []);
}

console.log('pointer play ok');
