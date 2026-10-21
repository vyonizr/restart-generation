## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/`. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels: `needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: one `CONTEXT.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Legal risk

This project revives a game that belongs to RedLynx (Ubisoft) and an online service that belonged to Nokia, and it is published on GitHub. Before every commit, read `docs/LEGAL.md` and follow its seven rules; run `npm run legal-check` (`npm test` runs it too). Never add anything from the game: its files, art, sound, text or data, screenshots or recordings of it, decompiled or disassembled output, or code translated from the original. Write down what the original does in your own words in `docs/re/` first, then implement from that note. A new image, video, audio file or font needs an entry in `tools/legal-allow.json` with where it comes from. If a task would need game material, stop and ask. A change to these rules is an ADR.
