// A member's Account menu asks before it signs out or deletes the account (ADR 0011, ADR 0016), with the safe answer focused, so
// Enter never confirms by accident. The tests only answer no: the seed accounts are shared by every test of the run.
import { test, expect, seed } from '../fixtures.mjs';

const member = seed.accounts.find(a => a.kind === 'member').name;
test.use({ account: member });

for (const [item, title, keep, answer] of [
  ['Delete my account', 'Delete your account?', 'Keep it', 'button'],
  ['Sign out', 'Sign out?', 'Cancel', 'Escape'],
]) {
  test(`${item} asks first, and ${answer === 'Escape' ? 'Escape' : keep} keeps the account`, async ({ page }) => {
    await page.goto('/');
    await page.locator('.who summary, .who-chip').filter({ visible: true }).click();
    await page.getByRole('button', { name: item }).filter({ visible: true }).click();
    const dialog = page.getByRole('dialog', { name: title });
    await expect(dialog.getByRole('button', { name: keep })).toBeFocused();
    if (answer === 'Escape') await page.keyboard.press('Escape');
    else await dialog.getByRole('button', { name: keep }).click();
    await expect(dialog).toBeHidden();
    await page.reload();
    await expect(page.locator('.who-name').filter({ visible: true })).toHaveText(member);
  });
}
