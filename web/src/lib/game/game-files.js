// The player's game files: kept in IndexedDB once the browser has them, else sent by the server (server/sendgame.js: to every
// visitor of a server that isn't public, or for the download code in the page's address on a public one), else asked for with the
// file picker. While it works it tells the page through `page.status` and `page.pick`.
import { gameFromZip } from '../../../../shared/zip.js';
import { unpackBundle, GAME_FILES, OPTIONAL_FILES } from '../../../../shared/bundle.js';
import { page } from '../page.svelte.js';
import { touch } from '../device.js';

const BUNDLE_URL = 'game/bundle';
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

// The game files in IndexedDB, under `game`, and where they came from, under `from`: 'server', 'code' or 'picked'.
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
export const forgetCopy = () => gameStore('readwrite', s => s.clear());

// The download code in the page's address (?code=, CONTEXT.md), taken out of the address as soon as the page loads, so that it stays
// in no history entry, bookmark or link copied from the address bar. Nothing on the page shows it.
const CODE = (() => {
  const url = new URL(location.href), code = url.searchParams.get('code');
  if (code === null) return null;
  url.searchParams.delete('code');
  history.replaceState(history.state, '', url);
  return code;
})();

// The game bundle the server sends (shared/bundle.js): GET from a server that sends it to every visitor, POST with the download code to
// a public one. Null when it sends none: a public server answers a code it doesn't take, for whatever reason, as if it had no game.
// The status line shows the download as a percentage of the bundle's own size (X-Game-Size), which is what the body reads as.
async function fetchBundle(code) {
  const res = await fetch(BUNDLE_URL, code === null ? { cache: 'no-store' } : { method: 'POST', body: code, cache: 'no-store' });
  const total = Number(res.headers.get('X-Game-Size'));
  if (!res.ok || !res.body || !(total > 0)) return null;
  const data = new Uint8Array(total), reader = res.body.getReader();
  let got = 0, shown = -1, shownAt = 0;
  for (let r; !(r = await reader.read()).done;) {
    if (got + r.value.length > total) throw new Error('the game bundle is longer than its size');
    data.set(r.value, got);
    got += r.value.length;
    const pct = Math.floor(100 * got / total), now = performance.now();
    if (pct > shown && now - shownAt >= 100) { shown = pct; shownAt = now; page.status = `Loading game files… ${pct}%`; } // never backwards, at most every 100 ms
  }
  if (got !== total) throw new Error('the game bundle is cut short');
  page.status = 'Unpacking…';
  return unpackBundle(data);
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
  const missing = GAME_FILES.filter(n => !OPTIONAL_FILES.has(n) && !found[n.toLowerCase()]);
  if (missing.length) {
    console.warn('missing game files:', missing.join(', '));
    page.status = `That ${what} isn't the Windows standalone build of Reset Generation. ${TRY_ANOTHER}`;
    return;
  }
  page.pick = false;
  page.status = 'Reading game files…';
  const files = {};
  for (const n of GAME_FILES) { const f = found[n.toLowerCase()]; if (f) files[n] = f instanceof Uint8Array ? f : new Uint8Array(await f.arrayBuffer()); }
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

export let source = null; // where the files came from: 'stored', 'server', 'code' or 'picked'

// The game files, from wherever this browser can have them. A copy this browser received for the download code is the server's,
// though the server says it sends none: then `page.sentByCode` is set and `page.ownCopy` cleared, for the footer and the Notices dialog.
export async function loadFiles() {
  const code = CODE;
  let files = null, from = null;
  try {
    files = await gameStore('readonly', s => s.get('game'));
    if (files) from = await gameStore('readonly', s => s.get('from'));
  } catch { /* storage blocked */ }
  source = files ? 'stored' : 'server';
  // A static host has no GET /status and sends nothing; a code that a public server doesn't take leaves the player to bring their own.
  if (!files && page.server?.servesGame) from = 'server';
  else if (!files && page.server && code !== null) from = source = 'code';
  if (!files && from) files = await fetchBundle(from === 'code' ? code : null).catch(e => { console.warn(e); return null; });
  if (!files) {
    source = from = 'picked';
    files = await pickFiles();
  }
  if (source !== 'stored') {
    try { await gameStore('readwrite', s => { s.put(from, 'from'); return s.put(files, 'game'); }); } catch { /* not kept: the next visit fetches or picks again */ }
  }
  if (from === 'code') { page.sentByCode = true; page.ownCopy = false; }
  return files;
}

// The files the engine saved in this browser go over the game's own copies. Call it once the saved game is settled (progress.js).
export function overlaySaved(files) {
  for (const name of store.names()) { const saved = store.get(name); if (saved) files[name] = saved; }
}
