// Browser host: downloads the game files, runs the engine in the emulator, draws frames to the
// canvas, forwards the keyboard and plays the engine's 8 kHz PCM through WebAudio.
import { GameHost, WIDTH, HEIGHT, VK } from './emu/host.js';
import { SnapClient } from './snap.js';

const GAME_URL = 'game/';   // served by server/gateway.js from the user's own copy of the game
const FILES = ['ResetGeneration-Win32-Web.dll', 'settings.cfg', 'achievements.dat', 'base.pak', 'fonts.pak', 'story.pak',
  'intro.pak', 'fight.pak', 'gameplay.pak', 'gameplay2.pak', 'levels.pak', 'menus.pak'];
const SAVED = new Set(['settings.cfg', 'achievements.dat']);
const MAX_TICKS_PER_FRAME = 4;   // catch-up limit after a stall

const canvas = document.getElementById('screen'), ctx = canvas.getContext('2d');
const overlay = document.getElementById('overlay'), status = document.getElementById('status'), startButton = document.getElementById('start');
const image = ctx.createImageData(WIDTH, HEIGHT), rgba = new Uint32Array(image.data.buffer);

const store = {
  get(name) { try { const v = localStorage.getItem(`rg:${name}`); return v && Uint8Array.from(atob(v), ch => ch.charCodeAt(0)); } catch { return null; } },
  set(name, data) { try { localStorage.setItem(`rg:${name}`, btoa(String.fromCharCode(...data))); } catch { /* storage full or blocked */ } },
};

async function loadFiles() {
  const files = {};
  let done = 0;
  await Promise.all(FILES.map(async name => {
    const saved = SAVED.has(name) && store.get(name);
    if (saved) files[name] = saved;
    else {
      const res = await fetch(GAME_URL + name);
      if (!res.ok) throw new Error(`${name}: HTTP ${res.status}`);
      files[name] = new Uint8Array(await res.arrayBuffer());
    }
    status.textContent = `Loading game files… ${++done}/${FILES.length}`;
  }));
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

function draw(game) {
  const px = game.pixels;
  for (let i = 0; i < px.length; i++) {
    const v = px[i];
    rgba[i] = 0xff000000 | ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff);
  }
  ctx.putImageData(image, 0, 0);
}

// The Arena login dialog.
function loginUI() {
  const form = document.getElementById('login'), user = document.getElementById('username'), pass = document.getElementById('password');
  const note = document.getElementById('login-note'), cancel = document.getElementById('login-cancel');
  let handlers = null;
  form.addEventListener('submit', e => {
    e.preventDefault();
    try { localStorage.setItem('rg:username', user.value); } catch {}
    const h = handlers;
    form.hidden = true; canvas.focus();
    h?.ready();
  });
  cancel.addEventListener('click', () => { const h = handlers; ui.stopLogin(); h?.cancel(); });
  form.addEventListener('keydown', e => { if (e.key === 'Escape') cancel.click(); e.stopPropagation(); });
  const ui = {
    startLogin(ready, cancelled) {
      handlers = { ready, cancel: cancelled };
      try { user.value ||= localStorage.getItem('rg:username') || ''; } catch {}
      note.textContent = 'New names are registered on first login.';
      form.hidden = false;
      (user.value ? pass : user).focus();
    },
    stopLogin() { form.hidden = true; handlers = null; canvas.focus(); },
    visible: () => !form.hidden,
    attempting() { note.textContent = 'Logging in…'; },
    credentials: () => ({ username: user.value.trim(), password: pass.value }),
  };
  return ui;
}

async function main() {
  const files = await loadFiles();
  status.textContent = 'Starting the engine…';
  await new Promise(r => setTimeout(r));
  const snap = new SnapClient({ url: 'snap', ui: loginUI(), log: s => console.warn('[snap]', s) });
  const game = new GameHost(files, { log: s => console.debug('[rg]', s), language: (navigator.language || 'en').slice(0, 2), snap: snap.methods() });
  snap.attach(game);
  game.boot();
  status.textContent = 'Ready';
  startButton.hidden = false;
  startButton.focus();
  await new Promise(r => startButton.addEventListener('click', r, { once: true }));
  overlay.hidden = true;
  canvas.focus();

  const audio = new Audio(game);
  const held = new Set();
  const input = []; // applied at the start of each tick
  canvas.addEventListener('keydown', e => {
    const k = javaKey(e);
    if (!k) return;
    e.preventDefault();
    if (held.has(e.code)) return;      // the Java listener ignored auto-repeat too
    held.add(e.code);
    const loc = e.location === 2 ? 3 : e.location === 1 ? 2 : 1;
    input.push(() => { game.key(true, k.code, k.ch, loc); if (k.ch !== 0xffff) game.typed(k.ch); });
  });
  canvas.addEventListener('keyup', e => {
    const k = javaKey(e);
    if (!k) return;
    e.preventDefault();
    held.delete(e.code);
    const loc = e.location === 2 ? 3 : e.location === 1 ? 2 : 1;
    input.push(() => game.key(false, k.code, k.ch, loc));
  });
  canvas.addEventListener('blur', () => { held.clear(); input.push(() => game.releaseAll()); });
  canvas.addEventListener('pointerdown', () => canvas.focus());

  const t0 = performance.now();
  let lastSave = 0, frames = 0, statT = t0, statI = 0;
  const frame = now => {
    try {
      if (++frames % 60 === 0) { // exposed for debugging and the headless browser test
        const ic = game.m.cpu.icount;
        window.rgStats = { fps: +(60000 / (now - statT)).toFixed(1), mips: +((ic - statI) / (now - statT) / 1000).toFixed(1),
          lag: Math.round(now - t0 - game.time) };
        statT = now; statI = ic;
      }
      // Tick until the engine's clock reaches real time; each tick sleeps the engine to its next frame.
      for (let i = 0; i < MAX_TICKS_PER_FRAME && game.time < now - t0; i++) {
        while (input.length) input.shift()();
        game.tick(); snap.pump();
      }
      if (game.time < now - t0 - 500) game.m.win.now = game.clock0 + (now - t0); // give up catching up
      draw(game);
      audio.pump();
      if (now - lastSave > 5000) { lastSave = now; for (const f of game.dirtyFiles()) store.set(f.name, f.data); }
      requestAnimationFrame(frame);
    } catch (e) {
      console.error(e);
      overlay.hidden = false; startButton.hidden = true;
      status.textContent = `The emulator stopped: ${e.message}`;
    }
  };
  requestAnimationFrame(frame);
}

main().catch(e => { console.error(e); status.textContent = `Could not start: ${e.message}`; });
