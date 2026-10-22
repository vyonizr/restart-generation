# Reset Generation online protocol

Reset Generation (the 2008 web and standalone build) talks to three layers:

1. **SNAP Mobile 1.4.4 gateway**: login, lobby, game rooms, buddy list, and an event long-poll. The client side is in the game's own `lib/rg-signed.jar` file (`com.nokia.sm.*` plus obfuscated classes). Original host: `resetgeneration-gw.arena.n-gage.com`.
2. **RedLynx message layer**: the engine's message layer (MT, after its `mt` C++ namespace), with a transport named NAF after the `naf://` addresses it connects to. Its message types include `MT_PING`, `MT_PONG`, `MT_GAMESERVER`, `MT_GAMEROOM`, `MT_USER`, `MT_HOSTMIGRATION`, `MT_SERVICE_DISCOVERY`, and `MT_STATS_AUTH`. Its payloads travel inside SNAP game packets.
3. **CasinoSystem**: RedLynx's game service for matchmaking, rankings, and friends (`CASINOSYSTEM_LOGIN`, `CASINO_MATCHMAKING`, `CASINO_MATCHED_UP`, `GET_RANKINGS`, and others). The Java side never sees these messages.

All three layers are recovered and verified against the live client: login, friends, ranked matchmaking, friendly rooms, and server-hosted battles.

## Client configuration

The Java client's `rg.ResetGeneration` class holds the following connection settings and the flags that override them:

| Setting | Value | Override flag |
| --- | --- | --- |
| Gateway host | `resetgeneration-gw.arena.n-gage.com` | `-gw HOST` |
| Connectors | `tcp,http:80` (TCP port defaults to 8976) | None |
| Lobby name | `resgen` | None |
| Game class | `42713` | `-gc GAME_CLASS` |
| Credentials | Java login screen | `-username USERNAME -password PASSWORD` (also turns on the `applet_USERNAME_*.txt` debug log) |

In the flags, `HOST` is the gateway's hostname, `GAME_CLASS` is a game class number, and `USERNAME` and `PASSWORD` are the Arena credentials.

Usernames must match `^[A-Za-z0-9_]{1,15}$` (`SMArenaValidator`).

On a server with Discord sign-in ([architecture decision record (ADR) 0011](adr/0011-guests-and-members-with-discord-sign-in.md)), the password of `extendedLogin` carries the guest's or member's token, and the server refuses the login (error 965) unless the token belongs to the account named in P1. Without Discord sign-in, the server ignores the password ([ADR 0009](adr/0009-a-name-is-the-whole-identity.md)). A bot logs in with its own in-process key in the same parameter ([ADR 0008](adr/0008-the-server-runs-bots-as-headless-engine-clients.md)).

## TCP framing

The Java client's classes `ah`, `q`, and `e` handle TCP framing. Every frame has a 20-byte big-endian header:

| Offset | Size | Field |
| --- | --- | --- |
| 0 | 4 | Magic `0x534d4f42` (`SMOB`) |
| 4 | 1 | `0` |
| 5 | 1 | Type |
| 6 | 2 | Sequence number |
| 8 | 4 | `0` |
| 12 | 4 | `0` |
| 16 | 4 | Payload length |

The type byte takes the following values:

| Type | Direction | Meaning |
| --- | --- | --- |
| 0 | Client to server | Hello. The client waits up to 20 s for a frame with the same sequence number and any type other than 5. |
| 4 | Client to server | Request. |
| 5 | Server to client | Response. Must carry the request's sequence number. |
| 7 | Client to server | Heartbeat. Sent every `stat` seconds (default 2; see `[set]` in [Responses](#responses)). Needs a reply with the same sequence number within 20 s. |

The server answers hello with type 1 and heartbeat with type 8. The client only checks the sequence number.

## Requests

The Java client's classes `i` and `p` build requests. The payload is a form string without URL encoding:

```text
R=<request id>&A=<acked ids>&V=1.4.4&S=<session id>&K=<key 0-15>&C=<command>&P1=...&P2=...
```

- `R` is a global counter. The client resends the same `R` on timeout, so the server must answer a repeated `R` with the reply it already sent.
- `S` is omitted before login.
- A per-command flag table decides the encoding of each `Pn`:
  - Bits 12 to 35 mark base64 params (P1 is bit 12).
  - Bits 36 to 59 mark scrambled params (P1 is bit 36). A scrambled param is base64 of `rotr(b, k & 7) ^ k` per byte, with `k` cycling through one of 16 fixed 32-byte keys selected by `K`. Only the login password uses this. This server doesn't decode it, and the key table isn't reproduced here ([ADR 0018](adr/0018-publishing-with-legal-guardrails.md)).
  - Bit 11 (`0x800`) selects the long timeout (35 s + 5 s) instead of the short one (15 s + 5 s).

## Responses

The Java client's class `r` parses responses. A response has the following form:

```text
<code> <message>\n
<fields separated by | or , or \n>
```

`200` is success. A list field is one row per line, ending at an empty line or the end of the body. Field prefixes in the client tables decide decoding: `*` int, `%` long, `!` boolean, `#` base64 UTF-8 string, `+` base64 bytes, `?` scrambled.

An optional `[set]RRLLSSDDCCTT` line after the status line overrides retry timing (all hex bytes: `rtry`, `ltim`, `stim`, `dlay`, `count`, `stat`).

## Commands used by the game

The game sends the following SNAP commands:

| C | Name | Params | Response fields |
| --- | --- | --- | --- |
| 0 | init | None | None |
| 1 | extendedLogin | P1 user, P2 password (scrambled), P5 game class, P9 `1`, P10 presence (base64), P11 `0`, P13 locale, P14 SKU | `webSessionID\|impsSessionID\|snapSessionID\|snapUserID`, then buddy list, then message list |
| 2 | unifiedLogout | None | None |
| 3 | retrieveAllEvents (long poll) | P1 min events | One event per line; see [Events](#events) |
| 109 | joinLobby | P1 lobby id, P2 password | None |
| 116 | createGameRoom | P1 name, P3 max users (4), P4 `1` | `gameRoomID` |
| 117 | joinGameRoom | P1 room id | None. Error 708 also counts as joined. |
| 118 | leaveGameRoom | None | None |
| 125 | getGameRooms | P1 lobby id | Rows `id\|name\|numClients\|numPlayers\|maxUsers\|status` |
| 126 | getLobbies | None | Rows `id\|name\|numUsers\|numRooms` |
| 129 | findUsers | P1 name, P2 max | Rows `userID\|userName\|lobbyID\|gameRoomID\|#property` |
| 133 | sendGamePacketToGameServer | P1 bytes (base64) | None |
| 302 | getBuddyList | None | Rows `id\|name\|status` (`to` = request sent, `from` = request received, `both` = friend) |
| 305 | setPresence | P1 availability, P2 presence | None |
| 306 to 309 | Request, accept, decline, and remove buddy | P1 user name | None |

Login order: `C=0`, `C=1`, `C=126` (find `resgen`), `C=109`. The engine then joins the `CasinoSystem` room with `C=125` and `C=117`. It never creates that room, so the server must provide it.

## Events

Each line of a `C=3` response is one event, `<event id>|<fields>`. The client acts on the following events:

| Id | Fields | Effect |
| --- | --- | --- |
| 117 | `from\|+gameData` | Passed to the engine's `onDataReceived` if the client is in a game room. All game traffic arrives this way. |
| 307 | `fromID\|fromName\|availability\|*gameClassID\|snapUserID\|lobbyID\|gameRoomID\|*matchMode\|!inPublicChat\|!inPrivateChat\|!inGame\|#presence` | Friend presence. |
| 308 | `fromUserID\|fromUserName\|#message` | Friend request received. |
| 309 | `fromUserID\|fromUserName\|*accepted\|#message` | Friend request answered. |
| 310, 311 | `fromUserID\|fromUserName` | Friend removed. |

An empty `200 OK` poll response is valid and makes the client poll again at once.

## MT transport

The MT layer travels inside SNAP game packets. It was recovered from the engine (Windows build, plus class names from the Mac build's type information) and verified against the live client.

Each SNAP room is one point-to-point connection between a client and the server. Client-to-server bytes arrive as command 133. Server-to-client bytes go out as event 117 in the same room. Messages carry no addresses.

### Framing

The engine's `DataFragmenter` cuts the byte stream into frames: `u16 LE hdr = (index << 10) | len`, followed by `len` bytes (at most 874). A message is either one frame with index 0, or frames numbered 1, 2, 3, and onward, where the last one is renumbered 0. Frames can be split or joined across SNAP packets.

A reassembled message is `u8 type` followed by the body. All integers are little-endian. The type byte takes the following values:

| Type | Meaning | Direction |
| --- | --- | --- |
| 1 | PING | Both |
| 2 | PONG | Both |
| 3 | Hello `Message` (key and value block) | Client to server |
| 0x0c | Ping config `[u32 timeout_ms][u32 interval_ms]` | Server to client |
| 0x11 | CasinoSystem messages (login, stats, rankings, friends, friendly rooms) | Both |
| 0x12 | Ranked casino messages | Both |
| 0x13 | Friendly casino messages | Both |
| 0x15 | Table (seat) messages | Both |
| 0x16 | Battle messages: one zlib stream holding one GameMessage | Both |

### Connection handshake

The client's socket counts as connected only after it receives its first packet in the room. Until then, it drops every send, and it gives up after 80 s. So the server must speak first:

1. After `joinGameRoom("CasinoSystem")`, the server sends `PING [u32 20000]` (`05 00 01 20 4e 00 00`).
2. The client answers `PONG [00]`, then sends a type 3 hello and a casino login request.
3. The client sends `PING [u32 20000]`, which needs `PONG [00]` within 20 s. After that, it sends `PING [u8 seq]` every 25 s, and each one needs `PONG [seq]`. A missing pong closes the connection.

### Serialization

- `mt::String`: `u32 hdr` (bits 28 to 30 give the encoding: 0 = 8-bit, 1 = 8-bit with hidden length, 2 = UTF-16LE), `u32 len`, `u32 count`, then the bytes, with no terminator.
- Hello `Message`: `u8 n` key and value string pairs, `u8 n` `{u8 key, string}` entries, `u8` flag plus optional address, `u8` flag plus optional object. Observed keys: `name`, `pid`, `passwd`, `roomname`.
- Casino header: `u16 = kind | action << 8`. Kind 0 is a request, 1 a response, 2 an event.

Observed casino login request (kind 0, action 0): `u32 1`, then the string `Reset Generation v. 1.1.3`.

## CasinoSystem

Casino messages ride on MT types `0x11` (system: login, stats, rankings, friends), `0x12` (ranked casino), `0x13` (friendly casino), and `0x15` (table). The server replies on the same MT type as the request. Every message starts with `u8 kind` (0 request, 1 response, 2 event) and `u8 action`. A response continues with `u8 result, u32 value`. An event continues with a String subject, usually the player id as decimal text.

Messages are built from the following blocks:

- **Profile**: `u32 n`, then `n` pairs of String key and String value. Keys: `id` (decimal), `name`, `fame`, `fameLevel`, `heroType`, `random`. The matchmaking screen crashes if a listed profile lacks `fameLevel`.
- **CasinoInfo**: `u8 type` (1 ranked, 2 friendly), `u32 id`, `u32 inLobby`, `u32 waiting`, `u32 playing`, String name.
- **StatsRecord**: the fields in the following table, then two `u32`-counted `s32` lists (play points, belts).
- **TableDescriptor**: the fields in the TableDescriptor table that follows the StatsRecord table.

A StatsRecord starts with the following fields, in order:

| Field | Type | Meaning |
| --- | --- | --- |
| `name` | String | Player name |
| `fameLevel` | `s32` | Fame level |
| `unknown` | `s32` | Unknown; the server sends 0 |
| `rank` | `s32` | Rank |
| `totalMatches` | `s32` | Matches played |
| `wins` | `s32` | Wins |
| `rescues` | `s32` | Rescues |
| `favouriteHero` | `s32` | Favorite hero |
| `highestFame` | `s32` | Highest fame, inferred from the UI |

A TableDescriptor holds the following fields, in order. The last four make up the table's Address:

| Field | Type | Meaning |
| --- | --- | --- |
| `id` | String | Table id |
| `name` | String | Table name |
| `nplrs` | `u8` | Players |
| `maxplrs` | `u8` | Maximum players |
| `skill` | `s32` | Skill |
| `kind` | `u8` | Address kind, always 0 |
| `platform` | `u8` | Platform (1 = Win32) |
| `address` | String | URL of the table's SNAP room |
| `isServer` | `u8` | Whether the address is a server |

The client joins the SNAP room named by the URL path; for example, `naf://rg.com:80/table_1` joins `table_1`.

The following table lists the verified flows. Byte strings are hexadecimal bytes. A client message starts with its MT type, then kind and action. A reply or event goes out on the request's MT type, which the server column leaves out, unless the row names another type. `RB` is the response base `00 00000000`: `u8` result 0, then `u32` value 0.

| Step | Client sends | Server replies |
| --- | --- | --- |
| Login | `11 00 00 u32 1 String version` | `01 00 RB Profile u8 1 CasinoInfo(ranked)` |
| Stats | `11 00 05 u32 0` | `01 05 RB StatsRecord` |
| Rankings | `11 00 04 u32 0` | `01 04 RB` plus 3 StatsRecord lists (top 10, friends, near you) |
| Achievements | `11 00 06` plus 48 bytes | `01 06 RB` plus 200 bytes |
| Friendly list | `11 00 07 u32 0` | `01 03 RB u8 0` (F_CASINO) |
| Register friends | `11 00 21 u8 n Strings` | None; see [Friends](#friends) |
| Enter ranked | `12 00 08 u32 casinoId` | `01 08 RB Profile CasinoInfo` |
| Matchmaking | `12 00 09 String heroType String random` | `01 09 RB u8 n Profiles` (players already waiting) |
| Matched | None | Event `02 1f String id TableDescriptor` on `0x12` to each player |
| Seat | `15 00 0d u32 playerId` in the table room | `01 0d RB`, plus event `02 0d String id` to the other members |

Matching also sends the request `LOCK_PLAYER_IN_GAME` (`00 1d u32 0` on `0x11`) before `MATCHED_UP`, so the lobby shows its game-starting notice (`GAME_STARTING`) and the player can't back out.

## Friends

The friend list lives in the SNAP layer. `C=302` returns rows `id|name|status` (`to` = request sent, `from` = request received, `both` = friend). The client shows every listed friend as offline until it gets event 307 with availability `available`, `unavailable`, or `away` (any other value breaks its menu). The engine never sends `setPresence`, so the server pushes 307 to a player's friends at login and logout. It also sends a player who logs in the presence of their online friends about 1 s after its `C=302` reply (sooner, and the client overwrites it). Requests use `C=306` to `C=309`, and events 308, 309, and 311 (the server sends 311 for a removal).

CasinoSystem receives `REGISTER_FRIENDS`, `FRIEND_ADD`, and `FRIEND_REMOVE` (`00 21`, `00 24`, and `00 23` on `0x11`) only as information; none needs a reply.

## Friendly rooms

The Online menu item **Create Room** needs at least one entry in the friend list.

A friendly room goes through the following steps, in the notation of the [CasinoSystem](#casinosystem) flows:

| Step | Client sends | Server sends |
| --- | --- | --- |
| Create | `11 00 14 u32 0` | `01 14 RB CasinoInfo` with type 2, a new id (never 1), and the host's name. Friends get event `02 15 String id CasinoInfo String name` and see a menu entry named after the host. |
| List | `11 00 07 u32 0` | `01 03 RB u8 n` plus `n` CasinoInfos of rooms hosted by friends. It replaces the client's whole list. |
| Poll | `11 00 19 u32 id` every 6 s | `01 19 RB`, then `u32` `id`, `inLobby`, `waiting`, and `playing`; or `01 25 00 u32 id` (CASINO_NOT_FOUND) once the room is gone |
| Enter | `13 00 08 u32 id` | `01 08 RB Profile CasinoInfo`, plus event `02 08 String id Profile` to the members |
| Pick hero | `13 00 09 String heroType String random` | `01 09 RB u8 n Profiles`, plus event `02 09 String id Profile` to the members. This list is the lobby. |
| Start | `11 00 1c u32 id` from any member | `01 1c RB`, then `LOCK_PLAYER_IN_GAME` (on `0x11`) and `MATCHED_UP` (on `0x13`) to the lobby players, as in ranked. `01 1c 01 00000000` shows the matchmaking-failed dialog (`MATCHMAKING_FAILED`). |
| Leave | `13 00 0a` or `13 00 0b` | `01 0a` or `01 0b`, plus event `02 0a String id` to the members. An empty room closes, and friends get event `02 16` (FRIENDLY_CASINO_LEFT) on `0x11`. |

Friendly battles don't change fame or ranked stats.

## Battle

In ranked and friendly matches, the server is the battle host (the original ran the engine's `ServerBattleLogic` as player 0). Clients only run `ClientBattleLogic`. All battle traffic is MT type `0x16` in the table room: one zlib stream (any level) per message, holding one GameMessage.

### GameMessage

A GameMessage starts with a header of 4-byte little-endian fields, in the following order:

| Field | Type | Meaning |
| --- | --- | --- |
| `seq` | `s32` | Sequence number, counted per sender |
| `reliable` | `s32` | 1 for a reliable message |
| `type` | `s32` | Message type, from the type table that follows |
| `sender` | `s32` | Sender; the server is 0 |
| `n` | `s32` | Number of recipients |
| `recipients` | `n` × `s32` | One per recipient |
| `team` | `s32` | The sender's seat |
| `turn` | `s32` | Turn |
| `phase` | `s32` | Phase |
| `hash` | `u32` | State checksum; 0 means no state check |
| `unknown` | `u32` | Unknown; send 0 |

The server is sender 0 with recipients `[0]`. The body depends on the type:

| Type | Name | Body |
| --- | --- | --- |
| 0 | InitGameData | `u32 len`, `len` bytes |
| 1 | BattleBegin | None |
| 3-6, 8, 13, 16 | Orders (move, cannon, tile, attack, point, ignored, special skill) | Opaque to the server |
| 7 | EndTurn | None |
| 9 | EndTurnRequest | None (uses header turn and phase) |
| 10 | EndGame | `s32 reason`: 0 quit, 1 surrender, 2 disconnect, 3 sync error |
| 12 | PlayerJoined | `s32 index, s32 team, u8 1, String name, s32 heroId, s32 -1, u8 random, Hero, s32 3` |
| 14 | MessageAccepted | `s32 ackSeq, s32 ackSender` |
| 15 | Chat | Text, not reliable |

### Join handshake

After the `SEAT_TAKE` response, the server and each player exchange the following messages:

1. Server sends InitGameData: Game blob plus `s32 1`. The Game holds the level, rules, heroes, and the random number generator (RNG) state (`server/gameblob.js`). It must have no join infos.
2. Client sends InitGameData: its JoinInfo (`s32 type, s32 slot, s32, s32, String name, u8 random, Hero`).
3. Server sends InitGameData: `s32 index, s32 team`. `index` and `team` are equal: a seat picked at random among the table's free seats, so a player's castle, color (the client uses `(team - 1) % 6`), and place in the turn order vary from battle to battle.
4. Server sends InitGameData: the pre-join snapshot (starts `0xdeadbeef`), `u32 n`, then the `n` reliable messages sent so far.
5. Server sends PlayerJoined for the new player to everyone.

When every seat is filled, or 40 s have passed with at least two players, the server sends BattleBegin. The battle starts in turn 1, phase 2.

### During the battle

- The server acks every reliable client message with MessageAccepted to the sender and forwards the message unchanged to the other players, in one global order. EndGame reason 3 is forwarded as 2.
- EndTurnRequest is never forwarded. Interactive phases are 2 (place tiles, all players at once), 4 (hero turns, in ascending seat order), and 5 (cannons, all at once). Phases 1, 3, 6, and 7 advance by themselves. The server sends EndTurn with the current turn and phase to everyone once every living player has finished phase 2 or 5, or when the current player ends their phase 4 turn. A player finishes phase 2 with one PlaceTile, and phase 5 after sending one FireCannon per cannon (`NumberOfCannonsInCastle`). An EndTurnRequest also finishes either phase; clients send it only when their phase time limit runs out. EndTurn for any other turn or phase is dropped by the clients and stalls the battle.
- Nothing a client sends shows its own defeat. A server with a server copy runs a witness, the engine's own battle logic fed the same messages in the same order ([ADR 0020](adr/0020-the-server-follows-every-battle-with-a-witness.md), [the witness note](re/re_witness.md)), and stops waiting for a player the moment the witness sees them defeated: in phases 2 and 5 the phase ends once every remaining player is done, and in phase 4 the defeated player's turn is skipped. Without a witness, or for a stopped player, whom no engine sees as defeated, the server takes silence for a defeat in phases 2 and 5:
  - A bot that has sent nothing 15 s into phase 2 or 5 is done, because a defeated bot sends nothing.
  - A person is presumed defeated, and not waited for, once they have sent nothing for a whole turn. The same applies 30 s into a phase if they sat out the previous phase 2 or 5 (no order, or cannon shots still owed), or if the clients skipped them in this turn's phase 4.
  - Without a witness, a defeat still costs one phase that runs to its forced end: the first phase in which nothing shows the defeat. That phase lasts 50 s, or in a relaxed match 60 s in phase 5 and 3 minutes in the other phases.
- In phase 4, the server never skips or ends a turn on silence. It can't tell a defeated player, whom the clients skip, from a stopped player (a phone that sleeps, a hidden tab, a hung bot), whom the clients still wait for. Instead, it follows the clients to phase 5 on their first shot, and a stopped player's turn waits for the forced end. In phase 4, a leaver, or a player the witness sees defeated, who held the last turn moves the server to phase 5 at once, as it did the clients.
- Each interactive phase has its phase time limit in the Game blob (20 s in the captured battle templates). The server forces the end with EndTurn 30 s after the limit. The server logs why it ended each phase or turn (every player acted, silence, the forced end, or following the clients) and every EndTurnRequest it dropped.
- A player who drops out is reported to the others as EndGame reason 2 with the leaver as sender. EndGame with sender 0 would make every client believe it won.
- Clients decide the winner themselves and upload nothing. When the battle ends, each client sends `SEAT_LEAVE` on `0x15` and logs in to CasinoSystem again. On the first one, the server scores every player the witness ranks first, waiting up to 5 s for a witness that is still catching up. Without the witness's ranks, it guesses: the last player standing, else the player who made the final move.

### Battle templates

The server doesn't build a Game or snapshot from the level files; it uses battle templates captured from the engine ([ADR 0006](adr/0006-capture-battle-templates-from-a-live-client.md)). `tools/rgtrace` attaches to a running client, makes `ServerBattleLogic` serialize its Game during an Arcade battle, and dumps the Game and the snapshot. `tools/rgtrace/import-template.js` turns a capture into a `.game` file and a `.snap` file in `data/templates/`.

A table uses a random template with one castle per seat. Each table gets a new battle seed, written into the RNG of the Game blob and into the snapshot's copy of it (the 56 bytes `s32 i, s32 j, s32 11, 11 × u32`, found in the snapshot's battlefield section by its bytes). A template whose snapshot doesn't hold that RNG exactly once is skipped at load. Each table also gets a random `Environment` (the Game's `s32` at `+0x120`: 0 space, 1 clouds and grass, 2 speedball, 3 soccer, 4 racetrack). The level files name none, so the engine draws one, and a capture only holds the draw it got. The snapshot holds nothing of it: captures with different environments have the same snapshot apart from the RNG.

## Browser endpoints

Besides SNAP at `POST /snap`, the HTTP server answers the following requests, which only this server's own page uses:

| Request | Reply |
| --- | --- |
| `GET /status` | A JSON object with the fields in the following table. |
| `GET /bots` | `{ available }`: whether the server can run bots. |

The `GET /status` reply has the following fields:

| Field | Meaning |
| --- | --- |
| `version` | The release the server runs, such as `v0.1.2`: `RG_VERSION`, else `git describe --tags --always` of its clone, else `dev` ([ADR 0019](adr/0019-releases-are-tagged-in-ci-on-the-public-main.md)). |
| `accounts` | Whether Discord sign-in is on. |
| `servesGame` | Whether the server sends the game files itself: `RG_SEND_GAME=1` with a loaded server copy (`RG_GAME`). |
| `unlockAll` | Whether the page opens every story and hero from the start: true unless the server runs with `--public` ([ADR 0007](adr/0007-patch-the-engine-in-memory.md)). |
| `invite` | The admin's Discord invite link, or empty. |
| `contact` | Where a rights holder can ask for the game's removal, or empty ([legal notes](LEGAL.md)). |
| `online` | Players online, bots excluded. |
| `waiting` | Players waiting in the ranked Quick Match. |

The page also sends two SNAP commands that only this server defines:

| C | Name | Params | Response fields |
| --- | --- | --- | --- |
| 900 | Fill bots | P1 `1` (**CPU**), `2` (**Expert**), or `0` (no bots); P2 friendly room id | None |
| 901 | Bot choice | P1 friendly room id | One of `ask`, `level`, `go`, or `gone` |

The page sends 901 when the player presses Start in a friendly room. The answer tells the page what to do:

- `ask`: two or three people are listed, so the page asks the player whether to fill the empty seats with bots, and at which difficulty.
- `level`: the player is alone, so the page asks which difficulty fills the seats.
- `go`: no seat is empty, or the server can't run bots, so the page sends the Start on.
- `gone`: the room is gone or already starting, so the page drops the Start.

When the page asked the player, it sends 900 with their answer before it passes the Start on. If the answer is `1` or `2`, the server fills the room's empty seats with bots of that difficulty when this player's Start arrives.

With Discord sign-in on (otherwise every `/auth/` path answers HTTP `404 Not Found`), a request carries its token as `Authorization: Bearer TOKEN`, where `TOKEN` is the guest's or member's token:

| Request | Reply |
| --- | --- |
| `POST /auth/guest` | `{ name, token }` for a new guest. HTTP `429 Too Many Requests` when the client address made too many guests in the last hour, and HTTP `503 Service Unavailable` when the server holds its cap of guests. |
| `GET /auth/me` | `{ name, kind, fame }`, or HTTP `401 Unauthorized` for an unknown or expired token. Each use of a member's token moves its expiry to 90 days later. |
| `POST /auth/discord/start` | `{ url }`, the Discord page. A guest's token binds that guest to the sign-in. |
| `GET /auth/discord/callback` | Where Discord returns. Redirects to `/#signin=CODE` or `/#signin-error=REASON`. |
| `POST /auth/exchange { code }` | `{ status: 'name', suggested }`, `{ status: 'confirm', name, guestFame }`, or `{ status: 'done', name, token }`. HTTP `404 Not Found` when the code is unknown or older than 10 minutes. |
| `POST /auth/finish { code, name?, confirm? }` | `{ name, token }`. HTTP `422 Unprocessable Entity` with `invalid`, `reserved`, or `taken` for a name, and HTTP `409 Conflict` with `confirm` when a guest with progress would be dropped. |
| `POST /auth/signout` | HTTP `204 No Content`, and the token stops working. |
| `POST /auth/delete` | HTTP `204 No Content`, and the account, its links, its saved game, and its tokens are gone. |
| `GET /auth/saves` | `{ files }`, a member's saved game ([ADR 0014](adr/0014-a-members-saved-game-is-kept-on-the-server.md)): an object that maps each file name to the file's bytes in base64. HTTP `403 Forbidden` with `members_only` for a guest, and HTTP `401 Unauthorized` for an unknown token. |
| `PUT /auth/saves/NAME` | The file's bytes as the body (`application/octet-stream`); HTTP `204 No Content`. `NAME` is 1-56 letters, digits, `_`, or `-`, then a dot and 1-6 letters or digits; any other name gets HTTP `400 Bad Request`. HTTP `413 Payload Too Large` when the file exceeds 256&nbsp;KiB, or when the account would exceed 1&nbsp;MiB or 16 files in total; the account keeps the files it already had. |
| `DELETE /auth/saves/NAME` | HTTP `204 No Content`, whether or not the file existed. |

With `RG_ADMIN_TOKEN` set (otherwise every `/admin/` path answers HTTP `404 Not Found`), the admin's account delete ([ADR 0016](adr/0016-the-admin-deletes-accounts-through-the-running-server.md)) takes that token as `Authorization: Bearer TOKEN`, and answers HTTP `401 Unauthorized` for a missing or wrong one. Caddy answers HTTP `404 Not Found` for these paths, so only `npm run delete-user` reaches them, from inside the container or on the host. Each request names one account with `name` or, on a server with Discord sign-in, `discord`:

| Request | Reply |
| --- | --- |
| `GET /admin/account?name=NAME` or `?discord=DISCORD_ID` | `{ name, kind, fame, matches, friends, files, online }`. HTTP `400 Bad Request` with `name_or_discord` unless exactly one is given, HTTP `404 Not Found` with `no_account`, and HTTP `422 Unprocessable Entity` with `no_discord` for `discord` on a server without Discord sign-in. |
| `DELETE /admin/account?name=NAME` or `?discord=DISCORD_ID` | HTTP `204 No Content`, and the account, its links, its saved game, and its tokens are gone and its sessions ended. The same errors as `GET /admin/account`. |

In these paths, `NAME` is the account name and `DISCORD_ID` is the account's Discord user id.
