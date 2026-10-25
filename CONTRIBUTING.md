# Contributing

Thank you for helping a game and its community come back. Two things come before anything else.

**Nothing from the game goes in this repository.** No game files, art, sound, text, or data, no screenshots or recordings of it, no decompiled or disassembled code, and no code translated from the original. Read [Keep the legal risk of this project low](docs/LEGAL.md): it's short, and it says what to do instead (write down what the original does in your own words, and then implement from that).

**Run the check before you commit.** Run the following commands once per clone:

```sh
npm install
npm run hooks
```

After that, git refuses a commit that adds what the rules forbid, or whose message doesn't follow the [commit message format](#write-commit-messages), and a push to the public repository that `tools/publish.mjs` didn't make ([Publishing](docs/LEGAL.md#publishing)). `npm test` runs the same legal check, and so does GitHub on every pull request.

## How to work here

- Read [`CONTEXT.md`](CONTEXT.md) for the words we use, and the architecture decision records (ADRs) in [`docs/adr/`](docs/adr/) for the decisions behind the code. A decision that is hard to reverse, surprising, and a real trade-off gets an ADR.
- Write the page's text, the docs, and code comments in US English (color, license, canceled). Names that the game, its protocol, or the database fix keep their spelling, such as `favouriteHero`.
- `npm test` runs the server's tests. `npm run test:gameblob` needs a folder of raw captures (`RG_CAPTURES` in `.env`).
- `npm run e2e` runs the end-to-end tests in a browser ([ADR 0025](docs/adr/0025-end-to-end-tests-run-in-playwright-with-the-engine-only-where-the-game-is.md)): the tests in `e2e/page/` against the page with no game, which GitHub also runs, and, when `RG_GAME` is set in `.env`, the tests in `e2e/engine/` against the page running the game. The picking test picks `RG_PICK` (a `.zip` or a folder), else `RG_GAME`. It uses Edge on Windows; elsewhere, run `npx playwright install chromium` once. The first engine run plays the seed's played battles into `data/e2e/`, which takes a few minutes. A failed test leaves its trace in `tmp/e2e/`: one from `tmp/e2e/engine/` shows the game, so keep it on your machine (docs/LEGAL.md rule 2).
- `npm run dev` starts a development server with the seed accounts of `server/seed.json`. When your change adds something that players can see on an account, a friend list, a ranking, a saved game, or a replay, add a seed row that shows it ([ADR 0023](docs/adr/0023-development-servers-load-seed-accounts.md)).
- The server and the emulator have no dependencies and run as plain Node modules; the page is built with Vite and Svelte ([ADR 0013](docs/adr/0013-the-page-is-built-with-vite-and-svelte.md)). The page's source is in `web/src`, grouped by feature under `web/src/lib`; what the server, the bots or the tools import at runtime is in `shared/`, and the server's code (tests aside) never imports from `web/` ([ADR 0035](docs/adr/0035-the-page-lives-in-web-src-and-code-node-shares-lives-in-shared.md)).

## Write commit messages

Every push to the public `main` is a release, numbered from the commit messages ([ADR 0019](docs/adr/0019-releases-are-tagged-in-ci-on-the-public-main.md)), so each subject follows [Conventional Commits](https://www.conventionalcommits.org/): a type, an optional scope in parentheses, a colon, and a plain sentence. For example:

```text
fix: show the game download as a percentage of its bytes
feat(bots): let a player alone in a friendly room start with bots
```

The type is one of `feat`, `fix`, `perf`, `refactor`, `docs`, `test`, `build`, `ci`, `chore`, `revert`, or `style`. The release notes group the commits by type.

A breaking change (see the entry in [`CONTEXT.md`](CONTEXT.md)) is one that makes the admin act during the update, or that makes going back to the previous release unsafe. Mark it with `!` after the type, such as `feat!:`, and say in a `BREAKING CHANGE:` footer what the admin must do. That footer goes into the release notes. Gameplay and page changes are never breaking.

Below version 1.0, a `feat` or a breaking change raises the minor number (0.1.5 to 0.2.0), and everything else raises the patch number ([ADR 0032](docs/adr/0032-before-1-0-a-feature-raises-the-minor-version.md)). From 1.0, `feat` raises the minor number and a breaking change the major number.

Merge commits and git's own `Revert "…"` subjects are exempt. `tools/publish.mjs` refuses to publish a commit that the hook would have refused.

## What you confirm by contributing

By contributing, you confirm the following:

- You wrote what you send, or you have the right to send it under the GNU General Public License, version 3 or later.
- It contains nothing from the game.
- Anything from another project is listed in [Third-party notices](THIRD_PARTY_NOTICES.md) with a compatible license.

## Request removal of material

If you represent RedLynx, Ubisoft, or Nokia and want something removed, [open an issue](https://github.com/vyonizr/restart-generation/issues) (the same address is in the [README's Legal section](README.md#legal)), or use GitHub's own takedown process. A server run by someone else names its admin and contact on its Terms and Privacy policy pages, and in its Notices dialog if it sends the game. We respond promptly.
