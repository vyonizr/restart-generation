// A touch device (CONTEXT.md "Touch pad"): the pad's buttons reach the engine, shown by quitting the game with the pad alone, and
// Soft screen switches the screen finish. Runs only in the engine-touch project (playwright.config.mjs).
// check-paths: web/src/lib/input/{Pad.svelte,pad.js,pads.js,presses.js} web/src/lib/game/finish.js web/src/lib/device.js
import { test, expect } from '../fixtures.mjs';
import { start, mainMenu, quitFromMainMenu } from './engine.mjs';

test('the touch pad alone can quit the game, and Soft screen switches the finish', async ({ page, errors }) => {
  await start(page);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'horizontal scroll').toBeLessThanOrEqual(0);

  const soft = page.getByRole('button', { name: 'Soft screen' }).filter({ visible: true });
  const was = await soft.getAttribute('aria-pressed');
  await soft.tap();
  await expect(soft).toHaveAttribute('aria-pressed', was === 'true' ? 'false' : 'true');

  const pad = action => page.locator(`.pad [data-key="${action}"]`).tap();
  await mainMenu(page, pad);
  const reloaded = page.waitForEvent('load');
  await quitFromMainMenu(page, pad);
  await reloaded;
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  expect(errors).toEqual([]);
});
