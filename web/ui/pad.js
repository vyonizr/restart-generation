// The touch pad's pointer handling: one control per finger; sliding a finger moves the press to the control under it.
// It works on elements it is given and returns a function that takes every listener off again. Pad.svelte draws the pad.
import { javaKey, PAD } from './keys.js';
import { stayAwake, needsVideo } from './wake.js';
import { botQuestion } from './bots.js';

// pad: the .pad element; typing: the hidden field that raises the system keyboard; typeButton: the Keyboard control.
// game, input (the queue applied at the start of each tick) and audio come from the running game (game.js).
export function bindPad({ pad, typing, typeButton, game, input, audio }) {
  const ac = new AbortController(), { signal } = ac;
  const presses = new Map(), fingers = new Map(); // data-key -> press count, pointerId -> data-key (undefined over empty space)
  const button = k => pad.querySelector(`[data-key="${k}"]`);
  const press = k => {
    if (botQuestion.pad(k)) return;
    presses.set(k, (presses.get(k) || 0) + 1);
    if (presses.get(k) > 1) return;
    input.push(() => game.key(true, PAD[k], 0xffff, 1));
    button(k).classList.add('held');
    navigator.vibrate?.(8);
  };
  const release = k => {
    if (!presses.has(k)) return; // a press the bot question took never reached the game
    if (presses.get(k) > 1) { presses.set(k, presses.get(k) - 1); return; }
    presses.delete(k);
    input.push(() => game.key(false, PAD[k], 0xffff, 1));
    button(k).classList.remove('held');
  };
  // k is the control under the finger, or undefined over empty space (the D-pad's middle and corners): the finger keeps its
  // place, so a slide across the middle presses the next arrow it reaches.
  const setFinger = (id, k) => {
    const old = fingers.get(id);
    if (old === k) return;
    if (old) release(old);
    fingers.set(id, k);
    if (k) press(k);
  };
  const lift = id => { const old = fingers.get(id); fingers.delete(id); if (old) release(old); };
  const under = e => document.elementFromPoint(e.clientX, e.clientY)?.closest('.pad [data-key]')?.dataset.key;
  pad.addEventListener('pointerdown', e => {
    if (audio.ctx.state !== 'running') audio.ctx.resume(); // Safari suspends sound until a tap
    if (needsVideo()) stayAwake();
    if (!e.target.closest('[data-key]')) return;
    pad.setPointerCapture(e.pointerId);
    setFinger(e.pointerId, under(e));
  }, { signal });
  // A press follows the finger from control to control, except Select and Back, which a drifting finger must never press or
  // lose: each starts only from a touch that begins on it and lasts until the finger lifts. So a drift while holding Select to
  // drop a block can't press an arrow, and a slide from an arrow never presses Select or Back.
  const fixed = new Set(['select', 'back']);
  pad.addEventListener('pointermove', e => {
    if (!fingers.has(e.pointerId) || fixed.has(fingers.get(e.pointerId))) return;
    const k = under(e);
    if (!fixed.has(k)) setFinger(e.pointerId, k);
  }, { signal });
  for (const t of ['pointerup', 'pointercancel']) pad.addEventListener(t, e => lift(e.pointerId), { signal });
  // An app switch mid-press might never send pointerup, so lift every finger.
  const liftAll = () => { for (const id of [...fingers.keys()]) lift(id); };
  addEventListener('blur', liftAll, { signal });
  document.addEventListener('visibilitychange', () => { if (document.hidden) liftAll(); else stayAwake(); }, { signal });
  pad.addEventListener('mousedown', e => e.preventDefault(), { signal }); // keeps focus in the typing field, so pad taps don't hide the keyboard

  // Keyboard: the hidden field raises the system keyboard; each typed character goes to the game as a key press.
  typeButton.addEventListener('click', () => document.activeElement === typing ? typing.blur() : typing.focus(), { signal });
  typing.addEventListener('focus', () => typeButton.classList.add('held'), { signal });
  typing.addEventListener('blur', () => typeButton.classList.remove('held'), { signal });
  // The system keyboard's own key events are unreliable on Android, so text and Backspace come from input events instead.
  // Enter and an attached keyboard's arrows, Shift and Esc still reach the game as key events.
  for (const t of ['keydown', 'keyup']) typing.addEventListener(t, e => { if (e.key.length === 1 || e.key === 'Backspace') e.stopPropagation(); }, { signal });
  typing.addEventListener('beforeinput', e => {
    e.preventDefault();
    for (const key of e.inputType === 'deleteContentBackward' ? ['Backspace'] : [...(e.data || '')]) {
      const k = javaKey({ key });
      if (k) input.push(() => { game.key(true, k.code, k.ch, 1); if (k.ch !== 0xffff) game.typed(k.ch); game.key(false, k.code, k.ch, 1); });
    }
    typing.value = ' '; // ponytail: a space keeps Backspace firing on an empty field; IME composition isn't handled
  }, { signal });

  return () => ac.abort();
}

// Fullscreen: Android and iPad; iPhone Safari can't make a page element fullscreen.
export const canFullscreen = () => Boolean(document.fullscreenEnabled || document.webkitFullscreenEnabled);

export function toggleFullscreen() {
  const root = document.querySelector('.page');
  if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
  else (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
}
