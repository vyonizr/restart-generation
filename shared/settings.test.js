// Self-check for the settings.cfg the engines of footage and showcase clips boot with: node shared/settings.test.js
// The files are built here from the layout in docs/re/re_settings.md, not taken from the game.
import assert from 'node:assert';
import { withoutMusic, validSettings } from './settings.js';

// A settings.cfg: three flags, the sound-effects and music volumes, a third number, the language, the key marker, `lists` as
// [count, ...entries] words, then the end marker.
function settings({ flags = [1, 1, 0], numbers = [4, 4, 4, 126], lists = [[1, 0x10009]] } = {}) {
  const words = [0x4b455953, ...lists.flatMap(l => [l.length, ...l]), 0x600dc0de];
  const dv = new DataView(new ArrayBuffer(19 + words.length * 4));
  flags.forEach((f, i) => dv.setUint8(i, f));
  numbers.forEach((n, i) => dv.setInt32(3 + i * 4, n, true));
  words.forEach((w, i) => dv.setUint32(19 + i * 4, w, true));
  return new Uint8Array(dv.buffer);
}
const numbers = bytes => [0, 1, 2, 3].map(i => new DataView(bytes.buffer, bytes.byteOffset).getInt32(3 + i * 4, true));

// A player's own file keeps everything but the music: their sound-effects volume, keys and language, and sound on or off.
{
  const own = settings({ flags: [0, 1, 0], numbers: [9, 7, 4, 157], lists: [[1, 0x10020], [2, 0x10005, 0x10015]] });
  const quiet = withoutMusic(own, 'en');
  assert.deepStrictEqual(numbers(quiet), [9, 0, 4, 157]);
  assert.deepStrictEqual([...quiet.subarray(0, 3)], [0, 1, 0]);
  assert.deepStrictEqual(quiet.subarray(19), own.subarray(19));
  assert.deepStrictEqual(numbers(own), [9, 7, 4, 157], 'the copy the engine boots with is a new one');
}

// No file, or one the engine would replace with its defaults (no end marker), becomes the defaults with no music, in the language
// `init` gets, English for a code the engine has no ID for; the engine reads it as it is.
for (const damaged of [undefined, settings().subarray(0, 31)]) {
  const quiet = withoutMusic(damaged, 'de');
  assert.ok(validSettings(quiet));
  assert.deepStrictEqual(numbers(quiet), [4, 0, 4, 157]);
  assert.deepStrictEqual([...quiet.subarray(0, 3)], [1, 1, 0]);
}
assert.strictEqual(numbers(withoutMusic(undefined, 'pt'))[3], 126);

console.log('settings ok');
