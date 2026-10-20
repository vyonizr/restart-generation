// Builds the page (ADR 0013): web/index.html and the Svelte components under web/ui are bundled into web/dist, which the gateway
// serves and a static host takes as it is. The emulator, the SNAP client and the other plain modules stay as they are, so Node
// can import them without this build.
import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';

// `npm run dev:web` serves the page with hot reload and forwards everything the gateway answers to a running gateway.
const gateway = `http://127.0.0.1:${process.env.HTTP_PORT || 8080}`;

export default defineConfig({
  root: 'web',
  base: './', // relative links, so a static host can serve the page from any folder
  plugins: [svelte({ configFile: false })],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    assetsInlineLimit: 0, // the wake video and the fonts stay files
  },
  server: {
    // Exact paths: a plain '/snap' would also catch the page's own /snap.js.
    proxy: Object.fromEntries(['^/(snap|status|bots)$', '^/(auth|game)/'].map(path => [path, gateway])),
  },
});
