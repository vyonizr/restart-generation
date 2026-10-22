# Run a server

This guide is for the admin: the person who runs a Restart Generation server for other players. To play on your own PC, [Start playing](../README.md#start-playing) in the README is enough.

The server replaces Nokia's N-Gage Arena, which used the SNAP Mobile protocol, for the standalone build of Reset Generation (RedLynx, 2008). It restores login, stats, rankings, achievements, friends, ranked Quick Match (2-4 players), friendly rooms, and server-hosted battles. The browser client runs the original engine, the 32-bit Windows program `ResetGeneration-Win32-Web.dll`, unchanged in a JavaScript x86 emulator.

For more information about how it works, see [the protocol](protocol.md), the [architecture decision records (ADRs)](adr/), the [reverse-engineering notes](re/) (including how to regenerate the analysis), [the emulator](../web/emu), and [the page](../web/ui) (Svelte components built by Vite, [ADR 0013](adr/0013-the-page-is-built-with-vite-and-svelte.md)).

## Run the server with Node.js

The server needs Node.js 22.13 or later, for the built-in `node:sqlite`. The server and the emulator have no npm dependencies, on purpose, so they run with nothing installed. Only building the page needs `npm install` (Vite and Svelte, ADR 0013). The built page is `web/dist`, which the server serves and a static host can take as it is.

To set up the server, do the following:

1. Run `npm install`.
2. Copy `.env.example` to `.env` in the repository root.
3. In `.env`, set `RG_GAME` to the path of your game copy, the server copy.
4. Optional: to send that copy to every visitor, so that nobody chooses their own files, also set `RG_SEND_GAME=1`. Read [Rules for a server that sends the game](LEGAL.md#rules-for-a-server-that-sends-the-game) first.

`RG_GAME` is the server copy of the game: either `ResetGeneration-Standalone.zip` or the extracted `ResetGeneration` folder (the one with `ResetGeneration-Win32-Web.dll` and the `.pak` files). The server runs it for its witness and, unless it's `--public`, for bots. It sends these files to the browser only with `RG_SEND_GAME=1`, so send only a copy you own. `RG_SEND_GAME=1` without `RG_GAME` sends nothing, and the server log says so. The dev tools in `web/tools` read the game from `RG_GAME` too.

Use the following npm scripts:

- `npm start`, or `npm run start:lan` for `--lan`: starts the server. If `web/dist` is missing, it builds the page first, and if Vite isn't installed, it tells you to run `npm install`.
- `npm run build`: rebuilds the page after you change anything in `web/`.
- `npm run dev:web`: serves the page while a gateway runs. A style change swaps in place, and a script or component change reloads the page. It forwards `/snap`, `/status`, `/auth`, `/bots`, `/replays`, `/replay/ID/data`, and `/game` to port 8080 (or `HTTP_PORT`).
- `npm run dev`, or `npm run dev:lan` for `--lan`: runs `npm run seed`, then starts a development server that restarts on file changes. It keeps its accounts and replays in `data/dev/`, apart from the files `npm start` uses ([ADR 0023](adr/0023-development-servers-load-seed-accounts.md)).
- `npm run seed`: upserts the seed accounts from `server/seed.json` into `data/dev/`, with their friends, tokens, saved games, and replays. Stop the development server first, because it doesn't read accounts that change under it. Add `-- --lan` for the name-only files. Add `-- --play` to also play the seed's `played` battles between bots, for replays the engine can play. That needs `RG_GAME` and battle templates, and takes a few minutes for each battle. The other seed replays show their players and result, and about 10 seconds after **Watch** the page says they can't be played.

  To play as a seed account on a server with Discord sign-in, open the page in a private window, paste the account's `localStorage` line that `npm run seed` prints into the browser console, and reload the page. A private window keeps your own account and saved game untouched. On a name-only server, choose **Change name** under **Start** and type the seed account's name, such as `Dev_Ada`.
- `npm test`: runs the self-checks that need no local data and no built page.
- `npm run backup`: copies the accounts database into `data/backups/` while the server runs, and keeps the newest 7 backups. To keep a different number, run `npm run backup -- --keep NUMBER`. In Docker, run `docker compose exec rg npm run backup`.

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

Every online battle that began, ranked or friendly, becomes a replay ([CONTEXT.md](../CONTEXT.md) "Replay"): after the battle, each player in the browser client is offered **Watch replay** and **Copy link**, and the replay page at `/replay/ID` plays the battle again in the game's own replay player ([ADR 0022](adr/0022-replays-send-a-battles-game-blob-to-anyone-with-the-link.md)). Anyone with the link can watch it. Each replay is also listed under the name of every player in it, for anyone to see: players open their list with **Replays**, in the Account menu or beside **Sign in with Discord** on a Discord server, and on the "Online as" line on a name-only one ([ADR 0024](adr/0024-a-players-replays-are-listed-under-their-name.md)). Watching needs the game, like playing: the visitor's own copy, or the server copy with `RG_SEND_GAME=1`. The server needs no server copy to keep them.

Replays are kept apart from the accounts, beside the accounts they name: in `data/replays.db` on a Discord server and in `data/replays-names.db` on a name-only one. Each is kept for 30 days, and the server deletes older ones every hour. Each is a few kilobytes. When a member deletes their account, or you delete one with `delete-user`, the replays of its battles go with it; a guest's stay for their 30 days. `npm run backup` doesn't back them up.

To keep no replays, set `RG_REPLAYS=0`: the server then keeps no new ones and serves none of those it kept, and the Privacy policy leaves them out. To delete every replay at once, stop the server and delete the replay file with its `-wal` and `-shm` files.

To check that replays play back the battles as they were played, run self-play with `--replays` (`npm run selfplay -- --battles 2 --replays`, needs `RG_GAME`): each battle's replay is played to its end in the engine, which must end on the bots' final turn with their ranks.

### Bots

If `RG_GAME` is set, the server can fill friendly matches with bots, players that the server controls. A `--public` server never runs bots, whatever `RG_GAME` says.

The player who selects **Start** in a friendly room chooses the difficulty, **CPU** or **Expert**, and a bot fills every empty seat. With 2 or 3 people in the room, they can also choose **No** to play with people only. For what players see, see [CPU players](../README.md#cpu-players). The game lets only a player with at least one friend create a room. Ranked matches never get bots, and the Java client gets no question and starts with people only.

**CPU** runs the game's own AI profiles with a random hero. **Expert** chooses its hero from `server/bot-heroes.json` and also applies the AI-profile changes listed in `server/bot-ai.json`. That file lists none, so Expert's AI otherwise plays like CPU's, and self-play hasn't shown Expert to be harder ([ADR 0012](adr/0012-bots-run-with-retuned-ai-profiles.md)).

Each bot runs the game in a worker thread on the server and starts when the match does, which takes about 15 seconds. Each bot needs about 400 MB of memory.

### Self-checks

To run the self-checks, run `npm test`. They need no local data and no built page.

Two checks need local data: `npm run test:battle` needs a battle template, and `npm run test:gameblob` needs raw captures in `RG_CAPTURES`.

## Host the page without the game files

If the page's host has no game files at `game/` (for example, `web/dist/` from `npm run build` deployed to a static host, or a server without `RG_SEND_GAME=1`), the page asks each player to choose their own copy of the game: `ResetGeneration-Standalone.zip`, the extracted `ResetGeneration` folder, or the folder that contains it. The page keeps the files in the browser's IndexedDB, so a player chooses them once per browser. The files never leave the player's computer.

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

The page also shows how many players are online, from `GET /status`: "3 online" under the game screen, or on a phone, a small people icon and the number on the Start screen. A public server runs no bots, so on a quiet server, players wait.

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
   # The .zip or the extracted folder; start a relative path with ./
   # RG_GAME_PATH=./ResetGeneration-Standalone.zip
   # Optional, and your decision and risk: 1 sends the server copy to every visitor. Leave it out and each player chooses
   # their own copy (ADR 0001).
   # RG_SEND_GAME=1
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

   `RG_VERSION` is the release that `/status` and the **Notices** dialog report, because the build can't see `.git`. Without it they report `unknown`. In PowerShell, run `$env:RG_VERSION = git describe --tags --always` first, and then `docker compose up -d --build`.

Caddy keeps its certificates in a Docker volume (`caddy_data`). If you lose that volume, Caddy requests the certificates from Let's Encrypt again, and Let's Encrypt limits how often it issues certificates for one name. The Java client's TCP port 8976 isn't published: a Discord-enabled server refuses the Java client anyway, because it can't send a token.

### On a private network or this PC

`compose.lan.yaml` runs the server with `--lan`: name-only login, every story and hero open, and the witness and bots when `RG_GAME_PATH` is set. It publishes the page on 8080 and the Java client's port on 8976, to this PC only, unless you set `BIND=0.0.0.0` in `.env`. The following `.env` lines are an example for this PC only; `RG_SEND_GAME=1` sends the server copy, so that other devices don't ask for the game files:

```sh
RG_GAME_PATH=./ResetGeneration-Standalone.zip
RG_SEND_GAME=1
BIND=127.0.0.1
```

Run `RG_VERSION=$(git describe --tags --always) docker compose -f compose.lan.yaml up -d --build` and open `http://localhost:8080/`. It keeps accounts and battle templates in `./data` the same way, and it only warns when there are no templates. The container serves plain HTTP, so the screen wake lock isn't available on another device unless you put HTTPS in front.

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
