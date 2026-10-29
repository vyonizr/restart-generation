// A server that sends no game: the player picks their own copy (RG_PICK, else RG_GAME: the standalone .zip or its folder), the
// engine boots from it, and the browser keeps it, so the next visit doesn't ask again.
// check-paths: web/src/lib/game/{game-files.js,Overlay.svelte} shared/{game.mjs,zip.js,pak.js}
import fs from 'node:fs';
import path from 'node:path';
import { test, expect } from '../fixtures.mjs';
import { engineTime } from './engine.mjs';

const copy = process.env.RG_PICK || process.env.RG_GAME;

test('a picked copy boots the game and is kept for the next visit', async ({ page, errors }) => {
  // The engine tier's gateway sends the game, so this test visits the one that sends none.
  await page.goto(process.env.E2E_PAGE_URL);
  await expect(page.getByRole('button', { name: 'Choose .zip file' })).toBeVisible();
  const file = path.resolve(copy);
  await page.locator(fs.statSync(file).isFile() ? '#pick-zip-input' : '#pick-input').setInputFiles(file);
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('#overlay')).toBeHidden();
  await expect(page.getByLabel('Game screen')).toBeFocused();
  await engineTime(page, 2000);

  await page.reload();
  await expect(page.getByRole('button', { name: 'Start' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Choose .zip file' })).toBeHidden();
  expect(errors).toEqual([]);
});
