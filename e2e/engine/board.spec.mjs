// The Board view (CONTEXT.md, docs/adr/0017): the Full board by default on a desktop, a switch beside Soft screen, and a change that applies in
// the middle of a battle too.
import { test, expect } from '../fixtures.mjs';
import { start, mainMenu, walk, byKey } from './engine.mjs';

const canvasSize = page => page.getByLabel('Game screen').evaluate(c => `${c.width}x${c.height}`);
const screenIs = (page, size) => page.waitForFunction(s => window.rgStats?.screen === s, size, { timeout: 60000 });

test('the Full board is the default on a desktop, and the switch changes the view in the middle of a battle', async ({ page }) => {
  test.setTimeout(240000);
  await start(page);
  const toggle = page.getByRole('button', { name: 'Full board' }).filter({ visible: true });
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');
  // The menus are the phone's 240 × 320 inside the curtain, on the Full board's frame.
  expect(await canvasSize(page)).toBe('420x378');
  await screenIs(page, '240x320');

  // Single-Player, Arcade, the first hero and its opponents, Start, then the battle's own screens.
  const keys = byKey(page);
  await mainMenu(page, keys);
  await walk(page, keys, ['select', 'down', 'down', 'select', 'select', 'select', 'select', 'select', 'select', 'up', 'select', 'select', 'select', 'select', 'select']);
  await screenIs(page, '420x378');
  await page.waitForFunction(() => window.rgStats?.battle === 'full');

  // Classic and back again, while the battle goes on.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => canvasSize(page), { timeout: 30000 }).toBe('240x320');
  await screenIs(page, '240x320');
  await toggle.click();
  await expect.poll(() => canvasSize(page), { timeout: 30000 }).toBe('420x378');
  await screenIs(page, '420x378');

  // The battle menu is the phone's screen inside the curtain; Classic chosen there leaves the curtain. Exit and Yes leave the battle.
  await walk(page, keys, ['back']);
  await screenIs(page, '240x320');
  expect(await canvasSize(page)).toBe('420x378');
  await toggle.click();
  await expect.poll(() => canvasSize(page), { timeout: 30000 }).toBe('240x320');
  await walk(page, keys, ['up', 'select', 'up', 'select']);
  await page.waitForFunction(() => window.rgStats && window.rgStats.battle === null, null, { timeout: 30000 });

  // The choice stays in this browser.
  await page.reload();
  await expect(page.getByRole('button', { name: 'Full board' }).filter({ visible: true })).toHaveAttribute('aria-pressed', 'false');
  expect(await canvasSize(page)).toBe('240x320');
});
