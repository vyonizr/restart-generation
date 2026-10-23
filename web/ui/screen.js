// The game screen, for the game page (game.js) and the replay page (replay.svelte.js). createScreen(canvas) returns
// { kind, paint(game), setCurtain(curtain) }. paint draws the engine's current screen in the middle of the canvas, whose size the
// caller sets. On the Full board's 420 x 378 canvas, a screen smaller than it has the curtain (CONTEXT.md) around it if one is set,
// black otherwise, and where the curtain is opaque it covers the screen too: it overlaps the engine's inset by a few pixels, as the
// engine draws it. A screen as big as the canvas, a Full board battle, has no curtain from the page. kind says how it paints, for
// debugging.
// It paints with WebGL 2 where that works ('webgl2'), which uploads the engine's frame as it is and swaps its colors in the
// shader, and otherwise converts the frame in a loop onto a 2D canvas ('2d'). A benchmark found no battle frame that left the
// picture as it was, so WebGL draws every frame; the 2D loop compares every pixel anyway, so it still skips an unchanged frame,
// as on a static menu.
// With WebGL the curtain fades in and out over 16 paints, as the engine fades its own: in over the last Full board frame, out over
// the new ones. The 2D fallback puts it up and takes it away at once.

// The curtain is the engine's image for its 420 x 378 Full board screen (docs/adr/0017), in the engine's colors, opaque where its
// fourth byte is set.
const CURTAIN_WIDTH = 420, CURTAIN_HEIGHT = 378;
const FADE_STEPS = 16;
const GL_OPTIONS = { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: false };

// One triangle covers the canvas. Under everything is the last frame that filled the canvas (`under`), else black; a smaller
// screen goes over it in the middle (`frame`), and the curtain over both, by `veil`, where it is opaque. The engine's bytes (blue,
// green, red, unused) arrive in a texture as red, green, blue and alpha, hence the swizzle.
const VERTEX = `#version 300 es
void main() { gl_Position = vec4(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0, 0.0, 1.0); }`;
const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D frame, curtain, under;
uniform ivec2 frameAt, curtainAt; // their top-left corners on the canvas
uniform int bottom;               // the canvas's last row: GL counts rows from the bottom, the engine from the top
uniform bool full, hasUnder;      // the screen fills the canvas (and is in under); under holds a frame
uniform float veil;               // how far the curtain is up, 0 to 1
out vec4 color;
bool inside(ivec2 q, ivec2 size) { return all(greaterThanEqual(q, ivec2(0))) && all(lessThan(q, size)); }
void main() {
  ivec2 p = ivec2(int(gl_FragCoord.x), bottom - int(gl_FragCoord.y)), c = p - curtainAt, f = p - frameAt;
  vec3 base = hasUnder ? texelFetch(under, p, 0).bgr : vec3(0.0);
  if (!full && inside(f, textureSize(frame, 0))) base = texelFetch(frame, f, 0).bgr;
  vec4 k = inside(c, textureSize(curtain, 0)) ? texelFetch(curtain, c, 0) : vec4(0.0);
  color = vec4(mix(base, k.bgr, k.a * veil), 1.0);
}`;

export function createScreen(canvas) {
  return (webgl2Works() && glScreen(canvas)) || flatScreen(canvas);
}

// Whether WebGL 2 works here, tried on a canvas of its own: a canvas keeps the first kind of context it gives, so the real one could
// no longer fall back to 2D.
function webgl2Works() {
  const gl = document.createElement('canvas').getContext('webgl2', GL_OPTIONS);
  if (!gl) return false;
  try { program(gl); return true; } catch { return false; } finally { gl.getExtension('WEBGL_lose_context')?.loseContext(); }
}

function program(gl) {
  const p = gl.createProgram();
  for (const [type, source] of [[gl.VERTEX_SHADER, VERTEX], [gl.FRAGMENT_SHADER, FRAGMENT]]) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    gl.attachShader(p, shader);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(`The screen's shaders don't build: ${gl.getProgramInfoLog(p)}`);
  return p;
}

// A new texture, bound to the given unit. It is read whole texels at a time, but without mipmaps it must not be set to filter with
// them, or it reads as black.
function texture(gl, unit) {
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, gl.createTexture());
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
}

// The smaller screen's texture is on unit 0, the curtain's on unit 1 and the last full frame's on unit 2; unit 0 stays active.
// Null if the canvas gives no context.
function glScreen(canvas) {
  const gl = canvas.getContext('webgl2', GL_OPTIONS);
  if (!gl) return null;
  let at, curtain = null, lost = false, source = null, bytes = null, w, h, cw, ch, row, veil = -1, hasUnder = false;
  const uploadCurtain = () => {
    gl.activeTexture(gl.TEXTURE1);
    gl.pixelStorei(gl.UNPACK_ROW_LENGTH, row = 0);
    if (curtain) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, CURTAIN_WIDTH, CURTAIN_HEIGHT, 0, gl.RGBA, gl.UNSIGNED_BYTE,
        new Uint8Array(curtain.buffer, curtain.byteOffset, CURTAIN_WIDTH * CURTAIN_HEIGHT * 4));
    } else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4)); // one clear texel
    gl.activeTexture(gl.TEXTURE0);
  };
  // Builds everything the context holds, at the start and again after the context is restored, when all of it is gone.
  const setUp = () => {
    const p = program(gl);
    gl.useProgram(p);
    at = Object.fromEntries(['frameAt', 'curtainAt', 'bottom', 'full', 'hasUnder', 'veil'].map(n => [n, gl.getUniformLocation(p, n)]));
    gl.uniform1i(gl.getUniformLocation(p, 'curtain'), 1);
    gl.uniform1i(gl.getUniformLocation(p, 'under'), 2);
    texture(gl, 2);
    texture(gl, 1);
    uploadCurtain();
    texture(gl, 0);
    w = h = cw = ch = -1; // the next paint sizes the textures and lays out the canvas
  };
  setUp();
  // While the context is lost, paints do nothing; preventing the default lets the browser restore it.
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; });
  canvas.addEventListener('webglcontextrestored', () => { setUp(); lost = false; });
  return Object.freeze({
    kind: 'webgl2',
    paint(game) {
      if (lost) return;
      const { width, height, pitch } = game;
      // WebGL takes the engine's colors only as bytes.
      if (game.pixels !== source) { source = game.pixels; bytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength); }
      if (canvas.width !== cw || canvas.height !== ch) {
        cw = canvas.width; ch = canvas.height; w = -1;
        gl.viewport(0, 0, cw, ch);
        gl.uniform1i(at.bottom, ch - 1);
        // Only the Full board's canvas has a curtain; on any other it is put out of reach.
        const boardSized = cw === CURTAIN_WIDTH && ch === CURTAIN_HEIGHT;
        gl.uniform2i(at.curtainAt, boardSized ? 0 : cw, boardSized ? 0 : ch);
        gl.activeTexture(gl.TEXTURE2);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, cw, ch, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.activeTexture(gl.TEXTURE0);
        hasUnder = false; gl.uniform1i(at.hasUnder, 0);
        veil = -1; // a new canvas starts with the curtain where it belongs, with no fade
      }
      const full = width === cw && height === ch;
      if (width !== w || height !== h) {
        w = width; h = height;
        if (!full) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        gl.uniform2i(at.frameAt, (cw - w) >> 1, (ch - h) >> 1);
        gl.uniform1i(at.full, full ? 1 : 0);
      }
      const target = full ? 0 : 1;
      veil = veil < 0 ? target : veil < target ? Math.min(target, veil + 1 / FADE_STEPS) : Math.max(target, veil - 1 / FADE_STEPS);
      gl.uniform1f(at.veil, veil);
      if (pitch !== row) gl.pixelStorei(gl.UNPACK_ROW_LENGTH, row = pitch);
      // A frame that fills the canvas also stays behind as `under`, for the curtain to fade in over once the screen is smaller.
      if (full) {
        gl.activeTexture(gl.TEXTURE2);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
        gl.activeTexture(gl.TEXTURE0);
        if (!hasUnder) { hasUnder = true; gl.uniform1i(at.hasUnder, 1); }
      } else gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    },
    // The curtain is kept, not copied, to upload again after a lost context.
    setCurtain(pixels) {
      curtain = pixels;
      if (!lost) uploadCurtain();
    },
  });
}

const rgbaOf = v => (0xff000000 | ((v & 0xff) << 16) | (v & 0xff00) | ((v >> 16) & 0xff)) >>> 0; // the engine's BGRX as canvas RGBA

// The 2D canvas keeps the whole picture in one image: black with the opaque curtain over it, laid down again whenever the canvas,
// the engine's screen size or the curtain changes, and the engine's frame converted into the rest of its area on every paint.
function flatScreen(canvas) {
  const ctx = canvas.getContext('2d');
  let image = null, rgba, cover = null, curtain = null, w = -1, h = -1, stale = true;
  // A browser may drop a hidden page's canvas; the first frame after it returns is always uploaded.
  document.addEventListener('visibilitychange', () => { if (!document.hidden) stale = true; });
  return Object.freeze({
    kind: '2d',
    paint(game) {
      const { pixels, width, height } = game, pitch = game.pitch, cw = canvas.width, ch = canvas.height;
      if (image?.width !== cw || image.height !== ch) { image = ctx.createImageData(cw, ch); rgba = new Uint32Array(image.data.buffer); w = -1; }
      if (width !== w || height !== h) {
        w = width; h = height; stale = true;
        rgba.fill(0xff000000);
        cover = curtain && (w < cw || h < ch) ? new Uint8Array(cw * ch) : null; // where the curtain hides the frame
        const kx = (cw - CURTAIN_WIDTH) >> 1, ky = (ch - CURTAIN_HEIGHT) >> 1;
        if (cover) {
          for (let y = Math.max(0, -ky); y < Math.min(CURTAIN_HEIGHT, ch - ky); y++) {
            for (let x = Math.max(0, -kx); x < Math.min(CURTAIN_WIDTH, cw - kx); x++) {
              const v = curtain[y * CURTAIN_WIDTH + x], j = (ky + y) * cw + kx + x;
              if (v >>> 24) { rgba[j] = rgbaOf(v); cover[j] = 1; }
            }
          }
        }
      }
      const ox = (cw - w) >> 1, oy = (ch - h) >> 1, x0 = Math.max(0, -ox), n = Math.min(w, cw - ox) - x0;
      let changed = stale;
      for (let y = Math.max(0, -oy), y1 = Math.min(h, ch - oy); y < y1; y++) {
        for (let i = y * pitch + x0, j = (oy + y) * cw + ox + x0, end = i + n; i < end; i++, j++) {
          if (cover !== null && cover[j] === 1) continue;
          const c = rgbaOf(pixels[i]);
          if (rgba[j] !== c) { rgba[j] = c; changed = true; }
        }
      }
      if (changed) { ctx.putImageData(image, 0, 0); stale = false; }
    },
    setCurtain(pixels) {
      curtain = pixels;
      w = -1; // the next paint lays it down
    },
  });
}
