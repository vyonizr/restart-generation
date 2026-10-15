# A replacement Arena server for unmodified clients

The game's online play depended on two services that are shut down: Nokia's SNAP Mobile gateway for N-Gage Arena, and RedLynx's CasinoSystem game server. The server in `server/` reimplements both protocols, so the original game runs as shipped: the Java client reaches the server through its own `-gw` flag or a hosts-file entry, and the engine is never modified. This follows the project's goal of reviving the abandoned game's online play faithfully, and it keeps every existing copy of the game working without a patch.

## Considered options

- **Patch the clients to use a simpler protocol.** Rejected because the CasinoSystem and battle protocols live in the native engine, so a patch would mean modifying the engine in every copy. The patched client would still need a server for matchmaking and battles.

## Consequences

- The browser client's SNAP code, `web/snap.js`, was written for this project from docs/protocol.md, so the engine sees the original protocol in both clients.
- The server must send only what the original clients accept. `docs/re/re_friends.md` lists messages that crash the client.
- Rules of the original server that left no trace in the clients are invented. The fame rules in `server/casino.js` are an example.
