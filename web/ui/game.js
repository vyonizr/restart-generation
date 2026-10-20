// Browser host: gets the game files, runs the engine in the emulator, draws frames to the canvas, forwards the keyboard and
// the touch pad and plays the engine's 8 kHz PCM through WebAudio. What the player sees goes through `page` (page.svelte.js).
import { GameHost, WIDTH, HEIGHT, UNLOCKS, LONE_START } from '../emu/host.js';
import { SnapClient } from '../snap.js';
import { page, padSession } from './page.svelte.js';
import { touch } from './device.js';
import { javaKey } from './keys.js';
import { Audio } from './audio.js';
import { stayAwake } from './wake.js';
import { loadFiles, overlaySaved, store, forgetCopy, source } from './gamefiles.js';
import { syncProgress, track } from './progress.js';
import { createAccounts } from './accounts.js';
import { createNameLogin, showOnlineName } from './login.js';
import { botQuestion } from './bots.js';
import { startOnlineCount } from './online.js';

let ctx, image, rgba;

function draw(game) {
  const px = game.pixels;
  for (let i = 0; i < px.length; i++) {
    const v = px[i];
    rgba[i] = 0xff000000 | ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff);
  }
  ctx.putImageData(image, 0, 0);
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
  if (server) startOnlineCount(server.online);
  page.ownCopy = !server?.servesGame; // set once and kept: a copy this browser stored earlier doesn't bring the notice back
  const accounts = server?.accounts ? createAccounts() : null;
  const accountReady = accounts?.start();
  const files = await loadFiles();
  await accountReady;
  if (accounts?.account.member) await syncProgress(accounts.account);
  overlaySaved(files);
  page.status = 'Starting the engine…';
  await new Promise(r => setTimeout(r));
  const login = accounts ? accountLogin(accounts) : createNameLogin(), snap = new SnapClient({ url: 'snap', ui: login, log: s => console.warn('[snap]', s) });
  const bots = await botsAvailable();
  if (bots) snap.bots = botQuestion;
  // Every story and hero is open only on a server that isn't public (ADR 0007); elsewhere they are earned.
  const patches = [...(server?.unlockAll ? UNLOCKS : []), ...(bots ? LONE_START : [])];
  window.rgPatches = patches.map(p => p.what); // exposed for debugging and the headless browser test, like rgStats
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
    if (!k || e.target.closest?.('.login, #overlay, .finish')) return;
    e.preventDefault();
    if (held.has(e.code)) return;      // the Java listener ignored auto-repeat too
    held.add(e.code);
    const loc = e.location === 2 ? 3 : e.location === 1 ? 2 : 1;
    input.push(() => { game.key(true, k.code, k.ch, loc); if (k.ch !== 0xffff) game.typed(k.ch); });
  });
  addEventListener('keyup', e => {
    const k = javaKey(e);
    if (!k || e.target.closest?.('.login, #overlay, .finish')) return;
    e.preventDefault();
    held.delete(e.code);
    const loc = e.location === 2 ? 3 : e.location === 1 ? 2 : 1;
    input.push(() => game.key(false, k.code, k.ch, loc));
  });
  addEventListener('blur', () => { held.clear(); input.push(() => game.releaseAll()); });
  canvas.addEventListener('pointerdown', () => canvas.focus());
  if (touch) padSession.current = { game, input, audio };

  // Settings, achievements and saves: every 5 s, and the moment the page hides, since a hidden phone tab may never come back.
  const saveNow = () => { for (const f of game.dirtyFiles()) { store.set(f.name, f.data); track(f.name, f.data); } };
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
