// The replay page (CONTEXT.md "Replay"): fetches the replay, gets the game files as the game page does (gamefiles.js), and runs the
// engine in its replay player (player mode, docs/re/re_replay.md) with our own controls, which behave as the original player's
// did (replayflow.js).
import { GameHost } from '../emu/host.js';
import { page } from './page.svelte.js';
import { loadFiles, source } from './gamefiles.js';
import { serverStatus } from './online.js';
import { ReplaySound } from './audio.js';
import { createScreen } from './screen.js';
import { stayAwake } from './wake.js';
import { touch } from './device.js';
import { createReplayFlow } from './replayflow.js';
import { BUTTONS, usable } from './pads.js';

const VOLUME = 0.8;

export const replay = $state({
  meta: null,        // what the server keeps beside the replay: players, heroes, seats, environment, kind, date, result
  gone: false,       // the replay doesn't exist, is 30 days old, or replays are off on this server
  loaded: false,     // the engine has built the replay's battle: the controls work
  unplayable: false, // the engine never built it (replayflow.js): the overlay says so and the engine stops
  playing: false,
  ended: false,      // the end screen is up
  time: 0, length: 0, // whole seconds from BattleBegin
  skipEmpty: true, doubleSpeed: false, // the engine's defaults
  volume: VOLUME, muted: false,
});

let flow = null, sound = null, onWatch = null;
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
  try { await main(canvas); } catch (e) { stopped(e); }
}

async function main(canvas) {
  const [server, found] = await Promise.all([serverStatus(), fetch(`replay/${encodeURIComponent(id)}/data`, { cache: 'no-store' })]);
  page.server = server;
  page.ownCopy = !server?.servesGame;
  if (!found.ok) {
    replay.gone = true;
    page.status = server?.replays === false ? 'This server keeps no replays.' : 'This replay is gone. Replays are kept for 30 days.';
    return;
  }
  const { text, meta } = await found.json();
  replay.meta = meta;
  const files = await loadFiles();
  page.status = 'Starting the engine…';
  await new Promise(r => setTimeout(r));
  const game = new GameHost(files, { log: s => console.debug('[rg]', s), language: (navigator.language || 'en').slice(0, 2), replay: text });
  try {
    game.boot(); // its first step allocates the emulator's memory, so game.m is unset if that fails
  } catch (e) {
    if (!(e instanceof RangeError && !game.m)) throw e;
    page.status = "This device doesn't have enough free memory for the game. Close other apps and tabs, then reload.";
    page.recover = true;
    return;
  }
  const screen = createScreen(canvas);
  page.status = 'Ready';
  page.start = true;
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

  let t0 = performance.now();
  const frame = now => {
    try {
      // As the game page: at most one tick per frame, when the engine's clock is behind real time, and no catch-up bursts.
      if (game.time < now - t0) {
        game.tick();
        if (game.time < now - t0) t0 = now - game.time;
        screen.paint(game);
      }
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

// ---- the controls (replayflow.js), which do nothing until the replay has loaded ----

export const togglePlay = () => flow?.togglePlay();
export const watchAgain = () => flow?.watchAgain();
export const seek = seconds => flow?.seek(seconds);
export const holdSlider = () => flow?.hold();
export const releaseSlider = () => flow?.release();
export const step = direction => flow?.step(direction);
export const setSkipEmpty = on => flow?.setSkipEmpty(on);
export const setDoubleSpeed = on => flow?.setDoubleSpeed(on);
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

// Space plays or pauses, the arrows seek by 5 seconds, F switches double speed, M mutes, wherever focus is, except for the keys the
// focused element uses itself: every key in a text field, Space and Enter on a button or link, the arrows on a slider.
function onKey(e) {
  if (e.ctrlKey || e.metaKey || e.altKey || e.target.closest?.('dialog, .login')) return;
  const t = e.target;
  const own = t.matches?.('textarea, input:not([type=range])') || (t.matches?.('button, a') && (e.key === ' ' || e.key === 'Enter'))
    || (t.matches?.('input[type=range]') && e.key.startsWith('Arrow'));
  const act = { ' ': togglePlay, ArrowLeft: () => step(-1), ArrowRight: () => step(1), f: () => setDoubleSpeed(!replay.doubleSpeed),
    F: () => setDoubleSpeed(!replay.doubleSpeed), m: toggleMute, M: toggleMute }[e.key];
  if (own || !act) return;
  e.preventDefault();
  page.input = 'keys';
  sound?.ctx.resume();
  act();
}

// A gamepad, as on the game page (pads.js): the bottom button starts the replay, then plays or pauses it; the D-pad's left and
// right seek.
function watchGamepad() {
  const READ = { select: BUTTONS.select, left: BUTTONS.left, right: BUTTONS.right };
  const was = {};
  const poll = () => {
    const pad = [...(navigator.getGamepads?.() ?? [])].find(usable);
    for (const [control, index] of Object.entries(READ)) {
      const down = Boolean(pad?.buttons[index]?.pressed);
      if (down && !was[control]) {
        page.input = 'gamepad';
        sound?.ctx.resume();
        if (control !== 'select') step(control === 'left' ? -1 : 1);
        else if (page.start) pressWatch();
        else togglePlay();
      }
      was[control] = down;
    }
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
}
