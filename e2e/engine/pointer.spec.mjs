// Pointer play (CONTEXT.md "Pointer play", docs/adr/0039) in an online battle: a click on the game screen acts for the local player.
// The engine sends the server what keys would have sent, so the test reads its own orders off the page's requests to the gateway,
// as the server gets them (server/mt.js, server/gamemsg.js), and never looks at the canvas (docs/adr/0025). Two members in a
// friendly room, CPU players in the empty seats; the host drops its first tile piece on the Full board, then acts again on Classic.
// Offline battles take the same page path; their engine reads are checked by `npm run test:pointer` (tools/emu/pointer-test.mjs).
import { createRequire } from 'node:module';
import { test, expect } from '../fixtures.mjs';
import { walk, engineTime, PAIRS, online, CREATE_ROOM, FRIENDS_ROOM } from './engine.mjs';

const require = createRequire(import.meta.url);
const { CMD } = require('../../shared/snap-ids.js');
const { createReader, T } = require('../../server/mt.js');
const gm = require('../../server/gamemsg.js');

// The battle messages the page's engine sends, in order. Each game packet request carries MT frames, and a battle message is one
// of type 0x16; a request resent for want of a reply keeps its request id (R), so it counts once.
function sentMessages(page) {
  const sent = [], seen = new Set(), read = createReader();
  page.on('request', request => {
    if (request.method() !== 'POST' || !request.url().endsWith('/snap')) return;
    const params = new Map((request.postData() ?? '').split('&').map(p => [p.slice(0, p.indexOf('=')), p.slice(p.indexOf('=') + 1)]));
    if (Number(params.get('C')) !== CMD.SEND_GAME_PACKET_TO_GAME_SERVER || seen.has(params.get('R'))) return;
    seen.add(params.get('R'));
    for (const m of read(Buffer.from(params.get('P1'), 'base64'))) if (m[0] === T.GAME) sent.push(gm.unpack(m.subarray(1)));
  });
  return sent;
}
const NAMES = Object.fromEntries(Object.entries(gm.TYPE).map(([name, type]) => [type, name]));
const names = messages => messages.map(m => NAMES[m.type] ?? m.type).join(', ') || 'none';
// What a player does on the battlefield, which only their input sends: the rest (EndTurnRequest at the phase time limit, the battle's
// handshake) the engine sends by itself.
const ORDERS = new Set([gm.TYPE.MOVE_UNIT, gm.TYPE.FIRE_CANNON, gm.TYPE.PLACE_TILE, gm.TYPE.ATTACK, gm.TYPE.POINT, gm.TYPE.SPECIAL_SKILL]);

// Points around the middle of the battlefield, in engine screen pixels from the middle of the screen, tried in turn: a piece can't
// drop on every cell, and a hero can't reach every cell. The painter centers the engine's screen in the canvas, so the screen's
// middle is the canvas's (web/src/lib/input/pointer-logic.js screenPoint).
const SPOTS = [[0, 0], [45, 0], [-45, 0], [0, 40], [0, -40], [45, 40], [-45, -40], [-45, 40], [45, -40]];
async function pagePoint(page, [x, y]) {
  const canvas = page.getByLabel('Game screen');
  const box = await canvas.boundingBox();
  const size = await canvas.evaluate(c => ({ w: c.width, h: c.height }));
  return { x: box.x + (size.w / 2 + x) * box.width / size.w, y: box.y + (size.h / 2 + y) * box.height / size.h };
}

// The pointer onto a spot, then two clicks there. On the Full board the hover takes the cursor (or the piece) to the cell and the
// first click commits; on Classic the first click moves it and the second commits. A click on a cell that does nothing more is
// harmless: while the player isn't acting it only moves the cursor.
async function playSpot(page, spot) {
  const p = await pagePoint(page, spot);
  await page.mouse.move(p.x, p.y, { steps: 5 });
  await engineTime(page, 500, { after: true });
  for (let i = 0; i < 2; i++) {
    await page.mouse.click(p.x, p.y);
    await engineTime(page, 1000, { after: true }); // a piece drops after Select is held for 600 ms of engine time
  }
}

// Plays spot after spot until done() or, at the latest, `ms` of engine time from now.
async function play(page, ms, done) {
  const until = await page.evaluate(() => window.rgStats.time) + ms;
  for (let i = 0; !done() && await page.evaluate(() => window.rgStats.time) < until; i++) await playSpot(page, SPOTS[i % SPOTS.length]);
}

test('in a friendly room with CPU players, a click drops the tile piece on the Full board and acts on Classic', async ({ browser, baseURL }) => {
  test.setTimeout(600000); // two engines on one machine, the bots' start, and a round of the battle
  const [host, guest] = PAIRS[1]; // dialogs.spec.mjs leaves a battle running with PAIRS[0]
  const [page, keys] = await online(browser, baseURL, host);
  const sent = sentMessages(page);
  await walk(page, keys, CREATE_ROOM);
  const [other, otherKeys] = await online(browser, baseURL, guest);
  await walk(other, otherKeys, FRIENDS_ROOM);
  await engineTime(page, 3000, { after: true }); // the room lists the guest, and Start appears
  await keys('select');
  await page.getByRole('dialog', { name: 'Fill the empty seats with CPU players?' }).getByRole('button', { name: 'Yes' }).click();
  await page.waitForFunction(() => window.rgStats?.battle === 'full', null, { timeout: 180000 });

  // The battle opens on tile placement, with a 20 s phase time limit; the engine asks to end the phase when it runs out.
  const placed = () => sent.some(m => m.type === gm.TYPE.PLACE_TILE);
  await play(page, 120000, () => placed() || sent.some(m => m.type === gm.TYPE.END_TURN_REQUEST));
  expect(placed(), `the host sent ${names(sent)}`).toBe(true);

  // Classic, while the battle goes on: the next thing the host's turn lets it do, a hero's move, a cannon shot or the next piece.
  const toggle = page.getByRole('button', { name: 'Full board' });
  await toggle.click();
  await expect(toggle).toHaveAttribute('aria-pressed', 'false');
  await page.waitForFunction(() => window.rgStats?.battle === 'classic', null, { timeout: 60000 });
  const before = sent.length;
  const acted = () => sent.slice(before).some(m => ORDERS.has(m.type));
  await play(page, 240000, acted);
  expect(acted(), `on Classic the host sent ${names(sent.slice(before))}`).toBe(true);

  await other.context().close();
  await page.context().close();
});
