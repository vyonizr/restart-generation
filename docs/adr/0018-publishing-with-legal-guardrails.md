# Publishing the project with legal guardrails

The project is published on GitHub and run as a public server (ADRs 0001, 0002). The game and its online service are out of print and shut down, which is the reason for the project and no defence for it: in the US the DMCA exemption for abandoned online games covers local play and not online multiplayer, and in October 2024 the Copyright Office refused to let archives share such games remotely. So the project follows what EKA2L1 does, the Symbian and N-Gage emulator: it ships no game files, says it isn't affiliated with the owners, and is free software that reimplements what it needs. On top of that it adds guards that work without anyone remembering them.

- **Licence.** Our code is GPL-3.0-or-later (`LICENSE`), as EKA2L1's is. The fonts and the Svelte runtime keep theirs (`THIRD_PARTY_NOTICES.md`), and the built page serves both as `/licenses.txt`.
- **History.** Only the `development` branch is published, through `tools/export-public.mjs`, which rewrites every author to a GitHub no-reply address and runs the check over every commit. The other branches stay local; some of them hold reference screenshots of third-party websites.
- **Rules and a check.** `docs/LEGAL.md` holds the rules for every commit. `tools/legal-check.mjs` enforces the file-level ones in `npm test`, in a pre-commit hook (`npm run hooks`) and in GitHub Actions. `AGENTS.md` points every agent session at the rules.
- **Protocol code.** `web/snap.js` no longer says it is a port of the Java client or names its classes, its internals use our own vocabulary, and the browser sends a plain base64 password with no `K`, so it carries none of the SDK's password keys. `server/snap.js` accepts that, and keeps the keys for an unmodified Java client.
- **Serving the game.** ADR 0001 lets an admin send their copy. A `--public` server that does must set `RG_CONTACT`, where a rights holder can ask for its removal, or it won't start; the Notices dialog shows it. No ads, donations or payments on such a server.
- **Names.** The page stays "Restart Generation" with a footer line, and a Notices dialog, that say it isn't affiliated with RedLynx, Ubisoft or Nokia. Documentation uses `example.com`, not a domain with the game's name.
- **Privacy.** The README and the Notices dialog of a server with accounts say what is kept: a Discord ID and a name, no email.

## Considered options

- **Publish every branch and commit as they are.** Rejected: some branches hold reference screenshots of third-party websites, and every commit carries a personal email address.
- **One squashed commit.** Rejected: it would remove nothing the filtered history doesn't, and it would lose the history that the ADRs and the community can use.
- **Keep the reverse-engineering notes private.** Rejected for now: `docs/re/` is the evidence that this is interoperability work and what a contributor needs to maintain the server. It is the first thing to remove if asked (`docs/LEGAL.md`).
- **MIT or AGPL.** Rejected: MIT would let a closed commercial fork profit from a fan revival; AGPL asks more of hosts than GPL for little gain here.
- **Send the game only to signed-in members.** Rejected: it breaks the first-visit flow of ADR 0011 and changes nothing about distribution.
- **Drop the SDK keys from the server too.** Not possible while an unmodified Java client has to log in (ADR 0002).

## Consequences

- Publishing can't be undone: what is pushed may be copied. That is why the check runs before it and not after.
- Older commits of `web/snap.js` still carry the keys and the earlier comments. The check allows that file's hex strings for this reason only (`tools/legal-allow.json`).
- The check can't see a screenshot or a recording of the game. Rule 2 of `docs/LEGAL.md` depends on people.
- A server that sends the game is still distributing it. The contact and the switch-off make a takedown easy to honour; they don't make the distribution lawful.
- This is not legal advice. If a notice arrives, follow `docs/LEGAL.md` and get a lawyer before replying.
