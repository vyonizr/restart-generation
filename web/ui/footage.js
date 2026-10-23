// Footage (CONTEXT.md, docs/adr/0028): a replay rendered to an MP4 file on the replay page. The engine runs on its own clock
// (web/emu/win32.js), so the page steps it as fast as it can instead of in real time, hands each frame to an H.264 encoder and each
// block of sound to an AAC encoder (WebCodecs, through Mediabunny), and gets an exact 30 frames a second whatever the device does.
// It always renders the whole replay as the original player first showed it: from the engine's first frame, at 1× with idle time
// skipped, to one second after the replay ends, in the Screen finish the page shows (CONTEXT.md).
// The replay page loads this module, and with it Mediabunny, in a chunk of its own after the page (replay.svelte.js).
import { Output, Mp4OutputFormat, BufferTarget, VideoSampleSource, AudioSampleSource, VideoSample, AudioSample, canEncodeVideo, canEncodeAudio } from 'mediabunny';
import { REPLAY_WIDTH, REPLAY_HEIGHT } from '../emu/host.js';
import { LOAD_LIMIT_MS, replayEnded } from './replayflow.js';
import { SOUND_BLOCK_MS } from './audio.js';
import { rgbaOf } from './screen.js';

const SCALE = 3; // a whole number, so the pixels stay square in an editor that can only scale smoothly
const WIDTH = REPLAY_WIDTH * SCALE, HEIGHT = REPLAY_HEIGHT * SCALE;
const FPS = 30;
const VIDEO = { codec: 'avc', bitrate: 8e6, keyFrameInterval: 1 };
// The engine's sound is 8 kHz mono in blocks of 512 samples, which AAC encoders don't take: it goes in at 48 kHz.
const SOUND_RATE = 8000, RATE = 48000, UP = RATE / SOUND_RATE;
const AUDIO = { codec: 'aac', bitrate: 128e3 };
const HOLD_MS = 1000; // after the end, so an editor has a clean tail
const YIELD_MS = 50; // the page gets the main thread back this often, for the progress bar and Cancel

export async function canExportFootage() {
  try {
    return await canEncodeVideo(VIDEO.codec, { width: WIDTH, height: HEIGHT, bitrate: VIDEO.bitrate, frameRate: FPS })
      && await canEncodeAudio(AUDIO.codec, { numberOfChannels: 1, sampleRate: RATE, bitrate: AUDIO.bitrate });
  } catch { return false; }
}

// Renders the replay of `game` (a GameHost started with one, web/emu/host.js) and resolves with the MP4 as a Blob, in the soft
// Screen finish if `soft`. It boots the engine again, so the replay starts over, and once that boot has worked leaves it with the
// replay's battle built, wherever it stopped: done, canceled through `signal` (rejects with its reason), or failed. Its sound is
// drained up to `game.time` by the page's rule (audio.js). `progress(fraction)` is called each time the page gets the main
// thread back.
export async function renderFootage(game, { soft, signal, progress }) {
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target: new BufferTarget() });
  const video = new VideoSampleSource(VIDEO), audio = new AudioSampleSource(AUDIO);
  output.addVideoTrack(video, { frameRate: FPS });
  output.addAudioTrack(audio);
  const paint = painter(soft);
  let booted = false, frames = 0, blocks = 0, last = 0, loaded = false, endAt = Infinity, yielded = performance.now();
  try {
    await output.start();
    game.boot();
    booted = true;
    while (game.time < endAt) {
      signal.throwIfAborted();
      game.tick();
      if (!loaded && game.replayLoaded) {
        loaded = true;
        game.setReplayMode({ skipEmpty: true, doubleSpeed: false });
      }
      if (!loaded && game.time >= LOAD_LIMIT_MS) throw new Error("The game couldn't load this replay.");
      // Frame n shows what the engine drew in the frame that covers n / 30 s. Its frames are 33 ms apart, so one in a hundred of
      // them is never shown, which keeps the picture on the sound's clock.
      for (let picture = null; frames * 1000 / FPS < game.time; frames++) {
        picture ??= paint(game);
        // The frame copies the picture, so the next one can be drawn over it.
        const sample = new VideoSample(new VideoFrame(picture, { timestamp: Math.round(frames * 1e6 / FPS), duration: Math.round(1e6 / FPS) }));
        await video.add(sample);
        sample.close();
      }
      for (; blocks * SOUND_BLOCK_MS < game.time; blocks++) {
        const [data, end] = resample(game.pullSound(), last);
        last = end;
        const sample = new AudioSample({ data, format: 'f32', numberOfChannels: 1, sampleRate: RATE, timestamp: blocks * SOUND_BLOCK_MS / 1000 });
        await audio.add(sample);
        sample.close();
      }
      if (loaded && endAt === Infinity && replayEnded(game.replayTime, game.replayLength, game)) endAt = game.time + HOLD_MS;
      if (performance.now() - yielded >= YIELD_MS) {
        progress(loaded && game.replayLength > 0 ? Math.min(game.replayTime / game.replayLength, 1) : 0);
        await nextTask();
        yielded = performance.now();
      }
    }
    await output.finalize();
    signal.throwIfAborted(); // Cancel, pressed while the file was being finished
    return new Blob([output.target.buffer], { type: 'video/mp4' });
  } catch (e) {
    await output.cancel().catch(() => {});
    throw e;
  } finally {
    // The page's controls reach the replay's battle, which a new engine builds a few frames in (replayflow.js).
    while (booted && !game.replayLoaded && game.time < LOAD_LIMIT_MS) {
      game.tick();
      for (; blocks * SOUND_BLOCK_MS < game.time; blocks++) game.pullSound();
    }
  }
}

// Draws the engine's 420 × 378 frame three times its size as the page shows it in the Screen finish (CONTEXT.md, stage.css): sharp,
// each pixel a 3 × 3 square, or soft, smoothed and under a faint grid of one cell per game pixel. The canvas it returns is drawn
// over on the next call.
function painter(soft) {
  const frame = new OffscreenCanvas(REPLAY_WIDTH, REPLAY_HEIGHT), frameCtx = frame.getContext('2d');
  const image = frameCtx.createImageData(REPLAY_WIDTH, REPLAY_HEIGHT), rgba = new Uint32Array(image.data.buffer);
  const out = new OffscreenCanvas(WIDTH, HEIGHT), ctx = out.getContext('2d', { alpha: false });
  ctx.imageSmoothingEnabled = soft;
  const grid = soft ? ctx.createPattern(gridCell(), 'repeat') : null;
  return game => {
    const src = game.pixels, pitch = game.pitch;
    for (let y = 0, i = 0; y < REPLAY_HEIGHT; y++) for (let x = 0; x < REPLAY_WIDTH; x++, i++) rgba[i] = rgbaOf(src[y * pitch + x]);
    frameCtx.putImageData(image, 0, 0);
    ctx.drawImage(frame, 0, 0, WIDTH, HEIGHT);
    if (grid) { ctx.fillStyle = grid; ctx.fillRect(0, 0, WIDTH, HEIGHT); }
    return out;
  };
}

// One game pixel's cell of the soft finish's grid, as stage.css draws it: across the cell, clear for 55%, then darkening to black
// at 22% at its right edge, and the same down to its bottom edge; read at each output pixel's middle.
function gridCell() {
  const shade = k => Math.max(0, ((k + 0.5) / SCALE - 0.55) / 0.45) * 0.22;
  const cell = new OffscreenCanvas(SCALE, SCALE), ctx = cell.getContext('2d'), image = ctx.createImageData(SCALE, SCALE);
  for (let y = 0; y < SCALE; y++) for (let x = 0; x < SCALE; x++) image.data[(y * SCALE + x) * 4 + 3] = Math.round((1 - (1 - shade(x)) * (1 - shade(y))) * 255);
  ctx.putImageData(image, 0, 0);
  return cell;
}

// A block of 16-bit samples at 8 kHz as floats at 48 kHz, each step drawn as a line from the previous sample (`last`, the end of
// the block before), so the sound lags by one 8 kHz sample, 0.125 ms. Returns the floats and this block's last sample.
function resample(pcm, last) {
  const out = new Float32Array(pcm.length * UP);
  let a = last;
  for (let i = 0; i < pcm.length; i++) {
    const b = pcm[i] / 32768;
    for (let k = 0; k < UP; k++) out[i * UP + k] = a + (b - a) * (k + 1) / UP;
    a = b;
  }
  return [out, a];
}

// The next task, not a timer: browsers slow timers in a hidden tab to one a second, but not messages.
const nextTask = () => new Promise(resolve => {
  const { port1, port2 } = new MessageChannel();
  port1.onmessage = () => { port1.close(); resolve(); };
  port2.postMessage(null);
});
