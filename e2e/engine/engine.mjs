// What the engine tests share. The engine draws to a canvas the tests don't look at (docs/adr/0025: no pixels), so they wait on its
// own clock, window.rgStats.time (web/src/lib/game/game.js), which runs as fast as the device lets it, never on the wall clock.
import { expect, seed } from '../fixtures.mjs';
import { tokenOf } from '../../server/seed.js';

// Opens the game page and presses Start once the engine is ready.
export async function start(page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Start' }).click();
  await expect(page.locator('#overlay')).toBeHidden();
}

// Waits until the engine's clock reads `ms` since Start, or, with `after`, `ms` past now. rgStats is refreshed every 60 frames, so
// "now" is its next refresh rather than the one already there, which can be most of a second old.
export async function engineTime(page, ms, { after = false } = {}) {
  let from = 0;
  if (after) {
    const seen = await page.evaluate(() => window.rgStats?.time ?? 0);
    from = await page.waitForFunction(t => window.rgStats?.time > t && window.rgStats.time, seen).then(h => h.jsonValue());
  }
  await page.waitForFunction(t => window.rgStats?.time >= t, from + ms, { timeout: 60000 });
}

// Gives the engine `actions` (select, back, up, down, left, right) through `press`, by key or by the touch pad, letting each screen
// settle before the next.
export async function walk(page, press, actions) {
  for (const action of actions) {
    await press(action);
    await engineTime(page, 1500, { after: true });
  }
}
export const KEYS = { select: 'Enter', back: 'Escape', up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
export const byKey = page => action => page.keyboard.press(KEYS[action]);

// The main menu opens on Single-Player, with Quick Match and Online below it. Back skips the intro to it once the intro has run.
export async function mainMenu(page, press) {
  await engineTime(page, 3000);
  await walk(page, press, ['back']);
}
export const ONLINE = ['down', 'down', 'select'];

// Pairs of members who are friends both ways, so one can make a friendly room and the other sees it; the arrow keys need the
// default keys, which a member's saved game may have changed. Each member is in one pair only: a battle a test leaves running holds
// its people's seats, and their next visit offers to rejoin it in Start's place (docs/adr/0038), so each test that starts a battle
// takes a pair of its own.
const plain = seed.accounts.filter(a => a.kind === 'member' && !a.keys).map(a => a.name);
const friends = (x, y) => seed.friends.some(([a, b, state]) => state === 'both' && ((a === x && b === y) || (a === y && b === x)));
export const PAIRS = plain.reduce((pairs, x) => {
  const taken = pairs.flat(), y = plain.find(y => y !== x && friends(x, y) && !taken.includes(y));
  return taken.includes(x) || !y ? pairs : [...pairs, [x, y]];
}, []);

// A page of its own, signed in as the seed member `name`, on the Online menu once the Arena login is through, with its key presser.
// Online opens on Quick Match, with Your Stats, Rankings and Create Room below it; Create Room asks for a hero, then waits for
// players. A friend's room is listed just above Quick Match, and entering it asks for a hero too. With `debug`, the page fills
// window.rgDebug as it boots (docs/agents/engine-debugging.md).
export async function online(browser, baseURL, name, { debug = false } = {}) {
  const context = await browser.newContext({ storageState: { cookies: [], origins: [{ origin: baseURL, localStorage: [{ name: 'rg:account', value: JSON.stringify({ name, token: tokenOf(name) }) }] }] } });
  if (debug) await context.addInitScript(() => { window.rgDebug = {}; });
  const page = await context.newPage();
  await start(page);
  const keys = byKey(page);
  await mainMenu(page, keys);
  await walk(page, keys, ONLINE);
  await engineTime(page, 3000, { after: true }); // the Arena login
  return [page, keys];
}
export const CREATE_ROOM = ['down', 'down', 'down', 'select', 'select'];
export const FRIENDS_ROOM = ['up', 'select', 'select'];

// The main menu's Quit (CONTEXT.md "Quit"), confirmed: Back opens Quit's yes/no with No chosen, Down chooses Yes, Select confirms.
// The engine stops on the last press, so nothing waits after it.
export async function quitFromMainMenu(page, press) {
  await walk(page, press, ['back', 'down']);
  await press('select');
}
