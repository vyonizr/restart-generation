// Pointer play (CONTEXT.md, docs/adr/0039) on the game screen of a desktop: the pointer's events on the canvas become the cells of
// the battlefield and, through pointer-logic.js, the engine's own cursor moves and Select presses, in the press queue the keys, the
// touch pad and the gamepad share (presses.js). The directions press the player's custom keys and Select presses Enter, which the
// engine keeps whatever the player chose (keys.js). The page draws nothing of its own: the engine draws its cursor, its route and
// its reach area, and the system pointer stays as it is.
import { battlePointer } from '../../../../shared/emu/pointer.js';
import { createPlay, screenPoint, boardCell, hovers } from './pointer-logic.js';
import { padKey } from './keys.js';
import { page } from '../page.svelte.js';

// Arms pointer play on the canvas, or returns null where this copy lacks the engine bytes it relies on (shared/emu/pointer.js, which
// warns which). blocked() is true while the page drives the keys itself (a rejoin). The game loop calls afterTick() after every
// engine tick; outside a rejoin it also has the battle pointer warn once in a battle where it never finds the local player's input,
// a battle that describe() names. `battle` is the battle pointer itself, for window.rgDebug (game.js).
export function attachPointer({ game, canvas, presses, blocked, describe }) {
  const battle = battlePointer(game);
  if (!battle) return null;
  let view = null; // the battle's state as the frame on screen shows it, or null where the pointer does nothing
  const play = createPlay({
    jump: (x, y) => battle.jump(x, y),
    press: action => presses.press(padKey(action, page.keys)),
    release: action => presses.release(padKey(action, page.keys)),
    blocked,
  });
  const cellOf = e => {
    if (!view) return null;
    const box = canvas.getBoundingClientRect();
    return boardCell(screenPoint(e.clientX - box.left, e.clientY - box.top, box, canvas, view.screen), view);
  };
  canvas.addEventListener('pointermove', e => play.hover(hovers(page.battle, e.pointerType) ? cellOf(e) : null));
  canvas.addEventListener('pointerdown', e => {
    if (e.button === 0) {
      canvas.setPointerCapture(e.pointerId); // a release off the screen still comes here, to cancel the press
      play.down(cellOf(e));
    } else if (e.button === 2) play.right(cellOf(e));
  });
  canvas.addEventListener('pointerup', e => { if (e.button === 0) play.up(cellOf(e)); });
  canvas.addEventListener('pointercancel', () => play.leave());
  canvas.addEventListener('pointerleave', () => play.leave());
  canvas.addEventListener('contextmenu', e => e.preventDefault()); // the right button is the game's over the game screen
  return {
    battle,
    afterTick() {
      view = battle.read();
      play.tick(view, game.time);
      if (!blocked()) battle.afterTick(describe);
    },
  };
}
