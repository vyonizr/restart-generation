// The question at a friendly Start with 2 or 3 people in the room: should bots fill the empty seats? (docs/adr/0037) Select
// answers with the highlighted button (it starts on Yes) and Back answers No, as in the game, with the player's custom keys.
import { page } from '../page.svelte.js';
import { action } from '../input/keys.js';

let done = null;

function finish(answer) {
  if (!done) return;
  const resolve = done;
  done = null;
  page.bots = null;
  resolve(answer);
}

// Left highlights No and Right highlights Yes, and the focused button follows the highlight.
const move = yes => { page.bots.yes = yes; };

export const answerBots = finish;

// Captured at the window by BotsDialog, so wherever focus is, no key reaches the game's listeners while the box is open.
// Key-ups still pass, which lets go of the Select that pressed Start.
export function botsKey(e) {
  if (!done) return;
  e.preventDefault(); e.stopImmediatePropagation();
  if (e.repeat) return;
  botQuestion.pad(action(e, page.keys));
}

// What the SNAP client (shared/snap.js) calls as `snap.bots`.
export const botQuestion = {
  // answer resolves with true (Yes) or false (No), or null if close() ends the question.
  ask() {
    page.bots = { yes: true };
    return { answer: new Promise(resolve => { done = resolve; }), close: () => finish(null) };
  },
  // The touch pad and the gamepad while the question is open: Select, Back, Left and Right answer it, and no press reaches the game.
  pad(key) {
    if (!done) return false;
    if (key === 'select') finish(page.bots.yes); else if (key === 'back') finish(false); else if (key === 'left') move(false); else if (key === 'right') move(true);
    return true;
  },
};
