// The Board view (CONTEXT.md): 'full', the whole battlefield on a 420 × 378 screen, or 'classic', the phone's 240 × 320. It frames
// a battle only: outside one every screen is 240 × 320, and the toggle shows only during one (docs/adr/0044). A desktop starts on the
// Full board; a phone or tablet (device.js) on Classic, since a 420-pixel-wide board on a phone's width comes out smaller than the
// engine drew it and costs a slow phone a third more per tick. It is a display setting, so it stays in this browser like the Screen
// finish (finish.js). The engine takes a change between two ticks (docs/adr/0017); a princess's rescue or a fight that is playing
// finishes first. `rg:board` has no dot, so the saved-game code (game-files.js) never takes it for a game file.
import { page } from '../page.svelte.js';
import { touch } from '../device.js';

const KEY = 'rg:board';
// The game screen's frame in game pixels for each view.
export const FRAMES = { full: { width: 420, height: 378 }, classic: { width: 240, height: 320 } };

page.board = touch ? 'classic' : 'full';
try { const saved = localStorage.getItem(KEY); if (Object.hasOwn(FRAMES, saved ?? '')) page.board = saved; } catch { /* storage blocked: the default, for this visit */ }

export function setBoard(view) {
  page.board = view;
  try { localStorage.setItem(KEY, view); } catch { /* storage blocked: the choice lasts until the page closes */ }
}
export const toggleBoard = () => setBoard(page.board === 'full' ? 'classic' : 'full');

// The view the game screen is framed for now: the battle's own while one is on, else the phone's. A copy that can't show the Full
// board has no battle view (GameHost.inBattle stays false), so it stays on 240 × 320 throughout.
export const frameView = () => page.battle ?? 'classic';
