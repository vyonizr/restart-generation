// The gamepad (CONTEXT.md): one pad presses Start, answers the CPU players box and plays the game, with the keys the touch pad
// presses. It is read once per animation frame from the moment the page opens, and it never vibrates.
import { VK } from '../emu/host.js';
import { page, padSession } from './page.svelte.js';
import { javaKey, padKey } from './keys.js';
import { botQuestion } from './bots.js';
import { touch } from './device.js';
import { stayAwake, needsVideo } from './wake.js';
import { soundContext } from './audio.js';
import { NO_DIRECTION, nextDirection } from './direction.js';
import { BUTTONS, usable } from './pads.js';

const RELEASED = { select: false, back: false, menu: false, up: false, down: false, left: false, right: false, x: 0, y: 0 };
const CONNECTED = 'Gamepad connected.', DISCONNECTED = 'Gamepad disconnected.';

let pressStart = null;
let index = null; // the pad in use: its index in navigator.getGamepads(), or null until a usable pad sends a press
// The pad in use's buttons and stick in the last frame, copied, since Firefox and Safari change a Gamepad in place. Null after
// the page let go of every press: the next frame is taken as it is, so a button still held presses nothing until pressed again.
let last = null;
let direction = NO_DIRECTION;
const sent = new Map(); // control -> the Java key code its press sent, so the release lets go of that key even after a rebind
const seen = new Map(); // while no pad is in use: each usable pad's last frame, to find the next one that sends a press
let early = null; // the sound, if the first gamepad started it before Start
let connectedTimer = 0;

const read = pad => {
  const now = { x: pad.axes[0] ?? 0, y: pad.axes[1] ?? 0 };
  for (const [control, i] of Object.entries(BUTTONS)) now[control] = Boolean(pad.buttons[i]?.pressed);
  return now;
};
const stick = s => nextDirection(NO_DIRECTION, s).held;
const pressed = (now, before) => Object.keys(BUTTONS).some(c => now[c] && !before[c]) || Boolean(stick(now) && !stick(before));

// The game's sound: Start's, or the one the first gamepad started before it. A browser may refuse it until a user action it
// counts, so gamepad presses, key presses and clicks retry it.
const sound = () => padSession.current?.audio.ctx ?? early;
function resumeSound() {
  const ctx = sound();
  if (ctx && ctx.state !== 'running') ctx.resume();
}
function wake() {
  resumeSound();
  if (touch && sound() && needsVideo()) stayAwake();
}

// The notice line takes a gamepad notice only when it's empty or holds the other one, so it never replaces another notice.
function notice(text) {
  if (page.notice && page.notice.text !== CONNECTED && page.notice.text !== DISCONNECTED) return;
  clearTimeout(connectedTimer);
  page.notice = { text, actions: [] };
  if (text === CONNECTED) connectedTimer = setTimeout(() => { if (page.notice?.text === CONNECTED) page.notice = null; }, 3000);
}

// "Gamepad disconnected." stays until the next input from any source: a key, a touch pad press or a gamepad press.
export function dismissDisconnected() {
  if (page.notice?.text === DISCONNECTED) page.notice = null;
}

// Sends a press to whatever takes input now: the CPU players box, Start, or the game.
function press(control) {
  wake();
  page.input = 'gamepad';
  dismissDisconnected();
  if (botQuestion.pad(control)) return;
  if (page.start) {
    if (!page.dialogs && (control === 'select' || control === 'menu')) pressStart();
    return;
  }
  const session = padSession.current;
  if (!session || !page.playing) return;
  const code = control === 'menu' ? VK.ESCAPE : padKey(control, page.keys);
  sent.set(control, code);
  session.presses.press(code);
}

function release(control) {
  if (!sent.has(control)) return; // the press went to Start or the CPU players box, or the page already let go of it
  padSession.current.presses.release(sent.get(control));
  sent.delete(control);
}

function letGo() {
  for (const control of [...sent.keys()]) release(control);
  last = null;
}

function frame() {
  requestAnimationFrame(frame);
  let pads;
  try { pads = navigator.getGamepads(); } catch { return; } // a frame that may not use gamepads
  if (index === null) {
    // The next usable pad that sends a press becomes the pad in use, and that press counts.
    for (const pad of pads) {
      if (!usable(pad)) continue;
      const now = read(pad), before = seen.get(pad.index) ?? RELEASED;
      seen.set(pad.index, now);
      if (index === null && pressed(now, before)) index = pad.index;
    }
    if (index === null) return;
    seen.clear();
    last = RELEASED;
    direction = NO_DIRECTION;
    notice(CONNECTED);
  }
  const pad = pads[index];
  if (!pad) return;
  const now = read(pad);
  if (!last) {
    last = now;
    direction = nextDirection(NO_DIRECTION, now);
    return;
  }
  for (const control of ['select', 'back', 'menu']) {
    if (now[control] && !last[control]) press(control);
    else if (!now[control] && last[control]) release(control);
  }
  const held = direction.held;
  direction = nextDirection(direction, now);
  if (direction.held !== held) {
    if (held) release(held);
    if (direction.held) press(direction.held);
  }
  last = now;
}

// The AudioContext the first usable gamepad started, or null: Start plays the game's sound through it.
export const gamepadSound = () => early;

// Watches the gamepads from the moment the page opens until it unloads. start presses Start.
export function watchGamepad(start) {
  if (!navigator.getGamepads) return;
  pressStart = start;
  // Safari counts only this event as a user action from a gamepad, for 5 s, so the sound starts here, before Start; on a touch
  // device the screen stays awake from then on.
  addEventListener('gamepadconnected', e => {
    if (!usable(e.gamepad)) return;
    if (!sound()) {
      early = soundContext();
      if (touch) stayAwake();
    }
    wake();
  });
  addEventListener('gamepaddisconnected', e => {
    seen.delete(e.gamepad.index);
    if (e.gamepad.index !== index) return;
    letGo();
    index = null;
    // The pads still connected must send a new press to take over: a button already held doesn't count.
    for (const pad of navigator.getGamepads()) if (usable(pad)) seen.set(pad.index, read(pad));
    if (page.playing) notice(DISCONNECTED);
  });
  addEventListener('blur', letGo);
  document.addEventListener('visibilitychange', () => { if (document.hidden) letGo(); });
  // The legend shows the keys again at the next key press.
  addEventListener('keydown', e => {
    if (javaKey(e)) page.input = 'keys';
    dismissDisconnected();
    resumeSound();
  });
  addEventListener('click', resumeSound);
  requestAnimationFrame(frame);
}
