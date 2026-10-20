# The page is built with Vite and Svelte; the server and engine stay dependency-free

The browser page grew from a few buttons into a login dialog, guest and member accounts, a bot prompt, a file picker, a touch pad, notices and a footer whose copy depends on the server. `web/main.js` wires 21 elements by id and mixes game loading, input, audio, the pad and every dialog, and `web/accountui.js` builds DOM by hand and manages dialog focus by hand. The UI layer moves to Svelte 5, compiled by plain Vite (not SvelteKit). The page and its dialogs become components that own their state; the emulator, the SNAP client and the server do not change.

This reverses the product rule "plain HTML, CSS and JavaScript modules with no build step and no dependencies" for the page only. The server stays dependency-free (the README's "nothing to install" becomes "nothing to install to run the server from a built page"; see below), and `node:sqlite` stays the only database (ADR 0010).

## What moves and what stays

Moves: `web/index.html` (markup, and the CSS as global styles keeping the `DESIGN.md` tokens), the UI parts of `web/main.js`, `web/accountui.js` and `web/account.js`.

Stays plain modules, because Node imports them with no bundler (`server/bot.mjs`, `tools/tune.mjs`, `server/gateway.js` and `server/casino.test.js`): `web/emu/`, `web/snap.js`, `web/zip.js` and `web/tools/game.mjs`. The emulator's game loop and canvas drawing also stay as they are; Svelte code calls them.

## Considered options

- **Keep plain modules and add a small helper (a hand-rolled `h()` or a tiny template library).** Rejected: it repeats what a compiler already does (reactive state, focus handling in dialogs, cleanup) and the page keeps growing.
- **React, with Vite.** Rejected: the UI is a thin shell around a canvas that the emulator keeps busy, and React with its DOM library costs about 42 KB gzipped (more than 60 KB for a plain Vite hello world, reported by Bundlephobia and community write-ups, not measured here) for an ecosystem this page does not need.
- **Preact.** A fair second choice: about 3 to 4 KB gzipped and the React model. Rejected only because Svelte 5 is as small and removes the virtual DOM and the hook rules. If the owner or a contributor knows React far better, this is the fallback.
- **Astro.** Rejected: it is built for content-heavy, multi-page sites with a few interactive islands. This is one screen around a canvas app, and Astro would still need Svelte or React inside it. If real pages arrive later (rankings, profile, help), a separate Astro site is the place for them and the game page stays on Svelte.
- **SvelteKit.** Rejected: routing, server rendering and an adapter add nothing to a single static page that the gateway already serves.
- **TypeScript.** Not now. The server, tests and tools are JavaScript, and the shared `web/` modules that Node imports cannot be TypeScript without a build for Node too. Revisit if the UI keeps growing.

## Consequences

- A fresh clone needs `npm install` before the page can be built: Svelte, Vite and the Svelte Vite plugin become development dependencies. Vite 8 needs Node 20.19 or 22.12 and later, which the project's 22.13 minimum meets. The server and the engine still run with no installed packages.
- `npm run build` writes `web/dist/`, and the gateway serves that folder. The `npm start` scripts build it first when it is missing. A static host takes `web/dist/` as is. The Dockerfile builds in a first stage and copies only `web/dist/` and the server into the final image, so the final image still has no `node_modules`.
- The gateway's static whitelist (`/^\/(emu\/)?[\w-]+\.(js|html|mp4)$/`) changes to serve hashed build output. The `Cache-Control: no-cache` rule stays for `index.html`; hashed assets may be cached for a long time.
- Development uses the Vite dev server with hot reload, proxying `/snap`, `/status`, `/auth`, `/bots` and `/game` to the gateway.
- The migration goes one surface at a time with the page working after every step (see `.scratch/ui-migration/spec.md`), and the old code is deleted at the end, with no old and new pages side by side.
- `PRODUCT.md`, the README and `.impeccable/surfaces/web-index-html.md` change with the build, not before it: they describe what the repository does today.
