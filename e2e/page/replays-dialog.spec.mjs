// A member's replays (docs/adr/0024): Replays in the Account menu lists the battles the member played, newest first.
import { test, expect, seed, replaysOf } from '../fixtures.mjs';

const member = seed.accounts.find(a => a.kind === 'member' && replaysOf(a.name).length >= 2).name;
test.use({ account: member });

test('a signed-in member opens their replays, newest first, and Escape gives the menu its focus back', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('.who-name').filter({ visible: true })).toHaveText(member);
  // The Account menu on a desktop, the who chip on a touch device.
  const menu = page.locator('.who summary, .who-chip').filter({ visible: true });
  await menu.click();
  await page.getByRole('button', { name: 'Replays' }).filter({ visible: true }).click();

  const dialog = page.getByRole('dialog', { name: 'Replays' });
  const watch = dialog.getByRole('link', { name: 'Watch' });
  await expect(watch).toHaveCount(replaysOf(member).length);
  const ids = (await watch.evaluateAll(links => links.map(a => a.href))).map(href => decodeURIComponent(href.split('/').at(-1)));
  expect(ids).toEqual(replaysOf(member).map(r => r.id));

  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(menu).toBeFocused();
});
