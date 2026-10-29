// The Board view frames a battle only (CONTEXT.md, docs/adr/0044): before any battle the screen is the phone's 240 × 320, with no
// Full board switch, whichever view the device starts on or the player saved. The default and the saved choice show in a battle
// (e2e/engine/board.spec.mjs).
import { test, expect } from '../fixtures.mjs';

test('outside a battle the screen is Classic and there is no Full board switch, even with the Full board saved', async ({ page, errors }) => {
  await page.addInitScript(() => localStorage.setItem('rg:board', 'full'));
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Choose .zip file' })).toBeVisible();
  await expect(page.locator('.page')).toHaveAttribute('data-frame', 'classic');
  await expect(page.getByRole('button', { name: 'Full board' })).toHaveCount(0);
  expect(errors).toEqual([]);
});
