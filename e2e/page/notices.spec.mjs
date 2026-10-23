// The Notices dialog (docs/LEGAL.md): the non-affiliation text, and the source the GPL asks for.
import { test, expect } from '../fixtures.mjs';

test('Notices says the revival is unofficial, links its source and licenses, and gives focus back on Close', async ({ page }) => {
  await page.goto('/');
  const open = page.getByRole('button', { name: 'Notices' });
  await open.click();
  const dialog = page.getByRole('dialog', { name: 'Notices' });
  await expect(dialog).toContainText('It is not affiliated with or endorsed by RedLynx, Ubisoft or Nokia');
  // This server sends no game, so the player brings theirs.
  await expect(dialog).toContainText('Windows standalone build only. Your files stay in this browser.');
  await expect(dialog.getByRole('link', { name: 'Source' })).toHaveAttribute('href', 'https://github.com/vyonizr/restart-generation');
  await expect(dialog.getByRole('link', { name: 'Licenses' })).toHaveAttribute('href', 'licenses.txt');
  expect((await page.request.get('licenses.txt')).ok()).toBe(true);
  await dialog.getByRole('button', { name: 'Close' }).click();
  await expect(dialog).toBeHidden();
  await expect(open).toBeFocused();
});
