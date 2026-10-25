// Filming the page for the showcase (docs/adr/0036). The window takes each picture's shape (16:9, 1:1, or a phone at 9:16), so the
// page lays itself out for it and nothing is cropped. The page runs on Playwright's fake clock: once the game has started, the
// script holds the clock and moves it on itself, so the engine runs as fast as the machine allows between pictures instead of in
// real time, and a clip is filmed a frame at a time, 1/30 s apart, whatever the machine does. Each frame goes to an MP4 encoder page
// (encoder.html), in a context of its own whose clock is the real one, while the next is photographed.
import fs from 'node:fs';
import path from 'node:path';
import { chromium, devices } from '@playwright/test';
import { root } from './stage.mjs';
import { SOUND_RATE } from './sound.mjs';

export const FPS = 30;

// The three shapes. A phone is Playwright's Pixel 7 (touch, a phone's browser) in a 9:16 window, drawn at 1080 × 1920.
export const ASPECTS = {
  '16x9': { label: '16:9', w: 1920, h: 1080, context: { viewport: { width: 1920, height: 1080 } } },
  '1x1': { label: '1:1', w: 1080, h: 1080, context: { viewport: { width: 1080, height: 1080 } } },
  '9x16': { label: '9:16', w: 1080, h: 1920, phone: true,
    context: { ...devices['Pixel 7'], viewport: { width: 405, height: 720 }, screen: { width: 405, height: 720 }, deviceScaleFactor: 1080 / 405 } },
};

// Edge on Windows, as the engine tests run there, for its hardware H.264 encoder; Playwright's Chromium elsewhere.
export const launch = () => chromium.launch({ channel: process.platform === 'win32' ? 'msedge' : undefined });

const SHOWCASE = path.join(root, 'tools', 'showcase');
const MEDIABUNNY = path.join(root, 'node_modules', 'mediabunny', 'dist', 'bundles', 'mediabunny.min.mjs');

// A browser context in `aspect`'s shape on the gateway `gw`, signed in as the hero, with `storage` (more localStorage, such as the
// board view).
export function open(browser, gw, aspect, storage = {}) {
  const items = { 'rg:account': JSON.stringify(gw.account), ...storage };
  return browser.newContext({ ...ASPECTS[aspect].context, baseURL: gw.url,
    storageState: { cookies: [], origins: [{ origin: gw.url, localStorage: Object.entries(items).map(([name, value]) => ({ name, value })) }] } });
}

// A page on Playwright's clock, which runs as the real one until hold().
export async function clockedPage(context) {
  const page = await context.newPage();
  await page.clock.install();
  return page;
}

// From now on the page's time moves only when the script moves it. The clock runs on while this is asked for, by more than a
// moment on a busy machine, so it is asked again further ahead until it is still ahead.
export async function hold(page) {
  for (let ahead = 100; ; ahead *= 4) {
    try {
      await page.clock.pauseAt(await page.evaluate(() => Date.now()) + ahead);
      return;
    } catch (e) {
      if (!/to the past/.test(e.message) || ahead > 10000) throw e;
    }
  }
}

// Moves a held page's clock on `ms`, a quarter of a second at a time with a moment of real time between, so the server's answers
// (the Arena login, a room) reach the page as they would while the time passes.
export async function pass(page, ms) {
  for (let t = 0; t < ms; t += 250) {
    await page.clock.runFor(Math.min(250, ms - t));
    await page.waitForTimeout(15);
  }
}

// Moves a held page's clock on until `fn` (run in the page) is true, at most `ms`.
export async function until(page, fn, arg, ms = 120000) {
  for (let t = 0; !(await page.evaluate(fn, arg)); t += 500) {
    if (t > ms) throw new Error(`waited ${ms / 1000} s of the page's time for ${fn}`);
    await pass(page, 500);
  }
}

// The encoder page, with the files of `out` (tmp/showcase/) under /__showcase/file/. WebCodecs is for secure pages only, which a
// localhost address is: this one is made up and served entirely by these routes. One page encodes one file at a time.
export async function encoder(browser, out) {
  const context = await browser.newContext({ baseURL: 'http://localhost:9' });
  await context.route('**/*', r => {
    const p = decodeURIComponent(new URL(r.request().url()).pathname);
    if (p === '/__showcase/encoder.html') return r.fulfill({ path: path.join(SHOWCASE, 'encoder.html'), contentType: 'text/html' });
    if (p === '/__showcase/mediabunny.mjs') return r.fulfill({ path: MEDIABUNNY, contentType: 'text/javascript' });
    if (p.startsWith('/__showcase/file/')) return r.fulfill({ path: path.join(out, p.slice('/__showcase/file/'.length)) });
    return r.fulfill({ status: 404 });
  });
  const page = await context.newPage();
  await page.goto('/__showcase/encoder.html');
  await page.waitForFunction(() => window.clipReady);
  return page;
}

// Frames on their way to the encoder at most: the page is photographed while the ones before are encoded.
const QUEUE = 4;

// A clip of the held `page` into `file`, encoded by `enc` (encoder()), with a sound track if `withSound`. `film.frames(n, between)`
// films n frames, calling `between(i)` before each (a key press, a click); `film.still(file)` saves the frame on screen as a PNG;
// `film.save(sound)` finishes the MP4, with `sound` (16-bit samples at 8 kHz) cut to the frames' length. A frame is a JPEG at
// quality 95, much quicker to make than a PNG and no worse once the H.264 encoder has had it.
export async function film(page, enc, aspect, file, { withSound = false } = {}) {
  const { w, h } = ASPECTS[aspect];
  await enc.evaluate(o => window.clip.start(o), { w, h, withSound });
  let count = 0, queue = Promise.resolve(), waiting = 0;
  const send = jpeg => {
    waiting++;
    queue = queue.then(() => enc.evaluate(b64 => window.clip.frame(b64), jpeg.toString('base64'))).finally(() => { waiting--; });
    queue.catch(() => {}); // a failure surfaces where the queue is awaited
  };
  return {
    get count() { return count; },
    get seconds() { return count / FPS; },
    async frames(n, between) {
      for (let i = 0; i < n; i++) {
        if (between) await between(i);
        await page.clock.runFor(1000 / FPS);
        send(await page.screenshot({ type: 'jpeg', quality: 95 }));
        count++;
        if (waiting >= QUEUE) await queue;
      }
    },
    still: f => still(page, f),
    async save(sound = null) {
      await queue;
      if (sound) {
        const length = Math.min(sound.length, Math.round(count / FPS * SOUND_RATE));
        await enc.evaluate(([b64, rate]) => window.clip.sound(b64, rate), [Buffer.from(sound.buffer, sound.byteOffset, length * 2).toString('base64'), SOUND_RATE]);
      }
      const mp4 = await enc.evaluate(() => window.clip.finish());
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, Buffer.from(mp4, 'base64'));
    },
  };
}

// A still of the whole window into `file`.
export async function still(page, file) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  await page.screenshot({ path: file });
}
