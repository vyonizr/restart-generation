// Self-check for reading the custom keys from settings.cfg: node web/src/lib/input/keys.test.js
// The files are built here from the layout in docs/re/re_settings.md, not taken from the game.
import assert from 'node:assert';
import { customKeys, DEFAULT_KEYS } from './keys.js';

const KB = 1;
const UP = 1, DOWN = 2, LEFT = 3, RIGHT = 4, ENTER = 5, BACKSPACE = 8, CTRL = 9, SHIFT = 11, ESC = 21, KP_ENTER = 82;
const digit = n => 22 + n, letter = c => 32 + c.charCodeAt(0) - 65;

// A settings.cfg: 19 bytes of other settings, the key marker, 13 lists of [device, key id], then the end marker.
function settings(lists, { magic = 0x4b455953, end = 0x600dc0de } = {}) {
  const words = [magic];
  for (const list of lists) { words.push(list.length); for (const [device, id] of list) words.push((device << 16 | id) >>> 0); }
  words.push(end);
  const bytes = new Uint8Array(19 + words.length * 4);
  const dv = new DataView(bytes.buffer);
  words.forEach((w, i) => dv.setUint32(19 + i * 4, w, true));
  return bytes;
}
// The 13 lists for the given Primary, Secondary, Left, Right, Up, Down and Chat lists; each menu twin follows its action.
const lists = ({ select, back, left, right, up, down, chat }) => [select, back, left, right, up, down, select, back, left, right, up, down, chat];
const defaults = {
  select: [[KB, CTRL], [KB, ENTER], [KB, KP_ENTER]], back: [[KB, SHIFT], [KB, ESC], [KB, BACKSPACE]],
  left: [[KB, LEFT]], right: [[KB, RIGHT]], up: [[KB, UP]], down: [[KB, DOWN]], chat: [[KB, letter('E')]],
};

// The engine's default file reads as the page's default keys.
assert.deepStrictEqual(customKeys(settings(lists(defaults))), DEFAULT_KEYS);

// A rebind puts the chosen key first; the keys the engine keeps after it don't count.
const rebound = settings(lists({ ...defaults,
  select: [[KB, letter('Z')], [KB, ENTER], [KB, KP_ENTER]], back: [[KB, letter('X')], [KB, ESC], [KB, BACKSPACE]],
  up: [[KB, letter('W')]], chat: [[KB, digit(1)]] }));
assert.deepStrictEqual(customKeys(rebound), { ...DEFAULT_KEYS, select: 90, back: 88, up: 87, chat: 49 });

// Only the action lists count: a menu twin that differs doesn't change what is shown.
const twins = lists(defaults);
twins[4] = [[KB, letter('Q')]]; // menu up
assert.strictEqual(customKeys(settings(twins)).up, DEFAULT_KEYS.up);

// The first keyboard key wins; another device's entry before it is skipped.
assert.strictEqual(customKeys(settings(lists({ ...defaults, left: [[2, UP], [KB, letter('A')]] }))).left, 65);

// An action with no keyboard key has none, rather than a default it doesn't have.
assert.strictEqual(customKeys(settings(lists({ ...defaults, chat: [] }))).chat, null);
assert.strictEqual(customKeys(settings(lists({ ...defaults, chat: [[2, letter('E')]] }))).chat, null);

// A missing or damaged file means the defaults, as it does to the engine.
const good = settings(lists({ ...defaults, up: [[KB, letter('W')]] }));
for (const bad of [undefined, null, new Uint8Array(0), good.subarray(0, 20),
  settings(lists(defaults), { magic: 0 }), settings(lists(defaults), { end: 0 }),
  good.subarray(0, good.length - 4)]) // cut off: no end marker
  assert.deepStrictEqual(customKeys(bad), DEFAULT_KEYS);

// A view into a larger buffer (as storage may hand it over) reads the same as the file alone.
const padded = new Uint8Array(good.length + 7);
padded.set(good, 5);
assert.strictEqual(customKeys(padded.subarray(5, 5 + good.length)).up, 87);

// Each call gives a new object, so a caller changing one can't change the defaults.
customKeys(undefined).select = 0;
assert.strictEqual(customKeys(undefined).select, DEFAULT_KEYS.select);
assert.strictEqual(DEFAULT_KEYS.select, 17);

console.log('custom keys ok');
