// The end-to-end tests (docs/adr/0025, e2e/): `npm run e2e`. Two tiers, each on a desktop and a touch device profile:
//   page-*    the page with no game, against a gateway that sends none; CI runs these
//   engine-*  the page running the engine, against gateways that send their server copy (RG_GAME); they skip where RG_GAME isn't set
// What a run leaves behind stays in tmp/e2e/, which git ignores: tmp/e2e/engine/ shows the game, so it never leaves this machine
// (docs/LEGAL.md rule 2). CI uploads tmp/e2e/page/ only.
import { defineConfig, devices } from '@playwright/test';

const CI = Boolean(process.env.CI);
// Edge where it is installed with Windows; elsewhere Playwright's Chromium (`npx playwright install chromium`).
const channel = !CI && process.platform === 'win32' ? 'msedge' : undefined;
const desktop = { ...devices['Desktop Chrome'], channel };
const touch = { ...devices['Pixel 7'], viewport: { width: 390, height: 844 }, channel };

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.mjs',
  // A test that passes only on its retry is flaky, and flaky is a failure to fix (docs/adr/0025).
  retries: CI ? 1 : 0,
  failOnFlakyTests: true,
  forbidOnly: CI,
  reporter: CI ? [['github'], ['list']] : 'list',
  use: { trace: 'retain-on-failure', screenshot: 'only-on-failure' },
  projects: [
    { name: 'page-desktop', testDir: 'e2e/page', outputDir: 'tmp/e2e/page/desktop', use: desktop, metadata: { server: 'E2E_PAGE_URL' } },
    { name: 'page-touch', testDir: 'e2e/page', outputDir: 'tmp/e2e/page/touch', use: touch, metadata: { server: 'E2E_PAGE_URL' } },
    // The emulator keeps a CPU core busy, so each engine project runs one test at a time rather than slow them into timeouts.
    { name: 'engine-desktop', testDir: 'e2e/engine', outputDir: 'tmp/e2e/engine/desktop', use: desktop, metadata: { server: 'E2E_ENGINE_URL' }, testIgnore: /touch\./, workers: 1, timeout: 180000 },
    { name: 'engine-touch', testDir: 'e2e/engine', outputDir: 'tmp/e2e/engine/touch', use: touch, metadata: { server: 'E2E_ENGINE_URL' }, testMatch: /touch\./, workers: 1, timeout: 180000 },
  ],
});
