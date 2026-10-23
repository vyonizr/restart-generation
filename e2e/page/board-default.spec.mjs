// The Board view's default (CONTEXT.md, web/ui/board.js): the Full board on a desktop, Classic on a phone, and the player's saved
// choice over either.
import { test, expect } from '../fixtures.mjs';

const frame = page => page.locator('.page');

test('a desktop starts on the Full board and a phone on Classic', async ({ page, errors, isMobile }) => {
  await page.goto('/');
  await expect(frame(page)).toHaveAttribute('data-frame', isMobile ? 'classic' : 'full');
  expect(errors).toEqual([]);
});

test('a saved board view wins over the device default', async ({ page, errors, isMobile }) => {
  const chosen = isMobile ? 'full' : 'classic';
  await page.addInitScript(view => localStorage.setItem('rg:board', view), chosen);
  await page.goto('/');
  await expect(frame(page)).toHaveAttribute('data-frame', chosen);
  expect(errors).toEqual([]);
});
