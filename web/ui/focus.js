// Where focus goes when a dialog closes or the player changes their name: the game screen, or the Start button. The components
// register their element with `use:focusTarget={'start'}`; plain code asks with focusOn('start').
const elements = new Map();

export function focusTarget(el, name) {
  elements.set(name, el);
  return { destroy() { elements.delete(name); } };
}

export const focusOn = name => elements.get(name)?.focus();
