// The curtain (CONTEXT.md): the engine's own gray wall, which the page puts around a phone-sized screen on the Full board. It is read
// from the player's own gameplay.pak each time the game starts and kept only in memory (docs/LEGAL.md); its .gfx format is in
// docs/re/re_screen.md "The .gfx image container", its run codes in docs/re/re_render.md "The run-length image".
import { pakRead } from '../pak.js';
import { CURTAIN_PATH } from '../emu/host.js';

const HEADER = 0x28, RUN_LENGTH = 4;

// The curtain as an Int32Array in the engine's color layout (web/ui/screen.js), its top byte 255 where it is opaque and 0 in its
// hole, or null when this copy has no such image in a form we know.
export async function loadCurtain(files, width, height) {
  const gfx = files['gameplay.pak'] && await pakRead(files['gameplay.pak'], CURTAIN_PATH);
  if (!gfx || gfx.length < HEADER) return null;
  const dv = new DataView(gfx.buffer, gfx.byteOffset, gfx.byteLength);
  if (dv.getUint32(4, true) !== RUN_LENGTH || dv.getUint32(8, true) !== width || dv.getUint32(12, true) !== height) return null;
  const end = HEADER + dv.getUint32(0x24, true);
  if (end > gfx.length || end < HEADER + 8) return null;
  const codesEnd = HEADER + dv.getUint32(end - 8, true), colors = dv.getUint32(end - 4, true);
  if (codesEnd + colors * 4 > end - 8) return null;
  const out = new Int32Array(width * height);
  let p = HEADER;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width;) {
      if (p + 2 > codesEnd) return null;
      const code = dv.getUint16(p, true);
      p += 2;
      let length = code >>> 12, index = code & 0xfff;
      if (!length) { length = code; index = dv.getUint16(p, true); p += 2; }
      if (!length) return null;
      // Bit 15 picks a palette color; any other run is the hole.
      if (index & 0x8000 && (index & 0x7fff) < colors) out.fill(dv.getUint32(codesEnd + 4 * (index & 0x7fff), true) | 0xff000000, y * width + x, y * width + Math.min(x + length, width));
      x += length;
    }
  }
  return out;
}
