// The dialogs the page opens over the game screen: the name a server without accounts asks for when the player goes online
// (ADR 0009), and the CPU question at a friendly Start with 2 or 3 people in the room (ADR 0008, ADR 0037).
import { test, expect } from '../fixtures.mjs';
import { mainMenu, walk, engineTime, byKey, ONLINE, PAIRS, online, CREATE_ROOM, FRIENDS_ROOM } from './engine.mjs';

test('on a server without accounts, going online asks for a name; Cancel goes back, and a name logs in', async ({ page }) => {
  await page.goto(process.env.E2E_NAMES_URL);
  await page.getByRole('button', { name: 'Start' }).click();
  const keys = byKey(page);
  await mainMenu(page, keys);
  await walk(page, keys, ONLINE);
  const dialog = page.getByRole('dialog', { name: 'Set your name' });
  await expect(dialog.getByLabel('Player name')).toBeFocused();
  await dialog.getByRole('button', { name: 'Cancel' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Game screen')).toBeFocused();

  // Cancel goes back to the main menu, on Single-Player again.
  await walk(page, keys, ONLINE);
  await dialog.getByLabel('Player name').fill('E2e_Player');
  await dialog.getByRole('button', { name: 'Play online' }).click();
  await expect(dialog).toBeHidden();
  await expect.poll(async () => (await (await page.request.get(`${process.env.E2E_NAMES_URL}/status`)).json()).online, { timeout: 30000 }).toBe(1);
});

test('with 2 people in a friendly room, Start asks whether CPU players fill the empty seats, and Yes starts the battle', async ({ browser, baseURL }) => {
  test.setTimeout(300000); // two engines on one machine, then the bots' start
  const [host, guest] = PAIRS[0];
  const [page, keys] = await online(browser, baseURL, host);
  await walk(page, keys, CREATE_ROOM);
  const [other, otherKeys] = await online(browser, baseURL, guest);
  await walk(other, otherKeys, FRIENDS_ROOM);
  await engineTime(page, 3000, { after: true }); // the room lists the guest, and Start appears
  await keys('select');
  const dialog = page.getByRole('dialog', { name: 'Fill the empty seats with CPU players?' });
  const yes = dialog.getByRole('button', { name: 'Yes' }), no = dialog.getByRole('button', { name: 'No' });
  await expect(yes).toBeFocused();
  await keys('left');
  await expect(no).toBeFocused();
  await keys('right');
  await expect(yes).toBeFocused();
  await keys('select');
  await expect(dialog).toBeHidden();
  await expect(page.getByLabel('Game screen')).toBeFocused();
  await page.waitForFunction(() => window.rgStats?.battle, null, { timeout: 120000 }); // the bots start with the battle
  await other.context().close();
  await page.context().close();
});
