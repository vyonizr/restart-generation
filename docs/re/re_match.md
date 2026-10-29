# Match start and in-match traffic

Addresses are virtual addresses in the Windows `ResetGeneration-Win32-Web.dll` file unless marked **Mac**
(`tr\mac_named.c`, i386 dylib). "Observed" = read in code. "Inferred" = our conclusion, not executed.

## 0. Summary

1. **The ranked arena client is never the game host.** Every casino client creates a `ClientBattleLogic`
   (ctor `FUN_100e0f50`, called from the arena lobby `FUN_100ebed0`). `ServerBattleLogic` (vtable 101779a0, ctor
   `FUN_1000ecd0`) is created only by single-player, QuickMatch, and local "HostMultiplayer" states
   (Mac callers of `FUN_000ce4f2`: HostMultiplayerGameState_v2, QuickMatchGameState_v2/v12, and
   SinglePlayerBattleGameState_v2/v13). In Arena the server played `ServerBattleLogic`, with player id 0.
   The original CasinoSystem was very likely the same engine running headless.
2. After `SEAT_TAKE` the client waits for the server to send a type 0x16 game message in the table room, on
   the engine's message layer (MT, after its `mt` C++ namespace). Nothing on 0x15 or 0x11 starts the match.
   The first 0x16 message must carry the serialized Game (level, rules, heroes, and battle seed). Without a
   valid Game blob the match can't start.
3. `menu+0x5c` (`GAME_STARTING`) is cosmetic. It is set by LOCK_PLAYER_IN_GAME on 0x11, which works only
   while the client is still in the CasinoSystem room, so before MATCHED_UP.
4. In-match traffic is MT type 0x16: one zlib-compressed `rg::GameMessage` per MT message. The server is
   authoritative. It acks every client order (MessageAccepted) and forwards it to the other players. It also
   creates PlayerJoined, BattleBegin, and EndTurn messages, and runs the join handshake and timers.

## 1. What sets menu+0x5c and what starts the match

### 1.1 The arena lobby screen
- Class `rg::ArenaLobbyState`, the screen that lists the players in the match and shows `WAITING_FOR_PLAYERS`
  or `GAME_STARTING`. Windows ctor `FUN_100eb540`, vtables: main 10189504, +0x20 ICasino listener
  101894b8, +0x24 CasinoPlayer listener 10189490, and +0x28 table listener 10189470.
- Created by the hero-selection menu `FUN_100e3670` right after it sets profile `heroType` / `random` and calls
  `player->startMatchmaking` (+0x54). So the lobby is visible during matchmaking, while the CasinoSystem
  connection is still open. Ctor args: +0x50 = hero index (`FUN_1006c3b0`), +0x54 = random flag (`FUN_100dbfb0`).
- Enter `FUN_100ec1e0`: +0x5c = 0, and +0x5d = 1 if the casino type is 2 (FRIENDLY). It registers +0x24 with the player
  (`player->+0x44`) and +0x20 with the casino.
- Draw `FUN_100eb6d0` (Mac `FUN_00015b2c`): lists the profiles in +0x3c (fameLevel, heroType, random, and name) and
  shows `GAME_STARTING` if +0x5c isn't 0, else `WAITING_FOR_PLAYERS`.
- The player list comes from ICasino listener slot 3 `FUN_100ebd00` (add profile, +0x34++) and slot 4
  `FUN_100ebe10` (remove by id). These are casino (0x12) events.

### 1.2 The only code that sets +0x5c to 1
`FUN_100ebeb0` (CasinoPlayer-listener slot 7, offset +0x1c; Mac `ArenaLobbyState_v34_01619e`) calls
`player->+0x90()` (`FUN_1009bb50`, which sets player+0x28 to 1), sets +0x5c to 1, and redraws.
The call chain (observed) runs as follows:

1. A REQUEST LOCK_PLAYER_IN_GAME on 0x11 (`00 1d u32`) reaches `FUN_10047f50`, then `FUN_100469c0`.
2. That calls the player's `+0x84` method, `FUN_1009c1f0`, which calls `+0x1c` on each player listener and sets
   player+0x28 to 1.
3. For the lobby, that listener is `FUN_100ebeb0`: it sets +0x5c to 1, and the lobby shows `GAME_STARTING`.
4. The client replies with RESPONSE 0x1d on 0x11: `01 1d`, a u8 result (0, because player+0x28 is now set), and
   a u32 0.

- Friendly lobbies set it locally too: the room host presses key 4 in `FUN_100eadd0`, which sends
  FRIENDLY_CASINO_START (`FUN_10046e00`) and calls +0x1c.
- A locked player can't back out: key 5 in `FUN_100eadd0` runs cancel only if `player->+0x94()` (`FUN_1009bb40`,
  player+0x28) is 0.
- UNLOCK `00 1e u32` -> player +0x88 `FUN_1009c230` (state 9, listeners +0x20) -> lobby `FUN_100eb070` shows the
  MATCHMAKING_FAILED dialog and returns to the matchmaking menu. Use it if a match can't be formed after a lock.
- On MATCHED_UP the client disconnects the shared casino connection (`FUN_100982b0` case 0x1f,
  `[this+0x2c]->+0x5c`). After that a 0x11 message can't arrive: the table connection registers only 0x15, and
  other types are queued and ignored. So send LOCK before MATCHED_UP.

### 1.3 What starts the match
1. The SEAT_TAKE RESPONSE reaches `player->+0x74` (`FUN_1009c160`: state 15 SEATED, listeners +0x14), then the
   lobby's `FUN_100eb060`, then `FUN_100ead20`. `FUN_100ead20` stores a new join state (`FUN_1005cf10`) in lobby+0x48,
   with state 0 and a new PlayerConnection (`FUN_1005d320`) on the table's connection (table+0x34, which
   `FUN_1000cf90` returns).
2. Lobby tick `FUN_100ec300` -> `FUN_100ebed0` (Mac `FUN_00015712`):
   - state 0 -> 1 (one tick).
   - state 1: `msg = PlayerConnection::receive` (`FUN_1005d100`). If no msg, wait (no timeout). If msg: the payload
     stream (msg+0x44, `FUN_100585e0`) is read as a Game (new 0x25c object `FUN_1003f2d0`, `Game::read`
     `FUN_1003e440`), then one s32 (read and discarded on Mac). `FUN_10038a60` (always returns true) then the
     client builds the join info: [0] = 0, [2] = the hero from `FUN_1003a120(game, lobby+0x50)` (a copy of the
     game's hero entry whose id matches), +0x14 = the profile name, and +0x18 = lobby+0x54. state = 2. It
     creates `ClientBattleLogic` (`FUN_100e0f50`) and switches to the arena game state (`FUN_100ec440`). The
     message type isn't checked here.
   - If `FUN_1003a120` finds no hero with that id, [2] is NULL. Inferred: a crash or a broken join later, so the
     Game blob must contain the hero the player picked (the `heroes` list at Game+0x204).
3. Then the ClientBattleLogic handshake continues (§3, steps 2-6).

### 1.4 Gates that don't affect the start
- `TD.nplrs` / `maxplrs`, SEAT_TAKE events, and SEAT_RESERVE: no start condition reads them. The table only keeps
  counters (`FUN_100ceeb0` / `FUN_100cef40`). The lobby's table listener (+0x28, 10189470) ignores SEAT events:
  slots 1-5 are no-ops, and only slot 7 `FUN_100eb170` (connection lost / GAME_START_FAILED) does anything.
- Profile `type` LOCAL/REMOTE (`FUN_100ce050`) is used only in the SEAT_LEAVE event (`FUN_100ce230` case 0xe): if the
  leaver isn't REMOTE, the table session closes. Caution: that path dereferences
  `players->+0x10(id)`. Send SEAT_LEAVE events only with ids the client already knows (from MATCHMAKING
  events/response), or it dereferences NULL (inferred).
- The `heroType` / `random` / `fameLevel` profile keys are only for the lobby UI (`FUN_100eb6d0`) and matchmaking.

## 2. Transport for type 0x16 game messages

### 2.1 PlayerConnection
`rg::PlayerConnection` has the Windows ctor `FUN_1005d320` and vtable 1017cb58 (Mac `FUN_00071f1a`).
- `+0x7c` = mt connection (the table connection), `+0x94` = zlib codec (vtbl 10181b18; Mac
  `mt::compression::CompressorZLIB`), and `+0x88` = outbound queue.
- Send `FUN_1005cfc0`: serializes `msg->vt+4` (write) into a MemoryStream, then `FUN_1005cf60`:
  `codec->+8(buf,len,&out,0x7f,0x7f)` (`thunk_FUN_10091350` -> `FUN_100918b0` `deflateInit_(strm, level 2,
  "1.2.3", 0x38)`), then `conn->+0x68(0x16, data, len)`.
- Receive `FUN_1005d100`: `conn->+0x7c(0x16, 0)` pops the queued type-0x16 body (no handler is registered for
  0x16, so `FUN_1011cec0` queues it), `codec->+0x10` = `FUN_10091a90` (`inflateInit_`, standard zlib header and
  adler32), then the GameMessage factory `FUN_1000c020` (singleton `FUN_10005710`), then sets +0x10 = 1
  ("came from network").

**Wire:** `MT frame(s)` -> `u8 0x16` + zlib stream (RFC 1950, any level) of exactly one serialized GameMessage.
No extra length or id field. Messages larger than 874 bytes are fragmented. Send each frame in its own SNAP
packet (the `frames` function in [`server/mt.js`](../../server/mt.js)): the client's receive ByteBuffer is
2048 bytes (inferred risk).

### 2.2 GameMessage header
`FUN_1000d160` writes the `rg::GameMessage` header, `FUN_1000c020` reads it, `FUN_1000d290` constructs it, and
`FUN_1000ce60` names the types. All fields are 4-byte little-endian, in the following layout:

```text
off  field                     member  notes
0    s32 seq                   +0x0c   per-sender counter, starts at 1 (FUN_1000c560); reader stores map[sender]=seq
4    s32 reliable              +0x14   1 for all types except Chat (0xf = 0); if 1 the ctor puts 0 in the recipient list
8    s32 type                  +0x18   see §2.3
12   s32 sender                +0x1c   0 = server/host; players use their player index (handshake step 3)
16   s32 n; n x s32 recipient  +0x2c/+0x24  routing list on the server; server-created messages start as [0]
..   s32 player                +0x30   seat (team) of the sender; receivers overwrite it (see re_rules.md §1.1)
..   s32 turn                  +0x34   game+0x9c at creation (FUN_1000cf80)
..   s32 phase                 +0x38   game+0x94 at creation (FUN_1000cfa0)
..   u32 hash                  +0x3c   state checksum; 0 = not checked (Mac ClientBattleLogic_v10_06ed36)
..   u32 b                     +0x40   meaning unknown
then the type-specific body
```
Not serialized: +0x8/+0x9 (rollback flags), +0x10 (1 = received from network).

### 2.3 Message types
Each message class calls the base ctor `FUN_1000d290(this, seq, sender, reliable, type)`; the Mac class names
come from RTTI. The following table lists each message type and its body:

| Type | Class | Windows ctor | Body after the header |
|---|---|---|---|
| 0 | InitGameDataMessage | `FUN_100586a0` (create `FUN_1000bd80`: seq 1, sender 0) | `u32 len` + `len` raw bytes (write `FUN_100585f0`, read `FUN_10058640`) |
| 1 | BattleBeginMessage | `FUN_10058a80` (create `FUN_1000cd10`) | None (Mac v2_01c5ac) |
| 2 | None | - | - |
| 3 | MoveUnitMessage | `FUN_10042dd0` | Order data (not decoded) |
| 4 | FireCannonMessage | `FUN_100430a0` | Order: `i32 x, i32 y` target (+0x44, +0x48; serialize `FUN_100430e0`), one message per shot |
| 5 | PlaceTileMessage | `FUN_10042ff0` | Order |
| 6 | AttackMessage | `FUN_10043140` | Order |
| 7 | EndTurnMessage | `FUN_10058b40` | None (Mac v2_0797aa) |
| 8 | PointMessage | `FUN_10043300` | Order |
| 9 | EndTurnRequest | `FUN_10058ae0` | None; uses the header turn/phase (see [re_rules.md](re_rules.md) §1.2) |
| 10 | EndGameMessage | `FUN_10043250` (create `FUN_1000cbd0`) | `s32 reason` (+0x44) |
| 11 | "SAVE GAME" | - | No class found |
| 12 | PlayerJoinedMessage | `FUN_1000f160` (create `FUN_1000cc70`) | `s32 playerIndex(+0x44) s32 team(+0x48) u8 hasInfo [info] s32 playerType(+0x50)`; info = `String name, s32, s32, u8, hero` (Mac `FUN_0006fd64`) |
| 13 | IgnoredOrderMessage | `FUN_10058720` | Client order created by UI states |
| 14 | MessageAcceptedMessage | `FUN_100589c0` (create `FUN_1000ca80`) | `s32 ackSeq(+0x44) s32 ackSender(+0x48)` |
| 15 | ChatMessage | `FUN_100587f0` (reliable 0) | Text (`FUN_1000c610`) |
| 16 | UseSpecialSkillMessage | `FUN_10058790` | Order |

EndGame reason (client Mac `ClientBattleLogic_v20_06e7da`): sender 0 -> CONNECTION_TO_HOST_LOST.
Otherwise 0 or 1 -> PLAYER_HAS_LEFT_THE_GAME, 2 -> PLAYER_HAS_DISCONNECTED, and 3 -> PLAYER_SYNC_ERROR.
Inferred: EndGame announces that a player left the game. It is not the victory result. The winner is computed
locally by BattleLogic.

## 3. Join handshake

Every handshake message is an InitGameData message (type 0) on 0x16.
Server side: ServerBattleLogic per-connection state machine `FUN_1000d8c0` (Mac `FUN_000ce60e`). A connection
is added by Mac `FUN_000cd7ee`, which also sets a 40 s start deadline. Client side: lobby `FUN_100ebed0`, then
ClientBattleLogic `FUN_100e17a0` (Mac `FUN_0006ef2a`).

The handshake runs in the following steps:

| Step | Direction | Payload inside InitGameData | Code |
|---|---|---|---|
| 1 | S->C | `Game blob` (Game::write `FUN_1003c4a0`) + `s32 connId` (free id or 1) | Server case 1; client lobby state 1 (s32 discarded) |
| 2 | C->S | `JoinInfo` (`FUN_1005cbe0`): `s32 type=0, s32 -1, s32 [3]=0, s32 [4]=-1, String name, u8 random, Hero` | Client state 2; server case 2 parses with `FUN_1005cd90` and remaps type 1->4, 0/2->3, else -1 |
| 3 | S->C | `s32 playerIndex, s32 team` | Server case 3 (index = `FUN_10023f40` / Mac `FUN_000be332` next free index; seat (team) allocated by `FUN_10024c60` / Mac `FUN_00025912` for category 1, reject if 0); client state 3 reads index -> ClientBattleLogic+0x84 (Mac +0x78), and the seat only if category(type) isn't 2 |
| 4 | S->C | `BattleLogic snapshot` (raw, `FUN_10006a80` format) + `u32 historyCount` + historyCount × full GameMessage (header+body, uncompressed) | Server case 4; client state 4 loads snapshot (`FUN_10006b10`), creates broadcaster and message queue, replays history -> state 6 |
| 5 | S->all | PlayerJoined(index, team, type 3, info{name, hero...}), sender 0 | Server case 4 end, through logic v10 (process + broadcast) |
| 6 | S->all | BattleBegin (type 1) once no connection is still handshaking (or the 40 s deadline passed) and the game has enough players (`FUN_10024c00` / Mac `FUN_00024fde`); otherwise the server quits | `FUN_1000ddf0` / Mac `ServerBattleLogic_v6_0cebc8` |

Category (Mac `FUN_000bd60e`): type 0/2 -> 0, 3 -> 1 (remote player), 1/4/5 -> 2 (the observer kinds, LocalObserver and RemoteObserver among them), -2 -> -2.
The server adds all table connections before ticking. Otherwise the first finished handshake would trigger
BattleBegin with one player, and `FUN_00024fde` would end the game (inferred).

### 3.1 Byte-exact envelope of message 1
Everything in message 1 except the Game blob is fixed. Its bytes are the following:

```text
MT: frames( 16 | zlib( GM ) )
GM =
01 00 00 00   seq 1
01 00 00 00   reliable 1
00 00 00 00   type 0 INIT GAME DATA
00 00 00 00   sender 0 (server)
01 00 00 00   recipients n=1
00 00 00 00     recipient 0
FF FF FF FF   +0x30
00 00 00 00   turn
00 00 00 00   phase
00 00 00 00   hash
00 00 00 00   +0x40
LL LL LL LL   u32 payload length = len(GameBlob)+4
<GameBlob>
01 00 00 00   s32 connId (client ignores it)
```
Message 3 uses the same envelope (seq 2) with payload `s32 playerIndex, s32 team` (length 8).

### 3.2 Game blob
`Game::write` (`FUN_1003c4a0`) writes the Game blob and `FUN_1003e440` reads it. The field names are the ones
[`server/gameblob.js`](../../server/gameblob.js) uses. The blob has the following layout:

```text
String  version          "Reset Generation v. 1.1.3" (FUN_10038a30; a mismatch is only logged)
s32 randomSeed (+0x118), s32 mapWidth (+0x138), s32 mapHeight (+0x13c)
u32 n0..n4               sizes of 5 settings maps
n0 x {s32 key, s32 value}          ints
n1 x {s32 key, u8 value}           bools
n2 x {s32 key, obj FUN_1000f900}   masks
n3 x {s32 key, obj FUN_1006dce0}   tiles
n4 x {s32 key, String}             strings
castles list +0x140 (FUN_1005c600 objects), blocks obj +0x14c, items obj +0x168 (FUN_1000f900),
  u32 +0x198, objects list +0x190 (FUN_1005c6e0)
s32 playerSlots(+0x1a8), s32 nNonNull, nNonNull x JoinInfo (FUN_1005cbe0)
s32 heroSlots(+0x19c), s32 nNonNull, nNonNull x {s32 slot, Hero FUN_1005c940}
6 x s32 movementCosts (+0xb8)
s32 n, n x s32 timeLimit (+0xc0/+0xc4)
u32 nHeroes(+0x20c), nHeroes x Hero heroes (+0x204)  <- available heroes; the client looks up its pick here
s32 n, n x Hero monsters (+0x214)
Hero princess (+0x21c)
4 int arrays, each s32 n, n x s32: itemsOnMatchStart (+0xd8/+0xdc), itemsOnMatchStartPerPlayers (+0xf0/+0xf4),
  itemGeneration (+0xcc/+0xd0), itemGenerationPerPlayers (+0xe4/+0xe8)
s32 environment (+0x120)
4 s32 arrays (+0x188), sized mapWidth, mapHeight, mapWidth, mapHeight
u32 len, len raw bytes   triggers (+0x1c0)
RNG (+0x12c, FUN_100f31a0): s32 i, s32 j, s32 11, 11 x u32 state
```
For each int list, the first offset is the list and the second its element pointer. For example, `FUN_100399c0`
reads the `timeLimit` elements through Game+0xc4.

Hero (`FUN_1005c940`): `String, String, s32 x6 (+8..+0x1c), s32 n, n x s32, s32 +0x2c, u8 +0x30, s32 +0x34`.

### 3.3 BattleLogic snapshot
`FUN_10006a80` (Mac `FUN_0004a254`) saves the snapshot and `FUN_10006b10` (Mac `FUN_0004a318`) loads it. It holds
`u32 0xDEADBEEF`, `s32 size + battlefield`, `s32 size + players`, `s32 size + third object`, `u8`, `u8`, and `s32`.
The sections are the full battlefield and player model. They weren't decoded further.

## 4. In-match traffic

### 4.1 Roles
- Host = server, sender id 0. Clients never host in Arena (§0). There is no host election and no host
  migration (MT_HOSTMIGRATION is unused, see [re_transport.md](re_transport.md)).
- The client wraps the table connection in a broadcaster (Mac `FUN_00072564`, `add(0, conn)`), so the server is
  its only peer.

### 4.2 Client behavior
The following rules come from the Mac `ClientBattleLogic`:
- A local order (UI creates it with sender = own player index and the next seq) is applied immediately
  (speculative, `BattleLogic::v10`). Then `v16` (06ee38) puts it in the rollback queue (+0x3c) and sends it to the
  server (because +0x10 is 0).
- An EndTurnRequest (9) is not applied locally. It is sent to the server (v10 06ed36).
- A received message (+0x10 is 1): if its `hash` isn't 0, the game phase is above 0, and the hash differs from
  the local state hash, the client sends EndGame(reason 3, sync error). Otherwise it applies the message and,
  if it is reliable and not type 0xe, queues it as already accepted (`FUN_000a2ad2(..., 0)`).
- MessageAccepted (v24 06e78e) marks its own queued order (ackSender, ackSeq) as accepted. If acceptance order
  differs from local order, the client restores its snapshot and replays (`FUN_000a2a08` / `FUN_0006e5c6`). After
  16 or more accepted messages with nothing pending, it takes a new snapshot (`FUN_000a28e4`).

### 4.3 Server behavior
The following rules come from the Mac `ServerBattleLogic`:
- v10 (0cedc4): type 3 MoveUnit gets `hash = stateHash(game)` (`FUN_0002e370`). Type 9 -> v29 (0cdd7e): if the
  sender is the current player (game+0x98) and turn/phase match the request's +0x34/+0x38, create EndTurn
  (`FUN_000a12ca`) with those turn/phase values and process it. Other types -> BattleLogic::v10 (validate and apply).
- v16 (0ceec0), run for every processed message:
  1. If the sender isn't 0 and the message is reliable: send
     `MessageAccepted{ackSeq = msg.seq, ackSender = msg.sender}` (sender 0) to the sender only.
  2. If reliable: append to the history (sent in handshake step 4).
  3. If the recipients are [0]: replace them with all players (`FUN_000be06a`). Remove the original sender, send
     to the rest (`FUN_00072336`), then restore the list. An EndGame with reason 3 is rewritten to reason 2.
  So forward each client message unchanged (same seq and sender) to every other player, and ack it to the
  sender. Server-created messages (sender 0) go to everyone.
- v6 (0cebc8) timers: start deadline (now + 40,000 ms), and the forced end: if the phase is more than 30 s past
  its phase time limit (`game->v4() < -29999` and not `v5()`), force EndTurn (`FUN_000cdc32`).
- v17/v18 (0cdd16/0cdca2): send EndTurn automatically when the current player can't act any more
  (`FUN_00029de4` / `FUN_00029e9a`).
- v20 (0cdb3e): when no players are left, EndGame(0).

### 4.4 How a match ends
- Victory is computed locally by BattleLogic. EndGame only reports that a player left, disconnected, or lost
  sync (§2.3).
- EndArenaState (Mac v2_07859e) shows the stats (time and battle turns from game data, PLAYER_WINS/LOSES from
  per-player +0x134) and then calls `player->+0x14` (Mac), which is Windows +0x10 = `FUN_10097090`, login. The
  client reconnects to CasinoSystem (type-3 hello + LOGIN again, as in [re_casino.md](re_casino.md) §5.3).
- No result or stat message from the client was found (no GET_STATISTICS update and no result upload). Inferred:
  the original server took results from its own simulation.
- No TABLE_CLOSED / TABLE_TERMINATED handler exists (re_casino.md). GAME_START_FAILED `00 11 u32` on 0x15 aborts
  a table (`FUN_100ce4e0` -> table listeners +0x1c(2) -> lobby `FUN_100eb170`).

## 5. Server-generated data
- The Game blob: the map size (`mapWidth` +0x138, `mapHeight` +0x13c), the environment (+0x120), the trigger
  data (+0x1c0), the rule maps, the heroes, the per-seat player list, the battle seed (`randomSeed`, +0x118), and
  the RNG state (+0x12c: 11-word lagged-Fibonacci state, `FUN_100f31a0` / step `FUN_100f2ff0`). The RNG lives in
  shared game data, so the simulation is deterministic on all peers (inferred).
- Player index and seat (handshake step 3), from the free-index and seat allocators.
- Per-sender sequence numbers for sender 0, and MessageAccepted acks.
- BattleBegin timing (all handshakes done or 40 s), EndTurn on valid requests, and the forced end 30 s after
  the phase time limit.
- The MoveUnit state hash (+0x3c). A relay can set it to 0 to disable the check.
- Not server data: the lobby music pick uses a local `timeGetTime` RNG (`FUN_100ebed0` -> `FUN_10005a60`).

## 6. Exact bytes for the server to send
1. Optional, before MATCHED_UP, to each matched player on 0x11: `00 1d 00 00 00 00`
   (REQUEST LOCK_PLAYER_IN_GAME, generic u32). The client answers `01 1d 00 00 00 00 00` and shows
   `GAME_STARTING`. If the match fails: `00 1e 00 00 00 00` (UNLOCK).
2. After the SEAT_TAKE response, on 0x16 in the table room, to each seated client: handshake step 1 (§3.1) with a
   valid Game blob. Then wait for step 2 (0x16 from the client), send step 3, then step 4, then broadcast
   PlayerJoined. When every player has finished, broadcast BattleBegin
   `GM(seq n, reliable 1, type 1, sender 0, [0], -1, 0, 0, 0, 0)`.
3. During the game: for each client 0x16 message, inflate it and parse the header. Ack it with MessageAccepted
   (type 14, body `s32 seq, s32 sender`) to the sender, and forward the original bytes to the other players. On
   EndTurnRequest (9) from the current player, send EndTurn (type 7) with the request's turn/phase to everyone.

## 7. Unknowns
1. **How to obtain a valid Game blob and initial BattleLogic snapshot.** Options: (a) capture them from a real
   client in a mode that runs ServerBattleLogic (QuickMatch or single-player; Windows ServerBattleLogic ctor
   callers `FUN_100ca920`, `FUN_100cb650`, `FUN_100cbdc0`, `FUN_100de940`, and `FUN_100debf0`) by hooking `FUN_1003c4a0`
   (Game::write) and `FUN_10006a80` (snapshot save), for example with Frida; (b) reimplement Game::write from
   `levels.pak`. The step-1 blob and the step-4 snapshot are taken before any player joins (snapshot saved in
   Mac v4/v5/v19/v21 via `FUN_000ce02e`), so per-level templates are plausible (inferred, untested).
2. Whether a thin relay (no server-side simulation) is enough. The server-only logic found: EndTurn validation,
   the forced end, automatic EndTurn when a player can't act (v17/v18), and the start/quit checks. Victory is
   local, so inferred feasible.
3. How the original server picked the level and rules for a ranked table, and how it computed fame/rank results.
4. Bodies of the order messages 3, 5, 6, 8, 13, and 16.
5. Header field +0x40, and the meaning of the 5 settings maps.
6. Answered: the client sends SEAT_LEAVE when its battle finishes normally; see [re_rules.md](re_rules.md) §5.
7. Mac `FUN_000cda90` (per-player `random % 10` list at +0x94) is used for something not identified.
8. The SNAP receive buffer limit (2048 bytes) for large 0x16 messages (inferred risk; one frame per packet
   avoids it).
9. Whether `FUN_1003a120` returning NULL (hero not in the Game blob) crashes the client (inferred).
