// The engine's settings file, settings.cfg (docs/re/re_settings.md): its layout, the language IDs it keeps, and a copy of it with the
// soundtrack off, which footage and the showcase's replay clips boot with (docs/adr/0041).

export const MAGIC = 0x4b455953, END = 0x600dc0de, HEADER = 19, LANGUAGE = 15;
const SOUND_VOLUME = 3, MUSIC_VOLUME = 7, DEFAULT_VOLUME = 4;

// The language codes `init` takes and their language IDs (FUN_1010b650).
export const LANGUAGE_IDS = { en: 126, fr: 142, it: 208, de: 157, es: 409, ru: 363, 'zh-cn': 84, 'zh-tw': 83, zh: 83, fi: 139, se: 417 };

// Whether `bytes` is a file the engine reads, rather than one it replaces with its defaults.
export function validSettings(bytes) {
  if (!bytes || bytes.length < HEADER + 8) return false;
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  return dv.getUint32(HEADER, true) === MAGIC && dv.getUint32(bytes.length - 4, true) === END;
}

// A copy of the settings.cfg `bytes` with the music volume at 0 and everything else as it was. A missing or damaged file becomes the
// engine's defaults with the language `init` gets from `language`, and no key lists, which an engine that plays a replay never reads.
export function withoutMusic(bytes, language = 'en') {
  if (validSettings(bytes)) {
    const out = bytes.slice();
    new DataView(out.buffer).setInt32(MUSIC_VOLUME, 0, true);
    return out;
  }
  const dv = new DataView(new ArrayBuffer(HEADER + 4 + 13 * 4 + 4));
  dv.setUint8(0, 1); dv.setUint8(1, 1); // sound on, as the engine's defaults
  dv.setInt32(SOUND_VOLUME, DEFAULT_VOLUME, true);
  dv.setInt32(11, DEFAULT_VOLUME, true);
  dv.setInt32(LANGUAGE, LANGUAGE_IDS[language] ?? LANGUAGE_IDS.en, true);
  dv.setUint32(HEADER, MAGIC, true);
  dv.setUint32(dv.byteLength - 4, END, true);
  return new Uint8Array(dv.buffer);
}
