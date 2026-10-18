# Reset Generation online protocol

Reset Generation (web/standalone build, 2008) talks to three layers:

1. **SNAP Mobile 1.4.4 gateway**: login, lobby, game rooms, buddy list, and an event long-poll. Implemented in `lib/rg-signed.jar` (`com.nokia.sm.*` plus obfuscated classes). Original host: `resetgeneration-gw.arena.n-gage.com`.
2. **RedLynx MT / NAF framework**: a message layer inside the native DLL (`MT_PING`, `MT_PONG`, `MT_GAMESERVER`, `MT_GAMEROOM`, `MT_USER`, `MT_HOSTMIGRATION`, `MT_SERVICE_DISCOVERY`, `MT_STATS_AUTH`). Its payloads travel inside SNAP game packets.
3. **CasinoSystem game server**: RedLynx's matchmaking, rankings, and friends service (`CASINOSYSTEM_LOGIN`, `CASINO_MATCHMAKING`, `CASINO_MATCHED_UP`, `GET_RANKINGS`, and so on). The Java side never sees these messages.

All three layers are recovered and verified against the live client: login, friends, ranked matchmaking, friendly rooms, and server-hosted battles.

## Client configuration

From `rg.ResetGeneration`:

| Setting | Value | Override flag |
| --- | --- | --- |
| Gateway host | `resetgeneration-gw.arena.n-gage.com` | `-gw <host>` |
| Connectors | `tcp,http:80` (TCP port defaults to 8976) | none |
| Lobby name | `resgen` | none |
| Game class | `42713` | `-gc <n>` |
| Credentials | Java login screen | `-username <u> -password <p>` (also enables the `applet_<user>_*.txt` debug log) |

Usernames must match `^[A-Za-z0-9_]{1,15}$` (`SMArenaValidator`).

On a server with Discord sign-in (ADR 0011) the password of `extendedLogin` carries the guest's or member's token, and the login is refused (error 965) unless the token belongs to the account named in P1. Without Discord sign-in the password is ignored (ADR 0009). A bot logs in with its own in-process key in the same slot (ADR 0008).

## TCP framing (class `ah`, `q`, `e`)

Every frame has a 20-byte big-endian header:

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 4 | Magic `0x534D4F42` (`SMOB`) |
| 4 | 1 | `0` |
| 5 | 1 | Type |
| 6 | 2 | Sequence number |
| 8 | 4 | `0` |
| 12 | 4 | `0` |
| 16 | 4 | Payload length |

| Type | Direction | Meaning |
| --- | --- | --- |
| 0 | client to server | Hello. The client waits up to 20 s for any non-5 frame with the same sequence number. |
| 4 | client to server | Request. |
| 5 | server to client | Response. Must carry the request's sequence number. |
| 7 | client to server | Heartbeat. Sent every `stat` seconds (default 2). Needs a reply with the same sequence number within 20 s. |

The server answers hello with type 1 and heartbeat with type 8. The client only checks the sequence number.

## Requests (class `i`, `p`)

The payload is a form string that is **not** URL-encoded:

```
R=<request id>&A=<acked ids>&V=1.4.4&S=<session id>&K=<key 0-15>&C=<command>&P1=...&P2=...
```

- `R` is a global counter. The client resends the same `R` on timeout, so the server should cache replies by `R`.
- `S` is omitted before login.
- A per-command flag table decides the encoding of each `Pn`:
  - Bits 12 to 35 mark base64 params (P1 is bit 12).
  - Bits 36 to 59 mark scrambled params (P1 is bit 36). A scrambled param is base64 of `rotr(b, k & 7) ^ k` per byte, with `k` cycling through one of 16 fixed 32-byte keys selected by `K`. Only the login password uses this. This server doesn't decode it and the key table is not reproduced here (ADR 0018).
  - Bit 11 (`0x800`) selects the long timeout (35 s + 5 s) instead of the short one (15 s + 5 s).

## Responses (class `r`)

```
<code> <message>\n
<fields separated by | or , or \n>
```

`200` is success. A list field is one row per line, ending at an empty line or the end of the body. Field prefixes in the client tables decide decoding: `*` int, `%` long, `!` boolean, `#` base64 UTF-8 string, `+` base64 bytes, `?` scrambled.

An optional `[set]RRLLSSDDCCTT` line after the status line overrides retry timing (all hex bytes: `rtry`, `ltim`, `stim`, `dlay`, `count`, `stat`).

## Commands used by the game

| C | Name | Params | Response fields |
| --- | --- | --- | --- |
| 0 | init | none | none |
| 1 | extendedLogin | P1 user, P2 password (scrambled), P5 game class, P9 `1`, P10 presence (base64), P11 `0`, P13 locale, P14 SKU | `webSessionID|impsSessionID|snapSessionID|snapUserID`, then buddy list, then message list |
| 2 | unifiedLogout | none | none |
| 3 | retrieveAllEvents (long poll) | P1 min events | one event per line, see below |
| 109 | joinLobby | P1 lobby id, P2 password | none |
| 116 | createGameRoom | P1 name, P3 max users (4), P4 `1` | `gameRoomID` |
| 117 | joinGameRoom | P1 room id | none. Error 708 also counts as joined. |
| 118 | leaveGameRoom | none | none |
| 125 | getGameRooms | P1 lobby id | rows `id|name|numClients|numPlayers|maxUsers|status` |
| 126 | getLobbies | none | rows `id|name|numUsers|numRooms` |
| 129 | findUsers | P1 name, P2 max | rows `userID|userName|lobbyID|gameRoomID|#property` |
| 133 | sendGamePacketToGameServer | P1 bytes (base64) | none |
| 302 | getBuddyList | none | rows `id|name|status` (`to` = sent request, `from` = received request) |
| 305 | setPresence | P1 availability, P2 presence | none |
| 306 to 309 | request, accept, decline, remove buddy | P1 user name | none |

Login order: `C=0`, `C=1`, `C=126` (find `resgen`), `C=109`. The native code then joins the `CasinoSystem` room with `C=125` and `C=117`. It never creates that room, so the server must provide it.

## Events (`C=3` response lines)

`<event id>|<fields>`. The client acts on:

| Id | Fields | Effect |
| --- | --- | --- |
| 117 | `from|+gameData` | Passed to native `onDataReceived` if the client is in a game room. All game traffic arrives this way. |
| 307 | `fromID|fromName|availability|*gameClassID|snapUserID|lobbyID|gameRoomID|*matchMode|!inPublicChat|!inPrivateChat|!inGame|#presence` | Friend presence. |
| 308 | `fromUserID|fromUserName|#message` | Friend request received. |
| 309 | `fromUserID|fromUserName|*accepted|#message` | Friend request answered. |
| 310, 311 | `fromUserID|fromUserName` | Friend removed. |

An empty `200 OK` poll response is valid and makes the client poll again at once.

## MT transport (inside SNAP game packets)

Recovered from the DLL (Windows build, plus class names from the Mac build's type info). Verified against the live client.

Each SNAP room is one point-to-point connection between a client and the server. Client-to-server bytes arrive as command 133. Server-to-client bytes go out as event 117 in the same room. Messages carry no addresses.

### Framing (DataFragmenter)

The byte stream is a sequence of frames: `u16 LE hdr = (index << 10) | len`, followed by `len` bytes (at most 874). A message is either one frame with index 0, or frames numbered 1, 2, … where the last one is renumbered 0. Frames can be split or joined across SNAP packets.

A reassembled message is `u8 type` followed by the body. All integers are little-endian.

| Type | Meaning | Direction |
| --- | --- | --- |
| 1 | PING | both |
| 2 | PONG | both |
| 3 | Hello "Message" (key/value block) | client to server |
| 0x0C | Ping config `[u32 timeout_ms][u32 interval_ms]` | server to client |
| 0x11 | CasinoSystem messages | both |
| 0x15 | Table (in-match) messages | both |

### Connecting

The client's socket counts as connected only after it receives its first packet in the room. Until then it drops every send, and it gives up after 80 s. So the server must speak first:

1. After `joinGameRoom("CasinoSystem")`, the server sends `PING [u32 20000]` (`05 00 01 20 4E 00 00`).
2. The client answers `PONG [00]`, then sends a type 3 hello and a casino login request.
3. The client sends `PING [u32 20000]`, which needs `PONG [00]` within 20 s. After that it sends `PING [u8 seq]` every 25 s, and each one needs `PONG [seq]`. A missing pong closes the connection.

### Serialization

- `mt::String`: `u32 hdr` (bits 28 to 30 give the encoding: 0 = 8-bit, 2 = UTF-16LE), `u32 len`, `u32 count`, then the bytes, with no terminator.
- Hello Message: `u8 n` key/value string pairs, `u8 n` `{u8 key, string}` entries, `u8` flag plus optional address, `u8` flag plus optional object. Observed keys: `name`, `pid`, `passwd`, `roomname`.
- Casino header: `u16 = kind | code << 8`. Kind 0 is a request, 1 a response, 2 an event.

Observed casino login request (kind 0, code 0): `u32 1`, then the string `Reset Generation v. 1.1.3`.

## CasinoSystem

Casino messages ride on MT types `0x11` (system: login, stats, rankings, friends), `0x12` (ranked casino), `0x13` (friendly casino) and `0x15` (table). The server replies on the same MT type as the request. Every message starts with `u8 kind` (0 request, 1 response, 2 event) and `u8 action`. A response continues with `u8 result, u32 value`. An event continues with a String subject, usually the player id as decimal text.

Building blocks:

- **Profile**: `u32 n`, then `n` pairs of String key and String value. Keys: `id` (decimal), `name`, `fame`, `fameLevel`, `heroType`, `random`. The matchmaking screen crashes if a listed profile lacks `fameLevel`.
- **CasinoInfo**: `u8 type` (1 ranked, 2 friendly), `u32 id`, `u32 inLobby`, `u32 waiting`, `u32 playing`, String name.
- **StatsRecord**: String name, then `i32` fameLevel, fame, highest fame (inferred from the UI), rank, totalMatches, wins, rescues, favouriteHero, unknown, then two `u32`-counted `i32` lists (play points, belts).
- **TableDescriptor**: String id, String name, `u8` players, `u8` max players, `i32` skill, then an Address: `u8 0`, `u8` platform (1 = Win32), String URL, `u8` isServer. The client joins the SNAP room named by the URL path, for example `naf://rg.com:80/table_1` joins `table_1`.

Verified flows:

| Step | Client sends | Server replies |
| --- | --- | --- |
| Login | `0x11 00 00 u32 1 String version` | `01 00 RB Profile u8 1 CasinoInfo(ranked)` |
| Stats | `0x11 00 05 u32 0` | `01 05 RB StatsRecord` |
| Rankings | `0x11 00 04 u32 0` | `01 04 RB` plus 3 StatsRecord lists (top 10, friends, near you) |
| Achievements | `0x11 00 06` plus 48 bytes | `01 06 RB` plus 200 bytes |
| Friendly list | `0x11 00 07 u32 0` | `01 03 RB u8 0` (F_CASINO) |
| Register friends | `0x11 00 21 u8 n Strings` | `01 21 RB` |
| Enter ranked | `0x12 00 08 u32 casinoId` | `01 08 RB Profile CasinoInfo` |
| Matchmaking | `0x12 00 09 String heroType String random` | `01 09 RB u8 n Profiles` (players already waiting) |
| Matched | none | event `02 1f String id TableDescriptor` to each player |
| Seat | `0x15 00 0d u32 playerId` in the table room | `01 0d RB`, plus event `02 0d String id` to the other members |

`RB` = `00 00000000`.

Matching also sends `LOCK_PLAYER_IN_GAME` (`0x11 00 1d u32 0`) before `MATCHED_UP`, so the lobby shows "Game starting" and the player can't back out.

## Friends

The friend list lives in the SNAP layer. `C=302` returns rows `id|name|status` (`to` = request sent, `from` = request received, `both` = friend). The client shows every listed friend as offline until it gets event 307 with availability `available`, `unavailable` or `away` (any other value breaks its menu). The native code never sends `setPresence`, so the server pushes 307 to a user's friends at login and logout, and sends a new user the presence of online friends about 1 s after its `C=302` reply (sooner and the client overwrites it). Requests use `C=306` to `C=309` and events 308, 309 and 311.

CasinoSystem receives `REGISTER_FRIENDS`, `FRIEND_ADD` and `FRIEND_REMOVE` (`0x11 00 21/24/23`) only as information; none needs a reply.

## Friendly rooms

The Online menu item **Create Room** needs at least one entry in the friend list.

| Step | Client sends | Server sends |
| --- | --- | --- |
| Create | `0x11 00 14 u32 0` | `01 14 RB CasinoInfo` with type 2, a new id (never 1), and the host's name. Friends get event `0x11 02 15 String id CasinoInfo String name` and see a menu entry named after the host. |
| List | `0x11 00 07 u32 0` | `01 03 RB u8 n` plus `n` CasinoInfos of rooms hosted by friends. It replaces the client's whole list. |
| Poll | `0x11 00 19 u32 id` every 6 s | `01 19 RB u32 id, inLobby, waiting, playing`, or `01 25 00 u32 id` (CASINO_NOT_FOUND) once the room is gone |
| Enter | `0x13 00 08 u32 id` | `01 08 RB Profile CasinoInfo`, plus event `02 08 String id Profile` to the members |
| Pick hero | `0x13 00 09 String heroType String random` | `01 09 RB u8 n Profiles`, plus event `02 09 String id Profile` to the members. This list is the lobby. |
| Start | `0x11 00 1c u32 id` from any member | `01 1c RB`, then `LOCK_PLAYER_IN_GAME` and `MATCHED_UP` (on `0x13`) to the lobby players, as in ranked. `01 1c 01 00000000` shows "matchmaking failed". |
| Leave | `0x13 00 0a` / `00 0b` | `01 0a` / `01 0b`, plus event `02 0a String id` to the members. An empty room closes, and friends get event `02 16` (FRIENDLY_CASINO_LEFT). |

Friendly battles don't change fame or ranked stats.

## Battle

In the ranked arena the server is the battle host (the original ran the engine's `ServerBattleLogic` as player 0). Clients only run `ClientBattleLogic`. All battle traffic is MT type `0x16` in the table room: one zlib stream (any level) per message, holding one GameMessage.

### GameMessage

Header, all `s32` little-endian: `seq, reliable, type, sender, n, n x recipient, team, turn, phase, hash, unknown`. The server is sender 0 with recipients `[0]`. `hash` can be 0 (no state check). The body depends on the type:

| Type | Name | Body |
| --- | --- | --- |
| 0 | InitGameData | `u32 len`, `len` bytes |
| 1 | BattleBegin | none |
| 3-6, 8, 13, 16 | Orders (move, cannon, tile, attack, point, ignored, special skill) | opaque to the server |
| 7 | EndTurn | none |
| 9 | EndTurnRequest | none (uses header turn and phase) |
| 10 | EndGame | `s32 reason`: 0 quit, 1 surrender, 2 disconnect, 3 sync error |
| 12 | PlayerJoined | `s32 index, s32 team, u8 1, String name, s32 heroId, s32 -1, u8 random, Hero, s32 3` |
| 14 | MessageAccepted | `s32 ackSeq, s32 ackSender` |
| 15 | Chat | text, not reliable |

### Joining a table

After the `SEAT_TAKE` response, per player:

1. Server sends InitGameData: Game blob plus `s32 1`. The Game holds the level, rules, heroes, and the RNG state (`server/gameblob.js`). It must have no join infos.
2. Client sends InitGameData: its JoinInfo (`s32 type, s32 slot, s32, s32, String name, u8 random, Hero`).
3. Server sends InitGameData: `s32 index, s32 team`. Index and team are equal: a seat number picked at random among the table's free ones, so a player's castle, colour (the client uses `(team - 1) % 6`) and place in the turn order vary from battle to battle.
4. Server sends InitGameData: the pre-join snapshot (starts `0xDEADBEEF`), `u32 n`, then the `n` reliable messages sent so far.
5. Server sends PlayerJoined for the new player to everyone.

When every seat is filled, or 40 s have passed with at least 2 players, the server sends BattleBegin. The battle starts in turn 1, phase 2.

### During the battle

- The server acks every reliable client message with MessageAccepted to the sender and forwards the message unchanged to the other players, in one global order. EndGame reason 3 is forwarded as 2.
- EndTurnRequest is never forwarded. Interactive phases are 2 (place tiles, all players at once), 4 (hero turns, ascending team), and 5 (cannons, all at once). Phases 1, 3, 6, and 7 advance by themselves. The server sends EndTurn with the current turn and phase to everyone once every living player has finished phase 2 or 5, or when the current player ends their phase 4 turn. A player finishes phase 2 with one PlaceTile, and phase 5 after sending one FireCannon per cannon (`NumberOfCannonsInCastle`). An EndTurnRequest also finishes either phase; clients send it only when their local phase timer runs out. EndTurn for any other turn or phase is dropped by the clients and stalls the battle.
- The server cannot see defeats, so silence stands in for them. A bot that has sent nothing 15 s into phase 2 or 5 is done (a defeated bot sends nothing). A person is presumed defeated, and not waited for, once they sent nothing for a whole turn (at once in phases 2 and 5, after 15 s in phase 4), or 30 s into a phase if they sat out the previous phase 2 or 5 (no order, or cannon shots still owed) or the clients skipped them in this turn's phase 4. A defeat still costs one forced phase, the first one where nothing yet shows it: 50 s, or 60 s in phase 5 and 3 minutes in the other phases on a relaxed table. In phase 4, a leaver who held the last turn moves the server to phase 5 at once, as it did the clients.
- Each interactive phase has a time limit in the Game blob (20 s in the captured levels). The server forces EndTurn 30 s after it.
- A player who drops out is reported to the others as EndGame reason 2 with the leaver as sender. EndGame with sender 0 would make every client believe it won.
- Clients decide the winner themselves and upload nothing. When the battle ends, each client sends `SEAT_LEAVE` on `0x15` and logs in to CasinoSystem again. The server scores the last player standing, else the player who made the final move.

### Level templates

The server can't build a Game or snapshot from the level files yet, so it uses captures from the engine. `tools/rgtrace` attaches to a running client, makes `ServerBattleLogic` serialize its Game during an Arcade battle, and dumps the Game and the snapshot. `tools/rgtrace/import-template.js` turns a capture into `data/templates/<name>.game` and `.snap`. A table uses a random template with one castle per seat. Each table gets a new battle seed, written into the RNG of the Game blob and into the snapshot's copy of it (the 56 bytes `s32 i, s32 j, s32 11, 11 x u32`, found in the snapshot's battlefield section by its bytes). A template whose snapshot doesn't hold that RNG exactly once is skipped at load. Each table also gets a random `Environment` (the Game's `s32` at +0x120: 0 space, 1 clouds and grass, 2 speedball, 3 soccer, 4 racetrack). The map files name none, so the engine draws one, and a capture only holds the draw it got. The snapshot holds nothing of it: captures with different environments have the same snapshot apart from the RNG.

## Browser endpoints

Besides SNAP at `POST /snap`, the HTTP server answers these, which only this server's own page uses.

| Request | Reply |
| --- | --- |
| `GET /status` | `{ accounts, servesGame, unlockAll, invite, online, waiting }`: whether Discord sign-in is on, whether the server sends the game files itself (`RG_GAME` is set), whether the page opens every story and hero from the start (true unless the server is `--public`, ADR 0007), the admin's Discord invite link, players online (bots excluded) and waiting in the ranked Quick Match. |
| `GET /bots` | `{ available }`: whether the server can run bots. |

With Discord sign-in on (otherwise `/auth/*` is 404), a token travels as `Authorization: Bearer <token>`:

| Request | Reply |
| --- | --- |
| `POST /auth/guest` | `{ name, token }` for a new guest. 429 when the client address made too many in the last hour, 503 when the server holds its cap. |
| `GET /auth/me` | `{ name, kind, fame }`, 401 for an unknown or expired token. Using a member's token pushes its expiry out to 90 days. |
| `POST /auth/discord/start` | `{ url }`, the Discord page. A guest's token binds that guest to the sign-in. |
| `GET /auth/discord/callback` | Where Discord returns. Redirects to `/#signin=<code>` or `/#signin-error=<reason>`. |
| `POST /auth/exchange { code }` | `{ status: 'name', suggested }`, `{ status: 'confirm', name, guestFame }`, or `{ status: 'done', name, token }`. 404 when the code is unknown or older than 10 minutes. |
| `POST /auth/finish { code, name?, confirm? }` | `{ name, token }`. 422 `invalid`, `reserved` or `taken` for a name, 409 `confirm` when a guest with progress would be dropped. |
| `POST /auth/signout` | 204, and the token stops working. |
| `POST /auth/delete` | 204, and the account, its links, its saved game and its tokens are gone. |
| `GET /auth/saves` | `{ files: { <name>: <base64> } }`, a member's saved game (ADR 0014). 403 `members_only` for a guest, 401 for an unknown token. |
| `PUT /auth/saves/<name>` | The file's bytes as the body (`application/octet-stream`); 204. The name is `<letters, digits, _ or ->.<1 to 6 letters or digits>`, else 400. 413 over 256 KB a file, 1 MB or 16 files in all, and the account keeps what it held. |
| `DELETE /auth/saves/<name>` | 204, whether or not the file existed. |

With `RG_ADMIN_TOKEN` set (otherwise every `/admin/` path is 404), the admin's account delete (ADR 0016) takes it as `Authorization: Bearer <token>`, answering 401 for a missing or wrong one. Caddy answers 404 for these paths, so only `npm run delete-user` reaches them, from inside the container or on the host. Each request names one account with `name` or, on a server with Discord sign-in, `discord`:

| Request | Reply |
| --- | --- |
| `GET /admin/account?name=<name>` or `?discord=<id>` | `{ name, kind, fame, matches, friends, files, online }`. 400 `name_or_discord` unless exactly one is given, 404 `no_account`, 422 `no_discord` for `discord` on a server without Discord sign-in. |
| `DELETE /admin/account?name=<name>` or `?discord=<id>` | 204, and the account, its links, its saved game and its tokens are gone and its sessions ended. The same errors as above. |
