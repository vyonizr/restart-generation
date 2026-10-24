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

// On a small view the lower third has two rows, each seat where its castle stands on the board (docs/re/re_rules.md): four as
// 1 2 over 4 3, the third of three centred under the other two.
for (const count of [3, 4]) {
  test(`on a small view, ${count} seats stand where their castles do`, async ({ page }) => {
    const kept = seed.replays.find(r => r.players.length === count);
    await page.setViewportSize({ width: 400, height: 800 });
    await page.goto(`/replay/${kept.id}`);
    const seats = page.getByRole('list', { name: 'Players by seat' }).getByRole('listitem');
    await expect(seats).toHaveCount(count);
    const [one, two, three, four] = await Promise.all(Array.from({ length: count }, (_, i) => seats.nth(i).boundingBox()));
    const centre = b => b.x + b.width / 2;
    expect(two.y).toBe(one.y);
    expect(two.x).toBeGreaterThan(one.x);
    expect(three.y).toBeGreaterThan(one.y);
    if (count === 4) {
      expect(four.y).toBe(three.y);
      expect(centre(four)).toBeCloseTo(centre(one), 0);
      expect(centre(three)).toBeCloseTo(centre(two), 0);
    } else {
      expect(three.width).toBeCloseTo(one.width, 0);
      expect(centre(three)).toBeCloseTo((centre(one) + centre(two)) / 2, 0);
    }
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
