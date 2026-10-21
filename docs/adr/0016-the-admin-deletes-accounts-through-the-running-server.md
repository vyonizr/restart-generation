# The admin deletes accounts through the running server

An admin needs to delete an account that isn't theirs, for a privacy request or to clear test accounts (CONTEXT.md "Admin"). `npm run delete-user -- --name Alice` (or `--discord <id>`) sends the request to the running gateway at `/admin/account`, which ends the player's sessions and removes the account by the same path as a player's own **Delete my account** (`POST /auth/delete`, ADR 0011). The endpoint exists only when `RG_ADMIN_TOKEN` is set; the CLI sends it as a bearer token. The CLI shows what will go (kind, fame, matches, friends, saved game files, online or not) and asks `y/N`; `--yes` skips the question.

The reason it goes through the server: the gateway is one process that caches each account as one object and compares accounts by identity (ADR 0010), and a session holds that object. A second process deleting the row would leave the server serving a deleted account.

## Considered options

- **The CLI opens `data/accounts.db` itself.** Rejected. The running server would keep the account cached and could keep its session, so it would be safe only with the server stopped, which means downtime on a public server for every request.
- **Leave `/admin/` open to the internet behind the token.** Rejected. Caddy answers 404 for `/admin/*` (`Caddyfile`), so a leaked token alone can't delete accounts from outside; the CLI runs inside the container (`docker compose exec rg ...`) or on the host.
- **Accept a `--url` for a remote server.** Not needed with the Caddy block, since no remote address could reach the endpoint.
- **A loopback-only check instead of a token.** Rejected: behind a reverse proxy every request arrives from the proxy, so the check would say little.
- **Ban as well as delete.** Not part of this. Deleting a member doesn't stop the same Discord ID from signing in again and getting a new account. A ban list would be its own feature.
- **A persistent audit table.** Rejected. The server logs `admin deleted <name>`, without the Discord ID, which is personal data. The deleted row can't be undone either way.

## Consequences

- The delete works on every kind of server: guests, members and name-only `named` accounts. `--discord` is refused on a server without Discord sign-in, which has no Discord IDs.
- An admin delete during a ranked match ends the player's session like a disconnect, so the others win (ADR 0005). The CLI says when the player is online.
- Without `RG_ADMIN_TOKEN` every `/admin/` path answers 404 as if it didn't exist; a 404 with `no_account` is how the CLI tells "no such account" apart.
- Where the server's port is reachable (`compose.lan.yaml` with `BIND=0.0.0.0`, or `npm start --lan`), the token is the only protection and a wrong guess isn't rate-limited, so the token must be long and random.
- The Caddy block is the second layer of protection. It was run against a live Caddy 2 in Docker Desktop (`compose.yaml` at `RG_DOMAIN=localhost`): `/admin/account` answered an empty 404 through Caddy, where the server itself answers 401 to a wrong token. Repeat that check on a real deployment (`docs/DEPLOY.md`, step 6) before relying on it.
