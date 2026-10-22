// One press count per Java key code, shared by the keyboard, the touch pad and the gamepad: the engine sees a key go down at its
// first press and up at its last release, so letting go of one input doesn't release a key another still holds.
// game and input (the queue applied at the start of each tick) come from the running game (game.js). ch and loc are the
// keyboard's typed character and key location; the other inputs leave them to the engine's defaults.
export function createPresses(game, input) {
  const count = new Map(); // Java key code -> inputs holding it
  return {
    // Whether the engine sees this press: a key another input already holds doesn't go down again.
    press(code, ch, loc) {
      const n = (count.get(code) ?? 0) + 1;
      count.set(code, n);
      if (n === 1) input.push(() => game.key(true, code, ch, loc));
      return n === 1;
    },
    release(code, ch, loc) {
      const n = count.get(code);
      if (!n) return; // already let go of by releaseAll
      if (n > 1) { count.set(code, n - 1); return; }
      count.delete(code);
      input.push(() => game.key(false, code, ch, loc));
    },
    // Lets go of every key, for every input: the page lost focus.
    releaseAll() {
      count.clear();
      input.push(() => game.releaseAll());
    },
  };
}
