// Keyboard: browser keys to Java KeyEvent codes, and the player's custom keys (CONTEXT.md) read from the engine's settings file.
import { VK } from '../emu/host.js';

const KEYS = {
  ArrowLeft: VK.LEFT, ArrowRight: VK.RIGHT, ArrowUp: VK.UP, ArrowDown: VK.DOWN,
  Control: VK.CONTROL, Enter: VK.ENTER, Shift: VK.SHIFT, Escape: VK.ESCAPE, Backspace: VK.BACK_SPACE, ' ': VK.SPACE,
};

export function javaKey(e) {
  if (KEYS[e.key] !== undefined) return { code: KEYS[e.key], ch: e.key === ' ' ? 32 : e.key === 'Backspace' ? 8 : 0xffff };
  if (e.key.length === 1) return { code: e.key.toUpperCase().charCodeAt(0), ch: e.key.charCodeAt(0) };
  return null;
}

// Custom keys: the Java key code the player chose for each of the engine's seven actions, or null for an action with no keyboard
// key. The page says Select and Back for the engine's Primary and Secondary.
export const DEFAULT_KEYS = { select: VK.CONTROL, back: VK.SHIFT, up: VK.UP, down: VK.DOWN, left: VK.LEFT, right: VK.RIGHT, chat: 69 };

// Whatever key the player chooses, the engine keeps Enter on Select and Esc on Back (docs/re/re_settings.md).
export const KEPT = { select: VK.ENTER, back: VK.ESCAPE };

// The key lists in settings.cfg, in file order. The first six are menu twins that follow the others.
const LISTS = [null, null, null, null, null, null, 'select', 'back', 'left', 'right', 'up', 'down', 'chat'];
const MAGIC = 0x4b455953, END = 0x600dc0de, KEYBOARD = 1, HEADER = 19;

// An engine key ID as a Java key code; null for keys the Custom Keys screen refuses.
function javaCode(id) {
  if (id >= 1 && id <= 4) return [VK.UP, VK.DOWN, VK.LEFT, VK.RIGHT][id - 1];
  if (id >= 22 && id <= 31) return 48 + id - 22; // 0-9
  if (id >= 32 && id <= 57) return 65 + id - 32; // A-Z
  return { 5: VK.ENTER, 6: VK.SPACE, 8: VK.BACK_SPACE, 9: VK.CONTROL, 10: VK.CONTROL, 11: VK.SHIFT, 12: VK.SHIFT, 21: VK.ESCAPE, 82: VK.ENTER }[id] ?? null;
}

// The custom keys in a settings.cfg. A missing or damaged file means the defaults, as it does to the engine. Each action takes the
// first keyboard key in its list, which is the one the player chose. Always a new object, so callers may keep it.
export function customKeys(bytes) {
  if (!bytes || bytes.length < HEADER + 8) return { ...DEFAULT_KEYS };
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), end = bytes.length - 4;
  if (dv.getUint32(HEADER, true) !== MAGIC || dv.getUint32(end, true) !== END) return { ...DEFAULT_KEYS };
  const keys = Object.fromEntries(Object.keys(DEFAULT_KEYS).map(a => [a, null]));
  let at = HEADER + 4;
  for (const action of LISTS) {
    if (at + 4 > end) break;
    const count = dv.getUint32(at, true);
    at += 4;
    for (let i = 0; i < count && at + 4 <= end; i++, at += 4) {
      const entry = dv.getUint32(at, true);
      if (action && keys[action] === null && entry >>> 16 === KEYBOARD) keys[action] = javaCode(entry & 0xffff);
    }
  }
  return keys;
}

// The Java key code a touch pad control (its data-key) presses. Select and Back press the keys the engine always keeps, so a
// rebind can't take them away; the D-pad presses the keys the player chose for each direction.
export const padKey = (control, keys) => KEPT[control] ?? keys[control] ?? DEFAULT_KEYS[control];

// The action a browser key press stands for in the page's own prompts: 'select', 'back', 'left', 'right', 'up', 'down', 'chat' or null.
export function action(e, keys) {
  const code = javaKey(e)?.code;
  if (code === undefined) return null;
  if (code === KEPT.select) return 'select';
  if (code === KEPT.back || code === VK.BACK_SPACE) return 'back';
  return Object.keys(keys).find(a => keys[a] === code) ?? null;
}
