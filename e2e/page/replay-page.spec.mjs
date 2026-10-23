// The replay page (CONTEXT.md "Replay") before the engine runs: what it says about a replay that's gone, and about one it can find.
import { test, expect, seed, factsLine } from '../fixtures.mjs';

test('an unknown replay is gone, with a way to the game', async ({ page }) => {
  await page.goto('/replay/no-such-replay');
  await expect(page.getByRole('heading', { name: 'Replay gone' })).toBeVisible();
  await expect(page.getByRole('status').filter({ hasText: 'This replay is gone. Replays are kept for 30 days.' })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Play Restart Generation' })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Replay controls' })).toBeHidden();
});

// A ranked match, and a friendly one with a bot, so the page has to say which seat the bot played.
const ranked = seed.replays.find(r => r.ranked);
const friendly = seed.replays.find(r => !r.ranked && r.players.some(p => p.bot));

for (const kept of [ranked, friendly]) {
  test(`a kept ${kept.ranked ? 'ranked' : 'friendly'} replay says what match it was and who played, and asks for the game files`, async ({ page }) => {
    await page.goto(`/replay/${kept.id}`);
    await expect(page.getByText(await factsLine(page, kept.id), { exact: true })).toBeVisible();
    await expect(page.getByText(kept.ranked ? 'Ranked match on ' : 'Friendly match on ')).toBeVisible();
    const seats = page.getByRole('list', { name: 'Players by seat' }).getByRole('listitem');
    await expect(seats).toHaveCount(kept.players.length);
    for (const [i, p] of [...kept.players].sort((a, b) => a.seat - b.seat).entries()) {
      await expect(seats.nth(i)).toContainText(p.bot ? `${p.name} (CPU)` : p.name);
    }
    await expect(page.getByRole('button', { name: 'Choose .zip file' })).toBeVisible();
    // The controls wait for the engine to build the battle.
    await expect(page.getByRole('button', { name: 'Play' })).toBeDisabled();
  });
}

// Footage (CONTEXT.md, docs/adr/0028) needs a browser that encodes H.264 and AAC with WebCodecs. Elsewhere Export footage stays,
// disabled, and says why.
test("a browser that can't encode footage says so at Export footage", async ({ page }) => {
  await page.addInitScript(() => { delete window.VideoEncoder; delete window.AudioEncoder; });
  await page.goto(`/replay/${ranked.id}`);
  const why = "Your browser can't export footage. Try Chrome or Edge.";
  const button = page.getByRole('button', { name: 'Export footage' });
  await expect(button).toBeDisabled();
  await expect(button).toHaveAccessibleDescription(why);
  await expect(page.getByText(why)).toBeVisible();
});
