// Keyboard: browser keys to Java KeyEvent codes.
import { VK } from '../emu/host.js';

const KEYS = {
  ArrowLeft: VK.LEFT, ArrowRight: VK.RIGHT, ArrowUp: VK.UP, ArrowDown: VK.DOWN,
  Control: VK.CONTROL, Enter: VK.CONTROL, Shift: VK.SHIFT, Escape: VK.ESCAPE, Backspace: VK.BACK_SPACE, ' ': VK.SPACE,
};

// The touch pad's controls (data-key) as Java key codes.
export const PAD = { left: VK.LEFT, right: VK.RIGHT, up: VK.UP, down: VK.DOWN, select: VK.CONTROL, back: VK.SHIFT };

export function javaKey(e) {
  if (KEYS[e.key] !== undefined) return { code: KEYS[e.key], ch: e.key === ' ' ? 32 : e.key === 'Backspace' ? 8 : 0xffff };
  if (e.key.length === 1) return { code: e.key.toUpperCase().charCodeAt(0), ch: e.key.charCodeAt(0) };
  return null;
}
