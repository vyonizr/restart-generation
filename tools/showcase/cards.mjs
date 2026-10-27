// The showcase's cards (docs/adr/0036): each still and clip again, framed for a post in the page's own design (DESIGN.md: the ink
// ground, Anton headlines with the crimson bar, Manrope text, the ghost name): the feature's headline and caption (copy.mjs), and the
// line that says the site isn't official. The site's name is the page's own header in the capture; a card adds it only where the
// capture has none (a phone's game page). A card is HTML photographed by Playwright; a clip's card is that photograph with the clip
// drawn into its window frame by frame on the encoder page, keeping the clip's sound. A comparison (stills.mjs) gets a card of its
// own: the site's name over the feature's headline and the crimson bar, then the page before and after, side by side or stacked.
import fs from 'node:fs';
import path from 'node:path';
import { root } from './stage.mjs';
import { ASPECTS, launch, encoder } from './capture.mjs';
import { SITE, DISCLAIMER, FEATURES } from './copy.mjs';

const font = name => fs.readFileSync(path.join(root, 'web', 'src', 'assets', 'fonts', name)).toString('base64');
const FONTS = `
@font-face { font-family: Anton; src: url(data:font/woff2;base64,${font('anton.woff2')}) format('woff2'); }
@font-face { font-family: Manrope; src: url(data:font/woff2;base64,${font('manrope.woff2')}) format('woff2'); font-weight: 200 800; }
@font-face { font-family: 'Roboto Mono'; src: url(data:font/woff2;base64,${font('roboto-mono.woff2')}) format('woff2'); font-weight: 100 700; }`;

const escape = s => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// The card's page: the capture (`src`, or an empty window for a clip) in a frame of the card's shape, with the site's name over the
// words if `named` (the capture doesn't show it). Landscape puts the words on the left; square and portrait put them over the capture.
function html(aspect, feature, src, named) {
  const { w, h } = ASPECTS[aspect];
  const wide = w > h;
  const unit = Math.min(w, h) / 1080; // sizes are for a 1080 px side
  const f = FEATURES[feature];
  return `<!doctype html><meta charset="utf-8"><style>${FONTS}
:root { --ink-0: #11141b; --ink-1: #181c26; --ink-2: #282b35; --crimson: #a50034; --light-2: #e2e4ec; --light-3: #c6cad7; --u: ${unit}px; }
* { margin: 0; box-sizing: border-box; }
html, body { width: ${w}px; height: ${h}px; background: var(--ink-1); color: #fff; overflow: hidden; }
body { position: relative; display: grid; padding: calc(64 * var(--u)) calc(72 * var(--u)) calc(48 * var(--u));
  grid-template: ${wide
    ? `${named ? '"name shot" auto ' : ''}"words shot" 1fr "foot foot" auto / 30% 1fr`
    : `${named ? '"name" auto ' : ''}"words" auto "shot" 1fr "foot" auto / 1fr`};
  gap: calc(40 * var(--u)) calc(64 * var(--u)); }
.ghost { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); font: 400 ${wide ? 23 : 34}vw/.82 Anton, sans-serif; text-transform: uppercase;
  text-align: center; color: transparent; -webkit-text-stroke: 1px rgb(255 255 255 / 12%); white-space: nowrap; }
.name { grid-area: name; position: relative; font: 400 calc(40 * var(--u))/1 Anton, sans-serif; letter-spacing: .02em; text-transform: uppercase; }
.words { grid-area: words; position: relative; align-self: ${wide ? 'center' : 'start'}; }
h1 { font: 400 calc(${wide ? 92 : 84} * var(--u))/.9 Anton, sans-serif; text-transform: uppercase; text-wrap: balance; }
h1::after { content: ''; display: block; width: calc(160 * var(--u)); height: calc(6 * var(--u)); margin-top: calc(22 * var(--u)); background: var(--crimson); }
p { margin-top: calc(26 * var(--u)); font: 400 calc(30 * var(--u))/1.5 Manrope, sans-serif; color: var(--light-2); max-width: 30ch; }
.shot { grid-area: shot; position: relative; min-height: 0; container-type: size; display: grid; place-items: center; }
/* As large as the cell lets the capture's shape be */
.shot > * { display: block; width: min(100cqw, 100cqh * ${w} / ${h}); aspect-ratio: ${w} / ${h};
  box-shadow: 0 calc(4 * var(--u)) calc(32 * var(--u)) rgb(0 0 0 / 45%); background: var(--ink-0); }
footer { grid-area: foot; position: relative; font: 400 calc(20 * var(--u))/1.4 'Roboto Mono', monospace; color: var(--light-3); }
</style>
<span class="ghost">Restart<br>Generation</span>
${named ? `<div class="name">${escape(SITE)}</div>` : ''}
<div class="words"><h1>${escape(f.headline)}</h1>${wide ? `<p>${escape(f.caption)}</p>` : ''}</div>
<div class="shot">${src ? `<img src="${src}" alt="">` : '<div id="window"></div>'}</div>
<footer>${escape(DISCLAIMER)}</footer>`;
}

// A comparison's card page: `before` and `after` (data URLs of pictures in the shape `shot`) side by side, as wide as their column,
// or stacked in a square card, as tall as their row. The words, the pictures and the line under them sit together in the middle; a
// 9:16 card keeps them clear of the top and bottom eighth or so, where a story's own bars sit.
function compareHtml(aspect, shot, feature, before, after) {
  const { w, h } = ASPECTS[aspect], s = ASPECTS[shot];
  const unit = Math.min(w, h) / 1080, story = h > w, stacked = w === h;
  const pad = story ? '240 72 260' : '56 72 40';
  return `<!doctype html><meta charset="utf-8"><style>${FONTS}
:root { --ink-0: #11141b; --ink-1: #181c26; --ink-3: #373b49; --crimson: #a50034; --light-3: #c6cad7; --u: ${unit}px; }
* { margin: 0; box-sizing: border-box; }
html, body { width: ${w}px; height: ${h}px; background: var(--ink-1); color: #fff; overflow: hidden; }
body { position: relative; display: grid; grid-template-rows: auto ${stacked ? '1fr' : 'auto'} auto; align-content: center; gap: calc(${story ? 64 : 36} * var(--u));
  padding: ${pad.split(' ').map(n => `calc(${n} * var(--u))`).join(' ')}; }
.ghost { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); z-index: -1;
  font: 400 calc(${story ? 228 : 260} * var(--u))/.86 Anton, sans-serif; text-transform: uppercase; text-align: center; color: transparent;
  -webkit-text-stroke: calc(2 * var(--u)) rgb(255 255 255 / 6%); white-space: nowrap; }
header { position: relative; z-index: 0; text-align: center; }
.kicker { font: 500 calc(26 * var(--u))/1 'Roboto Mono', monospace; letter-spacing: .22em; text-transform: uppercase; color: var(--light-3); }
h1 { margin-top: calc(24 * var(--u)); font: 400 calc(${stacked ? 110 : 150} * var(--u))/.9 Anton, sans-serif; text-transform: uppercase; letter-spacing: .01em; }
h1::after { content: ''; display: block; width: calc(160 * var(--u)); height: calc(8 * var(--u)); margin: calc(30 * var(--u)) auto 0; background: var(--crimson); }
.pair { position: relative; min-height: 0; display: grid; gap: calc(${stacked ? 28 : 48} * var(--u));
  grid-template-${stacked ? 'rows' : 'columns'}: 1fr 1fr; }
figure { min-height: 0; display: grid; grid-template-rows: auto 1fr; gap: calc(${stacked ? 12 : 22} * var(--u)); }
figcaption { font: 400 calc(${stacked ? 32 : 44} * var(--u))/1 Anton, sans-serif; text-transform: uppercase; letter-spacing: .02em; color: var(--light-3);
  display: flex; align-items: center; gap: calc(14 * var(--u)); }
figcaption::before { content: ''; width: calc(14 * var(--u)); height: calc(14 * var(--u)); background: currentColor; }
.after figcaption { color: #fff; } .after figcaption::before { background: var(--crimson); }
.frame { min-height: 0; ${stacked ? 'container-type: size; display: grid; place-items: center;' : ''} }
${stacked ? 'figcaption { justify-content: center; }' : ''}
img { display: block; width: ${stacked ? `min(100cqw, 100cqh * ${s.w} / ${s.h})` : '100%'}; aspect-ratio: ${s.w} / ${s.h}; border: calc(2 * var(--u)) solid var(--ink-3);
  box-shadow: 0 calc(30 * var(--u)) calc(80 * var(--u)) rgb(0 0 0 / 45%); }
.after img { border-color: var(--crimson); }
footer { position: relative; text-align: center; font: 400 calc(20 * var(--u))/1.4 'Roboto Mono', monospace; color: var(--light-3); }
</style>
<header><span class="ghost">Restart<br>Generation</span><p class="kicker">${escape(SITE)}</p><h1>${escape(FEATURES[feature].headline)}</h1></header>
<div class="pair">
  <figure class="before"><figcaption>Before</figcaption><div class="frame"><img src="${before}" alt=""></div></figure>
  <figure class="after"><figcaption>After</figcaption><div class="frame"><img src="${after}" alt=""></div></figure>
</div>
<footer>${escape(DISCLAIMER)}</footer>`;
}

// A card for every still and clip of `manifest` (from tmp/showcase/ `out`), into out/cards/, listed in manifest.cards. A card newer
// than its capture and than the card's design and words is kept as it is; a card whose capture is gone is deleted.
export async function cards(out, manifest) {
  const design = Math.max(...['cards.mjs', 'copy.mjs', 'encoder.html'].map(f => fs.statSync(path.join(root, 'tools', 'showcase', f)).mtimeMs));
  const cardOf = a => path.join(out, 'cards', a.kind === 'compare' ? `${a.still}-${a.aspect}.png` : a.file.replace(/^(stills|clips)\//, ''));
  const wanted = new Set(manifest.assets.map(a => path.resolve(cardOf(a))));
  for (const f of fs.existsSync(path.join(out, 'cards')) ? fs.readdirSync(path.join(out, 'cards'), { recursive: true }) : []) {
    const full = path.resolve(out, 'cards', f);
    if (fs.statSync(full).isFile() && !wanted.has(full)) fs.rmSync(full);
  }
  manifest.cards = [];
  if (!manifest.assets.length) return;
  const browser = await launch();
  try {
    const encoderPage = await encoder(browser, out);
    for (const a of manifest.assets) {
      const file = cardOf(a);
      manifest.cards.push({ file: path.relative(out, file).split(path.sep).join('/'), from: a.file, kind: a.kind, aspect: a.aspect, feature: a.feature });
      const newest = Math.max(design, ...[a.file, a.before].filter(Boolean).map(f => fs.statSync(path.join(out, f)).mtimeMs));
      if (fs.existsSync(file) && fs.statSync(file).mtimeMs > newest) continue;
      const { w, h } = ASPECTS[a.aspect];
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      try {
        const data = f => `data:image/png;base64,${fs.readFileSync(path.join(out, f)).toString('base64')}`;
        const src = a.kind === 'clip' ? null : data(a.file);
        await page.setContent(a.kind === 'compare' ? compareHtml(a.aspect, a.shot, a.feature, data(a.before), src) : html(a.aspect, a.feature, src, a.name === false));
        await page.evaluate(() => document.fonts.ready);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        if (a.kind !== 'clip') await page.screenshot({ path: file });
        else {
          const box = await page.locator('#window').boundingBox();
          const ground = (await page.screenshot()).toString('base64');
          const mp4 = await encoderPage.evaluate(o => window.cardClip(o), { clip: `/__showcase/file/${a.file}`, ground, box, w, h });
          fs.writeFileSync(file, Buffer.from(mp4, 'base64'));
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }
}
