// Footage (CONTEXT.md, docs/adr/0028): a replay rendered to an MP4 file on the replay page. The engine runs on its own clock
// (shared/emu/win32.js), so the page steps it as fast as it can instead of in real time, hands each frame to an H.264 encoder and each
// block of sound to an AAC encoder (WebCodecs, through Mediabunny), and gets an exact 30 frames a second whatever the device does.
// It always renders the whole replay as the original player first showed it: from the engine's first frame, at 1× with idle time
// skipped, to one second after the replay ends, in the Screen finish the page shows (CONTEXT.md). Broadcast footage (CONTEXT.md)
// adds the page's title band over the battle and its lower third under it, and holds the end for three seconds.
// The replay page loads this module, and with it Mediabunny, in a chunk of its own after the page (replay.svelte.js).
import { Output, Mp4OutputFormat, BufferTarget, VideoSampleSource, AudioSampleSource, VideoSample, AudioSample, Quality, canEncodeVideo, canEncodeAudio } from 'mediabunny';
import { REPLAY_WIDTH, REPLAY_HEIGHT } from '../../../../shared/emu/host.js';
import { LOAD_LIMIT_MS, createEndWatch, createDefeats } from './replay-flow.js';
import { SOUND_BLOCK_MS } from '../game/audio.js';
import { rgbaOf } from '../game/screen.js';
import { gridCell } from '../game/finish.js';
import { heroName, shortDay } from '../../../../shared/replay-text.js';

// The battle at most 1080 px tall: 1200 × 1080, 1080 / 378 of the engine's size. Not a whole multiple, so the picture is made at
// three times the engine's size, where each game pixel is a 3 × 3 square, and shrunk smoothly into it: every game pixel comes out
// the same size, its edges a little soft, instead of some 2 and some 3 pixels wide.
const SCALE = 3;
const HEIGHT = 1080, WIDTH = REPLAY_WIDTH * HEIGHT / REPLAY_HEIGHT;
const FPS = 30;
// Constant quality rather than a bitrate, so the file grows with what moves on screen and not with its length: Mediabunny's 'high',
// a quantizer of 22 out of H.264's 0 to 51 (TASVideos publishes game footage at a CRF of 20). A fixed bitrate spends the same bits
// on a still board as on a fight; measured on a 74 s battle with a hardware encoder, 8 Mbps came to 73 MB and this to 31 MB, scored
// 96 against 97.5 in VMAF. An encoder that takes no quantizer (OpenH264, used where a browser has no hardware one) gets the bitrate
// Mediabunny gives 'high' at this size, 3.9 Mbps, where more bits buy it little. A key frame every 2 seconds, Mediabunny's
// default, keeps scrubbing in an editor quick.
const VIDEO = { codec: 'avc', quality: new Quality('high') };
// The engine's sound is 8 kHz mono in blocks of 512 samples, which AAC encoders don't take: it goes in at 48 kHz, at 96 kbps, the
// least Windows' AAC encoder takes and more than sound with nothing above 4 kHz needs.
const SOUND_RATE = 8000, RATE = 48000, UP = RATE / SOUND_RATE;
const AUDIO = { codec: 'aac', quality: new Quality({ bitrate: 96e3 }) };
const HOLD_MS = 1000; // after the end, so an editor has a clean tail
const DETAILS_HOLD_MS = 3000; // with the winner's crown and the defeated seats in the lower third, long enough to read them
const YIELD_MS = 50; // the page gets the main thread back this often, for the progress bar and Cancel
// Broadcast footage's bands: the page's design (DESIGN.md, replay.css) at the size it has beside the battle on a desktop, where the
// page shows the battle at most 640 px tall (--screen-h): BAND times the design's pixels, so the file is as wide as the battle and
// its bands and text are as big beside the battle as on the page. The title band is 40 px tall, and the lower third as tall as one
// seat: 8 px around a name at 17 px over a hero at 13 px. H.264 takes even sizes only, so the lower third rounds to make one.
const BAND = HEIGHT / 640;
const TITLE = Math.round(40 * BAND);
const SEATS = (h => h + (TITLE + HEIGHT + h) % 2)(Math.round((16 + 17 * 1.15 + 13 * 1.3) * BAND));
const fileHeight = details => details ? TITLE + HEIGHT + SEATS : HEIGHT;

export async function canExportFootage() {
  try {
    for (const height of [fileHeight(false), fileHeight(true)]) {
      if (!await canEncodeVideo(VIDEO.codec, { width: WIDTH, height, quality: VIDEO.quality, frameRate: FPS })) return false;
    }
    return await canEncodeAudio(AUDIO.codec, { numberOfChannels: 1, sampleRate: RATE, quality: AUDIO.quality });
  } catch { return false; }
}

// Renders the replay of `game` (a GameHost started with one, shared/emu/host.js) and resolves with the MP4 as a Blob, in the soft
// Screen finish if `soft`, as broadcast footage of the replay `details` describes (its meta, server/battle.js replay()) if given.
// It boots the engine again, so the replay starts over, and once that boot has worked leaves it with the replay's battle built,
// wherever it stopped: done, canceled through `signal` (rejects with its reason), or failed. Its sound is drained up to `game.time`
// by the page's rule (audio.js). `progress(fraction)` is called each time the page gets the main thread back.
export async function renderFootage(game, { soft, details, signal, progress }) {
  const output = new Output({ format: new Mp4OutputFormat({ fastStart: false }), target: new BufferTarget() });
  const video = new VideoSampleSource(VIDEO), audio = new AudioSampleSource(AUDIO);
  output.addVideoTrack(video, { frameRate: FPS });
  output.addAudioTrack(audio);
  const { picture, paint } = painter(soft, details ? TITLE : 0, fileHeight(details));
  let bands = null, booted = false, frames = 0, blocks = 0, last = 0, loaded = false, endAt = Infinity, yielded = performance.now();
  // The seats the lower third shows as defeated, as the page follows them (replay-flow.js); the render always plays.
  const defeats = details && createDefeats(() => details.players.map(p => p.seat)), over = createEndWatch();
  try {
    if (details) bands = await broadcast(picture.getContext('2d'), details);
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
      if (loaded && defeats?.frame(game, true)) bands.seats(defeats.shown);
      // Frame n shows what the engine drew in the frame that covers n / 30 s. Its frames are 33 ms apart, so one in a hundred of
      // them is never shown, which keeps the picture on the sound's clock.
      for (let painted = false; frames * 1000 / FPS < game.time; frames++) {
        if (!painted) { paint(game); painted = true; }
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
      if (loaded && endAt === Infinity && over(game)) {
        endAt = game.time + (bands ? DETAILS_HOLD_MS : HOLD_MS);
        if (defeats) { defeats.finish(); bands.seats(defeats.shown, details.result?.winners); } // as the page at its end
      }
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
    // The page's controls reach the replay's battle, which a new engine builds a few frames in (replay-flow.js).
    while (booted && !game.replayLoaded && game.time < LOAD_LIMIT_MS) {
      game.tick();
      for (; blocks * SOUND_BLOCK_MS < game.time; blocks++) game.pullSound();
    }
  }
}

// Draws the engine's 420 × 378 frame as the page shows it in the Screen finish (CONTEXT.md, stage.css) at WIDTH × HEIGHT, `top`
// pixels down a picture `height` tall. Sharp: each pixel a 3 × 3 square, then the whole shrunk smoothly. Soft: smoothed straight to
// its size, under a faint grid of one cell per game pixel that is drawn at three times the engine's size and shrunk the same way
// once, at the start. Each takes two draws a frame, as a whole-number scale did: every draw is a wait for the graphics card when
// the frame is read, and a third (the soft picture at three times its size, then shrunk) made rendering a fifth slower. Smoothing
// stays the default bilinear: 'high' made it a third slower again. The picture is drawn over on the next call; only the battle's
// part of it changes.
function painter(soft, top, height) {
  const frame = new OffscreenCanvas(REPLAY_WIDTH, REPLAY_HEIGHT), frameCtx = frame.getContext('2d');
  const image = frameCtx.createImageData(REPLAY_WIDTH, REPLAY_HEIGHT), rgba = new Uint32Array(image.data.buffer);
  const picture = new OffscreenCanvas(WIDTH, height), ctx = picture.getContext('2d', { alpha: false });
  const big = new OffscreenCanvas(REPLAY_WIDTH * SCALE, REPLAY_HEIGHT * SCALE), bigCtx = big.getContext('2d');
  let grid = null;
  if (soft) {
    bigCtx.fillStyle = bigCtx.createPattern(gridCell(SCALE), 'repeat');
    bigCtx.fillRect(0, 0, big.width, big.height);
    grid = new OffscreenCanvas(WIDTH, HEIGHT);
    grid.getContext('2d').drawImage(big, 0, 0, WIDTH, HEIGHT);
  } else bigCtx.imageSmoothingEnabled = false;
  const paint = game => {
    const src = game.pixels, pitch = game.pitch;
    for (let y = 0, i = 0; y < REPLAY_HEIGHT; y++) for (let x = 0; x < REPLAY_WIDTH; x++, i++) rgba[i] = rgbaOf(src[y * pitch + x]);
    frameCtx.putImageData(image, 0, 0);
    if (soft) {
      ctx.drawImage(frame, 0, top, WIDTH, HEIGHT);
      ctx.drawImage(grid, 0, top);
    } else {
      bigCtx.drawImage(frame, 0, 0, big.width, big.height);
      ctx.drawImage(big, 0, top, WIDTH, HEIGHT);
    }
  };
  return { picture, paint };
}

// Broadcast footage's bands on `ctx`, as the replay page draws them (ReplayBroadcast.svelte, replay.css) at BAND times their size,
// in the page's own fonts and colors: the title band over the battle (the REPLAY tag, the day and the kind of match, without Share
// and Download replay) and the lower third under it, always one row. They stay as drawn, as the battle is drawn between them;
// `seats(defeated, crowned)` draws the lower third again with those seats defeated and those crowned.
async function broadcast(ctx, meta) {
  const css = getComputedStyle(document.documentElement), token = name => css.getPropertyValue(name).trim();
  const display = token('--display'), body = token('--body'), px = n => n * BAND;
  const font = (family, size) => `400 ${px(size)}px ${family}`;
  await Promise.all([font(display, 18), font(body, 13)].map(f => document.fonts.load(f)));
  // Each line of text where CSS puts it: its font's ascent and descent centred on the middle of its line box, which is what
  // line-height does, rather than the middle of the em square (textBaseline 'middle'), which sits lower in Anton.
  ctx.textBaseline = 'alphabetic';
  const say = (text, x, centre) => {
    const m = ctx.measureText(text);
    ctx.fillText(text, x, centre + (m.fontBoundingBoxAscent - m.fontBoundingBoxDescent) / 2);
  };

  // The title band: the crimson REPLAY tag, in Anton at 15 px with 0.04em between letters and 12 px each side, then the facts line.
  ctx.fillStyle = token('--ink-2');
  ctx.fillRect(0, 0, WIDTH, TITLE);
  ctx.font = font(display, 15);
  ctx.letterSpacing = `${px(15 * 0.04)}px`;
  const tag = ctx.measureText('REPLAY').width + px(24);
  ctx.fillStyle = token('--red');
  ctx.fillRect(0, 0, tag, TITLE);
  ctx.fillStyle = '#fff';
  say('REPLAY', px(12), TITLE / 2);
  ctx.letterSpacing = '0px';
  ctx.font = font(body, 13);
  ctx.fillStyle = token('--light-2');
  const facts = `${shortDay(meta.created)} - ${meta.ranked ? 'Ranked' : 'Friendly'} match`;
  say(cut(ctx, facts, WIDTH - tag - px(18)), tag + px(12), TITLE / 2);

  // The lower third: one equal cell per seat, divided by a 1 px line, each with 8 px 10 px around the seat's square and the name
  // over the hero. The square is as tall as the name and the hero together. A defeated seat goes one ink step down, its square
  // only an outline in its color with the number in it, and its name grey; a winner's square wears the crown at the end.
  const top = TITLE + HEIGHT, cell = WIDTH / meta.players.length, middle = top + SEATS / 2;
  const name = px(17 * 1.15), hero = px(13 * 1.3), lines = middle - (name + hero) / 2, square = name + hero;
  const crown = new Path2D('M1 13V3l5.5 4.5L11 1l4.5 6.5L21 3v10z'); // replay.css's, 22 × 14
  const seats = (defeated = new Set(), crowned = []) => meta.players.forEach((p, i) => {
    const left = i * cell, right = left + cell - px(10), out = defeated.has(p.seat), color = token(`--seat-${p.seat}`);
    ctx.fillStyle = token(out ? '--ink-1' : '--ink-2');
    ctx.fillRect(left, top, cell, SEATS);
    if (i) { ctx.fillStyle = token('--ink-3'); ctx.fillRect(Math.round(left), top, Math.round(px(1)), SEATS); }
    const x0 = left + px(10);
    if (out) {
      ctx.strokeStyle = color;
      ctx.lineWidth = px(2);
      ctx.strokeRect(x0 + px(1), lines + px(1), square - px(2), square - px(2));
    } else {
      ctx.fillStyle = color;
      ctx.fillRect(x0, lines, square, square);
    }
    ctx.fillStyle = out ? color : token(`--seat-${p.seat}-ink`);
    ctx.font = font(display, 18);
    ctx.textAlign = 'center';
    say(String(p.seat), x0 + square / 2, middle);
    ctx.textAlign = 'left';
    if (crowned.includes(p.seat)) {
      // Sitting on the middle of the square's top edge, 6 px into it, its outline under its fill (paint-order: stroke)
      ctx.save();
      ctx.translate(x0 + square / 2 - px(11), lines + px(6) - px(14));
      ctx.scale(BAND, BAND);
      ctx.lineWidth = 1.5;
      ctx.strokeStyle = token('--ink-2');
      ctx.stroke(crown);
      ctx.fillStyle = '#fff';
      ctx.fill(crown);
      ctx.restore();
    }
    const x = x0 + square + px(10);
    ctx.font = font(display, 17);
    ctx.fillStyle = out ? token('--light-3') : '#fff';
    say(cut(ctx, `${p.name}${p.bot ? ' (CPU)' : ''}`.toUpperCase(), right - x), x, lines + name / 2);
    ctx.font = font(body, 13);
    ctx.fillStyle = token('--light-3');
    say(cut(ctx, heroName(p.hero), right - x), x, lines + name + hero / 2);
  });
  seats();
  return { seats };
}

// `text` cut with an ellipsis to fit `width` in the context's font, as CSS's text-overflow does.
function cut(ctx, text, width) {
  if (ctx.measureText(text).width <= width) return text;
  let fits = 0;
  for (let lo = 0, hi = text.length - 1; lo <= hi;) {
    const mid = (lo + hi) >> 1;
    if (ctx.measureText(`${text.slice(0, mid)}…`).width <= width) { fits = mid; lo = mid + 1; } else hi = mid - 1;
  }
  return `${text.slice(0, fits)}…`;
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
