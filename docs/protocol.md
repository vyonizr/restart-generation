# Reset Generation online protocol

Reset Generation (web/standalone build, 2009) talks to three layers:

1. **SNAP Mobile 1.4.4 gateway**: login, lobby, game rooms, buddy list, and an event long-poll. Implemented in `lib/rg-signed.jar` (`com.nokia.sm.*` plus obfuscated classes). Original host: `resetgeneration-gw.arena.n-gage.com`.
2. **RedLynx MT / NAF framework**: a message layer inside the native DLL (`MT_PING`, `MT_PONG`, `MT_GAMESERVER`, `MT_GAMEROOM`, `MT_USER`, `MT_HOSTMIGRATION`, `MT_SERVICE_DISCOVERY`, `MT_STATS_AUTH`). Its payloads travel inside SNAP game packets.
3. **CasinoSystem game server**: RedLynx's matchmaking, rankings, and friends service (`CASINOSYSTEM_LOGIN`, `CASINO_MATCHMAKING`, `CASINO_MATCHED_UP`, `GET_RANKINGS`, and so on). The Java side never sees these messages.

Layers 1 and 2 are recovered and verified against the live client. Layer 3 works from login through seating at a match table; match start and in-match traffic are still being reversed from `ResetGeneration-Win32-Web.dll`.

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
  - Bits 36 to 59 mark scrambled params (P1 is bit 36). A scrambled param is base64 of `rotr(b, k & 7) ^ k` per byte, with `k` cycling through one of 16 fixed 32-byte keys selected by `K`. Only the login password uses this.
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

After seating, both clients show "Players in Match … Waiting for Players…". The message that starts the match is still being reversed.
