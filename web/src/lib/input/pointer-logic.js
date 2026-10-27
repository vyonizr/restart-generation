// Pointer play (CONTEXT.md, docs/adr/0039) apart from the page's events (pointer.js): which cell a point on the game screen is, and
// what the pointer does there. The engine takes keys only, so the pointer moves the engine's own cursor, by one arrow press for each
// cell or by a jump the engine plans a route for, and presses Select. The battle's state comes from shared/emu/pointer.js, read
// between ticks; what the page sends shows in a read the tick after next, so until then the page goes by where it sent the cursor.
import { cellAt } from '../../../../shared/emu/pointer.js';

const HOLD_MS = 600;   // a piece drops when Select is held past 500 ms of the engine's time, and a shorter press turns it
const LATENCY = 2;     // ticks until a read shows a press or a jump: the engine takes a key event in the tick after it gets it
const MAX_CYCLE = 64;  // presses a target cycle may take before the page gives up, should it never come back to its start
const FORWARD = 'down'; // in a cycle Down and Right go forward, Up and Left back

// A point the pointer is at: x and y from the canvas box's top left corner in CSS pixels, the box's CSS size, the canvas's size in
// its own pixels, which the box scales (the frame of the board view, board.js), and the engine's screen, which the painter centers
// in the canvas (screen.js). The engine screen pixel under it, or null off the engine's screen.
export function screenPoint(x, y, box, canvas, screen) {
  const px = Math.floor(x * canvas.width / box.width) - ((canvas.width - screen.w) >> 1);
  const py = Math.floor(y * canvas.height / box.height) - ((canvas.height - screen.h) >> 1);
  return px >= 0 && py >= 0 && px < screen.w && py < screen.h ? { x: px, y: py } : null;
}

// The battlefield cell under an engine screen point, from a read of the battle's state; null off the map and on the corner panels,
// which the pointer leaves alone.
export function boardCell(point, view) {
  if (!point) return null;
  if (view.panels?.some(r => point.x >= r.x && point.y >= r.y && point.x < r.x + r.w && point.y < r.y + r.h)) return null;
  const cell = cellAt(point.x, point.y, view);
  return cell.x >= 0 && cell.y >= 0 && cell.x < view.map.cols && cell.y < view.map.rows ? cell : null;
}

// Whether the pointer moves the cursor by hovering: on the Full board with a mouse or a pen. On Classic the camera follows the
// cursor, so a resting pointer would end up over another cell, and a finger has no hover; both move it by clicks.
export const hovers = (battle, pointerType) => battle === 'full' && (pointerType === 'mouse' || pointerType === 'pen');

// The arrows that take the cursor from one cell to another, one cell each, along the straight line between them: each step crosses
// the next cell edge the line crosses, a column's first when both are crossed at once.
export function line(from, to) {
  const dx = to.x - from.x, dy = to.y - from.y, nx = Math.abs(dx), ny = Math.abs(dy), arrows = [];
  for (let ix = 0, iy = 0; ix < nx || iy < ny;) {
    if (iy === ny || (ix < nx && (2 * ix + 1) * ny <= (2 * iy + 1) * nx)) { arrows.push(dx > 0 ? 'right' : 'left'); ix++; }
    else { arrows.push(dy > 0 ? 'down' : 'up'); iy++; }
  }
  return arrows;
}

// The anchor that puts a piece's middle on a cell (the anchor is where the engine keeps the piece; its cells are the anchor plus the
// shape's offsets), kept where the whole piece is on the map: the engine's arrows clamp it there, so an arrow past it would leave the
// piece behind the pointer.
export function anchorFor(cell, view) {
  const shape = view.piece;
  if (!shape?.length) return cell;
  const xs = shape.map(o => o.x), ys = shape.map(o => o.y);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  return { x: clamp(cell.x - Math.floor((x0 + x1) / 2), -x0, view.map.cols - 1 - x1), y: clamp(cell.y - Math.floor((y0 + y1) / 2), -y0, view.map.rows - 1 - y1) };
}

const same = (a, b) => a != null && b != null && a.x === b.x && a.y === b.y;
const near = (a, b) => Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1;
// The direction from one cell to another in its row or column, or null.
const towards = (from, to) => (from == null || to == null || same(from, to) ? null
  : to.x === from.x ? (to.y < from.y ? 'up' : 'down') : to.y === from.y ? (to.x < from.x ? 'left' : 'right') : null);
// How the state's arrows move the cursor: a piece ('tile'), a free cursor ('free'), a direction from the hero ('direction'), or a
// cycle through targets ('cycle').
const kind = view => (view.state === 'tile' || view.state === 'tileItem' ? 'tile' : view.targets);

// The pointer's rules, fed the page's events as cells (null off the battlefield) and a read of the battle after every tick.
// jump(x, y) moves the cursor without arrows and says whether the state allows it; press(action) and release(action) go to the
// shared press queue ('left', 'right', 'up', 'down', 'select'); blocked() is true while the page presses the keys itself (a
// rejoin's drive), when the pointer does nothing.
export function createPlay({ jump, press, release, blocked = () => false }) {
  let view = null, time = 0, ticks = 0;
  let due = 0;         // the tick from which a read shows everything the page sent
  let expect = null;   // until then, where it sent the cursor: a cell (a piece's anchor), or { dir } in a direction state
  let jumpTo = null;   // a jump waiting for arrows in flight, which would land after its write and carry the cursor off
  let last = null;     // the cell the pointer last hovered over, while it hovers
  let downAt;          // the cell where the left button went down (null off the battlefield), undefined while it is up
  let commit = null;   // a click's commit, waiting for the cursor to land on its cell
  let cycle = null;    // a target cycle under way: { goal, start, presses }
  let hold = null;     // while the page holds Select: until a tick count ({ ticks }) for a tap, or an engine time ({ time }) for a drop
  let reaim = false;   // a turned piece has a new shape, so it is centered on the pointer again

  const settled = () => ticks >= due;
  const sent = () => { due = ticks + LATENCY; };
  const tap = action => { press(action); release(action); };
  // Select is let go a tick after its press: a piece turns only on a release the engine takes in a later tick than the press.
  const select = (until = { ticks: ticks + 1 }) => { press('select'); hold = until; };
  // The cursor (a piece's anchor) once what the page sent has landed.
  const cursor = () => jumpTo ?? (!settled() && expect && !expect.dir ? expect : view.cell);
  const direction = () => (!settled() && expect?.dir) || towards(view.hero, view.cell);
  // In a direction state a cell next to the hero picks its direction, and the cursor's own cell the direction it is in.
  const picks = cell => (!view.hero || !(near(cell, view.hero) || same(cell, view.cell)) ? null : towards(view.hero, cell));
  // Whether a click on the cell is on the cursor, so it commits.
  const onCursor = cell => {
    switch (kind(view)) {
      case 'tile': return same(anchorFor(cell, view), cursor());
      case 'free': return same(cell, cursor());
      case 'direction': { const d = picks(cell); return d !== null && d === direction(); }
      case 'cycle': return same(cell, cycle ? cycle.goal : view.cell);
      default: return false;
    }
  };
  const arrows = (from, to) => {
    const steps = line(from, to);
    if (!steps.length) return;
    for (const a of steps) tap(a);
    expect = to; sent();
  };
  // Moves the cursor to the cell: by arrows when `step` (a piece always), else by a jump, or arrows where the state allows none.
  const moveTo = (cell, step) => {
    commit = null;
    switch (kind(view)) {
      case 'tile': return arrows(cursor(), anchorFor(cell, view));
      case 'free':
        if (same(cell, cursor())) return;
        if (jumpTo || (!step && !settled())) { jumpTo = cell; return; }
        if (step) return arrows(cursor(), cell);
        if (jump(cell.x, cell.y)) { expect = cell; sent(); return; }
        return arrows(view.cell, cell);
      case 'direction': {
        const d = picks(cell);
        if (d && d !== direction()) { tap(d); expect = { dir: d }; sent(); }
        return;
      }
      case 'cycle':
        // A cell that isn't one of the targets the engine lists would only take the cursor round once.
        if (same(cell, view.cell) || (view.choices && !view.choices.some(c => same(c, cell)))) return;
        cycle = { goal: cell, start: null, presses: 0 };
        advance();
    }
  };
  // What waits for the cursor to land: a jump, a target cycle's next press, a turned piece's new place, and a commit.
  const advance = () => {
    if (!settled()) return;
    if (jumpTo) {
      const to = jumpTo;
      jumpTo = null;
      if (jump(to.x, to.y)) { expect = to; sent(); } else arrows(view.cell, to);
      return;
    }
    if (cycle) {
      if (same(view.cell, cycle.goal) || same(view.cell, cycle.start) || cycle.presses >= MAX_CYCLE) cycle = null; // found, or round once: not a target
      else { cycle.start ??= view.cell; cycle.presses++; tap(FORWARD); sent(); return; }
    }
    if (reaim) {
      reaim = false;
      if (last) moveTo(last, true);
      return;
    }
    if (commit) {
      const cell = commit;
      commit = null;
      if (!onCursor(cell)) return; // the cursor went elsewhere, by keys or as the state willed
      if (kind(view) === 'tile') select({ time: time + HOLD_MS }); else select();
      sent();
    }
  };
  const idle = () => !view || blocked() || hold !== null;

  return {
    // After every tick, with the battle's state (null where the pointer does nothing) and the engine's time.
    tick(read, now) {
      ticks++;
      time = now;
      if (hold && (hold.time === undefined ? ticks >= hold.ticks : now >= hold.time)) { release('select'); hold = null; sent(); } // even if the state moved on
      if (!read || !view || read.state !== view.state) { expect = jumpTo = commit = cycle = null; reaim = false; }
      view = read;
      if (!idle()) advance();
    },
    // The pointer moved, hovering, onto the cell (null: off the battlefield, or a pointer that doesn't hover). From the cursor or a
    // cell next to it the cursor follows the pointer's trail; anywhere else (the pointer came onto the board, or keys moved the
    // cursor) it jumps there.
    hover(cell) {
      if (same(cell, last)) return;
      const from = last;
      last = cell;
      if (cell === null || idle() || kind(view) === 'cycle') return;
      moveTo(cell, from !== null && near(from, cursor()));
    },
    down(cell) { downAt = cell; },
    // The left button let go on the cell: a click if it went down on the same cell, which commits on the cursor's cell and moves the
    // cursor anywhere else, by arrows to a cell next to it and by a jump further. A release on another cell cancels the press.
    up(cell) {
      const from = downAt;
      downAt = undefined;
      if (from === undefined || !same(cell, from) || idle()) return;
      if (onCursor(cell)) { commit = cell; advance(); return; }
      moveTo(cell, kind(view) === 'free' && near(cell, cursor()));
    },
    // The right button on the battlefield: it turns a piece (a tap of Select) and takes a hero's cursor back to the hero, which drops
    // the route.
    right(cell) {
      if (cell === null || idle()) return;
      if (kind(view) === 'tile') { select(); sent(); reaim = true; commit = null; }
      else if (view.state === 'move' && view.hero) moveTo(view.hero, false);
    },
    // The pointer left the game screen, or the browser took it over.
    leave() { last = null; downAt = undefined; },
  };
}
