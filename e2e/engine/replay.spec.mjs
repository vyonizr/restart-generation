// Replays (CONTEXT.md) played back by the engine on their page: the seed's played battles, which Bots really played
// (global-setup.mjs keeps them in data/e2e/), and a seed placeholder, which the engine can't build.
import { test, expect, seed, factsLine, playButton } from '../fixtures.mjs';
import { markLabel } from '../../shared/replay-text.js';
import { markTarget } from '../../web/src/lib/replay/replay-flow.js';

const seconds = text => { const [m, s] = text.split(' of ')[0].split(':'); return +m * 60 + +s; };

async function watch(page, id) {
  await page.goto(`/replay/${id}`);
  await page.getByRole('button', { name: 'Watch' }).click();
}

for (const { id } of seed.played) {
  test(`the played replay ${id} plays, and its buttons and keys control it`, async ({ page, errors }) => {
    await watch(page, id);
    await expect(page.getByText(await factsLine(page, id), { exact: true })).toBeVisible();
    const play = playButton(page);
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
  const play = playButton(page);
  await expect(play).toHaveAccessibleName('Pause', { timeout: 30000 });
  await page.getByRole('button', { name: 'Double speed' }).click();
  // The end screen, whose Watch again is also what the play button turns into.
  const again = page.getByRole('status').getByRole('button', { name: 'Watch again' });
  await expect(again).toBeVisible({ timeout: 150000 });
  await expect(again).toBeFocused();
});

// Defeated seats and the winner's crown (.scratch/defeated-seats/): in the seed's battle with the most players, every seat starts in
// play; a seek to the end shows at once each seat the engine defeated by then, and the end gives each winner the crown.
test('a seek to the end shows the defeated seats, and the end crowns the winner', async ({ page, errors }) => {
  const metas = await Promise.all(seed.played.map(async ({ id }) => ({ id, ...(await (await page.request.get(`replay/${id}/data`)).json()).meta })));
  const meta = metas.reduce((a, b) => b.players.length > a.players.length ? b : a);
  expect(meta.players.length).toBeGreaterThan(2);
  await watch(page, meta.id);
  await expect(playButton(page)).toHaveAccessibleName('Pause', { timeout: 30000 });
  const seat = n => page.getByRole('list', { name: 'Players by seat' }).getByRole('listitem').filter({ has: page.getByLabel(`Seat ${n}`, { exact: true }) });
  for (const p of meta.players) await expect(seat(p.seat)).not.toHaveAttribute('data-defeated');

  await page.getByRole('slider', { name: 'Time' }).press('End');
  await expect(page.getByRole('status').getByRole('button', { name: 'Watch again' })).toBeVisible({ timeout: 30000 });
  for (const p of meta.players) {
    const won = meta.result.winners.includes(p.seat);
    if (won) {
      await expect(seat(p.seat)).not.toHaveAttribute('data-defeated');
      await expect(seat(p.seat)).toContainText(', won');
    } else {
      await expect(seat(p.seat)).toHaveAttribute('data-defeated', '');
      await expect(seat(p.seat)).toContainText(', defeated');
    }
  }
  expect(errors).toEqual([]);
});

// The witness's moments (docs/adr/0030): Bots' battles end with a rescue, so a played seed replay has marks. Each is a tick on the
// slider named by its moments; Next and a click on a tick seek to it, and the slider's thumb sits on the tick, not on the nearest
// 5 s step, which a mark's second seldom is.
test('a played replay shows its marks, and Next and its ticks go to them', async ({ page, errors }) => {
  let found = null;
  for (const { id } of seed.played) {
    const { meta } = await (await page.request.get(`replay/${id}/data`)).json();
    if (meta.marks?.length) { found = { id, meta }; break; }
  }
  expect(found, 'a played seed replay with a mark').not.toBeNull();
  const { id, meta } = found;
  await watch(page, id);
  const play = playButton(page), controls = page.getByRole('group', { name: 'Replay controls' });
  await expect(play).toHaveAccessibleName('Pause', { timeout: 30000 });
  await play.click();
  const time = page.getByRole('slider', { name: 'Time' });
  const at = async () => seconds(await time.getAttribute('aria-valuetext'));
  const ticks = meta.marks.map(mark => controls.getByRole('button', { name: markLabel(meta, mark), exact: true }));
  for (const tick of ticks) await expect(tick).toBeVisible();

  const next = markTarget(meta.marks, await at(), 1);
  if (next !== null) {
    await controls.getByRole('button', { name: 'Next moment' }).click();
    await expect.poll(at).toBe(next);
    await expect(time).toHaveValue(String(next));
  }
  const last = meta.marks.at(-1);
  await ticks.at(-1).click();
  await expect.poll(at).toBe(last.at);
  await expect(time).toHaveValue(String(last.at));
  await expect(controls.getByRole('button', { name: 'Next moment' })).toBeDisabled();
  expect(errors).toEqual([]);
});

// A seed replay's placeholder (server/seed.js) isn't one the engine can build: after its 10 s of engine time the page says so.
test("a replay the engine can't build says so instead of staying black", async ({ page }) => {
  await watch(page, seed.replays[0].id);
  await expect(page.getByRole('heading', { name: "Can't play" })).toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('status').filter({ hasText: "The game couldn't load this replay" })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Play the game' })).toBeVisible();
});
