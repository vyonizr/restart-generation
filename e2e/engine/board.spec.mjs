// The Board view (CONTEXT.md, docs/adr/0017): the Full board by default, a switch beside Soft screen, and a change during a battle
// that waits for the next one.
import { test, expect } from '../fixtures.mjs';
import { start, mainMenu, walk, byKey } from './engine.mjs';

const screenSize = page => page.evaluate(() => window.rgStats?.screen);
const canvasSize = page => page.getByLabel('Game screen').evaluate(c => `${c.width}x${c.height}`);

test('the Full board is the default, and Classic chosen in a battle applies once the battle is over', async ({ page }) => {
  test.setTimeout(240000);
  await start(page);
  const toggle = page.getByRole('button', { name: 'Full board' }).filter({ visible: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  // The menus are the phone's 240 × 320 inside the curtain, on the Full board's frame.
  expect(await canvasSize(page)).toBe('420x378');
  await page.waitForFunction(() => window.rgStats?.screen === '240x320');

  // Single-Player, Arcade, the first hero and its opponents, Start, then the battle's own screens.
  const keys = byKey(page);
  await mainMenu(page, keys);
  await walk(page, keys, ['select', 'down', 'down', 'select', 'select', 'select', 'select', 'select', 'select', 'up', 'select', 'select', 'select', 'select', 'select']);
  await page.waitForFunction(() => window.rgStats?.screen === '420x378', null, { timeout: 60000 });

  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('status').filter({ hasText: 'Classic takes effect from your next battle.' })).toBeVisible();
  expect(await canvasSize(page)).toBe('420x378');

  // The battle menu is the phone's screen inside the curtain; Exit and Yes leave the battle.
  await walk(page, keys, ['back']);
  expect(await screenSize(page)).toBe('240x320');
  await walk(page, keys, ['up', 'select', 'up', 'select']);
  await expect.poll(() => canvasSize(page), { timeout: 30000 }).toBe('240x320');

  // The choice stays in this browser.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Full board' }).filter({ visible: true })).toHaveAttribute('aria-pressed', 'false');
  expect(await canvasSize(page)).toBe('240x320');
});
