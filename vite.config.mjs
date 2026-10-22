// Builds the page (ADR 0013): web/index.html and the Svelte components under web/ui are bundled into web/dist, which the gateway
// serves and a static host takes as it is, with the Terms and the Privacy policy beside it as terms/ and privacy/ (docs/adr/0021).
// The emulator, the SNAP client and the other plain modules stay as they are, so Node can import them without this build.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { HTTP_PORT } from './server/ports.js';

// The page carries the licenses it needs, as licenses.txt next to index.html: the notices of what it includes, then our own LICENSE.
// Every deployment of web/dist ships them without anyone copying files (docs/LEGAL.md).
const licenses = () => ({
  name: 'licenses',
  generateBundle() {
    const read = f => fs.readFileSync(new URL(`./${f}`, import.meta.url), 'utf8');
    const bar = '='.repeat(78);
    this.emitFile({ type: 'asset', fileName: 'licenses.txt', source: `${read('THIRD_PARTY_NOTICES.md')}\n\n${bar}\nLICENSE\n${bar}\n\n${read('LICENSE')}` });
  },
});

// `npm run dev:web` serves the page with hot reload and forwards everything the gateway answers to a running gateway.
const gateway = `http://127.0.0.1:${HTTP_PORT}`;

export default defineConfig({
  root: 'web',
  base: './', // relative links, so a static host can serve the page from any folder
  plugins: [svelte({ configFile: false }), licenses()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0, // the wake video and the fonts stay files
    rollupOptions: { input: Object.fromEntries([['index', 'index.html'], ['terms', 'terms/index.html'], ['privacy', 'privacy/index.html']].map(([name, f]) => [name, fileURLToPath(new URL(`./web/${f}`, import.meta.url))])) },
  },
  server: {
    // Exact paths: a plain '/snap' would also catch the page's own /snap.js.
    proxy: Object.fromEntries(['^/(snap|status|bots)$', '^/(auth|game)/'].map(path => [path, gateway])),
  },
});
