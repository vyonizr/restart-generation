## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Engine debugging

A feature that reads or writes the engine's memory names the check that failed in one `console.warn` when it switches itself off, and is tested in an offline battle and in an online battle, from the room host's page and another player's in the room. `window.rgDebug`, the `tools/emu/` scripts and how to script a two-engine online battle are in `docs/agents/engine-debugging.md`.

## Legal risk

This project revives a game that belongs to RedLynx (Ubisoft) and an online service that belonged to Nokia, and it is published on GitHub. Before every commit, read `docs/LEGAL.md` and follow its seven rules; run `npm run legal-check` (`npm test` runs it too). Never add anything from the game: its files, art, sound, text or data, screenshots or recordings of it, decompiled or disassembled output, or code translated from the original. Write down what the original does in your own words in `docs/re/` first, then implement from that note. A new image, video, audio file or font needs an entry in `tools/legal-allow.json` with where it comes from. If a task would need game material, stop and ask. A change to these rules is an ADR.

## Seed accounts

`npm run dev` loads the made-up seed accounts of `server/seed.json` (ADR 0023). When a change adds a column, a table, an account kind, a friend state, or anything else players see on an account, a friend list, a ranking, a saved game, or a replay, add a seed row in `server/seed.json` that shows it, and extend `server/seed.js` when the file can't express it yet. `npm test` runs `server/seed.test.js`, which goes red when the seed no longer loads twice to the same result or breaks the server's stat rules.

## Commit messages

Write every commit subject as a Conventional Commit (`fix: …`, `feat(scope): …`, `feat!: …`): releases are numbered from them, and the `commit-msg` hook refuses anything else. `CONTRIBUTING.md` ("Write commit messages") lists the types and says when a change is breaking.
