// The showcase's stills (docs/adr/0036): pictures of the page without the engine, each with one battle frame drawn into its game
// screen, for features the page shows around the game. They need no battle templates and no Bots, only RG_GAME for the frame. A
// still is the page now (the cast's gateway, signed in as the hero), or, with `before`, the page at that git ref beside it
// (refs.mjs), which makes a comparison card.
//
// Each still names:
//   feature   its words in copy.mjs
//   device    'phone' (a 9:16 card) or 'desktop' (16:9 and 1:1 cards)
//   path      the page: '/', '/replay/<id>', '/terms/' or '/privacy/'
//   before    for a comparison, the git ref to show beside it; `after`, if given, the ref it is compared with instead of now
//   frame     the battle in the game screen: a scenario of tools/emu/scenarios.mjs and its tick, on the page's own board view
//   setup     run in the page once it has loaded: the state it shows (a pad awake, a dialog open)
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { root, gateway, battles } from './stage.mjs';
import { ASPECTS, open } from './capture.mjs';
import { serveRef } from './refs.mjs';
import { loadGame } from '../../shared/game.mjs';
import { SCENARIOS, pinClock, scenarioEngine, playTick } from '../emu/scenarios.mjs';

// The touch pad as it is while a battle runs: every control awake, and the tools a battle shows (Keyboard, Fullscreen) shown.
const battlePad = () => {
  for (const el of document.querySelectorAll('.asleep')) el.classList.remove('asleep');
  for (const id of ['type', 'fullscreen']) document.getElementById(id)?.removeAttribute('hidden');
};

export const STILLS = {
  // The touch pad's redesign (.scratch/touch-controls/spec.md): the cross of squares mid-page, then the round D-pad at the foot.
  'touch-pad-update': { feature: 'touchpad', device: 'phone', path: '/', before: '560f6c9', frame: { scenario: 'fight', tick: 2600 }, setup: battlePad },
  'touch-pad': { feature: 'phone', device: 'phone', path: '/', frame: { scenario: 'fight', tick: 2600 }, setup: battlePad },
};

// The shapes a still is taken in, and the cards made of it: a phone's in 9:16; a desktop's in 16:9 and 1:1, a comparison's both
// cards from 16:9 pictures (side by side, then stacked).
export const shapesOf = s => s.device === 'phone' ? ['9x16'] : s.before ? ['16x9'] : ['16x9', '1x1'];
export const cardShapesOf = s => s.device === 'phone' ? ['9x16'] : ['16x9', '1x1'];

// The frame of `scenario` at `tick` on the board `view` ('full' or 'classic'), as RGBA bytes, from the scripted battle played in
// Node with the clock pinned, so it's the same on every machine with the game.
const frames = new Map();
async function frameOf(files, { scenario, tick }, view) {
  const key = `${scenario}:${tick}:${view}`;
  if (!frames.has(key)) {
    const s = SCENARIOS[scenario];
    if (!s) throw new Error(`no scenario ${scenario} in tools/emu/scenarios.mjs`);
    const restore = [performance.now, Date.now];
    pinClock();
    try {
      const g = scenarioEngine(files, view), keys = new Map(s.keys), pulled = new Map();
      for (let i = 1; i <= tick; i++) playTick(g, keys, i, pulled);
      const rgba = Buffer.alloc(g.width * g.height * 4);
      for (let y = 0; y < g.height; y++) for (let x = 0; x < g.width; x++) {
        const v = g.pixels[y * g.pitch + x], o = (y * g.width + x) * 4;
        rgba[o] = (v >> 16) & 255; rgba[o + 1] = (v >> 8) & 255; rgba[o + 2] = v & 255; rgba[o + 3] = 255;
      }
      frames.set(key, { width: g.width, height: g.height, rgba: rgba.toString('base64') });
    } finally {
      [performance.now, Date.now] = restore;
    }
  }
  return frames.get(key);
}

// Photographs `still` at `url` in `context` into `file`: the page loaded, its setup run, the overlay over the screen hidden and the
// battle frame drawn into the screen's own canvas, so the page's screen finish (Soft or Sharp) and its pixel grid apply as in play.
async function photograph(context, url, still, files, file) {
  const page = await context.newPage();
  try {
    await page.goto(url);
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.fonts.ready);
    if (still.setup) await page.evaluate(still.setup);
    const view = await page.evaluate(() => document.querySelector('.page')?.dataset.frame === 'classic' ? 'classic' : 'full');
    const frame = await frameOf(files, still.frame, view);
    const drawn = await page.evaluate(({ width, height, rgba }) => {
      const old = document.querySelector('.screen canvas');
      if (!old) return false;
      document.getElementById('overlay')?.setAttribute('hidden', '');
      // A canvas the page hasn't drawn into yet takes a 2D context; one that has, is swapped for a copy that does.
      let canvas = old;
      let g = old.getContext('2d');
      if (!g) { canvas = old.cloneNode(); old.replaceWith(canvas); g = canvas.getContext('2d'); }
      canvas.width = width; canvas.height = height;
      const bytes = Uint8ClampedArray.from(atob(rgba), c => c.charCodeAt(0));
      g.putImageData(new ImageData(bytes, width, height), 0, 0);
      return true;
    }, frame);
    if (!drawn) throw new Error(`${url} has no game screen to draw the battle into`);
    await page.waitForTimeout(300);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    await page.screenshot({ path: file });
  } finally {
    await page.close();
  }
}

// Takes the stills `only` (all if null) in the shapes `aspects`, into out/stills/, and adds each to the manifest through `add`:
// a still as { kind: 'still', file }, a comparison as { kind: 'compare', file (now), before }. Resolves with the stills that failed.
export async function takeStills({ browser, out, game, only, aspects, add, log = console.log }) {
  const names = only ?? Object.keys(STILLS);
  for (const n of names) if (!STILLS[n]) throw new Error(`--stills: no still ${n} (${Object.keys(STILLS).join(', ')})`);
  const files = await loadGame(game);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-showcase-stills-'));
  const played = await battles(path.join(out, 'cache'), { play: false });
  const gw = await gateway(dir, null, played);
  const refs = new Map(); // a ref's server, started once for every still that shows it
  const serve = async ref => { if (!refs.has(ref)) refs.set(ref, serveRef(ref)); return refs.get(ref); };
  const failed = [];
  try {
    for (const name of names) {
      const still = STILLS[name], cards = cardShapesOf(still).filter(c => aspects.includes(c));
      // A still's picture is its card's shape; a comparison takes its pictures in shapesOf() for whichever of its cards are wanted.
      const pictures = !cards.length ? [] : still.before ? shapesOf(still) : cards;
      for (const aspect of pictures) {
        log(`Still ${name} at ${ASPECTS[aspect].label}…`);
        try {
          const shoot = async (ref, file) => {
            const server = ref ? await serve(ref) : gw;
            const context = ref ? await browser.newContext(ASPECTS[aspect].context) : await open(browser, gw, aspect);
            try { await photograph(context, server.url + still.path, still, files, file); } finally { await context.close(); }
          };
          const now = path.join(out, 'stills', `${name}-${aspect}.png`);
          await shoot(still.after ?? null, now);
          if (!still.before) {
            // A phone's game page has no header, so the picture doesn't show the site's name (shots.mjs does the same).
            add({ kind: 'still', file: now, aspect, feature: still.feature, name: !(ASPECTS[aspect].phone && still.path === '/'), still: name });
            continue;
          }
          const before = path.join(out, 'stills', `${name}-before-${aspect}.png`);
          await shoot(still.before, before);
          for (const card of cards) add({ kind: 'compare', file: now, before, aspect: card, shot: aspect, feature: still.feature, still: name });
        } catch (e) {
          failed.push(`${name} at ${ASPECTS[aspect].label}: ${e.message.split('\n')[0]}`);
          log(`  ${name} at ${ASPECTS[aspect].label} failed: ${e.message.split('\n')[0]}`);
        }
      }
    }
  } finally {
    gw.stop();
    for (const r of refs.values()) await r.then(s => s.stop(), () => {});
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }); } catch { /* a file the OS still holds */ }
  }
  return failed;
}
