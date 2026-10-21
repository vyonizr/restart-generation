# Contributing

Thank you for helping a game and its community come back. Two things come before anything else.

**Nothing from the game goes in this repository.** No game files, art, sound, text or data, no screenshots or recordings of it, no decompiled or disassembled code, no code translated from the original. Read [docs/LEGAL.md](docs/LEGAL.md): it is short, and it says what to do instead (write down what the original does in your own words, then implement from that).

**Run the check before you commit.** Once per clone:

```sh
npm install
npm run hooks
```

After that git refuses a commit that adds what the rules forbid. `npm test` runs the same check, and so does GitHub on every pull request.

## How to work here

- Read `CONTEXT.md` for the words we use and `docs/adr/` for the decisions behind the code. A decision that is hard to reverse, surprising and a real trade-off gets an ADR.
- `npm test` runs the server's tests. `npm run test:gameblob` and `npm run browser-test` need your own copy of the game (`RG_GAME` in `.env`).
- The server and the emulator have no dependencies and run as plain Node modules; the page is built with Vite and Svelte (ADR 0013).

## What you confirm by contributing

That you wrote what you send, or have the right to send it under the GNU General Public License, version 3 or later; that it contains nothing from the game; and that anything from another project is listed in `THIRD_PARTY_NOTICES.md` with a compatible licence.

## A rights holder, or a notice

If you represent RedLynx, Ubisoft or Nokia and want something removed, open an issue at https://github.com/vyonizr/restart-generation/issues (also in the README's Legal section), or use GitHub's own takedown process; a server run by someone else shows its own contact in its footer. We respond promptly.
