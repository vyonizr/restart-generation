// Paints the engine's frame onto the game screen's canvas, for the game page (game.js) and the replay page (replay.svelte.js).
// Returns paint(game), which converts the engine's BGRX framebuffer to the canvas's RGBA. About a quarter of battle frames leave the
// picture as it was, and those skip the upload and the browser's redraw of the screen, which saves phones power.
export function screenPainter(canvas, width, height) {
  const ctx = canvas.getContext('2d'), image = ctx.createImageData(width, height), rgba = new Uint32Array(image.data.buffer);
  // A browser may drop a hidden page's canvas; the first frame after it returns is always uploaded.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) rgba.fill(0); });
  return game => {
    const px = game.pixels;
    let changed = false;
    for (let i = 0; i < px.length; i++) {
      const v = px[i], c = (0xff000000 | ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff)) >>> 0;
      if (rgba[i] !== c) { rgba[i] = c; changed = true; }
    }
    if (changed) ctx.putImageData(image, 0, 0);
  };
}
