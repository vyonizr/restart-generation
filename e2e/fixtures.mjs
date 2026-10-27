// What every end-to-end test shares (docs/adr/0025): the gateway its project runs against, signing in as a seed account, the
// console errors a page logged, the seed (server/seed.json) the tests take their expectations from, and toFitItsControls.
import { test as base, expect as baseExpect } from '@playwright/test';
import { createRequire } from 'node:module';
import { shortDay } from '../shared/replay-text.js';

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

// What doesn't fit in a band or strip of the page (`row`): each of its children, and each control in it, that reaches outside its
// box, and each two of its children that overlap. Text an ellipsis cuts short keeps to its box, and a tip shown over the row on
// hover isn't a child or a control, so neither counts. The page clips what sticks out (stage.css `.page`), so a check on the page's
// scroll width never sees it: only the row's box does.
function misfits(row) {
  return row.evaluate(async el => {
    await document.fonts.ready; // a control's width depends on its font
    const SUBPIXEL = 0.5;
    const shown = e => e.checkVisibility({ visibilityProperty: true, opacityProperty: false });
    const name = e => e.getAttribute('aria-label') || e.getAttribute('title') || e.textContent.trim().slice(0, 24) || `<${e.tagName.toLowerCase()} class="${e.className}">`;
    const box = el.getBoundingClientRect(), faults = [];
    const children = [...el.children].filter(shown);
    for (const e of new Set([...children, ...[...el.querySelectorAll('button, input, select, a')].filter(shown)])) {
      const r = e.getBoundingClientRect();
      const out = { left: box.left - r.left, right: r.right - box.right, top: box.top - r.top, bottom: r.bottom - box.bottom };
      for (const [side, px] of Object.entries(out)) if (px > SUBPIXEL) faults.push(`"${name(e)}" sticks out ${Math.round(px)}px on the ${side}`);
    }
    for (const [i, a] of children.entries()) {
      for (const b of children.slice(i + 1)) {
        const p = a.getBoundingClientRect(), q = b.getBoundingClientRect();
        const x = Math.min(p.right, q.right) - Math.max(p.left, q.left), y = Math.min(p.bottom, q.bottom) - Math.max(p.top, q.top);
        if (x > SUBPIXEL && y > SUBPIXEL) faults.push(`"${name(a)}" and "${name(b)}" overlap by ${Math.round(x)}×${Math.round(y)}px`);
      }
    }
    return faults;
  });
}

export const expect = baseExpect.extend({
  // await expect(row).toFitItsControls(): retries, as Playwright's own assertions do, until the row's layout settles or the timeout.
  async toFitItsControls(row, options = {}) {
    let faults = await misfits(row);
    if (!this.isNot) {
      const deadline = Date.now() + (options.timeout ?? this.timeout);
      while (faults.length && Date.now() < deadline) { await new Promise(r => setTimeout(r, 100)); faults = await misfits(row); }
    }
    const pass = faults.length === 0;
    return {
      name: 'toFitItsControls', pass, expected: [], actual: faults,
      message: () => pass ? `${this.utils.matcherHint('toFitItsControls', 'row', '', { isNot: this.isNot })}\n\nEvery control fits ${row}.`
        : `${this.utils.matcherHint('toFitItsControls', 'row', '', { isNot: this.isNot })}\n\nIn ${row}:\n${faults.map(f => `  ${f}`).join('\n')}`,
    };
  },
});

// The seed replays listed under `name` (docs/adr/0024): its newest 25 (docs/adr/0034), newest first, as the server lists them. A seed
// time such as "-1d3h" is an offset from the seeding run, so the larger one is the newer.
export const replaysOf = name => seed.replays
  .filter(r => r.players.some(p => !p.bot && p.name === name))
  .sort((a, b) => offset(b.created) - offset(a.created))
  .slice(0, 25);

// A --public gateway won't start without battle templates, which CI can't have (docs/LEGAL.md), so tests put a public server's
// answer to GET /status in front of the test gateway's: the fields it fills from RG_ADMIN_NAME, RG_HOSTING and RG_CONTACT.
export const PUBLIC = { adminName: 'Jane Doe', hosting: 'Example Cloud, Jakarta', contact: 'https://example.org/contact' };
export const asPublicServer = page => page.route('**/status', async route => {
  const response = await route.fetch();
  await route.fulfill({ response, json: { ...(await response.json()), ...PUBLIC } });
});

// What a replay page's title band says about the replay the server keeps under `id` (web/src/lib/replay/ReplayBroadcast.svelte): the day it
// was kept and the kind of match.
export async function factsLine(page, id) {
  const { meta } = await (await page.request.get(`replay/${id}/data`)).json();
  return `${shortDay(meta.created)} - ${meta.ranked ? 'Ranked' : 'Friendly'} match`;
}

// The replay's play button (web/src/lib/replay/ReplayControls.svelte), named for what a press does; Previous moment comes before it when the
// replay has marks.
export const playButton = page => page.getByRole('group', { name: 'Replay controls' }).getByRole('button', { name: /^(Play|Pause|Watch again)$/ });
