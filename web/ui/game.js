// Browser host: gets the game files, runs the engine in the emulator, draws frames to the canvas, forwards the keyboard, the
// touch pad and the gamepad and plays the engine's 8 kHz PCM through WebAudio. What the player sees goes through `page`
// (page.svelte.js).
import { GameHost, UNLOCKS, LONE_START } from '../emu/host.js';
import { createScreen } from './screen.js';
import { SnapClient } from '../snap.js';
import { page, padSession } from './page.svelte.js';
import { touch } from './device.js';
import { javaKey, customKeys } from './keys.js';
import { Audio } from './audio.js';
import { stayAwake } from './wake.js';
import { loadFiles, overlaySaved, store, forgetCopy, source } from './gamefiles.js';
import { syncProgress, track, upload } from './progress.js';
import { createAccounts } from './accounts.js';
import { createNameLogin, showOnlineName } from './login.js';
import { botQuestion } from './bots.js';
import { watchGamepad, gamepadSound } from './gamepad.js';
import { createPresses } from './presses.js';
import { replaySaved, battleJoined } from './replaynotice.js';
import { startOnlineCount, serverStatus } from './online.js';

let screen; // the game screen, which paints the engine's frame (screen.js)

// A one-line notice under the pad when the device can't run the game at full speed.
function slowNotice() {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  page.slow = 'This device is running the game slowly.'
    + (ios ? ' If Lockdown Mode is on, exclude this site in Settings > Privacy & Security > Lockdown Mode.' : '');
}

// Whether the server can run bots (GET /bots).
const botsAvailable = () => fetch('bots').then(r => r.json()).then(b => b.available, () => false);

// With accounts the engine logs in as the page's guest or member, with no dialog: the token goes in the password slot (ADR 0011).
function accountLogin(accounts) {
  const { account } = accounts;
  return { startLogin(ready) { ready(); }, stopLogin() {}, visible: () => false, attempting() {}, rejected() { accounts.rejected(); },
    credentials: () => ({ username: account.name, password: account.token }), name: () => '', forget() {} };
}

// The Start button's click, or a gamepad's press of it (gamepad.js). Sound and the wake video must start inside the press itself,
// or Safari blocks them.
let onStart = null;
export const pressStart = () => onStart?.();

async function main(canvas) {
  const server = await serverStatus();
  page.server = server;
  if (server) startOnlineCount(server.online);
  page.ownCopy = !server?.servesGame; // set once and kept: a copy this browser stored earlier doesn't bring the notice back
  const accounts = server?.accounts ? createAccounts() : null;
  const accountReady = accounts?.start();
  const files = await loadFiles();
  await accountReady;
  if (accounts?.account.member) await syncProgress(accounts.account);
  overlaySaved(files);
  page.keys = customKeys(files['settings.cfg']);
  page.status = 'Starting the engine…';
  await new Promise(r => setTimeout(r));
  const login = accounts ? accountLogin(accounts) : createNameLogin();
  const snap = new SnapClient({ url: 'snap', ui: { ...login, replaySaved, battleJoined }, log: s => console.warn('[snap]', s) });
  const bots = await botsAvailable();
  if (bots) snap.bots = botQuestion;
  // Every story and hero is open only on a server that isn't public (ADR 0007); elsewhere they are earned.
  const patches = [...(server?.unlockAll ? UNLOCKS : []), ...(bots ? LONE_START : [])];
  window.rgPatches = patches.map(p => p.what); // exposed for debugging, like rgStats
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
      page.start = false;
      audio = new Audio(game, gamepadSound());
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
  const presses = createPresses(game, input);
  // Keys go to the game wherever focus is on the page, except in a dialog or the overlay's buttons.
  addEventListener('keydown', e => {
    const k = javaKey(e);
    if (!k || e.target.closest?.('.login, #overlay, .finish')) return;
    e.preventDefault();
    if (held.has(e.code)) return;      // the Java listener ignored auto-repeat too
    held.add(e.code);
    const loc = e.location === 2 ? 3 : e.location === 1 ? 2 : 1;
    presses.press(k.code, k.ch, loc);
  });
  addEventListener('keyup', e => {
    const k = javaKey(e);
    if (!k || e.target.closest?.('.login, #overlay, .finish')) return;
    e.preventDefault();
    if (!held.delete(e.code)) return; // its press never reached the game
    const loc = e.location === 2 ? 3 : e.location === 1 ? 2 : 1;
    presses.release(k.code, k.ch, loc);
  });
  addEventListener('blur', () => { held.clear(); presses.releaseAll(); });
  canvas.addEventListener('pointerdown', () => canvas.focus());
  padSession.current = { game, input, audio, presses };

  // Settings, achievements and saves: every 5 s, and the moment the page hides, since a hidden phone tab may never come back.
  // The settings file also holds the custom keys, which the controls legend and the touch pad follow.
  const saveNow = () => {
    for (const f of game.dirtyFiles()) {
      store.set(f.name, f.data); track(f.name, f.data);
      if (f.name.toLowerCase() === 'settings.cfg') page.keys = customKeys(f.data);
    }
  };
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
      if (++frames % 60 === 0) { // exposed for debugging and the end-to-end tests, which wait on the engine's own clock (time, ms)
        const ic = game.m.cpu.icount;
        window.rgStats = { fps: +(60000 / (now - statT)).toFixed(1), mips: +((ic - statI) / (now - statT) / 1000).toFixed(1),
          lag: Math.round(now - t0 - game.time), heap: Math.round(game.m.heap.top / 2 ** 20), time: game.time };
        statT = now; statI = ic;
      }
      // At most one tick per frame, when the engine's clock is behind real time; each tick sleeps the
      // engine to its next frame. A late frame slows the game instead of bursting catch-up ticks.
      if (game.time < now - t0) {
        while (input.length) input.shift()();
        const running = game.tick(); snap.pump();
        if (!running) { clearInterval(slowTimer); quit(saveNow, snap); return; } // the loop stops here: no more ticks, input or saves
        if (game.unsaved('settings.cfg')) saveNow(); // the player left the settings: show their keys at once
        if (game.time < now - t0) t0 = now - game.time; // drop the backlog
        screen.paint(game); // the framebuffer only changes inside a tick
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

// Quit (CONTEXT.md, docs/re/re_quit.md): the engine has ended, so save, leave Arena and start the page over as a refresh would.
async function quit(saveNow, snap) {
  page.playing = false;
  page.overlay = true; page.start = false;
  page.status = 'Saving your game…';
  saveNow();
  if (snap.loggedIn) await snap.signOut(false).catch(() => {}); // best effort: the server drops a silent session after 45 s
  await retryQuit();
}

// A member's latest files must reach the server first, or its older copy wins at the next start (ADR 0014).
export async function retryQuit() {
  page.unsent = false;
  page.status = 'Saving your game…';
  if (await upload()) return reload();
  page.status = "Your latest progress didn't reach the server and will be lost if you quit now.";
  page.unsent = true;
}

// Starts the page: the canvas is the game screen.
export function startGame(canvas) {
  screen = createScreen(canvas);
  watchGamepad(pressStart); // from the start, so the first gamepad press can start the sound while the game loads
  main(canvas).catch(e => fail("The game couldn't start with this copy.", e));
}

// The recovery buttons of the failure screen; Reload is also Quit anyway.
export const reload = () => location.reload();
export const useDifferentCopy = () => forgetCopy().finally(reload);
