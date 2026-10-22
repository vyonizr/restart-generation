# Contributing

Thank you for helping a game and its community come back. Two things come before anything else.

**Nothing from the game goes in this repository.** No game files, art, sound, text, or data, no screenshots or recordings of it, no decompiled or disassembled code, and no code translated from the original. Read [Keep the legal risk of this project low](docs/LEGAL.md): it's short, and it says what to do instead (write down what the original does in your own words, and then implement from that).

**Run the check before you commit.** Run the following commands once per clone:

```sh
npm install
npm run hooks
```

After that, git refuses a commit that adds what the rules forbid. `npm test` runs the same check, and so does GitHub on every pull request.

## How to work here

- Read [`CONTEXT.md`](CONTEXT.md) for the words we use, and the architecture decision records (ADRs) in [`docs/adr/`](docs/adr/) for the decisions behind the code. A decision that is hard to reverse, surprising, and a real trade-off gets an ADR.
- `npm test` runs the server's tests. `npm run browser-test` needs your own copy of the game (`RG_GAME` in `.env`). `npm run test:gameblob` needs a folder of raw captures (`RG_CAPTURES` in `.env`).
- The server and the emulator have no dependencies and run as plain Node modules; the page is built with Vite and Svelte ([ADR 0013](docs/adr/0013-the-page-is-built-with-vite-and-svelte.md)).

## What you confirm by contributing

By contributing, you confirm the following:

- You wrote what you send, or you have the right to send it under the GNU General Public License, version 3 or later.
- It contains nothing from the game.
- Anything from another project is listed in [Third-party notices](THIRD_PARTY_NOTICES.md) with a compatible license.

## Request removal of material

If you represent RedLynx, Ubisoft, or Nokia and want something removed, [open an issue](https://github.com/vyonizr/restart-generation/issues) (the same address is in the [README's Legal section](README.md#legal)), or use GitHub's own takedown process. A server run by someone else shows its own contact in its Notices dialog. We respond promptly.
