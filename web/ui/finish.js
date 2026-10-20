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
