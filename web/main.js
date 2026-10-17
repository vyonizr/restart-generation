// Browser host: downloads the game files, runs the engine in the emulator, draws frames to the
// canvas, forwards the keyboard and the touch pad and plays the engine's 8 kHz PCM through WebAudio.
import { GameHost, WIDTH, HEIGHT, VK, UNLOCKS, LONE_START } from './emu/host.js';
import { SnapClient } from './snap.js';
import { gameFromZip } from './zip.js';

const GAME_URL = 'game/';   // served by server/gateway.js from the user's own copy of the game
const FILES = ['ResetGeneration-Win32-Web.dll', 'settings.cfg', 'achievements.dat', 'base.pak', 'fonts.pak', 'story.pak',
  'intro.pak', 'fight.pak', 'gameplay.pak', 'gameplay2.pak', 'levels.pak', 'menus.pak'];
const OPTIONAL = new Set(['settings.cfg', 'achievements.dat']); // the game creates them if they're missing

const canvas = document.getElementById('screen'), ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay'), status = document.getElementById('status'), startButton = document.getElementById('start');
const image = ctx.createImageData(WIDTH, HEIGHT), rgba = new Uint32Array(image.data.buffer);
// Phones and tablets: the same query shows the touch pad in index.html.
const touch = matchMedia('(hover: none) and (pointer: coarse)').matches;
const TRY_ANOTHER = touch ? 'Try another .zip.' : 'Try another .zip or folder.';

const store = {
  get(name) { try { const v = localStorage.getItem(`rg:${name}`); return v && Uint8Array.from(atob(v), ch => ch.charCodeAt(0)); } catch { return null; } },
  set(name, data) {
    try { data ? localStorage.setItem(`rg:${name}`, btoa(String.fromCharCode(...data))) : localStorage.removeItem(`rg:${name}`); } catch { /* storage full or blocked */ }
  },
  // Every saved game file. The page's own keys (rg:guest, rg:username) have no file extension.
  names() { try { return Object.keys(localStorage).filter(k => k.startsWith('rg:') && k.includes('.')).map(k => k.slice(3)); } catch { return []; } },
};

// The player's own game files, kept in IndexedDB after they choose their game folder once.
function gameStore(mode, op) {
  return new Promise((resolve, reject) => {
    const open = indexedDB.open('rg', 1);
    open.onupgradeneeded = () => open.result.createObjectStore('files');
    open.onerror = () => reject(open.error);
    open.onsuccess = () => {
      const tx = open.result.transaction('files', mode), req = op(tx.objectStore('files'));
      tx.oncomplete = () => resolve(req.result);
      tx.onerror = () => reject(tx.error);
    };
  });
}

// Files served next to the page, as server/gateway.js does from RG_GAME. Null if the host has none.
async function fetchFiles() {
  const files = {};
  let done = 0;
  for (const name of FILES) {
    const res = await fetch(GAME_URL + name);
    if (!res.ok) { if (OPTIONAL.has(name)) continue; return null; }
    files[name] = new Uint8Array(await res.arrayBuffer());
    status.textContent = `Loading game files… ${++done}/${FILES.length}`;
  }
  return files;
}

// Asks the player for the standalone build's .zip or its game folder (the ResetGeneration folder or the one above it).
function pickFiles() {
  const pick = document.getElementById('pick'), zipInput = document.getElementById('pick-zip-input'), dirInput = document.getElementById('pick-input');
  status.textContent = 'Bring your own copy of the game to play';
  pick.hidden = false;
  document.getElementById('pick-zip').focus();
  document.getElementById('pick-zip').onclick = () => zipInput.click();
  document.getElementById('pick-folder').onclick = () => dirInput.click();
  return new Promise(resolve => {
    // found: { lowercase name: Uint8Array or File }
    const use = async (found, what) => {
      const missing = FILES.filter(n => !OPTIONAL.has(n) && !found[n.toLowerCase()]);
      if (missing.length) {
        console.warn('missing game files:', missing.join(', '));
        status.textContent = `That ${what} isn't the Windows standalone build of Reset Generation. ${TRY_ANOTHER}`;
        return;
      }
      pick.hidden = true;
      status.textContent = 'Reading game files…';
      const files = {};
      for (const n of FILES) { const f = found[n.toLowerCase()]; if (f) files[n] = f instanceof Uint8Array ? f : new Uint8Array(await f.arrayBuffer()); }
      resolve(files);
    };
    dirInput.onchange = () => {
      const found = Object.fromEntries([...dirInput.files].map(f => [f.name.toLowerCase(), f]));
      dirInput.value = '';
      use(found, 'folder');
    };
    zipInput.onchange = async () => {
      const file = zipInput.files[0];
      zipInput.value = '';
      if (!file) return;
      status.textContent = 'Unpacking…';
      try {
        const entries = await gameFromZip(new Uint8Array(await file.arrayBuffer()));
        use(Object.fromEntries(Object.entries(entries).map(([n, d]) => [n.toLowerCase(), d])), '.zip');
      } catch (e) { console.warn(e); status.textContent = `Couldn't read ${file.name}. ${TRY_ANOTHER}`; }
    };
  });
}

let source = null; // where the files came from: 'stored', 'server' or 'picked'

async function loadFiles() {
  let files = null;
  try { files = await gameStore('readonly', s => s.get('game')); } catch { /* storage blocked */ }
  source = files ? 'stored' : 'server';
  files ||= await fetchFiles().catch(() => null);
  if (!files) {
    source = 'picked';
    files = await pickFiles();
    try { await gameStore('readwrite', s => s.put(files, 'game')); } catch { /* not kept: the player picks again next visit */ }
  }
  for (const name of store.names()) { const saved = store.get(name); if (saved) files[name] = saved; }
  return files;
}

// ---- keyboard: browser keys to Java KeyEvent codes ----
const KEYS = {
  ArrowLeft: VK.LEFT, ArrowRight: VK.RIGHT, ArrowUp: VK.UP, ArrowDown: VK.DOWN,
  Control: VK.CONTROL, Enter: VK.CONTROL, Shift: VK.SHIFT, Escape: VK.ESCAPE, Backspace: VK.BACK_SPACE, ' ': VK.SPACE,
};
function javaKey(e) {
  if (KEYS[e.key] !== undefined) return { code: KEYS[e.key], ch: e.key === ' ' ? 32 : e.key === 'Backspace' ? 8 : 0xffff };
  if (e.key.length === 1) return { code: e.key.toUpperCase().charCodeAt(0), ch: e.key.charCodeAt(0) };
  return null;
}

// ---- audio: the engine fills 512-sample blocks of 8 kHz mono PCM on demand ----
class Audio {
  constructor(game) {
    this.game = game;
    this.ctx = new AudioContext({ sampleRate: 8000 });
    this.at = 0;
  }
  pump() {
    const ctx = this.ctx;
    if (this.at < ctx.currentTime) this.at = ctx.currentTime + 0.05;
    while (this.at < ctx.currentTime + 0.25) {
      const pcm = this.game.pullSound(), buf = ctx.createBuffer(1, pcm.length, 8000), ch = buf.getChannelData(0);
      for (let i = 0; i < pcm.length; i++) ch[i] = pcm[i] / 32768;
      const src = ctx.createBufferSource();
      src.buffer = buf; src.connect(ctx.destination); src.start(this.at);
      this.at += pcm.length / 8000;
    }
  }
}

// ---- touch pad: one control per finger; sliding a finger moves the press to the control under it ----
const PAD = { left: VK.LEFT, right: VK.RIGHT, up: VK.UP, down: VK.DOWN, select: VK.CONTROL, back: VK.SHIFT, menu: VK.ESCAPE };
const wake = document.getElementById('wake');

// Keeps the screen on: a Wake Lock where the browser has one (secure contexts only), else a hidden video.
// Chrome and Safari hold the screen only for a video that can make sound, and Safari not for a looping one,
// so the video has a silent audio track, plays unmuted, and jumps back before it ends.
wake.addEventListener('timeupdate', () => { if (wake.currentTime > 0.5) wake.currentTime = 0; });
function stayAwake() {
  if (navigator.wakeLock) return navigator.wakeLock.request('screen').catch(() => {});
  if (navigator.audioSession) navigator.audioSession.type = 'ambient'; // mixes with the player's music instead of stopping it
  wake.play().catch(() => {});
}

function bindPad(game, input, audio) {
  const pad = document.querySelector('.pad');
  const presses = new Map(), fingers = new Map(); // data-key -> press count, pointerId -> data-key
  const button = k => pad.querySelector(`[data-key="${k}"]`);
  const press = k => {
    presses.set(k, (presses.get(k) || 0) + 1);
    if (presses.get(k) > 1) return;
    input.push(() => game.key(true, PAD[k], 0xffff, 1));
    button(k).classList.add('held');
    navigator.vibrate?.(8);
  };
  const release = k => {
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
    if (!navigator.wakeLock && wake.paused) stayAwake();
    if (!e.target.closest('[data-key]')) return;
    pad.setPointerCapture(e.pointerId);
    setFinger(e.pointerId, under(e));
  });
  pad.addEventListener('pointermove', e => { if (fingers.has(e.pointerId)) setFinger(e.pointerId, under(e)); });
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
  const full = document.getElementById('fullscreen'), page = document.querySelector('.page');
  full.hidden = !(document.fullscreenEnabled || document.webkitFullscreenEnabled);
  full.onclick = () => {
    if (document.fullscreenElement || document.webkitFullscreenElement) (document.exitFullscreen || document.webkitExitFullscreen).call(document);
    else (page.requestFullscreen || page.webkitRequestFullscreen).call(page);
  };
}

// A one-line notice under the pad when the device can't run the game at full speed.
function slowNotice() {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const note = document.getElementById('slow');
  document.getElementById('slow-text').textContent = 'This device is running the game slowly.'
    + (ios ? ' If Lockdown Mode is on, exclude this site in Settings > Privacy & Security > Lockdown Mode.' : '');
  document.getElementById('slow-close').onclick = () => { note.hidden = true; };
  note.hidden = false;
}

function draw(game) {
  const px = game.pixels;
  for (let i = 0; i < px.length; i++) {
    const v = px[i];
    rgba[i] = 0xff000000 | ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff);
  }
  ctx.putImageData(image, 0, 0);
}

// A guest identity kept in this browser, so online play starts without a login dialog.
// The server registers the name on its first login.
function guestIdentity() {
  try {
    const saved = JSON.parse(localStorage.getItem('rg:guest'));
    if (saved) return saved;
  } catch {}
  const rand = new Uint32Array(5);
  crypto.getRandomValues(rand);
  const guest = { username: `Guest${rand[0] % 1e6}`, password: [...rand.slice(1)].map(n => n.toString(36)).join('') };
  try { localStorage.setItem('rg:guest', JSON.stringify(guest)); } catch {}
  return guest;
}

// The Arena login dialog. It appears only if the guest login is rejected.
function loginUI() {
  const form = document.getElementById('login'), user = document.getElementById('username'), pass = document.getElementById('password');
  const note = document.getElementById('login-note'), cancel = document.getElementById('login-cancel');
  let handlers = null, guest = guestIdentity();
  form.addEventListener('submit', e => {
    e.preventDefault();
    try { localStorage.setItem('rg:username', user.value); } catch {}
    const h = handlers;
    form.hidden = true; canvas.inert = false; canvas.focus();
    h?.ready();
  });
  cancel.addEventListener('click', () => { const h = handlers; ui.stopLogin(); h?.cancel(); });
  form.addEventListener('keydown', e => { if (e.key === 'Escape') cancel.click(); e.stopPropagation(); });
  const ui = {
    startLogin(ready, cancelled) {
      handlers = { ready, cancel: cancelled };
      if (guest) { user.value = guest.username; pass.value = guest.password; ready(); return; }
      try { user.value ||= localStorage.getItem('rg:username') || ''; } catch {}
      note.textContent = 'New names are registered on first login.';
      form.hidden = false; canvas.inert = true;
      (user.value ? pass : user).focus();
    },
    stopLogin() { form.hidden = true; canvas.inert = false; handlers = null; canvas.focus(); },
    visible: () => !form.hidden,
    attempting() { note.textContent = 'Logging in…'; },
    rejected() { if (guest) { guest = null; user.value = pass.value = ''; } },
    credentials: () => ({ username: user.value.trim(), password: pass.value }),
  };
  return ui;
}

// The bot switch: the server fills the empty seats of a friendly match this player starts with bots.
// It appears only if the server can run bots; the choice is kept in this browser and sent at each login.
// Returns whether the server can run bots.
async function botSwitch(snap) {
  const box = document.getElementById('bots'), on = document.getElementById('bots-on');
  try { if (!(await (await fetch('bots')).json()).available) return false; } catch { return false; }
  try { on.checked = localStorage.getItem('rg:bots') === '1'; } catch {}
  snap.fillBots = on.checked;
  on.onchange = () => { try { localStorage.setItem('rg:bots', on.checked ? '1' : '0'); } catch {} snap.setFillBots(on.checked); };
  box.hidden = false;
  return true;
}

async function main() {
  const files = await loadFiles();
  status.textContent = 'Starting the engine…';
  await new Promise(r => setTimeout(r));
  const snap = new SnapClient({ url: 'snap', ui: loginUI(), log: s => console.warn('[snap]', s) });
  const patches = [...UNLOCKS, ...(await botSwitch(snap) ? LONE_START : [])];
  const game = new GameHost(files, { log: s => console.debug('[rg]', s), language: (navigator.language || 'en').slice(0, 2), snap: snap.methods(), patches });
  snap.attach(game);
  try {
    game.boot(); // its first step allocates the emulator's memory, so game.m is unset if that fails
  } catch (e) {
    if (e instanceof RangeError && !game.m) return fail("This device doesn't have enough free memory for the game. Close other apps and tabs, then reload.", e, false);
    throw e;
  }
  status.textContent = 'Ready';
  startButton.hidden = false;
  startButton.focus();
  // Sound and the wake video must start inside the tap itself, or Safari blocks them.
  let audio;
  await new Promise(r => startButton.addEventListener('click', () => {
    audio = new Audio(game);
    audio.ctx.resume();
    if (touch) stayAwake();
    r();
  }, { once: true }));
  overlay.hidden = true;
  canvas.tabIndex = 0;
  canvas.focus();

  const held = new Set();
  const input = []; // applied at the start of each tick
  // Keys go to the game wherever focus is on the page, except in the login dialog or the overlay's buttons.
  addEventListener('keydown', e => {
    const k = javaKey(e);
    if (!k || e.target.closest?.('#login, #overlay')) return;
    e.preventDefault();
    if (held.has(e.code)) return;      // the Java listener ignored auto-repeat too
    held.add(e.code);
    const loc = e.location === 2 ? 3 : e.location === 1 ? 2 : 1;
    input.push(() => { game.key(true, k.code, k.ch, loc); if (k.ch !== 0xffff) game.typed(k.ch); });
  });
  addEventListener('keyup', e => {
    const k = javaKey(e);
    if (!k || e.target.closest?.('#login, #overlay')) return;
    e.preventDefault();
    held.delete(e.code);
    const loc = e.location === 2 ? 3 : e.location === 1 ? 2 : 1;
    input.push(() => game.key(false, k.code, k.ch, loc));
  });
  addEventListener('blur', () => { held.clear(); input.push(() => game.releaseAll()); });
  canvas.addEventListener('pointerdown', () => canvas.focus());
  if (touch) bindPad(game, input, audio);

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
  overlay.hidden = false; startButton.hidden = true; document.getElementById('pick').hidden = true;
  status.textContent = message;
  const reload = document.getElementById('reload'), forget = document.getElementById('forget');
  document.getElementById('recover').hidden = false;
  forget.hidden = !forgettable || (source !== 'stored' && source !== 'picked');
  reload.onclick = () => location.reload();
  forget.onclick = () => gameStore('readwrite', s => s.delete('game')).finally(() => location.reload());
  reload.focus();
}

main().catch(e => fail("The game couldn't start with this copy.", e));
