// The guide (CONTEXT.md): the info menu's instructions, heroes and items, read from the player's own copy of the game in the
// browser and kept in memory only (docs/adr/0033). Everything it reads is described in docs/re/re_info.md.
import { pakRead } from '../../../../shared/pak.js';
import { readSettings, KEYBOARD } from '../input/keys.js';
import { HERO_TYPES } from '../../../../shared/heroes.js';

const SHEET = 'data/menus/info_menu.xml';
const TABS = [['instructions', 'INSTRUCTIONS'], ['heroes', 'HEROES'], ['items', 'ITEMS']]; // our tab, the sheet it shows
// The key tokens, their action, and the engine's first key ID for it when there is no settings file (docs/re/re_info.md).
const TOKENS = { P: ['select', 9], S: ['back', 11], L: ['left', 3], R: ['right', 4], U: ['up', 1], D: ['down', 2] };
const ENTER = 5;
// The heroes' portraits and the palette the engine draws them with (FUN_10045620).
const HEROES_GFX = 'data/menus/gfx/heroes.gfx', HEROES_PALETTE = 5;
// The language codes `init` takes and their language IDs (FUN_1010b650); each ID's file name and the language's tag on the page.
const CODES = { en: 126, fr: 142, it: 208, de: 157, es: 409, ru: 363, 'zh-cn': 84, 'zh-tw': 83, zh: 83, fi: 139, se: 417 };
const LANGUAGES = { 126: ['english', 'en'], 142: ['french', 'fr'], 208: ['italian', 'it'], 157: ['german', 'de'], 409: ['spanish', 'es'],
  363: ['russian', 'ru'], 84: ['chinese-simplified', 'zh-Hans'], 83: ['chinese-traditional', 'zh-Hant'], 139: ['finnish', 'fi'], 417: ['swedish', 'sv'] };

// Why the guide can't be read from a copy; readGuide turns it into null.
class Unreadable extends Error {}
const need = (value, what) => {
  if (value == null) throw new Unreadable(what);
  return value;
};

// The text inside the first `<tag …>` of a block, or null. The sheet file isn't well-formed XML, so it is read by its tags only.
const tagText = (body, tag) => new RegExp(`<${tag}>\\s*([^<]*?)\\s*<`).exec(body)?.[1] ?? null;

// The `<sheet>` blocks of the sheet file by name, as text.
function sheets(text) {
  const out = new Map();
  for (const [, body] of text.matchAll(/<sheet>([\s\S]*?)<\/sheet>/g)) out.set(need(tagText(body, 'name'), 'a sheet name'), body);
  return out;
}

// The text key of the name of the first key of a token's list; Enter's when the engine would show no name, as Primary always keeps it.
function keyName(settings, token) {
  const [action, first] = TOKENS[token];
  const entry = settings ? settings.lists[action][0] : { device: KEYBOARD, id: first };
  return entry?.device === KEYBOARD ? `KEY_NAME_${entry.id}` : `KEY_NAME_${ENTER}`;
}

// The text of a language file by key: one "KEY text" per line.
function texts(bytes) {
  const out = new Map();
  for (const line of decode(bytes).split(/\r?\n/)) {
    const space = line.indexOf(' ');
    if (space > 0) out.set(line.slice(0, space), line.slice(space + 1));
  }
  return out;
}
// UTF-8 or UTF-16 by their byte-order marks, else one byte per character, which the game's files fill as Windows-1252.
function decode(bytes) {
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return new TextDecoder('utf-8').decode(bytes.subarray(3));
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return new TextDecoder('utf-16le').decode(bytes.subarray(2));
  return new TextDecoder('windows-1252').decode(bytes);
}

// A picture of a .gfx of kind 1: { width, height, rgba }, with straight alpha. `colors` is the palette a format 1 image needs.
function picture(bytes, frame, colors) {
  need(bytes, 'a picture');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 0x24 || dv.getUint32(4, true) !== 1) throw new Unreadable('a picture of kind 1');
  const width = dv.getUint32(8, true), height = dv.getUint32(12, true), frames = dv.getUint16(16, true), format = dv.getUint16(18, true);
  if (!frames || format > 1 || (format === 1 && !colors) || 0x24 + 4 * frames > bytes.length) throw new Unreadable('a picture header');
  if (frame >= frames) frame = 0;
  let p = 0x24 + 4 * frames;
  for (let i = 0; i < frame; i++) p += dv.getUint32(0x24 + 4 * i, true);
  const end = p + dv.getUint32(0x24 + 4 * frame, true), rgba = new Uint8ClampedArray(width * height * 4);
  if (end > bytes.length) throw new Unreadable('a picture frame');
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width;) {
      if (p + 8 > end) throw new Unreadable('a picture row');
      const skip = dv.getUint32(p, true), count = dv.getUint32(p + 4, true);
      p += 8;
      if (skip % 4 || count % 4 || !(skip + count) || x + (skip + count) / 4 > width || p + count > end) throw new Unreadable('a picture run');
      x += skip / 4;
      for (const stop = p + count; p < stop; p += 4, x++) {
        let pixel = dv.getUint32(p, true);
        if (format === 1) pixel = (need(colors[pixel & 0xfff], 'a palette entry') & 0xffffff | pixel & 0xff000000) >>> 0;
        rgba.set([pixel >>> 16 & 0xff, pixel >>> 8 & 0xff, pixel & 0xff, pixel >>> 24], (y * width + x) * 4);
      }
    }
  }
  return { width, height, rgba };
}

// A list's picture cut to the box its visible pixels fill, so the page can centre what shows: the items' frames draw their icons
// against the bottom edge. `frame` keeps the uncut size, which decides how large the page draws it. A picture with nothing visible
// keeps its frame.
function cropped({ width, height, rgba }) {
  let x0 = width, y0 = height, x1 = -1, y1 = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!rgba[(y * width + x) * 4 + 3]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      y1 = y;
    }
  }
  const frame = { width, height };
  if (x1 < 0) return { width, height, rgba, frame };
  const w = x1 - x0 + 1, h = y1 - y0 + 1, out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) out.set(rgba.subarray(((y0 + y) * width + x0) * 4, ((y0 + y) * width + x1 + 1) * 4), y * w * 4);
  return { width: w, height: h, rgba: out, frame };
}

// An image spec: a path, then optionally `,frame` and `:palette`, then a rectangle the guide doesn't need (docs/re/re_info.md).
function spec(text) {
  const m = need(/^([^,(]+?)(?:,(\d+)(?::(\d))?)?(?:\([^)]*\))?$/.exec(text.trim()), 'an image spec');
  return { path: m[1], frame: Number(m[2] ?? 0), palette: m[3] == null ? null : Number(m[3]) };
}

// The copy's guide, or null when it can't be read. `language` is the code the page passes the engine.
export async function readGuide(files, language) {
  try {
    return await read(files, language);
  } catch (e) {
    if (e instanceof Unreadable) return null;
    throw e;
  }
}

async function read(files, language) {
  const menus = need(files['menus.pak'], 'menus.pak'), base = need(files['base.pak'], 'base.pak');
  const sheet = sheets(decode(need(await pakRead(menus, SHEET), SHEET)));
  // The settings file's language replaces the code's, as it does in the engine; English where the language has no file.
  const settings = readSettings(files['settings.cfg']);
  const id = settings ? settings.language : CODES[language];
  let [file, lang] = LANGUAGES[id] ?? [], bytes = file && await pakRead(base, `data/base/lang/${file}.lng`);
  if (!bytes) [lang, bytes] = ['en', await pakRead(base, 'data/base/lang/english.lng')];
  const strings = texts(need(bytes, 'the text'));
  // A text without the spaces and line breaks at its ends, which only lay it out on the phone's screen.
  const text = key => need(strings.get(key), `the text ${key}`).trim();
  const name = token => strings.get(keyName(settings, token)) ?? text(`KEY_NAME_${ENTER}`);
  const shown = key => text(key).replaceAll('\\n', '\n').replaceAll('\\', '\n').replace(/<([PSLRUD])>/g, (_, t) => name(t)).trim();
  const palettes = new Map();
  const image = async s => picture(await pakRead(menus, s.path), s.frame, s.palette == null ? null : await palette(base, s.palette, palettes));

  // The menu's buttons give each tab its label, by the sheet they open.
  const menu = need(sheet.get('INFO_MENU'), 'the menu');
  const labels = new Map([...menu.matchAll(/<component type="BUTTON">([\s\S]*?)<\/component>/g)].map(([, b]) => [tagText(b, 'action type="LINK"'), tagText(b, 'text')]));
  const [instructions, heroes, items] = TABS.map(([id, sheetName]) => ({ id, label: text(need(labels.get(sheetName), `the ${sheetName} button`)) }));

  instructions.blocks = [];
  for (const [, type, value] of need(sheet.get('INSTRUCTIONS'), 'the instructions').matchAll(/<item type="(\w+)">\s*([^<]*?)\s*<\/item>/g)) {
    if (type === 'PLAIN_TEXT') instructions.blocks.push({ heading: shown(value) });
    else if (type === 'SMALL_TEXT') instructions.blocks.push({ text: shown(value) });
    else if (type === 'IMAGES') instructions.blocks.push({ pictures: await Promise.all(value.split('|').map(s => image(spec(s)))) });
    else throw new Unreadable(`an instructions item ${type}`);
  }

  // A row's description is an image spec and a text key, or a hero's variable, which the engine fills the same way.
  const rows = async sheetName => Promise.all([...need(sheet.get(sheetName), sheetName).matchAll(/<component type="STATUS">([\s\S]*?)<\/component>/g)].map(async ([, row]) => {
    const title = need(tagText(row, 'text'), 'a row title'), description = need(tagText(row, 'description'), 'a row description');
    const hero = /^\$(\w+)_DESCR$/.exec(description), described = /^\[([^\]]*)\](\w+)$/.exec(description);
    if (hero) {
      const index = HERO_TYPES.indexOf(hero[1]);
      if (index < 0) throw new Unreadable(`the hero ${hero[1]}`);
      return { title: text(title), text: text(`DESC_${hero[1]}`), picture: cropped(await image({ path: HEROES_GFX, frame: index, palette: HEROES_PALETTE })) };
    }
    need(described, `the row ${title}`);
    return { title: text(title), text: text(described[2]), picture: cropped(await image(spec(described[1]))) };
  }));
  heroes.entries = await rows('HEROES');
  items.entries = await rows('ITEMS');
  return { lang, tabs: [instructions, heroes, items] };
}

// Palette `digit` of the engine's table, loaded once per read: for 0 to 5, the default palette with color palette 0(digit + 1) laid
// over it from the default one's first slot, up to the end of either. The info menu uses no other.
function palette(base, digit, cache) {
  if (!cache.has(digit)) cache.set(digit, overlaid(base, digit));
  return cache.get(digit);
}
async function overlaid(base, digit) {
  if (digit > 5) throw new Unreadable(`palette ${digit}`);
  const [colors, first] = paletteFile(await pakRead(base, 'data/base/palette_default.pal'));
  const [over] = paletteFile(await pakRead(base, `data/base/palette_color_0${digit + 1}.pal`));
  over.forEach((color, i) => { if (first + i < colors.length) colors[first + i] = color; });
  return colors;
}
// A .pal: u32 count, u32 2 (32-bit entries), u32 first slot, then the colors. [colors, first slot].
function paletteFile(bytes) {
  need(bytes, 'a palette');
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.length < 12 || dv.getUint32(4, true) !== 2) throw new Unreadable('a palette header');
  const count = dv.getUint32(0, true);
  if (12 + 4 * count > bytes.length) throw new Unreadable('a palette');
  return [Array.from({ length: count }, (_, i) => dv.getUint32(12 + 4 * i, true)), dv.getUint32(8, true)];
}
