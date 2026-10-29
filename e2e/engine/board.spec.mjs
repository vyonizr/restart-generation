// The Board view (CONTEXT.md, docs/adr/0017, docs/adr/0044): a battle's view only. Outside a battle the screen is the phone's
// 240 × 320 with no switch; in one, the Full board by default on a desktop, and a switch beside Soft screen that applies at once.
// check-paths: shared/emu/host.js web/src/lib/game/{board,curtain,screen,game}.js web/src/App.svelte web/src/lib/input/Pad.svelte
// check-paths: web/src/styles/stage.css
import { test, expect } from '../fixtures.mjs';
import { start, mainMenu, walk, byKey } from './engine.mjs';

const canvasSize = page => page.getByLabel('Game screen').evaluate(c => `${c.width}x${c.height}`);
const screenIs = (page, size) => page.waitForFunction(s => window.rgStats?.screen === s, size, { timeout: 60000 });
const battleIs = (page, view) => page.waitForFunction(v => window.rgStats?.battle === v, view, { timeout: 60000 });
// Single-Player, Arcade, the first hero and its opponents, Start, then the battle's own screens.
const ARCADE = ['select', 'down', 'down', 'select', 'select', 'select', 'select', 'select', 'select', 'up', 'select', 'select', 'select', 'select', 'select'];

test('the switch shows only in a battle, starts on the Full board on a desktop, and changes the view in the middle of it', async ({ page }) => {
  test.setTimeout(360000);
  await start(page);
  const toggle = page.getByRole('button', { name: 'Full board' });
  // The menus are the phone's 240 × 320 on its own frame, with no switch, though the Full board is chosen.
  await screenIs(page, '240x320');
  expect(await canvasSize(page)).toBe('240x320');
  await expect(toggle).toHaveCount(0);

  const keys = byKey(page);
  await mainMenu(page, keys);
  await walk(page, keys, ARCADE);
  await battleIs(page, 'full');
  await screenIs(page, '420x378');
  await expect.poll(() => canvasSize(page), { timeout: 30000 }).toBe('420x378');
  await expect(toggle).toHaveAttribute('aria-pressed', 'true');

  // Classic and back again, while the battle goes on.
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await expect.poll(() => canvasSize(page), { timeout: 30000 }).toBe('240x320');
  await screenIs(page, '240x320');
  await toggle.click();
  await expect.poll(() => canvasSize(page), { timeout: 30000 }).toBe('420x378');
  await screenIs(page, '420x378');

  // The battle menu is the phone's screen inside the curtain, and the switch stays; Classic chosen there leaves the curtain.
  await walk(page, keys, ['back']);
  await screenIs(page, '240x320');
  expect(await canvasSize(page)).toBe('420x378');
  await expect(toggle).toBeVisible();
  await toggle.click();
  await expect.poll(() => canvasSize(page), { timeout: 30000 }).toBe('240x320');

  // Exit and Yes leave the battle, and the switch goes with it.
  await walk(page, keys, ['up', 'select', 'up', 'select']);
  await battleIs(page, null);
  await expect(toggle).toHaveCount(0);
  expect(await canvasSize(page)).toBe('240x320');

  // The choice stays in this browser: the next battle starts on Classic.
  await start(page);
  await mainMenu(page, keys);
  await walk(page, keys, ARCADE);
  await battleIs(page, 'classic');
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  expect(await canvasSize(page)).toBe('240x320');
});
