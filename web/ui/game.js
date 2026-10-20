// Browser host: gets the game files, runs the engine in the emulator, draws frames to the canvas, forwards the keyboard and
// the touch pad and plays the engine's 8 kHz PCM through WebAudio. What the player sees goes through `page` (page.svelte.js).
import { GameHost, WIDTH, HEIGHT, UNLOCKS, LONE_START } from '../emu/host.js';
import { SnapClient } from '../snap.js';
import { page } from './page.svelte.js';
import { touch } from './device.js';
import { javaKey, PAD } from './keys.js';
import { Audio } from './audio.js';
import { stayAwake, needsVideo } from './wake.js';
import { loadFiles, store, forgetCopy, source } from './gamefiles.js';
import { createAccounts } from './accounts.svelte.js';
import { createNameLogin, showOnlineName } from './login.svelte.js';
import { botQuestion } from './bots.svelte.js';

let ctx, image, rgba;

function draw(game) {
  const px = game.pixels;
  for (let i = 0; i < px.length; i++) {
    const v = px[i];
    rgba[i] = 0xff000000 | ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff);
  }
  ctx.putImageData(image, 0, 0);
}

// ---- touch pad: one control per finger; sliding a finger moves the press to the control under it ----
function bindPad(game, input, audio, botQuestion) {
  const pad = document.querySelector('.pad');
  const presses = new Map(), fingers = new Map(); // data-key -> press count, pointerId -> data-key
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
  const setFinger = (id, k) => {
    const old = fingers.get(id);
    if (old === k) return;
    if (old) release(old);
    if (k) { fingers.set(id, k); press(k); } else fingers.delete(id);
  };
  const under = e => document.elementFromPoint(e.clientX, e.clientY)?.closest('.pad [data-key]')?.dataset.key;
  pad.addEventListener('pointerdown', e => {
    if (audio.ctx.state !== 'running') audio.ctx.resume(); // Safari suspends sound until a tap
    if (needsVideo()) stayAwake();
    if (!e.target.closest('[data-key]')) return;
    pad.setPointerCapture(e.pointerId);
    setFinger(e.pointerId, under(e));
  });
  // A press follows the finger from control to control, except Select and Back, which a drifting finger must never press or
  // lose: each starts only from a touch that begins on it and lasts until the finger lifts. So a drift while holding Select to
  // drop a block can't press an arrow, and a slide from an arrow, or across the middle, never presses Select or Back.
  const fixed = new Set(['select', 'back']);
  pad.addEventListener('pointermove', e => {
    if (!fingers.has(e.pointerId) || fixed.has(fingers.get(e.pointerId))) return;
    const k = under(e);
    if (!fixed.has(k)) setFinger(e.pointerId, k);
  });
  for (const t of ['pointerup', 'pointercancel']) pad.addEventListener(t, e => setFinger(e.pointerId, null));
  // An app switch mid-press might never send pointerup, so lift every finger.
  const liftAll = () => { for (const id of [...fingers.keys()]) setFinger(id, null); };
  addEventListener('blur', liftAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) liftAll(); });
  pad.addEventListener('mousedown', e => e.preventDefault()); // keeps focus in the typing field, so pad taps don't hide the keyboard
  document.addEventListener('visibilitychange', () => { if (!document.hidden) stayAwake(); });

  // Keyboard: a hidden field raises the system keyboard; each typed character goes to the game as a key press.
  const typing = document.getElementById('typing'), type = document.getElementById('type');
  type.onclick = () => document.activeElement === typing ? typing.blur() : typing.focus();
  typing.addEventListener('focus', () => type.classList.add('held'));
  typing.addEventListener('blur', () => type.classList.remove('held'));
  // The system keyboard's own key events are unreliable on Android, so text and Backspace come from input events instead.
  // Enter and an attached keyboard's arrows, Shift and Esc still reach the game as key events.
  for (const t of ['keydown', 'keyup']) typing.addEventListener(t, e => { if (e.key.length === 1 || e.key === 'Backspace') e.stopPropagation(); });
  typing.addEventListener('beforeinput', e => {
    e.preventDefault();
    for (const key of e.inputType === 'deleteContentBackward' ? ['Backspace'] : [...(e.data || '')]) {
      const k = javaKey({ key });
      if (k) input.push(() => { game.key(true, k.code, k.ch, 1); if (k.ch !== 0xffff) game.typed(k.ch); game.key(false, k.code, k.ch, 1); });
    }
    typing.value = ' '; // ponytail: a space keeps Backspace firing on an empty field; IME composition isn't handled
  });

  // Fullscreen: Android and iPad; iPhone Safari can't make a page element fullscreen.
  const full = document.getElementById('fullscreen'), root = document.querySelector('.page');
  full.hidden = !(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  full.onclick = () => {
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (root.requestFullscreen || root.webkitRequestFullscreen).call(root);
  };
}

// A one-line notice under the pad when the device can't run the game at full speed.
function slowNotice() {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  page.slow = 'This device is running the game slowly.'
    + (ios ? ' If Lockdown Mode is on, exclude this site in Settings > Privacy & Security > Lockdown Mode.' : '');
}

// Whether the server can run bots (GET /bots).
const botsAvailable = () => fetch('bots').then(r => r.json()).then(b => b.available, () => false);

// What the server says about itself (GET /status): whether it has accounts, and who is online. Null on a static host with no server.
const serverStatus = () => fetch('status', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(s => (typeof s?.accounts === 'boolean' ? s : null), () => null);

// With accounts the engine logs in as the page's guest or member, with no dialog: the token goes in the password slot (ADR 0011).
function accountLogin(accounts) {
  const { account } = accounts;
  return { startLogin(ready) { ready(); }, stopLogin() {}, visible: () => false, attempting() {}, rejected() { accounts.rejected(); },
    credentials: () => ({ username: account.name, password: account.token }), name: () => '', forget() {} };
}

// The Start button's click. Sound and the wake video must start inside the tap itself, or Safari blocks them.
let onStart = null;
export const pressStart = () => onStart?.();

async function main(canvas) {
  const server = await serverStatus();
  page.server = server;
  page.ownCopy = !server?.servesGame;
  const accounts = server?.accounts ? createAccounts() : null;
  const accountReady = accounts?.start();
  const files = await loadFiles();
  page.ownCopy = source !== 'server';
  await accountReady;
  page.status = 'Starting the engine…';
  await new Promise(r => setTimeout(r));
  const login = accounts ? accountLogin(accounts) : createNameLogin(), snap = new SnapClient({ url: 'snap', ui: login, log: s => console.warn('[snap]', s) });
  const bots = await botsAvailable();
  if (bots) snap.bots = botQuestion;
  const patches = [...UNLOCKS, ...(bots ? LONE_START : [])];
  const game = new GameHost(files, { log: s => console.debug('[rg]', s), language: (navigator.language || 'en').slice(0, 2), snap: snap.methods(), patches });
  snap.attach(game);
  try {
    game.boot(); // its first step allocates the emulator's memory, so game.m is unset if that fails
  } catch (e) {
    if (e instanceof RangeError && !game.m) return fail("This device doesn't have enough free memory for the game. Close other apps and tabs, then reload.", e, false);
    throw e;
  }
  page.status = 'Ready';
  page.start = true;
  if (!accounts) showOnlineName();
  let audio;
  await new Promise(r => {
    onStart = () => {
      onStart = null;
      audio = new Audio(game);
      audio.ctx.resume();
      if (touch) stayAwake();
      r();
    };
  });
  page.overlay = false;
  page.playing = true;
  canvas.focus();
  accounts?.watch();

  const held = new Set();
  const input = []; // applied at the start of each tick
  // Keys go to the game wherever focus is on the page, except in a dialog or the overlay's buttons.
  addEventListener('keydown', e => {
    const k = javaKey(e);
    if (!k || e.target.closest?.('.login, #overlay')) return;
    e.preventDefault();
    if (held.has(e.code)) return;      // the Java listener ignored auto-repeat too
    held.add(e.code);
    const loc = e.location === 2 ? 3 : e.location === 1 ? 2 : 1;
    input.push(() => { game.key(true, k.code, k.ch, loc); if (k.ch !== 0xffff) game.typed(k.ch); });
  });
  addEventListener('keyup', e => {
    const k = javaKey(e);
    if (!k || e.target.closest?.('.login, #overlay')) return;
    e.preventDefault();
    held.delete(e.code);
    const loc = e.location === 2 ? 3 : e.location === 1 ? 2 : 1;
    input.push(() => game.key(false, k.code, k.ch, loc));
  });
  addEventListener('blur', () => { held.clear(); input.push(() => game.releaseAll()); });
  canvas.addEventListener('pointerdown', () => canvas.focus());
  if (touch) bindPad(game, input, audio, botQuestion);

  // Settings, achievements and saves: every 5 s, and the moment the page hides, since a hidden phone tab may never come back.
  const saveNow = () => { for (const f of game.dirtyFiles()) store.set(f.name, f.data); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
  addEventListener('pagehide', saveNow);

  // Slowness: a second is slow if the game advanced less than half a second in it; ten slow seconds in a
  // row show the notice once.
  let slowRun = 0, lastTime = game.time;
  const slowTimer = touch && setInterval(() => {
    const advanced = game.time - lastTime;
    lastTime = game.time;
    if (document.hidden) return;
    slowRun = advanced < 500 ? slowRun + 1 : 0;
    if (slowRun >= 10) { clearInterval(slowTimer); slowNotice(); }
  }, 1000);

  let t0 = performance.now();
  let lastSave = 0, frames = 0, statT = t0, statI = 0;
  const frame = now => {
    try {
      if (++frames % 60 === 0) { // exposed for debugging and the headless browser test
        const ic = game.m.cpu.icount;
        window.rgStats = { fps: +(60000 / (now - statT)).toFixed(1), mips: +((ic - statI) / (now - statT) / 1000).toFixed(1),
          lag: Math.round(now - t0 - game.time), heap: Math.round(game.m.heap.top / 2 ** 20) };
        statT = now; statI = ic;
      }
      // At most one tick per frame, when the engine's clock is behind real time; each tick sleeps the
      // engine to its next frame. A late frame slows the game instead of bursting catch-up ticks.
      if (game.time < now - t0) {
        while (input.length) input.shift()();
        game.tick(); snap.pump();
        if (game.time < now - t0) t0 = now - game.time; // drop the backlog
        draw(game); // the framebuffer only changes inside a tick
      }
      audio.pump();
      if (now - lastSave > 5000) { lastSave = now; saveNow(); }
      requestAnimationFrame(frame);
    } catch (e) {
      fail('The game stopped. Reload to try again.', e);
    }
  };
  requestAnimationFrame(frame);
}

// Shows an error with a way out: reload, or forget the stored copy and choose another (unless the copy isn't at fault).
function fail(message, e, forgettable = true) {
  console.error(e);
  page.overlay = true; page.start = false; page.pick = false;
  page.status = message;
  page.recover = true;
  page.forgettable = forgettable && (source === 'stored' || source === 'picked');
}

// Starts the page: the canvas is the game screen.
export function startGame(canvas) {
  ctx = canvas.getContext('2d');
  image = ctx.createImageData(WIDTH, HEIGHT);
  rgba = new Uint32Array(image.data.buffer);
  main(canvas).catch(e => fail("The game couldn't start with this copy.", e));
}

// The recovery buttons of the failure screen.
export const reload = () => location.reload();
export const useDifferentCopy = () => forgetCopy().finally(reload);
