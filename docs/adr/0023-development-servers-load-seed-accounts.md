# Development servers load seed accounts

A server started with `npm run dev` or `npm run dev:lan` started with an empty database (ADR 0010), so rankings, friends, rooms, and replays could only be checked after someone played enough to fill them. The dev scripts now run `npm run seed` (`server/seed.js`) first. It upserts the **seed accounts** (CONTEXT.md), with their friends, tokens, saved games, and replays, from one hand-written file, `server/seed.json`. The dev scripts start the gateway with `--dev`, which keeps the account and replay files in `data/dev/`, apart from the ones `npm start` uses. `--dev` together with `--public` is refused. Every row is made up and only has the shape of a public server's data, because `docs/LEGAL.md` rule 7 forbids committing account data and a public server's names and Discord IDs are personal data.

The seed owns the names in its file. Members carry a `Dev_` prefix, and guests are named `Guest9000NN`, as real guests are named `Guest` and six digits. Each run overwrites those rows with the file's values, leaves every other row alone, and deletes nothing. The file holds one row per account with its Discord-mode kind. In name-only mode, members become `named` and lose their Discord ID, tokens, and saved games, and guests are left out. Times are stored as offsets from the run, so guests and replays don't age out of their 24-hour and 30-day limits. Each run links the replays again to the current account ids, because a wiped guest comes back with a new id. The file gives wins and matches. The seed derives fame as 10 × wins and highest fame as fame, as ranked play makes them.

## Considered options

- **Seed in `gateway.js` on every start.** Rejected. `npm start` is how players play, and a public server would ship the seed code.
- **Seed the `data/` files that `npm start` uses.** Rejected. Made-up accounts would mix with the developer's own accounts and saved game.
- **Point the dev scripts at the files with `RG_DB` and `RG_REPLAYS_DB`.** Rejected. An npm script can't set environment variables in a way that works in every shell. One file would also serve both modes, which ADR 0010 keeps apart.
- **Copy or sample a public server's database.** Rejected under LEGAL.md rule 7 and the server's Privacy policy.
- **Generate the rows with a seeded random generator.** Rejected. A hand-written file shows each change in review, which keeping the seed up to date depends on.
- **A "sign in as" control on the page.** Rejected. It would ship to public servers. Instead, each guest and member has a token derived from its name, which the database stores by its sha256 as it does any token, and `npm run seed` prints a `localStorage['rg:account']` line for each of them to paste into a private window.
- **Real replays only.** Rejected as the default. Replay text contains a battle's Game blob, so it can't be committed. The seed's `replays` carry made-up players and results with placeholder text. Their page shows both, but the engine's player never loads them; it was checked in the emulator. `npm run seed -- --play` plays the seed's `played` battles that have no replay yet: Bots log in as the seed accounts on a throwaway name-only gateway, and the seed keeps the replay that gateway made. Later runs keep that text.

## Consequences

- A public server still starts empty. This ADR changes ADR 0010 only for development servers.
- The seed tokens are public. They open only the files of a development server, or a file named explicitly with `npm run seed -- --db`.
- Seed members use Discord IDs `1` to `30`. [INFERENCE] No real Discord account has such a small ID, because Discord IDs are timestamp-based and 17 to 20 digits long.
- A seed member's saved game holds a `settings.cfg` built from [re_settings.md](../re/re_settings.md), with the engine's default header and the member's custom keys. There's no note on the layout of the other files, so the seed writes none of them. One member adds three files the engine doesn't use, to fill most of the 1 MiB limit. The engine opens its files by name, so it ignores them; this was checked in the emulator.
- `npm run seed` while a development server runs leaves that server's cached accounts stale. The dev scripts seed before they start the server.
- Every change that adds a column, table, account kind, friend state, or other state that players can see adds at least one seed row that uses it. `AGENTS.md` and `CONTRIBUTING.md` state the rule. `server/seed.test.js` checks that loading the seed twice gives the same result and that the stat rules hold.
