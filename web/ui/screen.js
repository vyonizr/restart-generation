// The game screen, for the game page (game.js) and the replay page (replay.svelte.js). createScreen(canvas) returns
// { kind, paint(game), setCurtain(curtain) }. paint draws the engine's current screen in the middle of the canvas, whose size the
// caller sets, with the curtain (CONTEXT.md) around it if one is set and black otherwise. Where the curtain is opaque it covers the
// screen too: it overlaps the engine's inset by a few pixels, as the engine draws it. kind says how it paints, for debugging.
// It paints with WebGL 2 where that works ('webgl2'), which uploads the engine's frame as it is and swaps its colours in the
// shader, and otherwise converts the frame in a loop onto a 2D canvas ('2d'). A benchmark found no battle frame that left the
// picture as it was, so WebGL draws every frame; the 2D loop compares every pixel anyway, so it still skips an unchanged frame,
// as on a static menu.

// The curtain is the engine's image for its 420 x 378 Full board screen (docs/adr/0017), in the engine's colours, opaque where its
// fourth byte is set.
const CURTAIN_WIDTH = 420, CURTAIN_HEIGHT = 378;
const GL_OPTIONS = { alpha: false, antialias: false, depth: false, preserveDrawingBuffer: false };

// One triangle covers the canvas. Each pixel takes the curtain where it is opaque, else the engine's frame where the frame is, else
// black. The engine's bytes (blue, green, red, unused) arrive in a texture as red, green, blue and alpha, hence the swizzle.
const VERTEX = `#version 300 es
void main() { gl_Position = vec4(gl_VertexID == 1 ? 3.0 : -1.0, gl_VertexID == 2 ? 3.0 : -1.0, 0.0, 1.0); }`;
const FRAGMENT = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D frame, curtain;
uniform ivec2 frameAt, curtainAt; // their top-left corners on the canvas
uniform int bottom;               // the canvas's last row: GL counts rows from the bottom, the engine from the top
out vec4 color;
void main() {
  ivec2 p = ivec2(int(gl_FragCoord.x), bottom - int(gl_FragCoord.y)), c = p - curtainAt, f = p - frameAt;
  vec4 k = all(greaterThanEqual(c, ivec2(0))) && all(lessThan(c, textureSize(curtain, 0))) ? texelFetch(curtain, c, 0) : vec4(0.0);
  if (k.a > 0.5) color = vec4(k.bgr, 1.0);
  else if (all(greaterThanEqual(f, ivec2(0))) && all(lessThan(f, textureSize(frame, 0)))) color = vec4(texelFetch(frame, f, 0).bgr, 1.0);
  else color = vec4(0.0, 0.0, 0.0, 1.0);
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

// The frame's texture is on unit 0 and the curtain's on unit 1, and unit 0 stays active. Null if the canvas gives no context.
function glScreen(canvas) {
  const gl = canvas.getContext('webgl2', GL_OPTIONS);
  if (!gl) return null;
  let at, curtain = null, lost = false, source = null, bytes = null, w, h, cw, ch, row;
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
    at = { frame: gl.getUniformLocation(p, 'frameAt'), curtain: gl.getUniformLocation(p, 'curtainAt'), bottom: gl.getUniformLocation(p, 'bottom') };
    gl.uniform1i(gl.getUniformLocation(p, 'curtain'), 1);
    texture(gl, 1);
    uploadCurtain();
    texture(gl, 0);
    w = h = cw = ch = -1; // the next paint sizes the frame's texture and lays out the canvas
  };
  setUp();
  // While the context is lost, paints do nothing; preventing the default lets the browser restore it.
  canvas.addEventListener('webglcontextlost', e => { e.preventDefault(); lost = true; });
  canvas.addEventListener('webglcontextrestored', () => { setUp(); lost = false; });
  return Object.freeze({
    kind: 'webgl2',
    paint(game) {
      if (lost) return;
      const { width, height } = game, pitch = game.pitch ?? width;
      // WebGL takes the engine's colours only as bytes.
      if (game.pixels !== source) { source = game.pixels; bytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength); }
      if (width !== w || height !== h) {
        w = width; h = height; cw = -1;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
      if (canvas.width !== cw || canvas.height !== ch) {
        cw = canvas.width; ch = canvas.height;
        gl.viewport(0, 0, cw, ch);
        gl.uniform2i(at.frame, (cw - w) >> 1, (ch - h) >> 1);
        gl.uniform2i(at.curtain, (cw - CURTAIN_WIDTH) >> 1, (ch - CURTAIN_HEIGHT) >> 1);
        gl.uniform1i(at.bottom, ch - 1);
      }
      if (pitch !== row) gl.pixelStorei(gl.UNPACK_ROW_LENGTH, row = pitch);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, bytes);
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
      const { pixels, width, height } = game, pitch = game.pitch ?? width, cw = canvas.width, ch = canvas.height;
      if (image?.width !== cw || image.height !== ch) { image = ctx.createImageData(cw, ch); rgba = new Uint32Array(image.data.buffer); w = -1; }
      if (width !== w || height !== h) {
        w = width; h = height; stale = true;
        rgba.fill(0xff000000);
        cover = curtain ? new Uint8Array(cw * ch) : null; // where the curtain hides the frame
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
