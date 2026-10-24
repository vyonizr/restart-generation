// The game bundle: the server copy's files in one download (server/sendgame.js), which the page unpacks into the files the
// engine reads (web/ui/gamefiles.js). Layout: u32 header length (little-endian), a UTF-8 JSON header
// [{ name, size, zlib?, raw? }], then each file's bytes in header order.
// Each .pak travels with its entries stored (web/pak.js unpackPak): the bundle is compressed whole for the wire, which shrinks the
// entries' own bytes far more than their deflate streams. `zlib` and `raw` list the rows the page deflates again.
import { unpackPak, repackPak } from './pak.js';

// The files of the standalone build the engine runs from; the bundle carries only these. The engine makes the last two if they're
// missing.
export const GAME_FILES = ['ResetGeneration-Win32-Web.dll', 'settings.cfg', 'achievements.dat', 'base.pak', 'fonts.pak', 'story.pak',
  'intro.pak', 'fight.pak', 'gameplay.pak', 'gameplay2.pak', 'levels.pak', 'menus.pak'];
export const OPTIONAL_FILES = new Set(['settings.cfg', 'achievements.dat']);

// Throws if the copy lacks a file the engine can't run without.
export async function packBundle(files) {
  const header = [], bodies = [];
  for (const name of GAME_FILES) {
    const bytes = files[name];
    if (!bytes) { if (OPTIONAL_FILES.has(name)) continue; throw new Error(`the server copy has no ${name}`); }
    if (name.endsWith('.pak')) {
      const { bytes: stored, zlib, raw } = await unpackPak(bytes);
      header.push({ name, size: stored.length, zlib, raw }); bodies.push(stored);
    } else { header.push({ name, size: bytes.length }); bodies.push(bytes); }
  }
  const head = new TextEncoder().encode(JSON.stringify(header));
  const out = new Uint8Array(4 + head.length + bodies.reduce((n, b) => n + b.length, 0));
  new DataView(out.buffer).setUint32(0, head.length, true);
  out.set(head, 4);
  let at = 4 + head.length;
  for (const b of bodies) { out.set(b, at); at += b.length; }
  return out;
}

// { name: Uint8Array } from a bundle, the paks deflated again. Throws on a bundle that doesn't add up.
export async function unpackBundle(bytes) {
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(4, 4 + length)));
  const files = {};
  let at = 4 + length;
  for (const { name, size, zlib, raw } of header) {
    if (at + size > bytes.length) throw new Error('the game bundle is cut short');
    const body = bytes.subarray(at, at + size);
    files[name] = zlib || raw ? await repackPak(body, { zlib, raw }) : body.slice();
    at += size;
  }
  if (at !== bytes.length) throw new Error('the game bundle has bytes after its files');
  return files;
}
