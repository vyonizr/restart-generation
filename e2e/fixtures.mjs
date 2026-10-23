// What every end-to-end test shares (docs/adr/0025): the gateway its project runs against, signing in as a seed account, the
// console errors a page logged, and the seed (server/seed.json) the tests take their expectations from.
import { test as base, expect } from '@playwright/test';
import { createRequire } from 'node:module';
import { shortDay } from '../web/replay-text.js';

const require = createRequire(import.meta.url);
const { tokenOf, offset } = require('../server/seed.js');
export const seed = require('../server/seed.json');

export const test = base.extend({
  // The gateway global-setup.mjs started for this project's tier. The engine tier skips where RG_GAME isn't set.
  baseURL: async ({}, use, testInfo) => {
    const url = process.env[testInfo.project.metadata.server];
    testInfo.skip(!url, 'the engine tests need RG_GAME, the server copy of the game (.env)');
    await use(url);
  },
  // test.use({ account: 'Dev_Ada' }) opens the page signed in as that seed account, with the token server/seed.js gave it.
  // Without one, the server makes the page a new guest, as on a first visit.
  account: [null, { option: true }],
  storageState: async ({ account, baseURL }, use) => {
    await use(account ? { cookies: [], origins: [{ origin: baseURL, localStorage: [{ name: 'rg:account', value: JSON.stringify({ name: account, token: tokenOf(account) }) }] }] } : undefined);
  },
  // Every uncaught exception and console.error the page logs, with the address of a resource that failed to load.
  errors: async ({ page }, use) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    page.on('console', m => { if (m.type() === 'error') errors.push(m.location().url ? `${m.text()} (${m.location().url})` : m.text()); });
    await use(errors);
  },
});
export { expect };

// The seed replays listed under `name` (docs/adr/0024), newest first, as the server lists them. A seed time such as "-1d3h" is an
// offset from the seeding run, so the larger one is the newer.
export const replaysOf = name => seed.replays
  .filter(r => r.players.some(p => !p.bot && p.name === name))
  .sort((a, b) => offset(b.created) - offset(a.created));

// A --public gateway won't start without battle templates, which CI can't have (docs/LEGAL.md), so tests put a public server's
// answer to GET /status in front of the test gateway's: the fields it fills from RG_ADMIN_NAME, RG_HOSTING and RG_CONTACT.
export const PUBLIC = { adminName: 'Jane Doe', hosting: 'Example Cloud, Jakarta', contact: 'https://example.org/contact' };
export const asPublicServer = page => page.route('**/status', async route => {
  const response = await route.fetch();
  await route.fulfill({ response, json: { ...(await response.json()), ...PUBLIC } });
});

// What a replay page's title band says about the replay the server keeps under `id` (web/ui/ReplayBroadcast.svelte): the day it
// was kept and the kind of match.
export async function factsLine(page, id) {
  const { meta } = await (await page.request.get(`replay/${id}/data`)).json();
  return `${shortDay(meta.created)} - ${meta.ranked ? 'Ranked' : 'Friendly'} match`;
}
