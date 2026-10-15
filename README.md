# Reset Generation revival server

A replacement for the dead Nokia N-Gage Arena (SNAP Mobile) backend used by the standalone Java build of Reset Generation (RedLynx, 2009).

Status: login, stats, rankings, achievements, ranked Quick Match, and 1-vs-1 ranked battles hosted by the server work with the real client. Friendly arenas, the friends list, and 3-4 player tables are not implemented yet. See `docs/protocol.md`.

## Run the server

Requires Node.js 18 or later.

```sh
node server/gateway.js
```

The gateway listens on TCP port 8976. To use a different port, set the `PORT` environment variable. Accounts are created on first login and stored in `data/accounts.json`.

Self-checks:

```sh
node server/snap.test.js
node server/battle.test.js
node server/gameblob.test.js
```

`battle.test.js` needs a battle template, and `gameblob.test.js` needs raw captures in `RG_CAPTURES`.

## Battle templates

The server hosts battles with a level template captured from the game engine, stored in `data/templates/`. Matchmaking waits until a template with one castle per seat exists. To capture one on Windows:

1. Build the capture tool with the Visual Studio x86 tools: `cl /O1 tools\rgtrace\rgtrace.c`.
2. Start the game, then run `rgtrace <java.exe pid> <outdir> > trace.log`.
3. In the game, start an Arcade Mode battle with one opponent.
4. Run `node tools/rgtrace/lengths.js trace.log <outdir>\lengths.txt` to list the captures.
5. Import the `Game::write` capture taken at `ServerBattleLogic init` and the snapshot right after it:
   `node tools/rgtrace/import-template.js <outdir>\NN_game.bin <outdir>\MM_snapshot.bin <name>`.

Each Arcade battle uses a random level, so repeat to collect more levels.

## Point the game at the server

Pass the server address with `-gw` in the game's start command:

```bat
.\jre\bin\java.exe -jar ResetGeneration.jar -gw 127.0.0.1
```

Alternatively, map `resetgeneration-gw.arena.n-gage.com` to the server's IP address in the hosts file. This works with the unmodified start scripts.

The `-username <name> -password <pw>` flags prefill the login screen and write a client debug log (`applet_<name>_*.txt`) to the game folder.
