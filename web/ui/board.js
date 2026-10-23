// The Board view (CONTEXT.md): 'full', the whole battlefield on a 420 × 378 screen (the default), or 'classic', the phone's 240 × 320.
// It is a display setting, so it stays in this browser like the Screen finish (finish.js), and the engine takes it as a battle
// starts, so a change during a battle applies from the next one (docs/adr/0017). `rg:board` has no dot, so the saved-game code
// (gamefiles.js) never takes it for a game file.
import { page } from './page.svelte.js';

const KEY = 'rg:board';
export const BOARD_NAMES = { full: 'Full board', classic: 'Classic' };
// The game screen's frame in game pixels for each view.
export const FRAMES = { full: { width: 420, height: 378 }, classic: { width: 240, height: 320 } };

try { if (localStorage.getItem(KEY) === 'classic') page.board = 'classic'; } catch { /* storage blocked: Full board, for this visit */ }

export function setBoard(view) {
  page.board = view;
  try { localStorage.setItem(KEY, view); } catch { /* storage blocked: the choice lasts until the page closes */ }
  // The notice that a change waits for the next battle goes when the choice changes again; it says so again if it still waits.
  if (page.notice?.board) page.notice = null;
  if (page.battle && page.battle !== view) {
    page.notice = { board: true, text: `${BOARD_NAMES[view]} takes effect from your next battle.`, actions: [{ label: 'Dismiss', secondary: true }] };
  }
}
export const toggleBoard = () => setBoard(page.board === 'full' ? 'classic' : 'full');

// The view the game screen is framed for now: the battle's own while one is on, else the player's choice, if this copy can show it.
export const frameView = () => page.battle ?? (page.boardable ? page.board : 'classic');
