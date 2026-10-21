# Restart Generation server

A replacement for the dead Nokia N-Gage Arena (SNAP Mobile) backend used by the standalone Java build of Reset Generation (RedLynx, 2008).

Status: the game runs in the browser. The original engine (a 32-bit Windows DLL) runs unchanged in a JavaScript x86 emulator, and the server restores login, stats, rankings, achievements, friends, ranked Quick Match (2-4 players), friendly rooms, and server-hosted battles. See `docs/protocol.md` for the protocol, `docs/adr` for the architecture decisions, `docs/re` for the reverse-engineering notes and how to regenerate the analysis, `web/emu` for the emulator, and `web/ui` for the page (Svelte components built by Vite, ADR 0013).

## Play in the browser

1. Set `RG_GAME` to your copy of the game: either `ResetGeneration-Standalone.zip` or the extracted `ResetGeneration` folder (the one with `ResetGeneration-Win32-Web.dll` and the `.pak` files).
2. Run `npm install` once, then `npm start`. The first start builds the page into `web/dist` (ADR 0013); after you change anything in `web/`, rebuild it with `npm run build`.
3. Open `http://localhost:8080/` and press **Start**.

```sh
RG_GAME="D:/Downloads/ResetGeneration-Standalone.zip" npm start
```

If you don't set `RG_GAME`, the page asks for the game files instead, as described in [Host the page without the game files](#host-the-page-without-the-game-files). The dev tools in `web/tools` read the game from `RG_GAME` too.

Controls: arrow keys move, **Ctrl** or **Enter** selects (hold to drop a block), **Shift** goes back, **Esc** opens the menu. On a phone or tablet, the touch pad under the game screen does the same: the D-pad moves, **Select**, to its right and level with Up, selects (hold it to drop a block), **Back**, beside Select, goes back (in a battle it also opens the game's menu, as **Esc** does), and **Keyboard** raises the device's keyboard for typing. The game screen is shown soft by default, like a 2008 phone's display; **Soft screen** (the button under the screen, or the grid icon beside Keyboard on the touch pad) switches to the engine's sharp pixels, and the browser remembers the choice. To play online, choose **Quick Match** or **Online** in the main menu. On a server with Discord sign-in you play as a guest at once, with no form (see [Guests and members](#guests-and-members)). On any other server, such as a local or LAN one, the first time you go online the page asks you to set your name. It starts as a random guest name (such as `Guest123456`), and a new name is registered on first login. The page keeps your name in the browser's local storage, so your stats carry over between visits. There are no passwords: to keep your stats in another browser, enter the same name. Anyone can enter any name, and a second login with a name drops the first. To pick another name, choose **Change name** under **Start**; a new name starts with fresh stats. Names such as `CPU_1` are reserved for bots. Settings and achievements are also kept in local storage.

Every story and hero is open from the start on any server that isn't `--public` (ADR 0007); on a public server they are earned. The server sends the game files to the browser, so serve only a copy you own. To let other devices and people play, run the server with `--lan`, as described in [Play on other devices](#play-on-other-devices).

### Host the page without the game files

If the page's host has no game files at `game/` (for example, `web/dist/`, from `npm run build`, deployed to a static host), the page asks each player to choose their own copy of the game: `ResetGeneration-Standalone.zip`, or the extracted `ResetGeneration` folder or the folder above it. The page keeps the files in the browser's IndexedDB, so a player chooses them once per browser. The files never leave the player's computer.

Players need the files of the Windows standalone build. The emulator runs `ResetGeneration-Win32-Web.dll` and can't run the Mac library `libResetGenerationMacApplet.dylib`, but it runs in any desktop browser on any operating system.

## Play on other devices

A phone, tablet or other computer on the same network can play the game that your PC serves.

1. Run the server with `--lan`:

   ```sh
   RG_GAME="D:/Downloads/ResetGeneration-Standalone.zip" npm run start:lan
   ```

   The server prints one `http://<address>:8080/` line per network address, labelled with the network's name.
2. On the other device, open the address of the network both devices share, such as `http://192.168.1.20:8080/`.

Both devices must be on the same private network, such as your home Wi-Fi. Without `--lan`, the server accepts connections from your PC only. `--lan` always uses name-only login, with no Discord sign-in (see [Guests and members](#guests-and-members)). To serve people over the internet, use `--public` instead: it listens the same way and turns on Discord sign-in when it is configured. Friends need to reach your PC on ports 8080 (the page) and 8976 (the Java client).

If the other device can't connect, Windows Firewall is probably blocking it. To allow the two ports on private networks, run this command in PowerShell as an administrator:

```powershell
New-NetFirewallRule -DisplayName "Reset Generation" -Direction Inbound -Protocol TCP -LocalPort 8080,8976 -Action Allow -Profile Private
```

If Windows lists your network as public, set it to private in Windows Settings, or the rule doesn't apply.

Phones and tablets play in portrait, with a touch pad under the game screen; a keyboard attached to a tablet also works. A `.zip` you choose on the device stays in its browser. Safari can delete it after about 7 days without a visit, and the page then asks for it again.

## Run the server

Requires Node.js 22.13 or later, for the built-in `node:sqlite`. The server and the emulator have no npm dependencies, on purpose, so they run with nothing installed. Only building the page needs `npm install` (Vite and Svelte, ADR 0013). The built page is `web/dist`, which the server serves and a static host can take as it is.

Run `npm install` once, copy `.env.example` to `.env` in the repo root and set `RG_GAME=<path>` there, then use these npm scripts:

- `npm start`, or `npm run start:lan` for `--lan`: starts the server. If `web/dist` is missing it builds the page first, and if Vite is not installed it tells you to run `npm install`.
- `npm run build`: rebuilds the page after you change anything in `web/`.
- `npm run dev:web`: serves the page while a gateway runs: a style change swaps in place, a script or component change reloads the page. It forwards `/snap`, `/status`, `/auth`, `/bots` and `/game` to port 8080 (or `HTTP_PORT`).
- `npm run dev`: restarts the server on file changes.
- `npm test`: the self-checks that need no local data and no built page.
- `npm run backup`: copies the accounts database into `data/backups/` while the server runs, keeping the newest 7 (`-- --keep <n>`). In Docker: `docker compose exec rg npm run backup`.

To start the server alone, once the page is built:

```sh
node server/gateway.js
```

The gateway listens on TCP port 8976 and serves the page on port 8080. Both accept connections from this PC only, unless you add `--lan` (see [Play on other devices](#play-on-other-devices)). To use a different port, set the `PORT` environment variable. Accounts are created on first login and stored in a SQLite database (ADR 0010): `data/accounts-names.db` on a name-only server (`--lan`, or no Discord settings) and `data/accounts.db` on a Discord server, so switching modes never mixes the two kinds of account. A `data/accounts.json` from an older version is not read, and its players register again. To back up a database while the server runs, use `sqlite3 data/accounts.db "VACUUM INTO 'backup.db'"` (or `accounts-names.db`); copying the file mid-write is not safe.

To give new players more time, set `RG_RELAXED_FRIENDLY=1` or add `--relaxed` (`npm run start:relaxed`, or `npm run start:lan:relaxed` with `--lan`). Friendly matches then show no countdown in any phase, and the server ends a phase only after 3 minutes (1 minute for cannon shots) if someone stops playing. Ranked matches keep the 20 s limit.

If `RG_GAME` is set (and the server is not `--public`, which never runs bots, whatever `RG_GAME` says), the server can also fill friendly matches with bots, players the server controls. A player alone in their room who presses **Start** chooses the difficulty, CPU or Expert, and a bot fills every empty seat. With 2 or 3 people in the room, the page asks "Fill the empty seats with CPU players?" when someone presses **Start**, with No, CPU and Expert. That player moves between the buttons with Left and Right (or the D-pad), presses the focused one with Select (it starts on CPU) and answers No with Back (for a player alone, Back cancels the Start), or clicks a button. CPU is the game's own AI with a random hero. Expert chooses its hero from `server/bot-heroes.json` and runs the AI changes in `server/bot-ai.json`, none yet; self-play has not shown it to be harder (ADR 0012). The game still lets only a player with at least one friend create a room. Each bot runs the game in a worker thread on the server and starts when the match does, which takes about 15 seconds. Ranked matches never get bots, and the Java client gets no question and starts with people only.

Self-checks:

```sh
node server/snap.test.js
node server/store.test.js
node server/auth.test.js
node server/gateway.test.js
node server/gateway.auth.test.js
node server/bots.test.js
node server/battle.test.js
node server/gameblob.test.js
```

`battle.test.js` needs a battle template, and `gameblob.test.js` needs raw captures in `RG_CAPTURES`.

## Guests and members

By default a name is the whole identity (ADR 0009), which suits a local or LAN server, and `--lan` always keeps it that way, whatever the Discord settings say. A public server (`--public`, which the Docker image uses) can turn on guests and members (ADR 0011) by registering a Discord application at <https://discord.com/developers/applications> (upload `web/public/icon-512.png` as its icon), adding `<RG_PUBLIC_URL>/auth/discord/callback` as its redirect, and setting these environment variables (they all go in `.env` for `npm start` and Docker):

| Variable | Meaning |
| --- | --- |
| `RG_DISCORD_CLIENT_ID`, `RG_DISCORD_CLIENT_SECRET` | The Discord application. Sign-in asks for the `identify` scope only. |
| `RG_PUBLIC_URL` | The address players use, such as `https://play.example.com`, with no path. All three above are needed. |
| `RG_DISCORD_INVITE` | Optional. Your community's `https://discord.gg/...` link, which the page shows as "Join the Discord" in its footer. |
| `RG_TRUST_PROXY` | Set to `1` behind one reverse proxy, so the limit on new guests uses the client address the proxy appends to `X-Forwarded-For`. Leave it unset otherwise: anyone can forge that header. |
| `RG_GUESTS_PER_IP_HOUR` | New guests one address can make per hour. Default 10. |
| `RG_GUEST_CAP` | Guest accounts the server holds at once. Default 5000. |

With all three set, every player is a guest or a member:

- A **guest** is created on the first visit, with no form, and holds a secret token in the browser. It is wiped 24 hours after its last activity, together with its fame, stats and friends. Guests play everything, ranked included, but only members appear in the rankings.
- A **member** signs in with Discord, picks an in-game name once (letters, numbers and `_`, up to 15; it can't be changed), and keeps the account until they choose **Delete my account**. A guest who signs in keeps what it earned. If the Discord account already has a player, that player wins and the guest's progress is dropped, after a confirmation. The server stores the Discord ID and the name, never an email.
- A member's **saved game** (story progress, quick-match record, settings and achievements, up to 256 KB a file and 1 MB in all) is kept on the server with the account, so it follows them to another browser or device. A guest's stays in the browser. Signing out clears the browser's copy; deleting the account removes the server's (ADR 0014).
- The Java client can't send a token, so on such a server it is refused. It still works on servers without Discord sign-in.

The page also shows how many players are online, as "3 online" under the game screen (on a phone, a small people icon and the number on the Start screen), from `GET /status`. A public server runs no bots (see below), so a quiet server means a wait.

## Delete an account

A player deletes their own account with **Delete my account**. As the admin you can delete any account from the command line, for a privacy request or to clear test accounts (ADR 0016). It asks the running server, which ends the player's session and removes the account, its friend links, its saved game and its tokens, the same way **Delete my account** does. It doesn't ban anyone: a member can sign in with Discord again and start a new account.

1. Set `RG_ADMIN_TOKEN` in `.env` to a long random secret, and restart the server. Without it the server has no such endpoint at all.

   ```sh
   node -e "console.log(require('crypto').randomBytes(24).toString('base64url'))"
   ```
2. Delete by in-game name, or by Discord ID on a server with Discord sign-in:

   ```sh
   npm run delete-user -- --name Alice
   npm run delete-user -- --discord 123456789012345678
   ```

   It shows the account's kind, fame, matches, friends, saved game files and whether the player is online, then asks `y/N`. `--yes` skips the question (it is required when there is no terminal). A player in a ranked match is deleted anyway, so that match counts as a win for the others (ADR 0005).

With Docker, run it inside the container, because Caddy answers 404 for `/admin/` and the command talks to the server on `127.0.0.1`:

```sh
docker compose exec rg npm run delete-user -- --name Alice
```

On `compose.lan.yaml` the server's port is open to whatever `BIND` allows, and the token is then the only protection: use a long one. The server logs `admin deleted <name>`, with no Discord ID.

## Run in Docker

The image doesn't contain the game files (ADR 0001), and it builds the page in a first build stage, so it holds no `node_modules`. Two compose files run it: `compose.yaml` for the internet and `compose.lan.yaml` for a private network or this PC.

### On the internet (Caddy)

For the whole procedure on a VPS, from a bare host to updates and backups, see [docs/DEPLOY.md](docs/DEPLOY.md). What follows is the short version for a host that is ready.

`compose.yaml` runs the server behind [Caddy](https://caddyserver.com), which gets and renews the HTTPS certificate by itself, redirects http to https, and forwards the client's address (the server's `RG_TRUST_PROXY`, on by default here, reads it). The server publishes no port of its own, so Caddy is the only way in. The page needs HTTPS for features such as the screen wake lock, and Discord needs an `https://` address.

1. Point your domain's DNS `A` (and `AAAA`, if you have IPv6) record at the host, and open ports 80 and 443 (443 for UDP too, for HTTP/3) in its firewall. Nothing else on the host may use 80 or 443.
2. Register the Discord application as described in [Guests and members](#guests-and-members), with `https://<your domain>/auth/discord/callback` as its redirect.
3. Copy `.env.example` to `.env` in the repo root (it lists every setting, all empty) and fill in at least these:

   ```sh
   # The public name Caddy serves.
   RG_DOMAIN=play.example.com
   RG_DISCORD_CLIENT_ID=
   RG_DISCORD_CLIENT_SECRET=
   # Optional: your community link, shown as "Join the Discord" in the footer.
   # RG_DISCORD_INVITE=https://discord.gg/...
   # Optional, and your decision and risk: the server then sends this copy of the game to every visitor. Leave it out and each
   # player chooses their own copy (ADR 0001). The .zip or the extracted folder; start a relative path with ./
   # RG_GAME_PATH=./ResetGeneration-Standalone.zip
   # Required with RG_GAME_PATH: where a rights holder can ask for the game's removal, an email address or an https address.
   # The page shows it in its Notices dialog, and the server won't start without it (docs/LEGAL.md).
   # RG_CONTACT=removals@example.org
   ```

   `RG_PUBLIC_URL` defaults to `https://<RG_DOMAIN>`. A public server never runs bots, with or without `RG_GAME_PATH`.
4. Create the `data` folder next to `compose.yaml` and put your captured battle templates in it (see [Battle templates](#battle-templates)). It is a bind mount, so the database and the templates live on the host's disk, not in a Docker volume. Without a usable template the server refuses to start and prints why, and `restart: unless-stopped` then keeps retrying. On a Linux host, make the folder writable by the container's user (uid 1000), or Docker creates it owned by root and the server stops with `EACCES: permission denied, mkdir '/app/data'`:

   ```sh
   mkdir -p data/templates && sudo chown -R 1000:1000 data
   ```
5. Run `docker compose up -d --build` and open `https://<your domain>/`. The first visit can take a few seconds while Caddy gets the certificate; `docker compose logs caddy` shows how it went.

Caddy keeps its certificates in a Docker volume (`caddy_data`). Losing it only means asking Let's Encrypt again, which limits how often it will issue for one name. The Java client's TCP port 8976 isn't published: a Discord-enabled server refuses the Java client anyway, because it can't send a token. Each bot needs about 400 MB of memory, but a public server runs none.

### On a private network or this PC

`compose.lan.yaml` runs the server with `--lan`: name-only login, every story and hero open, and bots when `RG_GAME_PATH` is set. It publishes the page on 8080 and the Java client's port on 8976, to this PC only unless you set `BIND=0.0.0.0` in `.env`:

```sh
RG_GAME_PATH=./ResetGeneration-Standalone.zip
BIND=127.0.0.1
```

Run `docker compose -f compose.lan.yaml up -d --build` and open `http://localhost:8080/`. It keeps accounts and battle templates in `./data` the same way, and it only warns when there are no templates. The container serves plain HTTP, so the screen wake lock isn't available on another device unless you put HTTPS in front.


## Battle templates

Online battles don't work without templates. A `--public` server (which the Docker image runs) refuses to start when `data/templates/` holds no usable template, and prints why. Any other server starts and warns, since the page and single-player play don't need them. Whatever the mode, the server also warns for each player count (2, 3 or 4) that has no template: matches of that size won't start, and without a 4-player template CPU players can't fill a room. The server hosts every battle from a level template captured from the game engine, stored in `data/templates/` as `<name>.game` and `<name>.snap` pairs. Matchmaking waits until a template with one castle per seat exists, and the server logs `no battle template for N players in data/templates`. The templates stay out of the repository and the Docker image because they derive from the game (ADR 0001), so a fresh clone, a rebuilt container or a new server has none until you restore or capture them.

To capture one on Windows:

1. Build the capture tool with the Visual Studio x86 tools: `cl /O1 tools\rgtrace\rgtrace.c`.
2. Start the game, then run `rgtrace <java.exe pid> <outdir> > trace.log`.
3. In the game, start an Arcade Mode battle with one opponent.
4. Quit the battle and repeat; each Arcade battle uses a random map, and the opponent count sets the player count.
5. Run `node tools/rgtrace/import-all.js trace.log <outdir>`. It imports every new level into `data/templates/` and skips ones already there. Restart the server to use them.

The game has 6 maps, each in a 2-, 3- and 4-player version (18 levels).

### Back up and restore

Accounts have their own backup, `npm run backup`, which is safe while the server runs: see [Back up the accounts](docs/DEPLOY.md#7-back-up-the-accounts).

Keep a private copy of `data/templates/` (about 6 KB compressed for 6 templates), and never put it in the public repository. Make the archive after every capture:

```bash
tar -czf battle-templates.tar.gz -C data templates
```

To restore it on this machine or on a server, run the following from the folder that holds `data/`, then restart the server, which loads templates only at start:

```bash
mkdir -p data && tar -xzf battle-templates.tar.gz -C data
```

With Docker, extract it into the `./data` folder that the compose file mounts, then run `docker compose restart` (add `-f compose.lan.yaml` for a LAN server). When a match starts, the log shows `table uses template <name>`. A template the server can't use is skipped at start with a `battle template <name> skipped` warning.

If no archive is left, capture the templates again with the steps above. That needs Windows, the Visual Studio x86 tools and the Java client. Keep the `trace.log` and `<outdir>` from each capture session as well: `import-all.js` rebuilds the templates from them without playing the battles again.

## Point the Java client at the server

Pass the server address with `-gw` in the game's start command:

```bat
.\jre\bin\java.exe -jar ResetGeneration.jar -gw 127.0.0.1
```

Alternatively, map `resetgeneration-gw.arena.n-gage.com` to the server's IP address in the hosts file. This works with the unmodified start scripts.

The `-username <name> -password <pw>` flags prefill the login screen and write a client debug log (`applet_<name>_*.txt`) to the game folder.

## Legal

Restart Generation is an unofficial fan revival of Reset Generation (RedLynx, 2008). It isn't affiliated with or endorsed by RedLynx, Ubisoft or Nokia, and their names, and N-Gage, belong to their owners.

This repository holds no game files and none of the game's code, art, sound or text: no decompiled code, and no level or battle data. Each player brings their own copy of the Windows standalone build, unless the admin of a server chooses to send one from it (ADR 0001); that admin answers for it, and must publish where a rights holder can ask for its removal (`RG_CONTACT`). The notes in `docs/re/` describe how the engine and Arcade behave, in our own words, and the protocol code is written from `docs/protocol.md` so that the original clients and this server can talk to each other.

The code here is free software under the GNU General Public License, version 3 or later (`LICENSE`). The fonts and the Svelte runtime keep their own licences (`THIRD_PARTY_NOTICES.md`, also served as `/licenses.txt`). What may and may not be committed is in `docs/LEGAL.md`; `npm run legal-check` enforces the file-level rules.

If you hold rights to something here and want it removed from this repository, or from the server its author runs, open an issue at https://github.com/vyonizr/restart-generation/issues, or use GitHub's own takedown process. We respond promptly. Another admin's server shows its own contact in its Notices dialog.

## Privacy

A server with Discord sign-in keeps a member's Discord ID, in-game name, stats, friend links and saved game, and a guest's name, stats and friend links until the account is wiped after 24 hours. It keeps no email address and no avatar. **Delete my account** removes a player's record, and an admin can delete any account with `npm run delete-user`. The page says this in its footer.
