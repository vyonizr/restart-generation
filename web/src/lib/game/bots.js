// The question at a friendly Start with 2 or 3 people in the room: should bots fill the empty seats? A player alone chooses the
// CPU level instead. Select answers with the highlighted button (it starts on CPU) and Back answers No, as in the game, with the
// player's custom keys.
import { page } from '../page.svelte.js';
import { action } from '../input/keys.js';

const choices = alone => (alone ? ['cpu', 'expert'] : ['none', 'cpu', 'expert']);
let done = null;

function finish(answer) {
  if (!done) return;
  const resolve = done;
  done = null;
  page.bots = null;
  resolve(answer);
}

// Left and right move the highlight, and the focused button follows it.
function move(step) {
  const list = choices(page.bots.alone);
  page.bots.focus = list[Math.max(0, Math.min(list.length - 1, list.indexOf(page.bots.focus) + step))];
}

export const answerBots = finish;

// Captured at the window by BotsDialog, so wherever focus is, no key reaches the game's listeners while the box is open.
// Key-ups still pass, which lets go of the Select that pressed Start.
export function botsKey(e) {
  if (!done) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.repeat) return;
  const a = action(e, page.keys);
  if (a === 'select') finish(page.bots.focus);
  else if (a === 'back') finish('none');
  else if (a === 'left') move(-1);
  else if (a === 'right') move(1);
}

// What the SNAP client (shared/snap.js) calls as `snap.bots`.
export const botQuestion = {
  // answer resolves with 'none', 'cpu' or 'expert', or null if close() ends the question. A player alone has no 'none' button,
  // and Back there drops the Start.
  ask(alone = false) {
    page.bots = { alone, focus: 'cpu' };
    return { answer: new Promise(resolve => { done = resolve; }), close: () => finish(null) };
  },
  // The touch pad and the gamepad while the question is open: Select, Back, Left and Right answer it, and no press reaches the game.
  pad(key) {
    if (!done) return false;
    if (key === 'select') finish(page.bots.focus); else if (key === 'back') finish('none'); else if (key === 'left') move(-1); else if (key === 'right') move(1);
    return true;
  },
};
