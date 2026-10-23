// A first visit to a server that doesn't send the game: the page asks for the player's own copy before anything can start.
import { test, expect } from '../fixtures.mjs';

test('a first visit asks for the game files, with Start hidden', async ({ page, errors, isMobile }) => {
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: 'Bring your own copy of the game to play' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose .zip file' })).toBeFocused();
  // A phone can't pick a folder, so only a desktop offers it.
  await expect(page.getByRole('button', { name: 'Choose folder' })).toBeVisible({ visible: !isMobile });
  await expect(page.getByRole('button', { name: 'Start' })).toBeHidden();
  // The footer says the player brings the copy, since this server sends none.
  await expect(page.getByRole('contentinfo')).toContainText('Bring your own copy of the game.');
  expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 'horizontal scroll').toBeLessThanOrEqual(0);
  expect(errors).toEqual([]);
});
