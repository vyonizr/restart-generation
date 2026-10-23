// A server that sends the game (RG_SEND_GAME=1): the page fetches it, boots the engine, and Start hands the game screen the keys.
import { test, expect, asPublicServer } from '../fixtures.mjs';
import { engineTime } from './engine.mjs';

test('the page boots the game the server sends, and Start gives the game screen focus', async ({ page, errors }) => {
  await page.goto('/');
  await expect(page.getByRole('status').filter({ hasText: 'Ready' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose .zip file' })).toBeHidden();
  // This server sends the game, so nothing says to bring one.
  await expect(page.getByRole('contentinfo')).not.toContainText('Bring your own copy of the game.');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('#overlay')).toBeHidden();
  await expect(page.getByLabel('Game screen')).toBeFocused();
  await engineTime(page, 2000);
  expect(errors).toEqual([]);
});

test("a public server's Start says that playing online accepts its Terms and Privacy policy", async ({ page }) => {
  await asPublicServer(page);
  await page.goto('/');
  const accept = page.getByText('By playing online you accept the');
  await expect(accept).toBeVisible();
  await expect(accept.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', 'terms/');
  await expect(accept.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', 'privacy/');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(accept).toBeHidden();
});
