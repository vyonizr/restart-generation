// The Terms and the Privacy policy (docs/adr/0021) name the admin of a public server, and only a public server links them.
import { test, expect, PUBLIC, asPublicServer } from '../fixtures.mjs';

for (const [path, title] of [['/terms/', 'Terms'], ['/privacy/', 'Privacy policy']]) {
  test(`${title} names who runs a public server, who stores its data and where to write`, async ({ page }) => {
    await asPublicServer(page);
    await page.goto(path);
    await expect(page.getByRole('heading', { level: 1 })).toContainText(title);
    await expect(page.getByRole('definition').filter({ hasText: PUBLIC.adminName })).toBeVisible();
    await expect(page.getByRole('definition').filter({ hasText: PUBLIC.hosting })).toBeVisible();
    await expect(page.getByRole('link', { name: 'example.org/contact' })).toHaveAttribute('href', PUBLIC.contact);
  });

  test(`${title} of a server that isn't public names no admin`, async ({ page }) => {
    await page.goto(path);
    await expect(page.getByText("This page wasn't sent by a public server, so it names no admin.")).toBeVisible();
  });
}

test('only a public server links its Terms and Privacy policy from the footer', async ({ page }) => {
  await page.goto('/');
  const footer = page.getByRole('contentinfo');
  await expect(footer.getByRole('button', { name: 'Notices' })).toBeVisible();
  await expect(footer.getByRole('link', { name: 'Terms' })).toHaveCount(0);
  await asPublicServer(page);
  await page.reload();
  await expect(footer.getByRole('link', { name: 'Terms' })).toHaveAttribute('href', 'terms/');
  await expect(footer.getByRole('link', { name: 'Privacy policy' })).toHaveAttribute('href', 'privacy/');
});
