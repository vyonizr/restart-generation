// The replay page (CONTEXT.md "Replay") before the engine runs: what it says about a replay that's gone, and about one it can find.
import { test, expect, seed, factsLine } from '../fixtures.mjs';

test('an unknown replay is gone, with a way to the game', async ({ page }) => {
  await page.goto('/replay/no-such-replay');
  await expect(page.getByRole('heading', { name: 'Replay not found or expired' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Play the game' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Replay controls' })).toBeHidden();
});

// A ranked match, and a friendly one with a bot, so the page has to say which seat the bot played.
const ranked = seed.replays.find(r => r.ranked);
const friendly = seed.replays.find(r => !r.ranked && r.players.some(p => p.bot));

for (const kept of [ranked, friendly]) {
  test(`a kept ${kept.ranked ? 'ranked' : 'friendly'} replay says what match it was and who played, and asks for the game files`, async ({ page }) => {
    await page.goto(`/replay/${kept.id}`);
    await expect(page.getByText(await factsLine(page, kept.id), { exact: true })).toBeVisible();
    await expect(page.getByText(kept.ranked ? ' - Ranked match' : ' - Friendly match')).toBeVisible();
    const seats = page.getByRole('list', { name: 'Players by seat' }).getByRole('listitem');
    await expect(seats).toHaveCount(kept.players.length);
    for (const [i, p] of [...kept.players].sort((a, b) => a.seat - b.seat).entries()) {
      await expect(seats.nth(i)).toContainText(p.bot ? `${p.name} (CPU)` : p.name);
    }
    await expect(page.getByRole('button', { name: 'Choose .zip file' })).toBeVisible();
    // The controls wait for the engine to build the battle.
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeDisabled();
  });
}

// Footage (CONTEXT.md, docs/adr/0028) needs a browser that encodes H.264 and AAC with WebCodecs, which browsers give only to a
// secure page. Elsewhere Download replay stays, disabled, and says why.
test("a browser that can't encode footage says so at Download replay", async ({ page }) => {
  await page.addInitScript(() => { delete window.VideoEncoder; delete window.AudioEncoder; });
  await page.goto(`/replay/${ranked.id}`);
  const why = "Your browser can't download replays. Try Chrome or Edge.";
  const button = page.getByRole('button', { name: 'Download replay' });
  await expect(button).toBeDisabled();
  await expect(button).toHaveAccessibleDescription(why);
  await expect(page.getByText(why)).toBeVisible();
});

// A LAN address over plain HTTP (`--lan`) isn't a secure page, so even Chrome has no WebCodecs there. The test servers are on
// localhost, which is, so the test takes away what the browser would.
test('a page that isn\'t secure says footage needs one, rather than blaming the browser', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'isSecureContext', { value: false });
    delete window.VideoEncoder; delete window.AudioEncoder;
  });
  await page.goto(`/replay/${ranked.id}`);
  const why = 'Download replay needs a secure page: open this replay over HTTPS, or at localhost on the PC that runs the server.';
  const button = page.getByRole('button', { name: 'Download replay' });
  await expect(button).toBeDisabled();
  await expect(button).toHaveAccessibleDescription(why);
  await expect(page.getByText(why)).toBeVisible();
});
