// The player's game files: kept in IndexedDB once chosen, else sent by the server (RG_SEND_GAME=1), else asked for with the file picker.
// While it works it tells the page through `page.status` and `page.pick`.
import { gameFromZip } from '../zip.js';
import { page } from './page.svelte.js';
import { touch } from './device.js';

const GAME_URL = 'game/';   // served by server/gateway.js from the user's own copy of the game
const FILES = ['ResetGeneration-Win32-Web.dll', 'settings.cfg', 'achievements.dat', 'base.pak', 'fonts.pak', 'story.pak',
  'intro.pak', 'fight.pak', 'gameplay.pak', 'gameplay2.pak', 'levels.pak', 'menus.pak'];
const OPTIONAL = new Set(['settings.cfg', 'achievements.dat']); // the game creates them if they're missing
const TRY_ANOTHER = touch ? 'Try another .zip.' : 'Try another .zip or folder.';

// Bytes as base64, in chunks so a big file can't overflow the call stack.
export function toBase64(bytes) {
  let text = '';
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(text);
}
export const fromBase64 = text => Uint8Array.from(atob(text), ch => ch.charCodeAt(0));

// Settings, achievements and saves, kept in local storage.
export const store = {
  get(name) { try { const v = localStorage.getItem(`rg:${name}`); return v && fromBase64(v); } catch { return null; } },
  set(name, data) {
    try { data ? localStorage.setItem(`rg:${name}`, toBase64(data)) : localStorage.removeItem(`rg:${name}`); } catch { /* storage full or blocked */ }
  },
  // Every saved game file. The page's own keys (rg:guest) have no file extension.
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

// Forgets the stored copy, so the next visit asks for another.
export const forgetCopy = () => gameStore('readwrite', s => s.delete('game'));

// Files served next to the page, as server/gateway.js does from its server copy with RG_SEND_GAME=1. Null if the host has none.
// The status line shows the download as a percentage of the bytes. gameplay.pak alone is half of them, so counting files
// would look stuck there. The sizes come from HEAD requests first; if any size is missing, it counts files instead.
async function fetchFiles() {
  const heads = await Promise.all(FILES.map(name => fetch(GAME_URL + name, { method: 'HEAD' }).catch(() => null)));
  const sizes = heads.map(h => (h?.ok ? Number(h.headers.get('Content-Length')) : 0));
  const total = sizes.every((s, i) => s > 0 || !heads[i]?.ok) ? sizes.reduce((a, b) => a + b, 0) : 0;
  let got = 0, shown = -1, shownAt = 0;
  const show = (part, force) => {
    const pct = Math.min(Math.floor(100 * part), 100), now = performance.now();
    if (pct <= shown || (!force && now - shownAt < 100)) return; // never backwards, at most every 100 ms
    shown = pct; shownAt = now;
    page.status = `Loading game files… ${pct}%`;
  };
  const files = {};
  for (const [i, name] of FILES.entries()) {
    const res = await fetch(GAME_URL + name);
    if (!res.ok) { if (OPTIONAL.has(name)) continue; return null; }
    if (!total || !res.body) files[name] = new Uint8Array(await res.arrayBuffer());
    else {
      const chunks = [], reader = res.body.getReader();
      for (let r; !(r = await reader.read()).done;) { chunks.push(r.value); got += r.value.length; show(got / total); }
      const data = files[name] = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
      let at = 0;
      for (const c of chunks) { data.set(c, at); at += c.length; }
    }
    show(total ? got / total : (i + 1) / FILES.length, i === FILES.length - 1);
  }
  return files;
}

// Asks the player for the standalone build's .zip or its game folder (the ResetGeneration folder or the one above it).
// The picker's inputs call chooseZip and chooseFolder.
let picked = null;
function pickFiles() {
  page.status = 'Bring your own copy of the game to play';
  page.pick = true;
  return new Promise(resolve => { picked = resolve; });
}

// found: { lowercase name: Uint8Array or File }
async function use(found, what) {
  const missing = FILES.filter(n => !OPTIONAL.has(n) && !found[n.toLowerCase()]);
  if (missing.length) {
    console.warn('missing game files:', missing.join(', '));
    page.status = `That ${what} isn't the Windows standalone build of Reset Generation. ${TRY_ANOTHER}`;
    return;
  }
  page.pick = false;
  page.status = 'Reading game files…';
  const files = {};
  for (const n of FILES) { const f = found[n.toLowerCase()]; if (f) files[n] = f instanceof Uint8Array ? f : new Uint8Array(await f.arrayBuffer()); }
  picked(files);
}

export function chooseFolder(fileList) {
  use(Object.fromEntries([...fileList].map(f => [f.name.toLowerCase(), f])), 'folder');
}

export async function chooseZip(file) {
  if (!file) return;
  page.status = 'Unpacking…';
  try {
    const entries = await gameFromZip(new Uint8Array(await file.arrayBuffer()));
    use(Object.fromEntries(Object.entries(entries).map(([n, d]) => [n.toLowerCase(), d])), '.zip');
  } catch (e) { console.warn(e); page.status = `Couldn't read ${file.name}. ${TRY_ANOTHER}`; }
}

export let source = null; // where the files came from: 'stored', 'server' or 'picked'

export async function loadFiles() {
  let files = null;
  try { files = await gameStore('readonly', s => s.get('game')); } catch { /* storage blocked */ }
  source = files ? 'stored' : 'server';
  files ||= await fetchFiles().catch(() => null);
  if (!files) {
    source = 'picked';
    files = await pickFiles();
    try { await gameStore('readwrite', s => s.put(files, 'game')); } catch { /* not kept: the player picks again next visit */ }
  }
  return files;
}

// The files the engine saved in this browser go over the game's own copies. Call it once the saved game is settled (progress.js).
export function overlaySaved(files) {
  for (const name of store.names()) { const saved = store.get(name); if (saved) files[name] = saved; }
}
