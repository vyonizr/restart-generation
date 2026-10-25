// The one direction a gamepad holds: its D-pad and left stick count as one input, and the direction pressed most recently counts.
const DIRECTIONS = ['up', 'down', 'left', 'right'];
const PRESS = 0.5, RELEASE = 0.3; // how far the stick goes before it presses a direction, and back before it lets go
const KEEP = Math.cos((45 + 10) * Math.PI / 180); // a held direction keeps its 90° sector widened by 10° on each side
const UNIT = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] }; // the stick's y axis points down

// The stick's direction: the nearer of the four once it's past PRESS, and the one it holds while it stays above RELEASE and in
// that one's sector.
function stickDirection(x, y, held) {
  const r = Math.hypot(x, y);
  if (held && r >= RELEASE && (x * UNIT[held][0] + y * UNIT[held][1]) / r >= KEEP) return held;
  if (r <= PRESS) return null;
  return Math.abs(x) > Math.abs(y) ? (x < 0 ? 'left' : 'right') : (y < 0 ? 'up' : 'down');
}

// order: what holds a direction, in the order it was pressed: D-pad directions, and 'stick' for the stick's. stick: the stick's
// direction, or null. held: the direction that counts, or null.
export const NO_DIRECTION = { order: [], stick: null, held: null };

// The next frame's state from the last one and the pad: its D-pad buttons (up, down, left, right) and its left stick (x, y).
export function nextDirection(last, pad) {
  const stick = stickDirection(pad.x, pad.y, last.stick);
  const order = last.order.filter(d => (d === 'stick' ? stick === last.stick : pad[d]));
  for (const d of DIRECTIONS) if (pad[d] && !order.includes(d)) order.push(d);
  if (stick && !order.includes('stick')) order.push('stick');
  const top = order.at(-1);
  return { order, stick, held: (top === 'stick' ? stick : top) ?? null };
}
