// Replays (CONTEXT.md) played back by the engine on their page: the seed's played battles, which Bots really played
// (global-setup.mjs keeps them in data/e2e/), and a seed placeholder, which the engine can't build.
import { test, expect, seed, factsLine } from '../fixtures.mjs';

const seconds = text => { const [m, s] = text.split(' of ')[0].split(':'); return +m * 60 + +s; };

async function watch(page, id) {
  await page.goto(`/replay/${id}`);
  await page.getByRole('button', { name: 'Watch' }).click();
}

for (const { id } of seed.played) {
  test(`the played replay ${id} plays, and its buttons and keys control it`, async ({ page, errors }) => {
    await watch(page, id);
    await expect(page.getByText(await factsLine(page, id), { exact: true })).toBeVisible();
    const play = page.getByRole('group', { name: 'Replay controls' }).getByRole('button').first();
    const time = page.getByRole('slider', { name: 'Time' });
    // It plays at once once the engine has built the battle, with idle time skipped, as the original player did.
    await expect(play).toHaveAccessibleName('Pause', { timeout: 30000 });
    await expect(page.getByRole('button', { name: 'Skip idle' })).toHaveAttribute('aria-pressed', 'true');

    await play.click();
    await expect(play).toHaveAccessibleName('Play');
    const at = async () => seconds(await time.getAttribute('aria-valuetext'));
    const paused = await at();
    await page.keyboard.press('ArrowRight'); // seeks 5 s on, from the focused button too
    await expect.poll(at).toBeGreaterThan(paused);
    const later = await at();
    await page.keyboard.press('ArrowLeft'); // and 5 s back
    await expect.poll(at).toBeLessThan(later);

    await page.evaluate(() => document.activeElement.blur()); // Space on a button is the button's own
    await page.keyboard.press('Space');
    await expect(play).toHaveAccessibleName('Pause');
    await page.keyboard.press('f');
    await expect(page.getByRole('button', { name: 'Double speed' })).toHaveAttribute('aria-pressed', 'true');
    await page.keyboard.press('m');
    await expect(page.getByRole('button', { name: 'Mute' })).toHaveAttribute('aria-pressed', 'true');
    await page.getByRole('button', { name: 'Skip idle' }).click();
    await expect(page.getByRole('button', { name: 'Skip idle' })).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByRole('heading', { name: "Can't play" })).toBeHidden();
    expect(errors).toEqual([]);
  });
}

test('a played replay runs to its end at double speed, and offers to watch it again', async ({ page }) => {
  await watch(page, seed.played[0].id);
  const play = page.getByRole('group', { name: 'Replay controls' }).getByRole('button').first();
  await expect(play).toHaveAccessibleName('Pause', { timeout: 30000 });
  await page.getByRole('button', { name: 'Double speed' }).click();
  // The end screen, whose Watch again is also what the play button turns into.
  const again = page.getByRole('status').getByRole('button', { name: 'Watch again' });
  await expect(again).toBeVisible({ timeout: 150000 });
  await expect(again).toBeFocused();
});

// A seed replay's placeholder (server/seed.js) isn't one the engine can build: after its 10 s of engine time the page says so.
test("a replay the engine can't build says so instead of staying black", async ({ page }) => {
  await watch(page, seed.replays[0].id);
  await expect(page.getByRole('heading', { name: "Can't play" })).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('status').filter({ hasText: "The game couldn't load this replay." })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Play Restart Generation' })).toBeVisible();
});
