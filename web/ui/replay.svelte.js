// The replay page (CONTEXT.md "Replay"): fetches the replay, gets the game files as the game page does (gamefiles.js), and runs the
// engine in its replay player (player mode, docs/re/re_replay.md) with our own controls, which behave as the original player's
// did (replayflow.js). Download replay renders it to an MP4 file on the same engine (footage.js, docs/adr/0028).
import { GameHost } from '../emu/host.js';
import { page } from './page.svelte.js';
import { loadFiles, source } from './gamefiles.js';
import { serverStatus } from './online.js';
import { ReplaySound } from './audio.js';
import { createScreen } from './screen.js';
import { stayAwake } from './wake.js';
import { touch } from './device.js';
import { createReplayFlow } from './replayflow.js';
import { BUTTONS, SHOULDERS, usable } from './pads.js';
import { footageName } from '../replay-text.js';
// Footage needs Mediabunny (footage.js), so it comes in a chunk of its own, after the page, and only to a page that can use it.
const footageModule = () => import('./footage.js');

const VOLUME = 0.8;

export const replay = $state({
  meta: null,        // what the server keeps beside the replay: players, heroes, seats, environment, kind, date, result, marks
  gone: false,       // the replay doesn't exist, is 30 days old, or replays are off on this server
  booted: false,     // the engine is up: Watch and Download replay work
  loaded: false,     // the engine has built the replay's battle: the controls work
  unplayable: false, // the engine never built it (replayflow.js): the overlay says so and the engine stops
  playing: false,
  ended: false,      // the end screen is up
  time: 0, length: 0, // whole seconds from BattleBegin
  skipEmpty: true, doubleSpeed: false, // the engine's defaults
  volume: VOLUME, muted: false,
  // Download replay: 'checking' whether this browser can encode it, 'insecure' (WebCodecs is for secure pages only, which a LAN
  // address over plain HTTP isn't), 'unsupported', 'ready', 'rendering', or 'failed' (with `error`).
  // `progress` is 0 to 1 and `left` the seconds still to go, once there is a rate to tell from.
  footage: { status: 'checking', progress: 0, left: null, error: '' },
});

// `exporting` while Download replay runs, from its press; `taken` once the render has the engine to itself.
let flow = null, sound = null, onWatch = null, game = null, screen = null, exporting = null, taken = false;
export const pressWatch = () => onWatch?.();

const id = decodeURIComponent(location.pathname.split('/').filter(Boolean).at(-1) ?? '');

function stopped(e) {
  console.error(e);
  page.overlay = true; page.start = false; page.pick = false;
  page.status = 'The replay stopped. Reload to try again.';
  page.recover = true;
  page.forgettable = source === 'stored' || source === 'picked';
}

export async function startReplay(canvas) {
  watchGamepad(); // from the start, so its press can start the replay too
  if (!isSecureContext) replay.footage.status = 'insecure';
  else footageModule().then(m => m.canExportFootage(), () => false).then(can => { replay.footage.status = can ? 'ready' : 'unsupported'; });
  try { await main(canvas); } catch (e) { stopped(e); }
}

async function main(canvas) {
  const [server, found] = await Promise.all([serverStatus(), fetch(`replay/${encodeURIComponent(id)}/data`, { cache: 'no-store' })]);
  page.server = server;
  page.ownCopy = !server?.servesGame;
  if (!found.ok) {
    replay.gone = true;
    page.status = server?.replays === false ? 'This server keeps no replays.' : ''; // the title says the rest
    return;
  }
  const { text, meta } = await found.json();
  replay.meta = meta;
  const files = await loadFiles();
  page.status = 'Starting the engine…';
  await new Promise(r => setTimeout(r));
  game = new GameHost(files, { log: s => console.debug('[rg]', s), language: (navigator.language || 'en').slice(0, 2), replay: text });
  try {
    game.boot(); // its first step allocates the emulator's memory, so game.m is unset if that fails
  } catch (e) {
    if (!(e instanceof RangeError && !game.m)) throw e;
    page.status = "This device doesn't have enough free memory for the game. Close other apps and tabs, then reload.";
    page.recover = true;
    return;
  }
  screen = createScreen(canvas);
  page.status = 'Ready';
  page.start = true;
  replay.booted = true;
  // The engine starts on Watch: the browser plays sound only from a press, and the original player played from its first frame.
  await new Promise(resolve => {
    onWatch = () => {
      onWatch = null;
      page.start = false;
      sound = new ReplaySound(game);
      sound.volume = replay.muted ? 0 : replay.volume;
      sound.ctx.resume(); // inside the press, or Safari keeps it silent
      if (touch) stayAwake();
      resolve();
    };
  });
  page.overlay = false;
  flow = createReplayFlow(replay, game);
  addEventListener('keydown', onKey);
  addEventListener('click', () => sound.ctx.resume(), { capture: true });

  let t0 = performance.now(), resync = false;
  const frame = now => {
    try {
      // Footage has the engine to itself, and leaves its clock wherever it stopped.
      if (taken) { resync = true; requestAnimationFrame(frame); return; }
      if (resync) { t0 = now - game.time; resync = false; }
      // As the game page: at most one tick per frame, when the engine's clock is behind real time, and no catch-up bursts.
      if (game.time < now - t0) {
        game.tick();
        if (game.time < now - t0) t0 = now - game.time;
        screen.paint(game);
      }
      // Paused, the music and the battle's sounds stop with it; before the battle is built there is nothing to pause.
      sound.paused = replay.loaded && !replay.playing;
      sound.pump();
      flow.frame();
      if (replay.unplayable) { unplayable(); return; }
      requestAnimationFrame(frame);
    } catch (e) { stopped(e); }
  };
  requestAnimationFrame(frame);
}

// The engine ran 10 s without building the replay's battle, so it never will: say so where Watch was, and stop the engine.
function unplayable() {
  sound.ctx.suspend();
  page.overlay = true;
  page.status = "The game couldn't load this replay.";
}

// ---- the controls (replayflow.js), which do nothing until the replay has loaded, nor while footage is rendered ----

const idle = () => exporting ? null : flow;
export const togglePlay = () => idle()?.togglePlay();
export const watchAgain = () => idle()?.watchAgain();
export const seek = seconds => idle()?.seek(seconds);
export const holdSlider = () => idle()?.hold();
export const releaseSlider = () => idle()?.release();
export const step = direction => idle()?.step(direction);
export const jumpMark = direction => idle()?.jump(direction);
export const toMark = at => idle()?.toMark(at);
export const setSkipEmpty = on => idle()?.setSkipEmpty(on);
export const setDoubleSpeed = on => idle()?.setDoubleSpeed(on);
export function setVolume(v) {
  replay.volume = v;
  replay.muted = v === 0;
  if (sound) sound.volume = v;
}
export function toggleMute() {
  replay.muted = !replay.muted;
  if (!replay.muted && replay.volume === 0) replay.volume = VOLUME;
  if (sound) sound.volume = replay.muted ? 0 : replay.volume;
}

// ---- footage (CONTEXT.md "Footage"): rendered on the page's own engine, which then waits at 0 for Play ----

const confirmLeave = e => { e.preventDefault(); e.returnValue = ''; };

// Renders the footage and saves it; resolves true once it is saved, false if it was canceled or failed. Pressed before Watch, it
// starts the replay as Watch does (this press lets its sound play later) and waits for the battle to be built, as the page's
// controls need it afterwards.
export async function exportFootage() {
  const f = replay.footage;
  if (exporting || !replay.booted || replay.unplayable || f.status !== 'ready') return false;
  exporting = new AbortController();
  const { signal } = exporting;
  Object.assign(f, { status: 'rendering', progress: 0, left: null, error: '' });
  addEventListener('beforeunload', confirmLeave);
  if (touch) stayAwake();
  pressWatch();
  const started = performance.now();
  try {
    await new Promise(resolve => {
      const check = () => replay.loaded || replay.unplayable || signal.aborted ? resolve() : requestAnimationFrame(check);
      check();
    });
    signal.throwIfAborted();
    if (replay.unplayable) throw new Error("The game couldn't load this replay.");
    const { renderFootage } = await footageModule();
    taken = true;
    // The finish the page shows (stage.css): soft, except where the visitor asks for more contrast
    const soft = page.finish === 'soft' && !matchMedia('(prefers-contrast: more)').matches;
    const blob = await renderFootage(game, { soft, signal, progress: p => {
      f.progress = p;
      f.left = p >= 0.05 ? Math.ceil((performance.now() - started) / 1000 / p * (1 - p)) : null;
      screen.paint(game); // the battle races by under the progress bar
    } });
    save(blob, footageName(replay.meta));
    f.status = 'ready';
    return true;
  } catch (e) {
    if (signal.aborted) { f.status = 'ready'; return false; }
    console.error(e);
    Object.assign(f, { status: 'failed', error: failure(e) });
    return false;
  } finally {
    removeEventListener('beforeunload', confirmLeave);
    exporting = null;
    if (taken) {
      taken = false;
      // The engine boots again for footage; one that couldn't, as main() tells it, or never rebuilt the battle can't play on.
      if (game.m && game.replayLoaded) {
        sound.caughtUp();
        flow.restart();
        screen.paint(game);
      } else Object.assign(replay, { loaded: false, unplayable: true });
    } else if (replay.loaded) flow.restart(); // canceled before the render began: still at 0 and paused, as after one
  }
}
export const cancelFootage = () => exporting?.abort();
export function dismissFootage() {
  Object.assign(replay.footage, { status: 'ready', error: '' });
}

const failure = e => e instanceof RangeError ? 'This device ran out of memory. Close other apps and tabs, then try again.'
  : e?.message || String(e);

// As Download my data (accounts.js), with the address kept a minute: a large file can still be being written when the click returns.
function save(blob, name) {
  const url = URL.createObjectURL(blob);
  Object.assign(document.createElement('a'), { href: url, download: name }).click();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

// Space plays or pauses, the arrows seek by 5 seconds, Shift and an arrow go to the previous or next mark, F switches double speed,
// M mutes, wherever focus is, except for the keys the focused element uses itself: every key in a text field, Space and Enter on a
// button or link, the arrows on the volume slider (the time slider steps by 1 s only to show a mark's second, ReplayControls.svelte).
function onKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('dialog, .login')) return;
  const t = e.target;
  const own = t.matches?.('textarea, input:not([type=range])') || (t.matches?.('button, a') && (e.key === ' ' || e.key === 'Enter'))
    || (t.matches?.('input[type=range]:not(.time)') && e.key.startsWith('Arrow'));
  const keys = e.shiftKey && e.key.startsWith('Arrow') ? { ArrowLeft: () => jumpMark(-1), ArrowRight: () => jumpMark(1) }
    : { ' ': togglePlay, ArrowLeft: () => step(-1), ArrowRight: () => step(1), f: () => setDoubleSpeed(!replay.doubleSpeed),
      F: () => setDoubleSpeed(!replay.doubleSpeed), m: toggleMute, M: toggleMute };
  const act = keys[e.key];
  if (own || !act) return;
  e.preventDefault();
  page.input = 'keys';
  sound?.ctx.resume();
  act();
}

// A gamepad, as on the game page (pads.js): the bottom button starts the replay, then plays or pauses it; the D-pad's left and
// right seek, and the shoulder buttons go to the previous or next mark.
function watchGamepad() {
  const READ = { select: BUTTONS.select, left: BUTTONS.left, right: BUTTONS.right, ...SHOULDERS };
  const was = {};
  const poll = () => {
    const pad = [...(navigator.getGamepads?.() ?? [])].find(usable);
    for (const [control, index] of Object.entries(READ)) {
      const down = Boolean(pad?.buttons[index]?.pressed);
      if (down && !was[control]) {
        page.input = 'gamepad';
        sound?.ctx.resume();
        if (control === 'previous' || control === 'next') jumpMark(control === 'previous' ? -1 : 1);
        else if (control !== 'select') step(control === 'left' ? -1 : 1);
        else if (page.start) pressWatch();
        else togglePlay();
      }
      was[control] = down;
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
}
