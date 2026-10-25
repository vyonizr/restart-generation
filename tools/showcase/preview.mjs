// The showcase's preview (docs/adr/0036): tmp/showcase/index.html, every card and every raw capture by feature, each with its post
// caption, and a warning on the raw captures that don't show the site's name (a phone's game page has no header, DESIGN.md), so one
// isn't posted on its own. Also puts each feature's whole caption in the manifest.
import fs from 'node:fs';
import path from 'node:path';
import { SITE, DISCLAIMER, NEEDS, FEATURES } from './copy.mjs';
import { ASPECTS } from './capture.mjs';

const escape = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

// A post's whole caption, a line each: the feature's, what a player needs, and that the site isn't official.
export const captionOf = feature => `${FEATURES[feature].caption}\n${NEEDS}\n${DISCLAIMER}`;

const media = (file, kind) => kind === 'clip'
  ? `<video src="${escape(file)}" controls loop muted playsinline preload="metadata"></video>`
  : `<a href="${escape(file)}"><img src="${escape(file)}" alt="" loading="lazy"></a>`;

export function preview(out, manifest) {
  manifest.captions = Object.fromEntries(Object.keys(FEATURES).map(f => [f, captionOf(f)]));
  const sections = Object.entries(FEATURES).map(([feature, f]) => {
    const cards = (manifest.cards ?? []).filter(c => c.feature === feature);
    const raw = manifest.assets.filter(a => a.feature === feature);
    if (!cards.length && !raw.length) return '';
    const item = (a, warn) => `<figure>${media(a.file, a.kind)}<figcaption>${escape(ASPECTS[a.aspect].label)} · ${a.kind}${a.seconds ? ` · ${a.seconds.toFixed(1)} s` : ''}
      · <a href="${escape(a.file)}" download>${escape(path.basename(a.file))}</a>${warn && a.name === false ? '<br><b>No site name in it: post the card instead.</b>' : ''}</figcaption></figure>`;
    return `<section><h2>${escape(f.headline)}</h2>
      <p class="caption">${escape(captionOf(feature)).replaceAll('\n', '<br>')} <button type="button" data-copy="${escape(captionOf(feature))}">Copy caption</button></p>
      ${cards.length ? `<h3>Cards</h3><div class="grid">${cards.map(c => item(c, false)).join('')}</div>` : ''}
      ${raw.length ? `<h3>Raw captures</h3><div class="grid">${raw.map(a => item(a, true)).join('')}</div>` : ''}</section>`;
  }).join('');
  fs.writeFileSync(path.join(out, 'index.html'), `<!doctype html><meta charset="utf-8"><title>${escape(SITE)} showcase</title>
<style>
body { margin: 0; padding: 32px 48px 96px; background: #181c26; color: #fff; font: 15px/1.6 system-ui, sans-serif; }
h1 { font-size: 28px; } h2 { margin-top: 56px; font-size: 22px; border-bottom: 4px solid #a50034; display: inline-block; padding-bottom: 6px; }
h3 { color: #c6cad7; font-size: 14px; text-transform: uppercase; letter-spacing: .05em; }
.caption { max-width: 80ch; color: #e2e4ec; } .note { color: #c6cad7; max-width: 80ch; }
.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 24px; align-items: start; }
figure { margin: 0; } img, video { width: 100%; display: block; background: #11141b; }
figcaption { font-size: 13px; color: #c6cad7; margin-top: 6px; } figcaption b { color: #ff8fa8; }
a { color: #fff; } button { font: inherit; margin-left: 8px; }
</style>
<h1>${escape(SITE)} showcase</h1>
<p class="note">Made by <code>npm run showcase</code> with made-up players. Every file here shows the game: post it, but never commit it or attach it to an
issue or pull request (docs/LEGAL.md rule 2). Cards carry the site's name and the line that it isn't official; a raw capture marked below doesn't.</p>
${sections}
<script>document.addEventListener('click', e => { const t = e.target.dataset?.copy; if (t) navigator.clipboard.writeText(t).then(() => { e.target.textContent = 'Copied'; }); });</script>
`);
}
