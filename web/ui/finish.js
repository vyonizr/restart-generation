// The Screen finish (CONTEXT.md): how the game screen is shown, 'soft' (the default) or 'sharp'. It is a display setting, so it stays in this
// browser and doesn't follow an account. `rg:finish` has no dot, so the saved-game code (gamefiles.js) never takes it for a game file.
import { page } from './page.svelte.js';

const KEY = 'rg:finish';
// Device pixels per game pixel from which the pixel grid stays clean. Below it the grid beats against the pixel pitch and shimmers;
// soft scaling alone is used there. Looked at live: 2.5 (a 480 px screen at 1.25x) is clean, 1.7 (a 329 px one) shimmers.
export const GRID_MIN_PITCH = 2.4;
try { if (localStorage.getItem(KEY) === 'sharp') page.finish = 'sharp'; } catch { /* storage blocked: soft, for this visit */ }

export function toggleFinish() {
  page.finish = page.finish === 'soft' ? 'sharp' : 'soft';
  try { localStorage.setItem(KEY, page.finish); } catch { /* storage blocked: the choice lasts until the page closes */ }
}

// One game pixel's cell of the soft finish's grid, `size` device pixels square, as stage.css draws it: across the cell, clear for
// 55%, then darkening to black at 22% at its right edge, and the same down to its bottom edge; read at each pixel's middle. Footage
// (footage.js) and the guide's pictures (GuideDialog.svelte) draw it themselves. Made once per size: the guide asks for one per
// picture, and making it was half of what a soft picture cost.
const cells = new Map();
export function gridCell(size) {
  if (cells.has(size)) return cells.get(size);
  const shade = k => Math.max(0, ((k + 0.5) / size - 0.55) / 0.45) * 0.22;
  const cell = new OffscreenCanvas(size, size), ctx = cell.getContext('2d'), image = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) image.data[(y * size + x) * 4 + 3] = Math.round((1 - (1 - shade(x)) * (1 - shade(y))) * 255);
  ctx.putImageData(image, 0, 0);
  cells.set(size, cell);
  return cell;
}
