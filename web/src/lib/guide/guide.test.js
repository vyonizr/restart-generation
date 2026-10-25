// Self-check for reading the guide from a copy of the game: node web/src/lib/guide/guide.test.js
// Every file here is made up, built from the layouts in docs/re/re_info.md; none is taken from the game.
import assert from 'node:assert';
import { pathHash } from '../../../../shared/pak.js';
import { readGuide } from './guide.js';

const utf8 = s => new TextEncoder().encode(s);

// A .pak with every entry stored (shared/pak.js); an undefined body leaves the entry out.
function pak(entries) {
  const list = Object.entries(entries).filter(([, b]) => b), head = 8 + 17 * list.length;
  const out = new Uint8Array(head + list.reduce((n, [, b]) => n + b.length, 0)), dv = new DataView(out.buffer);
  dv.setUint32(0, head, true); dv.setUint32(4, list.length, true);
  let at = head;
  list.forEach(([path, body], i) => {
    const o = 8 + 17 * i;
    dv.setUint32(o, pathHash(path), true); dv.setUint32(o + 4, body.length, true); dv.setUint32(o + 8, body.length, true); dv.setUint32(o + 13, at, true);
    out.set(body, at); at += body.length;
  });
  return out;
}

// A .gfx of kind 1: frames of rows, each row a string of pixel letters looked up in `colors` ('.' is transparent).
function gfx(width, frames, colors, format = 0) {
  const blobs = frames.map(rows => {
    const words = [];
    for (const row of rows) {
      for (let x = 0; x < width;) {
        let skip = 0; while (x < width && row[x] === '.') { skip++; x++; }
        const run = []; while (x < width && row[x] !== '.') run.push(colors[row[x++]]);
        words.push(skip * 4, run.length * 4, ...run);
      }
    }
    const b = new Uint8Array(words.length * 4), dv = new DataView(b.buffer);
    words.forEach((w, i) => dv.setUint32(i * 4, w >>> 0, true));
    return b;
  });
  const head = 0x24 + 4 * frames.length, out = new Uint8Array(head + blobs.reduce((n, b) => n + b.length, 0)), dv = new DataView(out.buffer);
  dv.setUint32(0, 2, true); dv.setUint32(4, 1, true); dv.setUint32(8, width, true); dv.setUint32(12, frames[0].length, true);
  dv.setUint16(16, frames.length, true); dv.setUint16(18, format, true);
  let at = head;
  blobs.forEach((b, i) => { dv.setUint32(0x24 + 4 * i, b.length, true); out.set(b, at); at += b.length; });
  return out;
}

// A .lng: one "KEY text" line each, CR LF, in UTF-8 without a byte-order mark (it is ASCII here).
const lng = texts => utf8(Object.entries(texts).map(([k, v]) => `${k} ${v}\r\n`).join(''));

// A settings.cfg (docs/re/re_settings.md): 3 flags, 4 numbers with the language last, the key marker, 13 key lists, the end marker.
function settings({ language = 126, primary = [[1, 9]] } = {}) {
  const lists = Array.from({ length: 13 }, (_, i) => i === 6 ? primary : [[1, 5]]);
  const words = [0x4b455953];
  for (const list of lists) { words.push(list.length); for (const [device, id] of list) words.push((device << 16 | id) >>> 0); }
  words.push(0x600dc0de);
  const out = new Uint8Array(19 + words.length * 4), dv = new DataView(out.buffer);
  dv.setInt32(3, 4, true); dv.setInt32(7, 4, true); dv.setInt32(11, 4, true); dv.setInt32(15, language, true);
  words.forEach((w, i) => dv.setUint32(19 + i * 4, w, true));
  return out;
}

// A sheet with only the elements the reader looks at, docs/re/re_info.md "The sheet", and our own keys: the menu's buttons, the
// instructions, the items and the heroes.
const SHEET = `
<sheet>
	<name>INFO_MENU</name>
	<component type="BUTTON"><text>T_HOW</text><action type="LINK">INSTRUCTIONS</action></component>
	<component type="BUTTON"><text>T_THINGS</text><action type="LINK">ITEMS</action></component>
	<component type="BUTTON"><text>T_WHO</text><action type="LINK">HEROES</action></component>
	<component type="BUTTON"><text>T_ABOUT</text><action type="LINK">ABOUT_SHEET</action></component>
</sheet>
<sheet>
	<name>INSTRUCTIONS</name>
	<item type="PLAIN_TEXT">H_ONE</item>
	<item type="IMAGES">data/menus/gfx/pic.gfx(2,0;35,50)</item>
	<item type="SMALL_TEXT">P_ONE</item>
</sheet>
<sheet>
	<name>ITEMS</name>
	<component type="STATUS"><text>I_CUP</text><description>[data/menus/gfx/things.gfx,1(-5,-3;30,35)]I_CUP_INFO</description></component>
	<component type="STATUS"><text>I_KEY</text><description>[data/menus/gfx/things.gfx,9(-5,-3;30,35)]I_KEY_INFO</description></component>
</sheet>
<sheet>
	<name>HEROES</name>
	<component type="STATUS">
		<text>PLUMBER</text>
		<description>$PLUMBER_DESCR</description>
	</component>
	<component type="STATUS"><text>HEDGEHOG</text><description>$HEDGEHOG_DESCR</description></component>
</sheet>`;

const RED = 0xffff0000, HALF_BLUE = 0x800000ff, GREEN = 0xff00ff00;
const ENGLISH = {
  T_HOW: 'How', T_THINGS: 'Things', T_WHO: 'Who', T_ABOUT: 'About', H_ONE: 'First steps ', P_ONE: 'Press <P> to pick.\\nThen go.\\n\\n',
  I_CUP: 'Cup', I_CUP_INFO: 'Holds things.', I_KEY: 'Key', I_KEY_INFO: 'Opens things.',
  PLUMBER: 'Pipe hero', DESC_PLUMBER: 'Fixes pipes.', HEDGEHOG: 'Spiky hero', DESC_HEDGEHOG: 'Rolls fast.',
  KEY_NAME_5: 'Enter', KEY_NAME_9: 'Ctrl', KEY_NAME_57: 'Z',
};

function copy({ english = ENGLISH, extraLang = {}, sheet = SHEET, menus = {} } = {}) {
  return {
    'menus.pak': pak({
      'data/menus/info_menu.xml': utf8(sheet),
      'data/menus/gfx/pic.gfx': gfx(3, [['R.B', 'GGG']], { R: RED, B: HALF_BLUE, G: GREEN }),
      'data/menus/gfx/things.gfx': gfx(2, [['RR'], ['GG']], { R: RED, G: GREEN }),
      // Two portraits by palette index: frame 0 for the hedgehog and frame 1 for the plumber, in the engine's order.
      'data/menus/gfx/heroes.gfx': gfx(1, [['a'], ['b']], { a: 0xff000001, b: 0x80000003 }, 1),
      ...menus,
    }),
    'base.pak': pak({
      'data/base/lang/english.lng': lng(english),
      ...extraLang,
      // A default palette of 4 entries whose last 2 are the color slots, and a color palette 06 that replaces them.
      'data/base/palette_default.pal': palette(2, [0xff111111, 0xff222222, 0xff333333, 0xff444444]),
      'data/base/palette_color_06.pal': palette(0, [0xffaa0000, 0xff00bb00]),
    }),
  };
}
function palette(first, colors) {
  const out = new Uint8Array(12 + 4 * colors.length), dv = new DataView(out.buffer);
  dv.setUint32(0, colors.length, true); dv.setUint32(4, 2, true); dv.setUint32(8, first, true);
  colors.forEach((c, i) => dv.setUint32(12 + 4 * i, c >>> 0, true));
  return out;
}
// A picture's pixels as [r, g, b, a] each.
const pixels = p => Array.from({ length: p.width * p.height }, (_, i) => [...p.rgba.subarray(i * 4, i * 4 + 4)]);

// The instructions: the tabs take the menu's own labels, a heading, a whole picture at its own pixels, and a paragraph whose line
// break and Primary key token become a newline and the name of the key the player chose.
{
  const guide = await readGuide({ ...copy(), 'settings.cfg': settings({ primary: [[1, 57], [1, 5]] }) }, 'en');
  assert.deepStrictEqual(guide.tabs.map(t => [t.id, t.label]), [['instructions', 'How'], ['heroes', 'Who'], ['items', 'Things']]);
  const [heading, pictures, paragraph] = guide.tabs[0].blocks;
  assert.deepStrictEqual(heading, { heading: 'First steps' });
  assert.deepStrictEqual(paragraph, { text: 'Press Z to pick.\nThen go.' });
  const [pic] = pictures.pictures;
  assert.deepStrictEqual([pic.width, pic.height], [3, 2]);
  assert.deepStrictEqual(pixels(pic), [[255, 0, 0, 255], [0, 0, 0, 0], [0, 0, 255, 128], [0, 255, 0, 255], [0, 255, 0, 255], [0, 255, 0, 255]]);
}

// The token names the first key of Primary's list, whatever its device; one the engine can't name reads as Enter, which Primary always
// keeps. Without a settings file, Primary is the engine's default, Ctrl.
{
  const paragraph = async files => (await readGuide({ ...copy(), ...files }, 'en')).tabs[0].blocks[2].text;
  assert.strictEqual(await paragraph({ 'settings.cfg': settings({ primary: [[1, 9]] }) }), 'Press Ctrl to pick.\nThen go.');
  assert.strictEqual(await paragraph({ 'settings.cfg': settings({ primary: [[2, 57], [1, 57]] }) }), 'Press Enter to pick.\nThen go.');
  assert.strictEqual(await paragraph({ 'settings.cfg': settings({ primary: [] }) }), 'Press Enter to pick.\nThen go.');
  assert.strictEqual(await paragraph({ 'settings.cfg': settings({ primary: [[1, 200]] }) }), 'Press Enter to pick.\nThen go.');
  assert.strictEqual(await paragraph({}), 'Press Ctrl to pick.\nThen go.');
}

// Heroes, in the sheet's order: each portrait is the frame of the hero's place in the engine's order, in the default palette with
// color palette 06 laid over it from the default's first slot. Items: the picture of the row's spec, and frame 0 for a frame the
// file doesn't have, as the engine draws it.
{
  const [, heroes, items] = (await readGuide(copy(), 'en')).tabs;
  assert.deepStrictEqual(heroes.entries.map(e => [e.title, e.text]), [['Pipe hero', 'Fixes pipes.'], ['Spiky hero', 'Rolls fast.']]);
  assert.deepStrictEqual(heroes.entries.map(e => pixels(e.picture)), [[[0, 0xbb, 0, 0x80]], [[0x22, 0x22, 0x22, 0xff]]]);
  assert.deepStrictEqual(items.entries.map(e => [e.title, e.text]), [['Cup', 'Holds things.'], ['Key', 'Opens things.']]);
  assert.deepStrictEqual(items.entries.map(e => pixels(e.picture)), [[[0, 255, 0, 255], [0, 255, 0, 255]], [[255, 0, 0, 255], [255, 0, 0, 255]]]);
}

// A list's picture is cut to the box of its visible pixels, however its frame pads it, and remembers the frame's size; one with
// nothing visible keeps its frame. The instructions' pictures stay whole (above).
{
  const low = gfx(4, [['....', '....', '....'], ['....', '..R.', '.GG.']], { R: RED, G: GREEN });
  const [, , items] = (await readGuide(copy({ menus: { 'data/menus/gfx/things.gfx': low } }), 'en')).tabs;
  const [icon, empty] = items.entries.map(e => e.picture);
  assert.deepStrictEqual([icon.width, icon.height, icon.frame], [2, 2, { width: 4, height: 3 }]);
  assert.deepStrictEqual(pixels(icon), [[0, 0, 0, 0], [255, 0, 0, 255], [0, 255, 0, 255], [0, 255, 0, 255]]);
  assert.deepStrictEqual([empty.width, empty.height, empty.frame], [4, 3, { width: 4, height: 3 }]);
}

// The language: settings.cfg's, as the engine takes it, else the code the page passes; English where that language has no file.
// The 8-bit files are Windows-1252, and a UTF-16 file starts with its byte-order mark.
{
  const german = Object.fromEntries(Object.entries(ENGLISH).map(([k, v]) => [k, `${v} (de)`]));
  const utf16 = s => new Uint8Array([0xff, 0xfe, ...[...s].flatMap(c => [c.charCodeAt(0) & 0xff, c.charCodeAt(0) >> 8])]);
  const { T_THINGS, ...rest } = ENGLISH;
  const extraLang = {
    'data/base/lang/german.lng': lng(german),
    'data/base/lang/russian.lng': utf16(Object.entries({ ...ENGLISH, T_HOW: 'Как' }).map(([k, v]) => `${k} ${v}\r\n`).join('')),
    'data/base/lang/french.lng': new Uint8Array([...lng({ ...rest, T_HOW: 'Comment', T_WHO: 'Qui' }), ...utf8('T_THINGS Objets '), 0xe9, 0x92, 13, 10]),
  };
  const read = async (settingsFile, code) => readGuide({ ...copy({ extraLang }), ...(settingsFile ? { 'settings.cfg': settingsFile } : {}) }, code);
  const label = guide => guide.tabs[0].label;

  let guide = await read(settings({ language: 157 }), 'en');
  assert.deepStrictEqual([guide.lang, label(guide)], ['de', 'How (de)']);
  guide = await read(null, 'de');
  assert.deepStrictEqual([guide.lang, label(guide)], ['de', 'How (de)']);
  guide = await read(settings({ language: 363 }), 'de');
  assert.deepStrictEqual([guide.lang, label(guide)], ['ru', 'Как']);
  guide = await read(settings({ language: 142 }), 'en');
  assert.deepStrictEqual([guide.lang, guide.tabs.map(t => t.label)], ['fr', ['Comment', 'Qui', 'Objets é’']]);
  for (const [settingsFile, code] of [[settings({ language: 139 }), 'fi'], [null, 'fi'], [null, 'pt'], [settings({ language: 84 }), 'en']]) {
    guide = await read(settingsFile, code);
    assert.deepStrictEqual([guide.lang, label(guide)], ['en', 'How']);
  }
}

// A copy the guide can't read in full has no guide, rather than part of one: a missing file, sheet, text, picture or palette, a
// picture of another kind or with a run past its row, or a sheet item the engine doesn't know.
{
  const { P_ONE, ...noParagraph } = ENGLISH;
  const broken = [
    {},
    { 'menus.pak': copy()['menus.pak'] },
    copy({ sheet: SHEET.replace('<name>HEROES</name>', '<name>PEOPLE</name>') }),
    copy({ english: noParagraph }),
    copy({ menus: { 'data/menus/gfx/pic.gfx': undefined } }),
    copy({ menus: { 'data/menus/gfx/pic.gfx': gfx(3, [['RRR']], { R: RED }).map((b, i) => i === 4 ? 4 : b) } }),
    copy({ menus: { 'data/menus/gfx/things.gfx': gfx(2, [['RR']], { R: RED }).map((b, i) => i === 0x28 + 4 ? 12 : b) } }),
    copy({ sheet: SHEET.replace('type="SMALL_TEXT"', 'type="MOVIE"') }),
  ];
  const noPalette = copy();
  noPalette['base.pak'] = pak({ 'data/base/lang/english.lng': lng(ENGLISH) });
  for (const files of [...broken, noPalette]) assert.strictEqual(await readGuide(files, 'en'), null);
  assert.notStrictEqual(await readGuide(copy(), 'en'), null);
}

console.log('guide ok');
