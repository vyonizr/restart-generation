# End-to-end tests run in Playwright, with the engine only where the game is

The page now has many states that only show when its Svelte components, its stores, the gateway and the engine work together: the overlay, the dialogs, the replay page, the touch pad. `npm test` checks logic pulled into pure modules against a fake engine (`web/ui/replayflow.test.mjs`), and `web/tools/browser-test.mjs` only drives a browser with fixed sleeps and fails on console errors, so a broken flow reached players. `npm run e2e` now runs `@playwright/test` (the project's first test framework) against a throwaway gateway that each run seeds from `server/seed.json` (ADR 0023). The tests come in two tiers. CI can't hold the game (ADR 0001), so CI runs the engine-free tier on every push and before every release. The engine tier runs only on a machine that has the game, as `RG_GAME` in `.env`, and reports a skip when the game is missing.

## Considered options

- **Grow `web/tools/browser-test.mjs` into a small library.** Rejected. It adds no dependency, but we would have to write waiting, a fresh browser state per test, touch emulation, several pages and reporting ourselves, and its sleeps are what makes browser tests flaky. Playwright replaces it.
- **Run the E2E tests inside `npm test`.** Rejected. `npm test` stays fast and runs without a browser, and its engine-free checks would be pretending to cover the engine.
- **A fake engine host in the page, so CI reaches the dialogs the engine opens** (Bots, Name). Not yet. It is a test-only path in shipped code, and it can drift from what the engine really does. The engine tier covers those two locally. Revisit this if a bug in one of them escapes the engine tier. Of the page's other dialogs, Confirm opens from the Account menu and is in the engine-free tier; the Member dialog opens only on the way back from Discord sign-in, which no tier reaches.
- **Pixel baselines.** Rejected. A baseline taken while the engine runs is a screenshot of the game (`docs/LEGAL.md` rule 2), and a page-only baseline needs a `tools/legal-allow.json` entry and breaks on every style change. Tests check what the page shows by role and text.
- **Firefox and WebKit.** Not yet. Tests run in Chromium (Edge locally) on a desktop and a touch device profile. Playwright's WebKit isn't the iOS Safari a phone runs.

## Consequences

- Traces, screenshots and videos from an engine-tier run are recordings of the game. They stay in `tmp/e2e/`, which git ignores, and never go into a commit, an issue, a pull request or a CI artifact. CI uploads failure traces only from the engine-free tier.
- Playable replays for the engine tier come from `server/seed.js --play`, cached in `data/e2e/` (which git ignores) and played again only when the seed's `played` battles change. A seed placeholder replay checks the unplayable state, in the engine tier too: only the engine can find out that it can't build a replay.
- Tests derive their expectations from `server/seed.json`, so a new seed row doesn't break them.
- A `--public` gateway won't start without battle templates, which CI can't have, so the tests of what a public server shows (its Terms, Privacy policy and links) put a public server's answer to `GET /status` in front of the test gateway's.
- The engine draws on a canvas the tests never look at, so they wait on the engine's own clock, which the page exposes as `window.rgStats.time`, and never on the wall clock.
- A test that passes only on its retry counts as a failure to fix.
- The Docker page stage installs `@playwright/test` with the other devDependencies. It downloads no browser, and the final image holds no `node_modules`.
