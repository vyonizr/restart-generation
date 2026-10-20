// A member's saved game follows them to the server (ADR 0014): the files the engine writes (story progress, quick-match record,
// settings, achievements) are kept in this browser as before, and for a member also on the server, so they survive a cleared
// browser and move to another device. Guests, name-only servers and static hosts keep them in the browser only.
//
// At the start the server wins when it holds any files (the same rule as for fame, ADR 0011); when it holds none, the
// browser's files are uploaded. While playing, changed files go up every 30 s and once more when the page is hidden.
import { store, toBase64, fromBase64 } from './gamefiles.js';

const SYNC_MS = 30000;
const KEEPALIVE_MAX = 60000; // a request that may outlive the page can carry about 64 KB

let account = null;           // set once the start-up sync worked; until then nothing is uploaded
const pending = new Map();    // file name -> bytes, or null for a deleted file, waiting to go up
const sent = new Map();       // file name -> what the server holds, as base64 (null: deleted)
let timer = null, running = Promise.resolve();

// Settles the saved game before the engine starts: the server's files replace the browser's, or the browser's go up.
export async function syncProgress(member) {
  try {
    const remote = await member.saves();
    const names = Object.keys(remote);
    if (names.length) {
      for (const local of store.names()) if (!(local in remote)) store.set(local, null);
      for (const name of names) { store.set(name, fromBase64(remote[name])); sent.set(name, remote[name]); }
    } else {
      for (const name of store.names()) {
        const data = store.get(name);
        if (!data) continue;
        try { await member.putSave(name, data); sent.set(name, toBase64(data)); } catch (e) { if (e.code !== 'too_large') throw e; }
      }
    }
  } catch (e) {
    // Offline or refused: play from the browser's copy and upload nothing, so an older copy can't overwrite the server's.
    console.warn('[saves]', e.message);
    return;
  }
  account = member;
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(true); });
  addEventListener('pagehide', () => flush(true));
}

// A file the engine wrote (bytes) or deleted (null).
export function track(name, data) {
  if (!account) return;
  pending.set(name, data);
  timer ??= setTimeout(() => { timer = null; flush(); }, SYNC_MS);
}

async function flushNow(keepalive) {
  if (!account) return;
  for (const [name, data] of [...pending]) {
    const text = data && toBase64(data);
    try {
      if (sent.get(name) !== text) {
        const lasts = keepalive && (!data || data.length <= KEEPALIVE_MAX);
        if (data) await account.putSave(name, data, lasts); else await account.dropSave(name, lasts);
        sent.set(name, text);
      }
    } catch (e) {
      if (e.code === 'too_large') { console.warn(`[saves] ${name} is over the server's limit and stays in this browser`); pending.delete(name); continue; }
      timer ??= setTimeout(() => { timer = null; flush(); }, SYNC_MS); // offline: it stays pending for the next round
      return;
    }
    if (pending.get(name) === data) pending.delete(name);
  }
}

const flush = keepalive => (running = running.then(() => flushNow(keepalive)));

// Signing out: send what is pending, then clear this browser's copy so the next guest here doesn't inherit it.
export async function leave() {
  await flush();
  discard();
}

// The account is gone (or the browser is being handed on): forget the saved game here and stop uploading.
export function discard() {
  account = null;
  pending.clear(); sent.clear();
  for (const name of store.names()) store.set(name, null);
}
