# SQLite for accounts, starting empty

Accounts move from `data/accounts.json` to a SQLite database, `data/accounts.db`, opened through the built-in `node:sqlite` (Node 22.13 or later, no flag). The JSON file was rewritten whole and synchronously on every save, and it keyed friend links by name inside each account. The guest wipe (ADR 0011) needs deletes that clean up links, ids that are never reused (the old `count + 1` would hand a living account's id to a new one after a wipe), and indexed lookups by name and Discord ID. SQLite gives all of that with no new dependency and no second service.

The database starts empty. `data/accounts.json` is not imported and is never read again; players on an existing server register again at their next login. A development server is the exception: it loads seed accounts into its own files (ADR 0023).

## Considered options

- **Keep the JSON file.** Rejected because the wipe needs cascading deletes and safe ids, and every save would grow with the number of accounts while the same process relays live battles.
- **Postgres.** Rejected because the gateway is one process that keeps live sessions in memory, so it can't run as several instances anyway. Postgres would add a service and a driver dependency for no gain. Revisit only if that changes.
- **`better-sqlite3`.** Rejected because it is a native dependency, and the project ships with none.
- **Import the old accounts.** Rejected: the 26 accounts on the author's machine are test data, and a public server starts from nothing.

## Consequences

- `node:sqlite` is still marked experimental (Node 22 docs, stability 1.1). Keep every SQL statement in one module so replacing it is cheap, and require Node 22.13 or later.
- WAL mode can misbehave on network file systems. Compose bind-mounts `./data`; test that on the target host, or use a named volume.
- Back up with `VACUUM INTO 'backup.db'`, which is safe while the server runs. Copying the file mid-write is not.
- Battle templates stay in `data/templates/` as files (ADR 0006).
- A server in name-only mode (`--lan`, or no Discord settings) uses `data/accounts-names.db`, and a Discord server uses `data/accounts.db`, so a name-only login can never reach a member's account and the guest wipe never touches name-only players.
- LAN servers use the same database. Their players also register again.
