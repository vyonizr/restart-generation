---
status: accepted
---

# The page lives in `web/src`, and the code Node shares lives in `shared/`

This decision changes where ADR 0013 kept the page's plain modules. It doesn't change the build: the page is still Svelte 5 compiled by plain Vite, not SvelteKit.

`web/` held two kinds of code side by side. One was the page: the Svelte components in a flat `web/ui` of about 65 files. The other was the modules Node imports without a bundler: the emulator, the SNAP client and the other plain modules of ADRs 0013 and 0015. The server reached into the page's folder for `web/snap.js`, the Dockerfile picked eight files and three folders out of `web/` by name, and the emulator's developer tools went into the production image with the game loader. Nothing in the tree said which files the server depends on.

The tree now follows a standard Vite and Svelte project, with one rule: **`shared/` holds what the server, the bots or the tools import at runtime; everything only the page runs is in `web/src`, even when a Node test imports it.**

- `web/` is Vite's root. The HTML entries stay where their URLs are (`index.html`, `terms/`, `privacy/`, `replay/`), with `public/` beside them.
- `web/src/` holds the entry scripts (`main.js`, `doc.js`, `replay.js`), `App.svelte`, `styles/`, and `assets/fonts/`.
- `web/src/lib/` holds the rest, grouped by feature: `game/`, `input/`, `account/`, `guide/`, `replay/`, `legal/`, with `components/` for the dialog primitives. A few modules that several features use sit in `lib/` itself, such as `page.svelte.js`.
- `shared/` holds `emu/`, `snap.js`, `snap-ids.js`, `zip.js`, `pak.js`, `bundle.js`, `heroes.js`, `replay-text.js`, and `game.mjs` (the game loader the server uses, formerly `web/tools/game.mjs`). Its `package.json` makes them ES modules for Node.
- The emulator's developer tools moved from `web/tools/` to `tools/emu/`, next to the repository's other tools.
- Components are PascalCase, modules that use runes end in `.svelte.js`, and every other module is kebab-case (`game-files.js`, `replay-flow.js`). Tests sit next to what they test as `*.test.js`, and stay importable by plain Node, so the page uses relative imports and no path aliases.
- `svelte.config.mjs` at the repository root holds the Svelte options (runes mode), and `vite.config.mjs` points the plugin at it because Vite's root is `web/`.

## Considered options

- **SvelteKit, with `adapter-static`.** Rejected for ADR 0013's reasons: routing, server rendering and an adapter add nothing to one static page that the gateway already serves, and `/replay/<id>` would need a fallback page and new gateway rules.
- **SvelteKit's folder names without SvelteKit** (`src/routes/`). Rejected: they look like Kit and would mislead anyone who knows it.
- **Keep the shared modules under the page, as `web/src/lib/engine/`.** Rejected: the server would import from the page's source tree, and "engine" names the game's own program (CONTEXT.md "Engine"), not the emulator that runs it.
- **The app at the repository root** (`index.html`, `src/` and `public/` beside `server/`). Rejected: the root already holds the server, the Docker files and the tools, and `web/dist` is a path that the gateway, the Dockerfile and the hosting docs share.
- **Group `web/src/lib` by type** (`components/`, `state/`, and modules side by side). Rejected: a flat folder of about 40 modules was the problem, and each feature already had a clear boundary.

## Consequences

- The server's code imports only from `shared/`; its tests may also import page modules that run under plain Node (`server/seed.test.js` reads `web/src/lib/input/keys.js`). `server/dockerfile.test.js` follows the imports of the server's non-test files and fails when one leaves `server/` for a file the image doesn't copy, which includes any page code in `web/`.
- The Dockerfile copies `shared/` whole into both stages. The final image no longer carries the emulator's developer tools.
- The page imports `shared/` from outside Vite's root, so `vite.config.mjs` allows both folders in the dev server. The e2e setup rebuilds the page when anything in `web/` or `shared/` is newer than the last build.
- `tools/legal-allow.json` lists the fonts at their new paths and keeps the old paths, because `--history` checks every older commit against the same list.
- Existing ADRs keep the paths they were written with. ADRs 0013 and 0015 point here.
