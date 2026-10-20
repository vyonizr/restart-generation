# Restart Generation server

A replacement for the dead Nokia N-Gage Arena (SNAP Mobile) backend used by the standalone Java build of Reset Generation (RedLynx, 2009).

Status: the game runs in the browser. The original engine (a 32-bit Windows DLL) runs unchanged in a JavaScript x86 emulator, and the server restores login, stats, rankings, achievements, friends, ranked Quick Match (2-4 players), friendly rooms, and server-hosted battles. See `docs/protocol.md` for the protocol, `docs/adr` for the architecture decisions, `docs/re` for the reverse-engineering notes and how to regenerate the analysis, `web/emu` for the emulator, and `web/ui` for the page (Svelte components built by Vite, ADR 0013).

## Play in the browser

1. Set `RG_GAME` to your copy of the game: either `ResetGeneration-Standalone.zip` or the extracted `ResetGeneration` folder (the one with `ResetGeneration-Win32-Web.dll` and the `.pak` files).
2. Run `npm install` once, then `npm start`. The first start builds the page into `web/dist` (ADR 0013); after you change anything in `web/`, rebuild it with `npm run build`.
3. Open `http://localhost:8080/` and press **Start**.

```sh
RG_GAME="D:/Downloads/ResetGeneration-Standalone.zip" npm start
```

If you don't set `RG_GAME`, the page asks for the game files instead, as described in [Host the page without the game files](#host-the-page-without-the-game-files). The dev tools in `web/tools` read the game from `RG_GAME` too.

Controls: arrow keys move, **Ctrl** or **Enter** selects (hold to drop a block), **Shift** goes back, **Esc** opens the menu. On a phone or tablet, the touch pad under the game screen does the same: the D-pad moves, **Select**, to its right and level with Up, selects (hold it to drop a block), **Back**, beside Select, goes back (in a battle it also opens the game's menu, as **Esc** does), and **Keyboard** raises the device's keyboard for typing. To play online, choose **Quick Match** or **Online** in the main menu. On a server with Discord sign-in you play as a guest at once, with no form (see [Guests and members](#guests-and-members)). On any other server, such as a local or LAN one, the first time you go online the page asks you to set your name. It starts as a random guest name (such as `Guest123456`), and a new name is registered on first login. The page keeps your name in the browser's local storage, so your stats carry over between visits. There are no passwords: to keep your stats in another browser, enter the same name. Anyone can enter any name, and a second login with a name drops the first. To pick another name, choose **Change name** under **Start**; a new name starts with fresh stats. Names such as `CPU_1` are reserved for bots. Settings and achievements are also kept in local storage.

The server sends the game files to the browser, so serve only a copy you own. To let other devices and people play, run the server with `--lan`, as described in [Play on other devices](#play-on-other-devices).

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

Run `npm install` once, put `RG_GAME=<path>` in a `.env` file in the repo root, then use these npm scripts:

- `npm start`, or `npm run start:lan` for `--lan`: starts the server. If `web/dist` is missing it builds the page first, and if Vite is not installed it tells you to run `npm install`.
- `npm run build`: rebuilds the page after you change anything in `web/`.
- `npm run dev:web`: serves the page while a gateway runs: a style change swaps in place, a script or component change reloads the page. It forwards `/snap`, `/status`, `/auth`, `/bots` and `/game` to port 8080 (or `HTTP_PORT`).
- `npm run dev`: restarts the server on file changes.
- `npm test`: the self-checks that need no local data and no built page.

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

By default a name is the whole identity (ADR 0009), which suits a local or LAN server, and `--lan` always keeps it that way, whatever the Discord settings say. A public server (`--public`, which the Docker image uses) can turn on guests and members (ADR 0011) by registering a Discord application at <https://discord.com/developers/applications>, adding `<RG_PUBLIC_URL>/auth/discord/callback` as its redirect, and setting these environment variables (they all go in `.env` for `npm start` and Docker):

| Variable | Meaning |
| --- | --- |
| `RG_DISCORD_CLIENT_ID`, `RG_DISCORD_CLIENT_SECRET` | The Discord application. Sign-in asks for the `identify` scope only. |
| `RG_PUBLIC_URL` | The address players use, such as `https://play.example.com`, with no path. All three above are needed. |
| `RG_DISCORD_INVITE` | Optional. Your community's `https://discord.gg/...` link, which the page shows as "Join the Discord". |
| `RG_TRUST_PROXY` | Set to `1` behind one reverse proxy, so the limit on new guests uses the client address the proxy appends to `X-Forwarded-For`. Leave it unset otherwise: anyone can forge that header. |
| `RG_GUESTS_PER_IP_HOUR` | New guests one address can make per hour. Default 10. |
| `RG_GUEST_CAP` | Guest accounts the server holds at once. Default 5000. |

With all three set, every player is a guest or a member:

- A **guest** is created on the first visit, with no form, and holds a secret token in the browser. It is wiped 24 hours after its last activity, together with its fame, stats and friends. Guests play everything, ranked included, but only members appear in the rankings.
- A **member** signs in with Discord, picks an in-game name once (letters, numbers and `_`, up to 15; it can't be changed), and keeps the account until they choose **Delete my account**. A guest who signs in keeps what it earned. If the Discord account already has a player, that player wins and the guest's progress is dropped, after a confirmation. The server stores the Discord ID and the name, never an email.
- The Java client can't send a token, so on such a server it is refused. It still works on servers without Discord sign-in.

The page also shows how many players are online and waiting for a match (`GET /status`). A public server runs no bots (see below), so a quiet server means a wait.

## Run in Docker

`compose.yaml` builds and runs the server in a container. The image doesn't contain the game files (ADR 0001), and it builds the page in a first build stage, so it holds no `node_modules`. To set it up, create a `.env` file in the repo root:

```sh
# Your copy of the game: the .zip or the extracted folder. Start a relative path with ./
RG_GAME_PATH=./ResetGeneration-Standalone.zip
# Who can connect. 127.0.0.1 (default) is this PC only; 0.0.0.0 is your network or the internet.
BIND=127.0.0.1
# Optional: guests and members (see Guests and members). Leave them out for name-only login.
# RG_DISCORD_CLIENT_ID=
# RG_DISCORD_CLIENT_SECRET=
# RG_PUBLIC_URL=https://play.example.com
```

Then run `docker compose up -d --build` and open `http://localhost:8080/`. The container keeps accounts and battle templates in `./data`, so create that folder and put your captured templates in it before the first start: without one the container exits with a message (see [Battle templates](#battle-templates)), and `restart: unless-stopped` then keeps retrying.

- **Local or LAN:** set `RG_GAME_PATH`. The server serves the game files and runs bots. For LAN play, set `BIND=0.0.0.0`.
- **Public:** set `BIND=0.0.0.0`. With `RG_GAME_PATH` empty, the server serves no game files, so each player chooses their own copy (see [Host the page without the game files](#host-the-page-without-the-game-files)); that is the project's default (ADR 0001). If you set `RG_GAME_PATH`, the server sends that copy to every visitor, which is your decision and your risk. A public server never runs bots, with or without it.

The container serves plain HTTP. For a public server, put a reverse proxy or tunnel in front of port 8080 that provides HTTPS, which the page needs for features such as screen wake lock, and that waits more than 15 s for a response, because the server holds `retrieveAllEvents` requests for up to 15 s (ADR 0004). Without Discord sign-in, anyone can log in as any name and drop that player's session (ADR 0009), so turn it on for a public server (see [Guests and members](#guests-and-members)). Each bot needs about 400 MB of memory.

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

Keep a private copy of `data/templates/` (about 6 KB compressed for 6 templates), and never put it in the public repository. Make the archive after every capture:

```bash
tar -czf battle-templates.tar.gz -C data templates
```

To restore it on this machine or on a server, run the following from the folder that holds `data/`, then restart the server, which loads templates only at start:

```bash
mkdir -p data && tar -xzf battle-templates.tar.gz -C data
```

With Docker, extract it into the `./data` folder that `compose.yaml` mounts, then run `docker compose restart`. When a match starts, the log shows `table uses template <name>`. A template the server can't use is skipped at start with a `battle template <name> skipped` warning.

If no archive is left, capture the templates again with the steps above. That needs Windows, the Visual Studio x86 tools and the Java client. Keep the `trace.log` and `<outdir>` from each capture session as well: `import-all.js` rebuilds the templates from them without playing the battles again.

## Point the Java client at the server

Pass the server address with `-gw` in the game's start command:

```bat
.\jre\bin\java.exe -jar ResetGeneration.jar -gw 127.0.0.1
```

Alternatively, map `resetgeneration-gw.arena.n-gage.com` to the server's IP address in the hosts file. This works with the unmodified start scripts.

The `-username <name> -password <pw>` flags prefill the login screen and write a client debug log (`applet_<name>_*.txt`) to the game folder.
