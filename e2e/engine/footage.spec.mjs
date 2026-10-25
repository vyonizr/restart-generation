// Footage (CONTEXT.md, docs/adr/0028): a played seed replay exported from its page as an MP4 file. The file shows the game, so it
// stays in this test's output under tmp/e2e/engine/ and is never uploaded (docs/LEGAL.md rule 2); the test reads only its tracks.
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { Input, BlobSource, ALL_FORMATS } from 'mediabunny';
import { test, expect, seed, playButton } from '../fixtures.mjs';

// When the replay is over by the page's rule (replay-flow.js), at the engine's own 1× with idle time skipped, in seconds of engine
// time: played with the engine itself, apart from the page and its encoders. In a Node of its own, because the engine's modules
// loaded into the test runner break its loading of the server's (fixtures.mjs). Its battles all finish, so the rule's fallback for
// one that never does doesn't come into it.
const ENGINE_END = `
import fs from 'node:fs';
import { GameHost } from ${JSON.stringify(new URL('../../shared/emu/host.js', import.meta.url).href)};
import { loadGame } from ${JSON.stringify(new URL('../../shared/game.mjs', import.meta.url).href)};
const game = new GameHost(await loadGame(), { replay: fs.readFileSync(0, 'utf8'), warn: () => {} });
game.boot();
for (let tick = 0, pulled = 0; tick < 60000; tick++) {
  game.tick();
  for (; pulled * 64 < game.time; pulled++) game.pullSound();
  if (game.replayLoaded && game.replayLength > 0 && game.replayTime >= game.replayLength && !game.replayAnimating && game.replayFinished) {
    process.stdout.write(String(game.time / 1000));
    process.exit(0);
  }
}
process.exit(1);`;
function endOf(text) {
  const run = spawnSync(process.execPath, ['--input-type=module', '-e', ENGINE_END], { input: text, encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`the replay never ended: ${run.stderr}`);
  return Number(run.stdout);
}

// The tracks of the MP4 file at `file`.
async function tracksOf(file) {
  const input = new Input({ source: new BlobSource(new Blob([fs.readFileSync(file)])), formats: ALL_FORMATS });
  expect(await input.getMimeType()).toMatch(/^video\/mp4/);
  return { video: await input.getPrimaryVideoTrack(), audio: await input.getPrimaryAudioTrack() };
}

test('a played replay exports as the battle only: an MP4 of the whole battle at 30 fps, 1080 px tall, with sound', async ({ page, errors }, testInfo) => {
  const { id } = seed.played[0];
  const { text } = await (await page.request.get(`replay/${id}/data`)).json();
  await page.goto(`/replay/${id}`);
  await page.getByRole('button', { name: 'Watch' }).click();
  const play = playButton(page);
  await expect(play).toHaveAccessibleName('Pause', { timeout: 30000 });
  await page.getByRole('button', { name: 'Double speed' }).click(); // the page's own speed doesn't reach the footage

  const saving = page.waitForEvent('download', { timeout: 150000 });
  await page.getByRole('button', { name: 'Download replay' }).click();
  await page.getByRole('menuitem', { name: 'Battle Only' }).click();
  await expect(page.getByRole('progressbar', { name: 'Download' })).toBeVisible();
  await expect(play).toBeDisabled();
  const download = await saving;
  // It says so for 2.5 s, less than copying a long battle's file can take.
  await expect(page.getByRole('button', { name: 'Downloaded' })).toBeVisible();
  expect(download.suggestedFilename()).toMatch(/^restart-generation-\d{4}-\d\d-\d\d-.+(?<!-details)\.mp4$/);
  const file = testInfo.outputPath('footage.mp4');
  await download.saveAs(file);

  // Back at the start, paused, with the page's 2× still on, and it plays from there.
  await expect(play).toHaveAccessibleName('Play');
  const time = page.getByRole('slider', { name: 'Time' });
  await expect(time).toHaveAttribute('aria-valuetext', /^0:00 of /);
  await expect(page.getByRole('button', { name: 'Double speed' })).toHaveAttribute('aria-pressed', 'true');
  await play.click();
  await expect(time).not.toHaveAttribute('aria-valuetext', /^0:00 of /, { timeout: 15000 });

  const { video, audio } = await tracksOf(file);
  expect(video.codec).toBe('avc');
  expect([await video.getDisplayWidth(), await video.getDisplayHeight()]).toEqual([1200, 1080]);
  expect((await video.computePacketStats()).averagePacketRate).toBeCloseTo(30, 1);
  expect(audio?.codec).toBe('aac');
  // The whole battle and one second more.
  const expected = endOf(text) + 1;
  expect(Math.abs(await video.computeDuration() - expected)).toBeLessThanOrEqual(1);
  expect(Math.abs(await audio.computeDuration() - expected)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});

// Download replay works as soon as Watch does, so it is never disabled with nothing on screen saying why. With Details puts the
// page's title band over the battle and its lower third under it, and holds the end for three seconds.
test('a replay exports as footage with details straight from Watch, and then waits at the start', async ({ page, errors }, testInfo) => {
  const { id } = seed.played[1];
  const { text } = await (await page.request.get(`replay/${id}/data`)).json();
  await page.goto(`/replay/${id}`);
  await expect(page.getByRole('button', { name: 'Watch' })).toBeVisible({ timeout: 30000 });
  const saving = page.waitForEvent('download', { timeout: 150000 });
  await page.getByRole('button', { name: 'Download replay' }).click();
  // With Details comes first and has focus: Enter picks it.
  await expect(page.getByRole('menuitem', { name: 'With Details' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('progressbar', { name: 'Download' })).toBeVisible();
  const download = await saving;
  expect(download.suggestedFilename()).toMatch(/-details\.mp4$/);
  const file = testInfo.outputPath('footage-details.mp4');
  await download.saveAs(file);
  await expect(page.getByRole('button', { name: 'Watch' })).toBeHidden();
  const play = playButton(page);
  await expect(play).toHaveAccessibleName('Play');
  await expect(page.getByRole('slider', { name: 'Time' })).toHaveAttribute('aria-valuetext', /^0:00 of /);

  // As wide as the battle, with the bands over and under it as big beside it as on the page, where the battle is at most 640 px
  // tall: 40 px, and one seat's 52.45 px rounded to an even size, at 1080 / 640.
  const { video, audio } = await tracksOf(file);
  expect([await video.getDisplayWidth(), await video.getDisplayHeight()]).toEqual([1200, 68 + 1080 + 90]);
  const expected = endOf(text) + 3;
  expect(Math.abs(await video.computeDuration() - expected)).toBeLessThanOrEqual(1);
  expect(Math.abs(await audio.computeDuration() - expected)).toBeLessThanOrEqual(1);
  expect(errors).toEqual([]);
});
