// Quit (CONTEXT.md): confirming Quit on the main menu ends the engine, and the page starts over as a refresh would.
// check-paths: web/src/lib/game/game.js web/src/lib/account/**
import { test, expect } from '../fixtures.mjs';
import { start, mainMenu, quitFromMainMenu, byKey } from './engine.mjs';

test('Quit on the main menu starts the page over at Start, with the same account', async ({ page, errors }) => {
  await start(page);
  const who = await page.locator('#who .who-name').textContent();
  await mainMenu(page, byKey(page));
  const reloaded = page.waitForEvent('load');
  await quitFromMainMenu(page, byKey(page));
  await reloaded;
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  await expect(page.locator('#who .who-name')).toHaveText(who);
  expect(errors).toEqual([]);
});
