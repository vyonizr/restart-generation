// The dialogs the engine opens over the game screen: the name a server without accounts asks for when the player goes online
// (ADR 0009), and the CPU level a player alone in a friendly room is asked for at Start (ADR 0008).
import { test, expect, seed } from '../fixtures.mjs';
import { start, mainMenu, walk, engineTime, byKey, ONLINE } from './engine.mjs';

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

test.describe('a member with friends', () => {
  // Making a room needs a friend; the arrow keys need the default keys, which a member's saved game may have changed.
  const member = seed.accounts.find(a => a.kind === 'member' && !a.keys && seed.friends.some(([x, y, state]) => state === 'both' && (x === a.name || y === a.name)));
  test.use({ account: member.name });

  test('alone in a friendly room, Start asks for the CPU level, with CPU chosen', async ({ page }) => {
    await start(page);
    const keys = byKey(page);
    await mainMenu(page, keys);
    await walk(page, keys, ONLINE);
    await engineTime(page, 3000, { after: true }); // the Arena login
    // Online opens on Quick Match, with Your Stats, Rankings and Create Room below it; Create Room asks for a hero, then waits
    // for players with Start.
    await walk(page, keys, ['down', 'down', 'down', 'select', 'select']);
    await keys('select');
    const dialog = page.getByRole('dialog', { name: 'Choose the CPU level' });
    await expect(dialog.getByRole('button', { name: 'CPU', exact: true })).toBeFocused();
    await expect(dialog.getByRole('button', { name: 'No' })).toHaveCount(0); // alone, the room can't start without them
    await dialog.getByRole('button', { name: 'CPU', exact: true }).click();
    await expect(dialog).toBeHidden();
    await expect(page.getByLabel('Game screen')).toBeFocused();
  });
});
