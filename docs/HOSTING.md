# Run a server

This guide is for the admin: the person who runs a Restart Generation server for other players. To play on your own PC, [Start playing](../README.md#start-playing) in the README is enough.

The server replaces Nokia's N-Gage Arena, which used the SNAP Mobile protocol, for the standalone build of Reset Generation (RedLynx, 2008). It restores login, stats, rankings, achievements, friends, ranked Quick Match (2-4 players), friendly rooms, and server-hosted battles. The browser client runs the original engine, the 32-bit Windows program `ResetGeneration-Win32-Web.dll`, unchanged in a JavaScript x86 emulator.

For more information about how it works, see [the protocol](protocol.md), the [architecture decision records (ADRs)](adr/), the [reverse-engineering notes](re/) (including how to regenerate the analysis), [the emulator](../shared/emu), and [the page](../web/src) (Svelte components built by Vite, [ADR 0013](adr/0013-the-page-is-built-with-vite-and-svelte.md)).

## Run the server with Node.js

The server needs Node.js 22.13 or later, for the built-in `node:sqlite`. The server and the emulator have no npm dependencies, on purpose, so they run with nothing installed. Only building the page needs `npm install` (Vite and Svelte, ADR 0013). The built page is `web/dist`, which the server serves and a static host can take as it is.

To set up the server, do the following:

1. Run `npm install`.
2. Copy `.env.example` to `.env` in the repository root.
3. In `.env`, set `RG_GAME` to the path of your game copy, the server copy.

`RG_GAME` is the server copy of the game: either `ResetGeneration-Standalone.zip` or the extracted `ResetGeneration` folder (the one with `ResetGeneration-Win32-Web.dll` and the `.pak` files). The server runs it for its witness and, unless it's `--public`, for bots. A server that isn't `--public` also sends it to every visitor, so that nobody chooses their own files; a `--public` server sends it only to visitors who come with its download code (see [Send the game with a download code](#send-the-game-with-a-download-code)). Send only a copy you own. The dev tools in `tools/emu` read the game from `RG_GAME` too.

The server sends the game as one download, the game bundle, a few seconds after it starts: the files the engine runs from, compressed with gzip, about 28 MiB. The page keeps them in the browser's IndexedDB, so a browser downloads them once.

Use the following npm scripts:

- `npm start`, or `npm run start:lan` for `--lan`: starts the server. If `web/dist` is missing, it builds the page first, and if Vite isn't installed, it tells you to run `npm install`.
- `npm run build`: rebuilds the page after you change anything in `web/` or `shared/`.
- `npm run dev:web`: serves the page while a gateway runs. A style change swaps in place, and a script or component change reloads the page. It forwards `/snap`, `/status`, `/auth`, `/bots`, `/replays`, `/replay/ID/data`, and `/game` to port 8080 (or `HTTP_PORT`).
- `npm run dev`, or `npm run dev:lan` for `--lan`: runs `npm run seed`, then starts a development server that restarts on file changes. It keeps its accounts and replays in `data/dev/`, apart from the files `npm start` uses ([ADR 0023](adr/0023-development-servers-load-seed-accounts.md)).
- `npm run seed`: upserts the seed accounts from `server/seed.json` into `data/dev/`, with their friends, tokens, saved games, and replays, and six weeks of made-up visitor statistics for `npm run stats -- --dev`. Stop the development server first, because it doesn't read accounts that change under it. Add `-- --lan` for the name-only files. Add `-- --play` to also play the seed's `played` battles between bots, for replays the engine can play. That needs `RG_GAME` and battle templates, and takes a few minutes for each battle. The other seed replays show their players and result, and about 10 seconds after **Watch** the page says they can't be played.

  To play as a seed account on a server with Discord sign-in, open the page in a private window, paste the account's `localStorage` line that `npm run seed` prints into the browser console, and reload the page. A private window keeps your own account and saved game untouched. On a name-only server, choose **Set name** (or **Change name**) under **Start**, type the seed account's name, such as `Dev_Ada`, and choose **Save**.
- `npm test`: runs the self-checks that need no local data and no built page.
- `npm run backup`: copies the accounts database into `data/backups/` while the server runs, and keeps the newest 7 backups. To keep a different number, run `npm run backup -- --keep NUMBER`. In Docker, run `docker compose exec rg npm run backup`.
- `npm run stats`: shows the visitor statistics of a public server that counts them. See [Visitor statistics](#visitor-statistics).

To start the server without npm after you build the page, run the following command:

```sh
node --env-file-if-exists=.env server/gateway.js
```

The gateway listens on TCP port 8976 for the Java client and serves the page on port 8080. Both accept connections from this PC only, unless you add `--lan` (see [Play on other devices](../README.md#play-on-other-devices)) or `--public`. To change the Java client port (8976), set `PORT`. To change the page port (8080), set `HTTP_PORT`.

Accounts are created on first login and stored in a SQLite database ([ADR 0010](adr/0010-sqlite-for-accounts-starting-empty.md)): `data/accounts-names.db` on a name-only server (`--lan`, or no Discord settings) and `data/accounts.db` on a Discord server, so switching modes never mixes the two kinds of account. A `data/accounts.json` file from an older version isn't read, and its players register again.

To back up the database while the server runs, run `npm run backup`; copying the file during a write isn't safe. For more information, see [Back up the accounts](DEPLOY.md#7-back-up-the-accounts).

Every story and hero is open from the start on any server that isn't `--public` ([ADR 0007](adr/0007-patch-the-engine-in-memory.md)); on a public server, players earn them.

To serve people over the internet, use `--public`: it listens on all addresses like `--lan` and turns on Discord sign-in when it is configured (see [Guests and members](#guests-and-members)). Friends need to reach your PC on ports 8080 (the page) and 8976 (the Java client). `--lan` always uses name-only login, with no Discord sign-in.

### Relaxed friendly matches

To give new players more time, set `RG_RELAXED_FRIENDLY=1` or add `--relaxed` (`npm run start:relaxed`, or `npm run start:lan:relaxed` with `--lan`). Friendly matches then show no countdown in any phase, and if someone stops playing, the server ends a phase only after 3 minutes (1 minute for cannon shots). Ranked matches keep the 20-second limit.

### Battle results

With `RG_GAME` set, the server runs a witness: one more engine, in a worker thread, that follows every battle's orders as the players' engines do ([ADR 0020](adr/0020-the-server-follows-every-battle-with-a-witness.md)). The engine then decides who won a ranked match: every player it ranks first gets the win and +10 fame, and every player gets a match. The witness also tells the server the moment a player is defeated, so the server stops waiting for that player. It runs on a `--public` server too, takes about 270 MB of memory once booted, plus about 4 MB for every battle it follows, and restarts itself after 50 battles.

Without `RG_GAME`, or when the witness fails, the server guesses the result: the last player standing, or else the one who made the last move. At startup a server without `RG_GAME` logs that battle results will be guessed, and each battle whose result is guessed logs one `battle over: result guessed (...)` line with the reason: `no server copy`, or `witness failed:` and the cause. Players are never told.

### Replays

Every online battle that began, ranked or friendly, becomes a replay ([CONTEXT.md](../CONTEXT.md) "Replay"): after the battle, each player in the browser client is offered **Watch replay** and **Copy link**, and the replay page at `/replay/ID` plays the battle again in the game's own replay player ([ADR 0022](adr/0022-replays-send-a-battles-game-blob-to-anyone-with-the-link.md)). Anyone with the link can watch it. Each replay is also listed under the name of every player in it, for anyone to see: players open their list with **Replays**, in the Account menu or beside **Sign in with Discord** on a Discord server, and on the "Online as" line on a name-only one (in the who chip's menu on a phone or tablet) ([ADR 0024](adr/0024-a-players-replays-are-listed-under-their-name.md)). Watching needs the game, like playing: the visitor's own copy, or the server copy, which a server that isn't `--public` sends to every visitor and a `--public` one only for its download code (a replay link takes `?code=` too). The server needs no server copy to keep them.

Replays are kept apart from the accounts, beside the accounts they name: in `data/replays.db` on a Discord server and in `data/replays-names.db` on a name-only one. Each player keeps the replays of their last 25 battles, and a replay is deleted once it is in the last 25 of none of its players ([ADR 0034](adr/0034-each-player-keeps-their-last-25-replays.md)), so the file holds at most 25 replays per account, each a few kilobytes. A new battle takes a player's oldest off their list at once; every hour the server also takes the replays off the lists of accounts that are gone, such as wiped guests. When a member deletes their account, or you delete one with `delete-user`, the replays of its battles go with it. `npm run backup` doesn't back them up.

To keep no replays, set `RG_REPLAYS=0`: the server then keeps no new ones and serves none of those it kept, and the Privacy policy leaves them out. To delete every replay at once, stop the server and delete the replay file with its `-wal` and `-shm` files.

From a replay's page, anyone who can watch it can also save it as footage ([CONTEXT.md](../CONTEXT.md) "Footage"), an MP4 file their own browser makes, with the game's sound effects but not its soundtrack ([ADR 0041](adr/0041-footage-and-showcase-clips-leave-out-the-soundtrack.md)); the server does nothing more for it. Browsers make footage only on a secure page, so a `--lan` server over plain HTTP offers it only at `localhost` on its own PC; a public server over HTTPS offers it to everyone. `RG_REPLAYS=0` stops new footage too, but nothing can recall a file someone already saved ([ADR 0028](adr/0028-players-can-export-a-replay-as-footage.md)).

To check that replays play back the battles as they were played, run self-play with `--replays` (`npm run selfplay -- --battles 2 --replays`, needs `RG_GAME`): each battle's replay is played to its end in the engine, which must end on the bots' final turn with their ranks.

### Visitor statistics

A `--public` server can count its visitors, for you alone to see: how many open its pages each day, from which referring site and country, and on which kind of device ([CONTEXT.md](../CONTEXT.md) "Visitor statistics", [ADR 0043](adr/0043-visitor-statistics-are-counted-by-the-gateway-itself.md)). It's off by default. To turn it on, set `RG_STATS=1` and restart the server, which logs `Visitor statistics are on`. The Privacy policy then describes them, credits DB-IP, and offers each visitor a **Don't count my visits** button. A server that isn't `--public` has no Privacy policy to say so: it ignores `RG_STATS=1`, logs that the statistics stay off, and never counts.

Each of the four pages (the game, a replay, the Terms, and the Privacy policy) reports its own visit once it has loaded. For each UTC day, the server counts:

- page opens, in all and in each hour;
- unique visitors: each visitor once, however many pages they open that day;
- page opens by kind of page, by referring site (its domain only, such as `reddit.com`), by country, and by kind of device (desktop or touch). Each of these tallies is kept on its own, so no row combines two of them.

The server tells visitors apart by a hash of their IP address and their browser's name with a salt that lives only in memory and changes at every UTC midnight. It uses the address for that and for the country, and never writes it down or logs it. The page sets no cookies. One visitor adds at most 50 page opens a day. A browser that sends Global Privacy Control, or whose player chose **Don't count my visits**, isn't counted, and neither is a browser that runs no script, nor most link previews and crawlers, so the counts are a floor.

The counts are kept in `data/stats.db` (`RG_STATS_DB` names another file). At start and every hour, the server deletes the days older than 25 months. `npm run backup` doesn't back them up. To delete them all, stop the server and delete the file with its `-wal` and `-shm` files.

To see the last 30 days, run `npm run stats`. With Docker, run it inside the container:

```sh
docker compose exec rg npm run stats
```

It reads the file while the server runs. Add these options after `--`, such as `npm run stats -- --days 7 --tz +7`:

- `--days N`: the last `N` days, ending today (30 by default).
- `--from YYYY-MM-DD` and `--to YYYY-MM-DD`: the days from one date to another, both included.
- `--tz ±H`: shifts the hourly chart by `H` hours, to your clock. The days stay UTC.
- `--dev`: the development server's file, `data/dev/stats.db`, where `npm run seed` puts six weeks of made-up days.
- `--db FILE`: another file.

The report looks like this, shortened:

```text
Visitor statistics from data/stats.db, 2026-09-29 to 2026-10-28 (UTC days)

Day               Page opens  Unique visitors
2026-10-07 Wed            62               27  ██████
2026-10-08 Thu           396              248  ████████████████████████████████████████
2026-10-09 Fri           224              140  ███████████████████████
2026-10-19 Mon *          82               39  ████████
* The server started that day: a visitor it had already counted that day may have counted again.

Page opens: 2,979
Unique visitors, summed over the days: 1,432 (a visitor on two days counts twice)

Referring sites         Page opens   Share
  reddit.com                   747   25.1%
  discord.com                  227    7.6%
  google.com                   163    5.5%
  other                         96    3.2%
  none                       1,302   43.7%
```

The full report lists every day of the range, the kinds of page and of device, the ten largest referring sites and countries, and the page opens of each hour.

The day's salt and its set of visitors live only in memory, so after a restart a visitor already counted that day counts again. The report marks the days the server started with `*`. A move between the site's own pages, and the return from Discord sign-in, count with no referring site.

The country comes from DB-IP's free IP to Country Lite database ([db-ip.com](https://db-ip.com), CC BY 4.0). The server downloads it from `download.db-ip.com` into `data/` as `dbip-country-lite-YYYY-MM.csv.gz`, about 4.5 MB, when it starts, and checks every day for the new month's file, which DB-IP publishes during the month. Until then it keeps last month's, and it deletes older files once a newer one loads. A failed download logs one line and keeps the file the server has; with none, every country is unknown. The database takes about 10 MB of memory and a quarter of a second to load. As its licence asks, the Privacy policy credits it: "IP geolocation by DB-IP", linked to `https://db-ip.com`.

### Bots

If `RG_GAME` is set, the server can fill friendly matches with bots, players that the server controls. A `--public` server never runs bots, whatever `RG_GAME` says.

When 2 or 3 people are in a friendly room, the player who selects **Start** chooses whether bots fill the empty seats. For what players see, see [CPU players](../README.md#cpu-players). A player alone in a room can't start it, as in the original game ([ADR 0037](adr/0037-bots-fill-seats-only-for-2-or-3-people-with-no-difficulty-choice.md)), and the game lets only a player with at least one friend create a room. Ranked matches never get bots, and the Java client gets no question and starts with people only.

Bots run the game's own AI profiles, each with a random hero.

Each bot runs the game in a worker thread on the server and starts when the match does, which takes about 15 seconds. Each bot needs about 400 MB of memory.

### Self-checks

To run the self-checks, run `npm test`. They need no local data and no built page.

Two checks need local data: `npm run test:battle` needs a battle template, and `npm run test:gameblob` needs raw captures in `RG_CAPTURES`.

## Host the page without the game files

If the page's host sends no game (for example, `web/dist/` from `npm run build` deployed to a static host, a server without `RG_GAME`, or a `--public` server to a visitor without its download code), the page asks each player to choose their own copy of the game: `ResetGeneration-Standalone.zip`, the extracted `ResetGeneration` folder, or the folder that contains it. The page keeps the files in the browser's IndexedDB, so a player chooses them once per browser. The files never leave the player's computer.

Players need the files of the Windows standalone build. The emulator runs `ResetGeneration-Win32-Web.dll` and can't run the Mac library `libResetGenerationMacApplet.dylib`, but it runs in any desktop browser on any operating system.

## Guests and members

By default, a name is the whole identity ([ADR 0009](adr/0009-a-name-is-the-whole-identity.md)), which suits a local or LAN server, and `--lan` always keeps it that way, whatever the Discord settings say. A public server (`--public`, which the Docker image uses) can turn on guests and members ([ADR 0011](adr/0011-guests-and-members-with-discord-sign-in.md)).

To turn on guests and members, do the following:

1. Register a Discord application in the [Discord Developer Portal](https://discord.com/developers/applications).
2. Upload `web/public/icon-512.png` as the application's icon.
3. Add the address in `RG_PUBLIC_URL` followed by `/auth/discord/callback` as the application's redirect, for example `https://play.example.com/auth/discord/callback`. Set its **Privacy Policy URL** and **Terms of Service URL** to your server's `/privacy` and `/terms` pages, for example `https://play.example.com/privacy`: Discord's developer terms require a privacy policy that the app links to ([Terms and Privacy policy](#terms-and-privacy-policy)).
4. Set the environment variables in the following table. They all go in `.env`, for both `npm start` and Docker.

The following table lists the variables for guests and members:

| Variable | Meaning |
| --- | --- |
| `RG_DISCORD_CLIENT_ID`, `RG_DISCORD_CLIENT_SECRET` | The Discord application. Sign-in asks for the `identify` scope only. |
| `RG_PUBLIC_URL` | The address players use, such as `https://play.example.com`, with no path. |
| `RG_DISCORD_INVITE` | Optional. Your community's `https://discord.gg/...` link, which the page shows as **Join the Discord** in its footer. |
| `RG_TRUST_PROXY` | Set to `1` behind one reverse proxy, so the limit on new guests uses the client address the proxy appends to `X-Forwarded-For`. Leave it unset otherwise: anyone can forge that header. |
| `RG_GUESTS_PER_IP_HOUR` | New guests one address can make per hour. An IPv6 address's `/64` network counts as one address. Default 30, because phones on one mobile network often share an address. |
| `RG_GUEST_CAP` | Guest accounts the server holds at once. Default 5,000. |

`RG_DISCORD_CLIENT_ID`, `RG_DISCORD_CLIENT_SECRET`, and `RG_PUBLIC_URL` are all required. With all three set, every player is a guest or a member:

- A **guest** is created on the first visit, with no form, and holds a secret token in the browser. A guest's account is wiped 24 hours after its last activity, together with its fame, stats, and friends. Guests play everything, ranked included, but only members appear in the rankings.
- A **member** signs in with Discord, picks an in-game name once (letters, numbers, and `_`, up to 15; it can't be changed), and keeps the account until they choose **Delete my account**. **Download my data** in the same menu saves everything the server keeps about the account as one JSON file. A guest who signs in keeps what they earned. If the Discord account already has a player, that player wins and the guest's progress is dropped, after a confirmation. The server stores the Discord ID and the name, never an email address.
- A member's **saved game** (story progress, quick-match record, settings, and achievements; at most 256 KiB per file, and at most 1 MiB and 16 files per account) is kept on the server with the account, so it follows them to another browser or device. A guest's saved game stays in the browser. Signing out clears the browser's copy; deleting the account removes the server's copy ([ADR 0014](adr/0014-a-members-saved-game-is-kept-on-the-server.md)).
- The Java client can't send a token, so such a server refuses it. The Java client still works on servers without Discord sign-in.

The page also shows how many players are online, from `GET /status`: "3 online" at the right end of the header, or on a phone, at the top of the page, over the game screen. A public server runs no bots, so on a quiet server, players wait.

## Terms and Privacy policy

A `--public` server serves two pages beside the game: the **Terms** at `/terms` and the **Privacy policy** at `/privacy` ([ADR 0021](adr/0021-public-servers-publish-terms-and-a-privacy-policy.md)). The page's footer, its Notices dialog, a line under **Start**, and the new member's name dialog link to them, and playing online accepts both. Their text ships with the repository; the server fills in three settings, and a `--public` server won't start without all three:

| Variable | Meaning |
| --- | --- |
| `RG_ADMIN_NAME` | Your legal name: you run the server and answer for the data it keeps. One line, up to 120 characters. |
| `RG_HOSTING` | The company that stores the server and its data for you, and where, such as `Example Cloud, Jakarta`. One line, up to 120 characters. |
| `RG_CONTACT` | Where players and rights holders write: an email address or an `https://` address. A public page, such as a GitHub profile, keeps your inbox private, but then requests arrive in public, and a rights holder who finds no private way to reach you may write to your hosting provider instead. |

The Privacy policy describes the server as this repository runs it. Keep it true:

- Run it with `compose.yaml`, whose log limits are the ones the policy names: 3 files of 10 MB plus `data/capture.log`'s 20 MB for the game server, and 3 files of 10 MB for Caddy, which keeps no access log but whose error lines can hold a client's address. With `npm start`, the server's output is kept wherever you send it.
- Back up every night as [Back up the accounts](DEPLOY.md#7-back-up-the-accounts) says, and keep only the newest backup off the server: the policy says a deleted account leaves the backups as they're replaced.
- The Terms say you may delete any account; use [Delete an account](#delete-an-account) for a player who breaks them, and for a privacy request sent to `RG_CONTACT`.

The Terms ask players to be 13 or older, and players under 18 to have a parent's or guardian's permission; the page doesn't check. Neither page is legal advice, and neither names a governing law: what the law where you live asks of you still applies.

## Delete an account

A player deletes their own account with **Delete my account**. As the admin, you can delete any account from the command line, for a privacy request or to clear test accounts ([ADR 0016](adr/0016-the-admin-deletes-accounts-through-the-running-server.md)). The `delete-user` command asks the running server, which ends the player's session and removes the account, its friend links, its saved game, and its tokens, the same way **Delete my account** does. It doesn't ban anyone: a member can sign in with Discord again and start a new account.

1. Generate a long random secret:

   ```sh
   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
   ```
2. Set `RG_ADMIN_TOKEN` in `.env` to the output, and then restart the server. Without the token, the server has no admin endpoint.
3. Delete by in-game name, or by Discord ID on a server with Discord sign-in:

   ```sh
   npm run delete-user -- --name Alice
   npm run delete-user -- --discord 123456789012345678
   ```

   The command shows the account's kind, fame, matches, friends, saved game files, and whether the player is online, and then asks `y/N`. `--yes` skips the question; it's required when there is no terminal. A player in a ranked match is deleted anyway, so that match counts as a win for the others ([ADR 0005](adr/0005-the-server-relays-battles.md)).

With Docker, run the command inside the container, because Caddy answers 404 for `/admin/` and the command talks to the server on `127.0.0.1`:

```sh
docker compose exec rg npm run delete-user -- --name Alice
```

With `compose.lan.yaml`, the server's port is open to whatever `BIND` allows, and the token is then the only protection: use a long one. The server logs `admin deleted` and the player's name, with no Discord ID.

## Send the game with a download code

A `--public` server with a server copy sends it only to visitors who come with its **download code**, six letters and digits in a link such as `https://play.example.com/?code=AB3K9Q` ([ADR 0031](adr/0031-the-server-sends-its-copy-only-to-a-download-code.md)). Use it to let a few friends try the game without finding the standalone build themselves. Read [Rules for a server that sends the game](LEGAL.md#rules-for-a-server-that-sends-the-game) first: it is your decision and your risk.

Nothing on the page shows the code or asks for it, and `/status` doesn't say that the server sends the game. A visitor whose code doesn't work, for whatever reason, sees the page of a server that sends nothing and brings their own copy. Only a browser that received the game is told, in its Notices dialog, that the server sent it, with your `RG_CONTACT` for removal requests.

1. Set `RG_ADMIN_TOKEN` as in [Delete an account](#delete-an-account), and `RG_GAME` (or `RG_GAME_PATH` with Docker).
2. Make a code:

   ```sh
   npm run download-code -- --new
   ```

   The command prints the link to give your friends. A server has one code at a time: a new code ends the old one at once. `--days N` makes it end after `N` days instead of 30.
3. To see the code and what it has sent, run `npm run download-code`. To end it at once, so that the server sends the game to nobody, run `npm run download-code -- --end`.

With Docker, run the command inside the container: `docker compose exec rg npm run download-code -- --new`.

The limits that keep a leaked code from costing you much:

- A code ends after 20 downloads, after its days, or when you end it.
- One network (one IPv4 address, or one IPv6 /64) gets 2 downloads a day.
- The server sends at most `RG_GAME_MB_PER_DAY` MiB a day for the code (700 by default, about 30 downloads), and none more until the next day (UTC).
- After 10 wrong codes from one network, or 100 from everywhere, within an hour, the server takes no code, the right one included, until that hour has passed.

A browser that supports brotli gets about 23 MiB; the server makes that download in two or three minutes the first time it starts with a copy, keeps it in `data/` (`game-bundle-*.br`), and sends gzip, about 28 MiB, until it is ready. The code and its count of downloads are kept in `data/download-code.json`; the counts per network and the day's total are kept in memory, so a restart starts them over. The server logs each download as a count, with no address.

## Run in Docker

The image doesn't contain the game files ([ADR 0001](adr/0001-players-bring-their-own-game-files.md)), and it builds the page in a first build stage, so it holds no `node_modules`. Two compose files run it: `compose.yaml` for the internet and `compose.lan.yaml` for a private network or this PC.

### On the internet (Caddy)

For the whole procedure on a virtual private server (VPS), from a bare host to updates and backups, see [Deploy to a VPS](DEPLOY.md). The following steps are the short version for a host that is ready.

`compose.yaml` runs the server behind [Caddy](https://caddyserver.com), which gets and renews the HTTPS certificate by itself, redirects HTTP to HTTPS, and forwards the client's address (the server's `RG_TRUST_PROXY`, on by default here, reads it). The server publishes no port of its own, so Caddy is the only way in. The page needs HTTPS for features such as the screen wake lock, and Discord needs an `https://` address.

1. Point your domain's DNS `A` record at the host, and open ports 80 and 443 (443 for UDP too, for HTTP/3) in its firewall. Create no `AAAA` record for now: with `compose.yaml` as written, Docker may show every IPv6 visitor as one address, and so give them one shared guest limit. Check that nothing else on the host uses port 80 or 443.
2. Register the Discord application as described in [Guests and members](#guests-and-members), with `https://DOMAIN/auth/discord/callback` as its redirect. Replace `DOMAIN` with your domain.
3. Copy `.env.example` to `.env` in the repository root (it lists every setting, all empty), and fill in at least these:

   ```sh
   # The public name Caddy serves.
   RG_DOMAIN=play.example.com
   RG_DISCORD_CLIENT_ID=
   RG_DISCORD_CLIENT_SECRET=
   # Optional: your community link, shown as "Join the Discord" in the footer.
   # RG_DISCORD_INVITE=https://discord.gg/...
   # Optional: the server copy. The witness runs it, so the engine decides battle results; without it they're guessed.
   # It is also what the download code sends (see "Send the game with a download code"): without a code, nobody gets it.
   # The .zip or the extracted folder; start a relative path with ./
   # RG_GAME_PATH=./ResetGeneration-Standalone.zip
   # Required on a public server: they fill in its Terms and Privacy policy, and it won't start without them (see "Terms and
   # Privacy policy"). RG_CONTACT is an email address or an https address, also shown to rights holders in the Notices dialog.
   RG_ADMIN_NAME=Jane Doe
   RG_HOSTING=Example Cloud, Jakarta
   RG_CONTACT=admin@example.org
   ```

   `RG_PUBLIC_URL` defaults to `https://DOMAIN`, where `DOMAIN` is your `RG_DOMAIN` value. A public server never runs bots, with or without `RG_GAME_PATH`.
4. Create the `data` folder next to `compose.yaml`, owned by the container's user (UID 1000):

   ```sh
   mkdir -p data && sudo chown -R 1000:1000 data
   ```

   On a Linux host, without the `chown` command, Docker creates the folder owned by root and the server stops with `EACCES: permission denied, mkdir '/app/data'`.
5. Copy your `battle-templates.zip` file into `data`. For more information, see [Battle templates](#battle-templates).

   `data` is a bind mount, so the database and the templates live on the host's disk, not in a Docker volume. Without a usable template, the server refuses to start and prints why, and `restart: unless-stopped` then keeps retrying.
6. Run `RG_VERSION=$(git describe --tags --always) docker compose up -d --build` and open `https://DOMAIN/`. The first visit can take a few seconds while Caddy gets the certificate; `docker compose logs caddy` shows the result.

   `RG_VERSION` gives the image the version that `/status` and the **Notices** dialog report, such as `0.1.2`, because the build can't see `.git`. Without it, `/status` reports `unknown` and the dialog shows no version. In PowerShell, run `$env:RG_VERSION = git describe --tags --always` first, and then `docker compose up -d --build`.

Caddy keeps its certificates in a Docker volume (`caddy_data`). If you lose that volume, Caddy requests the certificates from Let's Encrypt again, and Let's Encrypt limits how often it issues certificates for one name. The Java client's TCP port 8976 isn't published: a Discord-enabled server refuses the Java client anyway, because it can't send a token.

### On a private network or this PC

`compose.lan.yaml` runs the server with `--lan`: name-only login, every story and hero open, and the witness and bots when `RG_GAME_PATH` is set. With `RG_GAME_PATH`, it also sends the server copy to every visitor, so that other devices don't ask for the game files. It publishes the page on 8080 and the Java client's port on 8976, to this PC only, unless you set `BIND=0.0.0.0` in `.env`. The following `.env` lines are an example for this PC only:

```sh
RG_GAME_PATH=./ResetGeneration-Standalone.zip
BIND=127.0.0.1
```

Run `RG_VERSION=$(git describe --tags --always) docker compose -f compose.lan.yaml up -d --build` and open `http://localhost:8080/`. It keeps accounts and battle templates in `./data` the same way, and it only warns when there are no templates. The container serves plain HTTP, so the screen wake lock isn't available on another device unless you put HTTPS in front.

Each `--build` leaves the previous image and its build cache behind, with either compose file. To free that space every week, add the prune job from [Run the server day to day](DEPLOY.md#9-run-the-server-day-to-day).

## Battle templates

Online battles don't work without battle templates. The server hosts every battle from a battle template captured from the engine ([ADR 0006](adr/0006-capture-battle-templates-from-a-live-client.md)), stored as a pair of `NAME.game` and `NAME.snap` files, where `NAME` is the template's name, in `data/templates/`, in `data/battle-templates.zip`, or both. The templates stay out of the repository and the Docker image because they derive from the game (ADR 0001), so a fresh clone, a rebuilt container, or a new server has none until you restore or capture them.

A `--public` server (which the Docker image runs) refuses to start when neither `data/templates/` nor `data/battle-templates.zip` holds a usable template, and prints why. Any other server starts and warns, because the page and single-player play don't need templates.

In every mode, the server also warns for each player count (2, 3, or 4) that has no template: matches of that size don't start, and without a 4-player template, bots can't fill a room. Matchmaking waits until a template with one castle per seat exists, and the server logs `no battle template for N players in data/templates or data/battle-templates.zip`.

Before you begin, you need Windows, the Visual Studio x86 tools, and the Java client. To capture templates, do the following:

1. Build the capture tool with the Visual Studio x86 tools: `cl /O1 tools\rgtrace\rgtrace.c`.
2. Start the Java client, and then run `rgtrace JAVA_PID OUTPUT_DIR > trace.log`.

   Replace the following:
   - `JAVA_PID`: the process ID of `java.exe`
   - `OUTPUT_DIR`: the folder where `rgtrace` writes captures
3. In the game, start an Arcade Mode battle with one opponent.
4. Leave the battle. To capture more levels, repeat steps 3 and 4. Each Arcade battle uses a random map, and the number of opponents sets the player count.
5. Run `node tools/rgtrace/import-all.js trace.log OUTPUT_DIR`. It imports every new level into `data/templates/` and skips ones already there.
6. Restart the server to use the new templates.

The game has 6 maps, each in a 2-, 3-, and 4-player version (18 levels).

### Back up and restore

Accounts have their own backup, `npm run backup`, which is safe while the server runs. For more information, see [Back up the accounts](DEPLOY.md#7-back-up-the-accounts).

Keep a private copy of your templates in `data/battle-templates.zip` (about 15 KB for 6 templates), and never put it in the public repository. Make it again after every capture, from the folder that holds `data`:

```powershell
Compress-Archive -Force data\templates data\battle-templates.zip
```

On Linux or macOS, run `cd data && zip -r battle-templates.zip templates`.

The server reads the zip as it is, next to `data/templates/`. To restore your templates, copy the zip into `data/` on this computer or a server, and then restart the server, which loads templates only at start. A zip of the `templates` folder and a zip of the files in it both work. A template in both places is taken from `data/templates/`, with a `differs` warning at start if the two copies aren't the same.

With Docker, copy the zip into the `./data` folder that the compose file mounts, and then run `docker compose restart` (add `-f compose.lan.yaml` for a LAN server). When a match starts, the log shows `table uses template` and the template's name. A template that the server can't use is skipped at start with a warning that names the template and says `skipped`, and a zip that it can't read is skipped with `battle-templates.zip skipped`.

If no zip is left, capture the templates again with the preceding steps. Keep the `trace.log` file and the output folder from each capture session as well: `import-all.js` rebuilds the templates from them without playing the battles again.

## Point the Java client at the server

Pass the server address with `-gw` in the game's start command:

```bat
.\jre\bin\java.exe -jar ResetGeneration.jar -gw 127.0.0.1
```

Alternatively, map `resetgeneration-gw.arena.n-gage.com` to the server's IP address in the hosts file. This works with the unmodified start scripts.

The `-username NAME -password PASSWORD` flags prefill the login screen and write a client debug log (`applet_NAME_*.txt`) to the game folder. Replace `NAME` with a player name and `PASSWORD` with a password.
