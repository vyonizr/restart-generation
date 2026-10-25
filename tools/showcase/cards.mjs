// The showcase's cards (docs/adr/0036): each still and clip again, framed for a post in the page's own design (DESIGN.md: the ink
// ground, Anton headlines with the crimson bar, Manrope text, the ghost name): the feature's headline and caption (copy.mjs), and the
// line that says the site isn't official. The site's name is the page's own header in the capture; a card adds it only where the
// capture has none (a phone's game page). A card is HTML photographed by Playwright; a clip's card is that photograph with the clip
// drawn into its window frame by frame on the encoder page, keeping the clip's sound.
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

// A card for every still and clip of `manifest` (from tmp/showcase/ `out`), into out/cards/, listed in manifest.cards. A card newer
// than its capture and than the card's design and words is kept as it is; a card whose capture is gone is deleted.
export async function cards(out, manifest) {
  const design = Math.max(...['cards.mjs', 'copy.mjs', 'encoder.html'].map(f => fs.statSync(path.join(root, 'tools', 'showcase', f)).mtimeMs));
  const cardOf = a => path.join(out, 'cards', a.file.replace(/^(stills|clips)\//, ''));
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
      if (fs.existsSync(file) && fs.statSync(file).mtimeMs > Math.max(design, fs.statSync(path.join(out, a.file)).mtimeMs)) continue;
      const { w, h } = ASPECTS[a.aspect];
      const page = await browser.newPage({ viewport: { width: w, height: h } });
      try {
        const src = a.kind === 'still' ? `data:image/png;base64,${fs.readFileSync(path.join(out, a.file)).toString('base64')}` : null;
        await page.setContent(html(a.aspect, a.feature, src, a.name === false));
        await page.evaluate(() => document.fonts.ready);
        fs.mkdirSync(path.dirname(file), { recursive: true });
        if (a.kind === 'still') await page.screenshot({ path: file });
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
