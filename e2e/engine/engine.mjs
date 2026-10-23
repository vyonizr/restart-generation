// What the engine tests share. The engine draws to a canvas the tests don't look at (docs/adr/0025: no pixels), so they wait on its
// own clock, window.rgStats.time (web/ui/game.js), which runs as fast as the device lets it, never on the wall clock.
import { expect } from '../fixtures.mjs';

// Opens the game page and presses Start once the engine is ready.
export async function start(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('#overlay')).toBeHidden();
}

// Waits until the engine's clock reads `ms` since Start, or, with `after`, `ms` past now. rgStats is refreshed every 60 frames, so
// "now" is its next refresh rather than the one already there, which can be most of a second old.
export async function engineTime(page, ms, { after = false } = {}) {
  let from = 0;
  if (after) {
    const seen = await page.evaluate(() => window.rgStats?.time ?? 0);
    from = await page.waitForFunction(t => window.rgStats?.time > t && window.rgStats.time, seen).then(h => h.jsonValue());
  }
  await page.waitForFunction(t => window.rgStats?.time >= t, from + ms, { timeout: 60000 });
}

// Gives the engine `actions` (select, back, up, down, left, right) through `press`, by key or by the touch pad, letting each screen
// settle before the next.
export async function walk(page, press, actions) {
  for (const action of actions) {
    await press(action);
    await engineTime(page, 1500, { after: true });
  }
}
export const KEYS = { select: 'Enter', back: 'Escape', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
export const byKey = page => action => page.keyboard.press(KEYS[action]);

// The main menu opens on Single-Player, with Quick Match and Online below it. Back skips the intro to it once the intro has run.
export async function mainMenu(page, press) {
  await engineTime(page, 3000);
  await walk(page, press, ['back']);
}
export const ONLINE = ['down', 'down', 'select'];

// The main menu's Quit (CONTEXT.md "Quit"), confirmed: Back opens Quit's yes/no with No chosen, Down chooses Yes, Select confirms.
// The engine stops on the last press, so nothing waits after it.
export async function quitFromMainMenu(page, press) {
  await walk(page, press, ['back', 'down']);
  await press('select');
}
