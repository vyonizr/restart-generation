// The showcase (docs/adr/0036): stills and clips of the page for a landing page and social posts, staged with made-up players
// (cast.mjs), with designed cards, a manifest and a preview page. Everything it makes shows the game, so it goes to tmp/showcase/,
// which git ignores and `npm run legal-check` refuses, and is never committed (docs/LEGAL.md rule 2).
//
// Usage: npm run showcase [-- --fresh] [-- --only replay,footage,online,room,arcade] [-- --aspect 16x9,1x1,9x16] [-- --cards]
//   --fresh    play the cast's battles again instead of using tmp/showcase/cache/
//   --only     film these scenes only (shots.mjs); the manifest keeps the other scenes' files
//   --aspect   in these shapes only (capture.mjs)
//   --cards    film nothing: draw the cards and the preview again from the manifest, as after editing copy.mjs
// Needs RG_GAME (.env) and battle templates (data/templates/ or data/battle-templates.zip), as `npm run seed -- --play` does.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { root, battles as playBattles, gateway } from './stage.mjs';
import { ASPECTS, launch, encoder } from './capture.mjs';
import { scenes } from './shots.mjs';
import { cards } from './cards.mjs';
import { preview } from './preview.mjs';
import { buildPage } from '../../e2e/global-setup.mjs';

const OUT = path.join(root, 'tmp', 'showcase');
const argv = process.argv.slice(2);
const list = name => { const i = argv.indexOf(`--${name}`); return i < 0 ? null : (argv[i + 1] ?? '').split(',').filter(Boolean); };

function fail(message) {
  console.error(message);
  process.exit(1);
}

const manifestFile = path.join(OUT, 'manifest.json');
const readManifest = () => fs.existsSync(manifestFile) ? JSON.parse(fs.readFileSync(manifestFile, 'utf8')) : { assets: [] };
const rel = f => path.relative(OUT, f).split(path.sep).join('/');

async function film() {
  if (!process.env.RG_GAME) fail('The showcase films the game, so it needs RG_GAME, your copy of the game (see .env.example).');
  const game = path.resolve(root, process.env.RG_GAME);
  if (!fs.existsSync(game)) fail(`RG_GAME names ${process.env.RG_GAME}, which doesn't exist.`);
  if (!fs.existsSync(path.join(root, 'data', 'templates')) && !fs.existsSync(path.join(root, 'data', 'battle-templates.zip')))
    fail('Online battles need battle templates in data/templates/ or data/battle-templates.zip (docs/adr/0006).');
  const all = ['replay', 'footage', 'online', 'room', 'arcade'];
  const only = list('only') ?? all, aspects = list('aspect') ?? Object.keys(ASPECTS);
  for (const s of only) if (!all.includes(s)) fail(`--only: no scene ${s} (${all.join(', ')})`);
  for (const a of aspects) if (!ASPECTS[a]) fail(`--aspect: no shape ${a} (${Object.keys(ASPECTS).join(', ')})`);

  buildPage();
  const played = await playBattles(path.join(OUT, 'cache'), { fresh: argv.includes('--fresh') });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-showcase-'));
  const gw = await gateway(dir, game, played);
  const manifest = readManifest();
  // The files of the scenes filmed again go, so one that is no longer made (a clip of a moment a new battle doesn't have) doesn't stay.
  const again = a => only.includes(a.scene) && aspects.includes(a.aspect);
  for (const a of manifest.assets.filter(again)) fs.rmSync(path.join(OUT, a.file), { force: true });
  manifest.assets = manifest.assets.filter(a => !again(a));
  const failed = [];
  // The Arena keeps one login a member, and every shape signs in as the hero: the scenes that go online take turns.
  let online = Promise.resolve();
  const arena = fn => { const turn = online.then(fn); online = turn.catch(() => {}); return turn; };
  const browser = await launch();
  const t0 = Date.now(), seconds = since => `${((Date.now() - since) / 1000).toFixed(0)} s`;
  try {
    // The shapes at once, each with its own encoder page, its scenes one after another.
    await Promise.all(aspects.map(async aspect => {
      const enc = await encoder(browser, OUT);
      for (const scene of only) {
        const run = scenes({ browser, enc, gw, out: OUT, battles: played, arena, add: a => manifest.assets.push({ ...a, file: rel(a.file), scene }) });
        const t = Date.now();
        console.log(`Filming ${scene} at ${ASPECTS[aspect].label}…`);
        try {
          await run[scene](aspect);
          console.log(`  ${scene} at ${ASPECTS[aspect].label}: ${seconds(t)}`);
        } catch (e) {
          failed.push(`${scene} at ${ASPECTS[aspect].label}: ${e.message.split('\n')[0]}`);
          console.error(`  ${scene} at ${ASPECTS[aspect].label} failed: ${e.message.split('\n')[0]}`);
        }
      }
    }));
    console.log(`Filmed in ${seconds(t0)}.`);
  } finally {
    await browser.close();
    gw.stop();
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }); } catch { /* a file the OS still holds */ }
  }
  const order = (a, b) => all.indexOf(a.scene) - all.indexOf(b.scene) || Object.keys(ASPECTS).indexOf(a.aspect) - Object.keys(ASPECTS).indexOf(b.aspect);
  manifest.assets.sort(order);
  fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
  return failed;
}

const failed = argv.includes('--cards') ? [] : await film();
const manifest = readManifest();
await cards(OUT, manifest);
preview(OUT, manifest);
fs.writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
console.log(`Done: ${manifest.assets.length} files, ${manifest.cards?.length ?? 0} cards. Open tmp/showcase/index.html.`);
if (failed.length) fail(`Some scenes failed:\n  ${failed.join('\n  ')}`);
