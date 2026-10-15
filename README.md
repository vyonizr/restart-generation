# Reset Generation revival server

A replacement for the dead Nokia N-Gage Arena (SNAP Mobile) backend used by the standalone Java build of Reset Generation (RedLynx, 2009).

Status: the game runs in the browser. The original engine (a 32-bit Windows DLL) runs unchanged in a JavaScript x86 emulator, and the server restores login, stats, rankings, achievements, friends, ranked Quick Match (2-4 players), friendly rooms, and server-hosted battles. See `docs/protocol.md` for the protocol, `docs/adr` for the architecture decisions, `docs/re` for the reverse-engineering notes and how to regenerate the analysis, and `web/emu` for the emulator.

## Play in the browser

1. Set `RG_GAME` to your copy of the game: either `ResetGeneration-Standalone.zip` or the extracted `ResetGeneration` folder (the one with `ResetGeneration-Win32-Web.dll` and the `.pak` files).
2. Run `node server/gateway.js`.
3. Open `http://localhost:8080/` and press **Start**.

```sh
RG_GAME="D:/Downloads/ResetGeneration-Standalone.zip" node server/gateway.js
```

If you don't set `RG_GAME`, the page asks for the game files instead, as described in [Host the page without the game files](#host-the-page-without-the-game-files). The dev tools in `web/tools` read the game from `RG_GAME` too.

Controls: arrow keys move, **Ctrl** or **Enter** selects (hold to drop a block), **Shift** goes back, **Esc** opens the menu. On a phone or tablet, the touch pad under the game screen does the same: the D-pad moves, **Select** selects (hold to drop a block), **Back** goes back, **Menu** opens the menu, and **Keyboard** raises the device's keyboard for typing. To play online, choose **Online** in the main menu. The page logs in with a guest name (such as `Guest123456`) that it creates once and keeps in the browser's local storage, so your stats carry over between visits. If the server rejects the guest login, the page shows a login dialog instead; a new player name is registered on first login. Settings and achievements are also kept in local storage.

The server sends the game files to the browser, so serve only a copy you own. To let other devices and people play, run the server with `--lan`, as described in [Play on other devices](#play-on-other-devices).

### Host the page without the game files

If the page's host has no game files at `game/` (for example, `web/` deployed to a static host), the page asks each player to choose their own copy of the game: `ResetGeneration-Standalone.zip`, or the extracted `ResetGeneration` folder or the folder above it. The page keeps the files in the browser's IndexedDB, so a player chooses them once per browser. The files never leave the player's computer.

Players need the files of the Windows standalone build. The emulator runs `ResetGeneration-Win32-Web.dll` and can't run the Mac library `libResetGenerationMacApplet.dylib`, but it runs in any desktop browser on any operating system.

## Play on other devices

A phone, tablet or other computer on the same network can play the game that your PC serves.

1. Run the server with `--lan`:

   ```sh
   RG_GAME="D:/Downloads/ResetGeneration-Standalone.zip" node server/gateway.js --lan
   ```

   The server prints one `http://<address>:8080/` line per network address, labelled with the network's name.
2. On the other device, open the address of the network both devices share, such as `http://192.168.1.20:8080/`.

Both devices must be on the same private network, such as your home Wi-Fi. Without `--lan`, the server accepts connections from your PC only. The same option lets friends play over the internet if they can reach your PC on ports 8080 (the page) and 8976 (the Java client).

If the other device can't connect, Windows Firewall is probably blocking it. To allow the two ports on private networks, run this command in PowerShell as an administrator:

```powershell
New-NetFirewallRule -DisplayName "Reset Generation" -Direction Inbound -Protocol TCP -LocalPort 8080,8976 -Action Allow -Profile Private
```

If Windows lists your network as public, set it to private in Windows Settings, or the rule doesn't apply.

Phones and tablets play in portrait, with a touch pad under the game screen; a keyboard attached to a tablet also works. A `.zip` you choose on the device stays in its browser. Safari can delete it after about 7 days without a visit, and the page then asks for it again.

## Run the server

Requires Node.js 18 or later.

```sh
node server/gateway.js
```

The gateway listens on TCP port 8976 and serves the page on port 8080. Both accept connections from this PC only, unless you add `--lan` (see [Play on other devices](#play-on-other-devices)). To use a different port, set the `PORT` environment variable. Accounts are created on first login and stored in `data/accounts.json`.

Self-checks:

```sh
node server/snap.test.js
node server/gateway.test.js
node server/battle.test.js
node server/gameblob.test.js
```

`battle.test.js` needs a battle template, and `gameblob.test.js` needs raw captures in `RG_CAPTURES`.

## Battle templates

The server hosts battles with a level template captured from the game engine, stored in `data/templates/`. Matchmaking waits until a template with one castle per seat exists. To capture one on Windows:

1. Build the capture tool with the Visual Studio x86 tools: `cl /O1 tools\rgtrace\rgtrace.c`.
2. Start the game, then run `rgtrace <java.exe pid> <outdir> > trace.log`.
3. In the game, start an Arcade Mode battle with one opponent.
4. Quit the battle and repeat; each Arcade battle uses a random map, and the opponent count sets the player count.
5. Run `node tools/rgtrace/import-all.js trace.log <outdir>`. It imports every new level into `data/templates/` and skips ones already there. Restart the server to use them.

The game has 6 maps, each in a 2-, 3- and 4-player version (18 levels).

## Point the Java client at the server

Pass the server address with `-gw` in the game's start command:

```bat
.\jre\bin\java.exe -jar ResetGeneration.jar -gw 127.0.0.1
```

Alternatively, map `resetgeneration-gw.arena.n-gage.com` to the server's IP address in the hosts file. This works with the unmodified start scripts.

The `-username <name> -password <pw>` flags prefill the login screen and write a client debug log (`applet_<name>_*.txt`) to the game folder.
