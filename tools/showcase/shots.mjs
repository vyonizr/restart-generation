// What the showcase films (docs/adr/0036): each scene opens the page in one shape on the staged gateway, steers the engine with keys
// (or the touch pad on a phone) the way the engine tests do (e2e/engine/engine.mjs), and takes stills and clips. Once the game has
// started, the scene holds the page's clock (capture.mjs), so waiting for the engine costs only the time the machine needs to run it.
// A scene adds each file to the manifest with the feature it shows (copy.mjs) and whether the site's name is in it.
import path from 'node:path';
import { ASPECTS, open, clockedPage, hold, pass, until, film, still, FPS } from './capture.mjs';
import { replaySound } from './sound.mjs';

const KEYS = { select: 'Enter', back: 'Escape', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };

// A press of `action` (select, back, up, down, left, right): a key on a desktop, the touch pad on a phone. Forced, as a held clock
// draws no frame for Playwright to wait on.
const presser = (page, aspect) => ASPECTS[aspect].phone
  ? action => page.locator(`.pad [data-key="${action}"]`).tap({ force: true })
  : action => page.keyboard.press(KEYS[action]);

// Presses each action, letting each screen settle for 1.5 s of the page's time, as e2e/engine/engine.mjs walk() does.
async function walk(page, press, actions) {
  for (const action of actions) {
    await press(action);
    await pass(page, 1500);
  }
}

// The game page, loaded and ready for Start.
async function ready(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).waitFor({ timeout: 120000 });
}

// Start, then the main menu (Back skips the intro once it has run), with the page's clock held from Start on.
async function mainMenu(page, press) {
  await page.getByRole('button', { name: 'Start' }).click();
  await page.locator('#overlay').waitFor({ state: 'hidden' });
  await hold(page);
  await pass(page, 3000);
  await walk(page, press, ['back']);
}

// Films `steps` into `clip`: a number holds that many frames, an action is pressed before the next frame, and { still } saves the
// frame on screen as that still.
async function script(clip, press, steps, keep) {
  for (const s of steps) {
    if (typeof s === 'number') await clip.frames(s);
    else if (typeof s === 'string') await clip.frames(1, () => press(s));
    else await keep(s.still, clip);
  }
}

// `arena(fn)` runs fn while no other scene is online: every shape signs in as the hero, and the Arena keeps one login a member.
export function scenes({ browser, enc, gw, out, add, battles, arena }) {
  const file = (kind, aspect, name, ext) => path.join(out, kind, aspect, `${name}.${ext}`);
  const phone = aspect => Boolean(ASPECTS[aspect].phone);
  // A still of the page now; `name` is whether the site's name is in it (a phone's game page has no header).
  const shot = async (page, aspect, stillName, feature, name = !phone(aspect)) => {
    const f = file('stills', aspect, stillName, 'png');
    await still(page, f);
    add({ file: f, kind: 'still', aspect, feature, name });
  };
  const clipped = (aspect, name, feature, clip, nameShown = !phone(aspect)) =>
    add({ file: file('clips', aspect, name, 'mp4'), kind: 'clip', aspect, feature, name: nameShown, seconds: clip.seconds });

  return {
    // The replay page: clips around each battle's moments, with their sound, and a still at each moment. One page a battle, sought
    // to each clip's start with the time slider, as a player drags it; the sound is sought to the same second (sound.mjs).
    async replay(aspect) {
      for (const b of battles) {
        const context = await open(browser, gw, aspect);
        try {
          const page = await clockedPage(context);
          await page.goto(`/replay/${b.id}`);
          await page.getByRole('button', { name: 'Watch' }).click({ timeout: 120000 });
          await page.getByRole('group', { name: 'Replay controls' }).getByRole('button', { name: 'Pause' }).waitFor({ timeout: 60000 });
          await hold(page);
          await page.clock.runFor(6000); // seeks as sound.mjs does, with the battle under way
          const slider = page.getByRole('slider', { name: 'Time' });
          for (const [i, at] of clipStarts(b.meta).entries()) {
            const from = Math.max(0, at - LEAD_S);
            await slider.evaluate((s, to) => { s.value = String(to); s.dispatchEvent(new Event('input', { bubbles: true })); }, from);
            await page.clock.runFor(1000 / FPS); // the page seeks on its next frame
            const name = `replay-${b.id}-${i + 1}`, feature = b.players.length === 4 ? 'battle' : 'replay'; // "Four players. One board."
            const clip = await film(page, enc, aspect, file('clips', aspect, name, 'mp4'), { withSound: true });
            await clip.frames((at - from) * FPS);
            await clip.still(file('stills', aspect, name, 'png'));
            add({ file: file('stills', aspect, name, 'png'), kind: 'still', aspect, feature, name: true });
            await clip.frames(CLIP_S * FPS - clip.count);
            await clip.save(await replaySound(b.text, from, clip.seconds));
            clipped(aspect, name, feature, clip, true);
          }
        } finally {
          await context.close();
        }
      }
    },

    // Download replay: its menu, then the panel while the footage renders, canceled. On the real clock: the render keeps to it.
    async footage(aspect) {
      const context = await open(browser, gw, aspect);
      try {
        const page = await context.newPage();
        await page.goto(`/replay/${battles[0].id}`);
        await page.getByRole('button', { name: 'Watch' }).click({ timeout: 120000 });
        await page.getByRole('group', { name: 'Replay controls' }).getByRole('button', { name: 'Pause' }).waitFor({ timeout: 60000 });
        await page.waitForTimeout(6000);
        await page.getByRole('button', { name: 'Download replay' }).click();
        await page.getByRole('menuitem', { name: 'With Details' }).waitFor();
        await shot(page, aspect, 'footage-menu', 'footage', true);
        await page.getByRole('menuitem', { name: 'With Details' }).click();
        await page.getByRole('progressbar', { name: 'Download' }).waitFor();
        await page.waitForTimeout(4000);
        await shot(page, aspect, 'footage-rendering', 'footage', true);
        await page.getByRole('button', { name: 'Cancel' }).click();
      } finally {
        await context.close();
      }
    },

    // The game page, online: the account's Replays and the main menu, then a filmed walk from the main menu through the Arena login to
    // Your Stats, the Rankings, and a Quick Match hero and its queue.
    online: aspect => arena(async () => {
      const context = await open(browser, gw, aspect);
      try {
        const page = await clockedPage(context);
        const press = presser(page, aspect);
        // The Account menu: under Start on a phone, before the game runs; in the header on a desktop, where it is opened once the
        // main menu is behind it. Opened on the real clock: a menu waits for the page to draw.
        const replays = async () => {
          await page.locator('.menu summary').filter({ visible: true }).click();
          await page.getByRole('button', { name: 'Replays' }).filter({ visible: true }).click();
          await page.locator('.replay-item').first().waitFor();
          await shot(page, aspect, 'replays-dialog', 'replays');
          await page.locator('#replays-close').click();
        };
        await ready(page);
        if (phone(aspect)) await replays();
        await mainMenu(page, press);
        await shot(page, aspect, 'main-menu', 'browser');
        if (!phone(aspect)) {
          await page.clock.resume();
          await replays();
          await hold(page);
        }
        await page.getByLabel('Game screen').focus(); // not the Account menu, whose focus ring would show in every frame

        const keep = async (stillName, clip) => {
          await clip.still(file('stills', aspect, stillName, 'png'));
          add({ file: file('stills', aspect, stillName, 'png'), kind: 'still', aspect, feature: STILL_FEATURE[stillName], name: !phone(aspect) });
        };
        const clip = await film(page, enc, aspect, file('clips', aspect, 'online', 'mp4'));
        await script(clip, press, [
          15, 'down', 10, 'down', 14, 'select', 150, { still: 'online-menu' }, // Online, and the Arena login
          'down', 14, 'select', 75, { still: 'your-stats' }, 'back', 30,
          'down', 14, 'select', 90, { still: 'rankings' }, 'back', 30,
          'up', 12, 'up', 14, 'select', 45, { still: 'hero-picker' }, 'right', 12, 'right', 12, 'right', 25, 'select', 90, { still: 'quick-match' },
        ], keep);
        await clip.save();
        clipped(aspect, 'online', 'quickmatch', clip);
      } finally {
        await context.close();
      }
    }),

    // A friendly room (e2e/engine/dialogs.spec.mjs): Online, Create Room, a hero, Start alone, Expert, and the battle that starts.
    room: aspect => arena(async () => {
      const context = await open(browser, gw, aspect);
      try {
        const page = await clockedPage(context);
        const press = presser(page, aspect);
        await ready(page);
        await mainMenu(page, press);
        await walk(page, press, ['down', 'down', 'select']);
        await pass(page, 3000); // the Arena login
        await walk(page, press, ['down', 'down', 'down', 'select', 'select']);
        await press('select');
        await until(page, () => Boolean(document.querySelector('#bots-ask')), null, 30000);
        await shot(page, aspect, 'cpu-level', 'rooms');
        await page.locator('#bots-expert').click({ force: true });
        await until(page, () => Boolean(window.rgStats?.battle));
        await pass(page, 8000);
        await shot(page, aspect, 'room-battle', 'rooms');
      } finally {
        await context.close();
      }
    }),

    // The game page, offline: an Arcade battle on the Full board, filmed switching to Classic and back, and the screen's finish.
    async arcade(aspect) {
      const context = await open(browser, gw, aspect, { 'rg:board': 'full' });
      try {
        const page = await clockedPage(context);
        const press = presser(page, aspect);
        await ready(page);
        await mainMenu(page, press);
        // Single-Player, Arcade, the first hero and its opponents, Start, then the battle's own screens (e2e/engine/board.spec.mjs).
        await walk(page, press, ['select', 'down', 'down', 'select', 'select', 'select', 'select', 'select', 'select', 'up', 'select', 'select', 'select', 'select', 'select']);
        await until(page, () => window.rgStats?.battle === 'full', null, 60000);
        await pass(page, 2000);
        const feature = phone(aspect) ? 'phone' : 'board';
        await shot(page, aspect, 'arcade-full', feature);
        const board = page.getByRole('button', { name: 'Full board' }).filter({ visible: true });
        const soft = page.getByRole('button', { name: 'Soft screen' }).filter({ visible: true });
        const keep = async (stillName, clip) => {
          await clip.still(file('stills', aspect, stillName, 'png'));
          add({ file: file('stills', aspect, stillName, 'png'), kind: 'still', aspect, feature, name: !phone(aspect) });
        };
        const clip = await film(page, enc, aspect, file('clips', aspect, 'board', 'mp4'));
        await clip.frames(45);
        await clip.frames(1, () => board.click({ force: true }));
        await clip.frames(75);
        await keep('arcade-classic', clip);
        await clip.frames(1, () => soft.click({ force: true }));
        await clip.frames(60);
        await keep('arcade-classic-sharp', clip);
        await clip.frames(1, () => soft.click({ force: true }));
        await clip.frames(1, () => board.click({ force: true }));
        await clip.frames(75);
        await clip.save();
        clipped(aspect, 'board', feature, clip);
      } finally {
        await context.close();
      }
    },
  };
}

// The still a frame of the online walk is, by its name.
const STILL_FEATURE = { 'online-menu': 'quickmatch', 'hero-picker': 'browser', 'quick-match': 'quickmatch', 'your-stats': 'rankings', rankings: 'rankings' };

// A replay clip starts LEAD_S before its moment and runs CLIP_S in all: whole seconds, as the time slider seeks.
const LEAD_S = 4, CLIP_S = 10;

// Where a battle's clips are: its last rescue (server/replay.js marks()), and in a 4-player battle its first knockout too; 5 s in
// where it has neither.
function clipStarts(meta) {
  const marks = meta.marks ?? [];
  const knockout = meta.players.length > 3 ? marks.find(m => m.moments.some(x => x.kind === 'knockout')) : undefined;
  const rescue = marks.findLast(m => m.moments.some(x => x.kind === 'rescue'));
  const at = [...new Set([knockout?.at, rescue?.at].filter(a => a !== undefined))];
  return at.length ? at : [LEAD_S + 1];
}
