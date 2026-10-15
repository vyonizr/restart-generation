# Reset Generation revival server

A replacement for the dead Nokia N-Gage Arena (SNAP Mobile) backend used by the standalone Java build of Reset Generation (RedLynx, 2009).

Status: SNAP gateway login, lobby, and game rooms work. The native CasinoSystem protocol (matchmaking, rankings, friends) is still being reversed. See `docs/protocol.md`.

## Run the server

Requires Node.js 18 or later.

```sh
node server/gateway.js
```

The gateway listens on TCP port 8976. To use a different port, set the `PORT` environment variable. Accounts are created on first login and stored in `data/accounts.json`.

To check the protocol codec:

```sh
node server/snap.test.js
```

## Point the game at the server

Pass the server address with `-gw` in the game's start command:

```bat
.\jre\bin\java.exe -jar ResetGeneration.jar -gw 127.0.0.1
```

Alternatively, map `resetgeneration-gw.arena.n-gage.com` to the server's IP address in the hosts file. This works with the unmodified start scripts.

The `-username <name> -password <pw>` flags prefill the login screen and write a client debug log (`applet_<name>_*.txt`) to the game folder.
