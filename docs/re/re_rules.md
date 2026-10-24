# In-match rules of ServerBattleLogic

Addresses are Windows virtual addresses unless marked **Mac** (`tr\mac_named.c`). "Observed" = read in code. "Inferred" = our conclusion.
All ints are little-endian. `String` = mt::String (`u32 hdr, u32 len, u32 count, count x 1 or 2 bytes`, see
[`server/gameblob.js`](../../server/gameblob.js)). Game object = BattleFieldLogic (`logic+0x14`), player registry = PlayerManager
(`logic+0x18`), per-seat in-game player = `rg::Commander` (`game+0x2c[team]`, count `game+0x28`).

## 0. Summary for the server

- **Two id spaces.** `playerIndex` = sender id in GameMessage headers (registry entry, 1 to n; 0 = server).
  `team` = the seat number, 1-4 (`game+0x2c[team]`; `game+0x98` is the current seat). Every validation maps
  sender to seat with `FUN_10023dc0` (Mac `FUN_000bde64`). With players joining in order and nobody dropping
  mid-handshake, index k is seat k.
- **Phases** (`game+0x94`): 0 lobby, 1 battle turn start (automatic), 2 tile placement (all at once), 3 special
  power (automatic), 4 player turns (one at a time), 5 cannons (all at once), 6 and 7 (automatic), and 8 game over.
  Only 2, 4, and 5 wait for an EndTurn message. The battle turn counter `turn` (`game+0x9c`) increments on
  entering phase 1.
- Every client is a deterministic simulator. Clients stay in sync with each other as long as all of them get
  the same messages in the same order. The server only needs to decide when to emit EndTurn, and with
  which `(turn, phase)` header.
- Every client silently drops an EndTurn with a wrong `(turn, phase)` (the validator returns 1 and only logs
  it), and the match stalls.

## 1. Byte layouts

### 1.1 GameMessage header

`FUN_1000d160` writes the header and `FUN_1000d290` constructs it. The header has the following layout:

```text
s32 seq        +0x0c  per-sender counter (factory FUN_1000c560 keeps map[sender]; reader FUN_1000c020 updates it)
s32 reliable   +0x14  1 for all except Chat (15)
s32 type       +0x18
s32 sender     +0x1c  player index; 0 = server
s32 n, n x s32 +0x2c/+0x24 recipients; [0] = "everyone" (reliable ctor adds 0 via FUN_1000d090)
s32 player     +0x30  seat (team) of the sender. Receivers overwrite it before validation (FUN_10007f80 ->
                      FUN_1000cf70: sender>0 ? team(sender) : game+0x98). Send -1 or anything.
s32 turn       +0x34
s32 phase      +0x38
u32 hash       +0x3c  0 = no check (only the server sets it, on MoveUnit, FUN_1000e150 -> FUN_1001a770)
u32 unknown    +0x40  ctor 0; send 0
```
Server factories set turn/phase from the server's game: EndTurn `FUN_1000c940`, EndTurnRequest `FUN_1000c8a0`,
BattleBegin `FUN_1000cd10`, EndGame `FUN_1000cbd0` (all `turn=game+0x9c, phase=game+0x94`).

### 1.2 Message bodies

Vtable slot 1 of each message class is its write method. The following table lists, for each message type these
rules use, its class, Windows constructor, vtable, write method, and body:

| Type | Class (Windows ctor, vtable, write) | Body |
|---|---|---|
| 1 BattleBegin | `FUN_10058a80`, 1017bfcc, thunk `FUN_1000d160` | None |
| 7 EndTurn | `FUN_10058b40`, 1017bff4, thunk `FUN_1000d160` | None |
| 9 EndTurnRequest | `FUN_10058ae0`, 1017bfe0, thunk `FUN_1000d160` | None (uses header turn/phase) |
| 10 EndGame | `FUN_10043250`, 1017aa7c, `FUN_10043290` | `s32 reason` (+0x44) |
| 12 PlayerJoined | `FUN_1000f160`, 10177a14, `FUN_1000f290` | See §1.4 |
| 14 MessageAccepted | `FUN_100589c0`, 1017bfb8, `FUN_10058a00` | `s32 ackSeq` (+0x44), `s32 ackSender` (+0x48) |

EndGame reason (set by): 0 = QUIT_GAME, 1 = SURRENDER (both from the in-game menu, Mac
`rg_IngameMenuState_v16_08bd5e`; not sent if the player already has rank 1, `FUN_0008bc84`), 2 = disconnected
(created by the host for a dropped connection, Mac `FUN_0007263a`, sender = the dropped player), 3 = sync error
(client, Mac `ClientBattleLogic_v10_06ed36`). The server rewrites 3 -> 2 when forwarding (Mac 0ceec0).

### 1.3 JoinInfo

`FUN_1005cbe0` writes JoinInfo and `FUN_1005cb00` reads it (through `FUN_1005cd90`); the client constructor is
`FUN_1005c790`. JoinInfo has the following layout:

```text
s32 type    [0]   client sends 0 (LocalPlayer)
s32 slot    [1]   client sends -1
s32 fc      [3]   client sends 0
s32 f10     [4]   client sends -1
String name +0x14 profile name
u8  random  +0x18 lobby "random hero" flag
Hero        +8    always written (null pointer would crash the writer); copy of the Game-blob hero whose id
                  matches the pick (FUN_1003a120)
```
Hero (write `FUN_1005c940`, read `FUN_1005c9f0`, 0x38 bytes): `String type, String name, s32 +8, +0xc, +0x10,
+0x14, +0x18, +0x1c, s32 n (0..0x400), n x s32, s32 +0x2c, u8 +0x30, s32 +0x34`. `FUN_10038940` maps the type
string to the hero id, for example HEDGEHOG 0 and PLUMBER 1; the full map is `HERO_IDS` in `server/gameblob.js`.

Player type values (factory Mac `FUN_000bd6e2`, RTTI): 0 LocalPlayer, 1 LocalObserver, 2 AIPlayer,
3 RemotePlayer, 4 RemoteObserver, and 5 (unnamed, 0xbc bytes). Category `FUN_10042ce0` / Mac `FUN_000bd60e`:
0/2 -> 0 (controlled here), 3 -> 1 (remote player), 1/4/5 -> 2 (observer).
Server remap of the received JoinInfo.type (`FUN_1000d8c0` case 2): 0 or 2 -> 3, 1 -> 4, else -1.
So a person's client becomes type 3 on the server.

### 1.4 PlayerJoined body

`FUN_1000f290` writes the body and `FUN_1000f2f0` reads it. The body has the following layout:

```text
s32 playerIndex   +0x44  server-allocated (FUN_10023f40)
s32 team          +0x48  server-allocated seat (FUN_10024c60); 0 for observers
u8  hasInfo       (+0x4c != 0)
[ PlayerInfo (write FUN_100421b0, read FUN_100423b0):
    String name     <- JoinInfo.name
    s32 heroId      <- FUN_10038940(JoinInfo.hero.type)
    s32 color       = -1 (never copied from JoinInfo; client then uses (team-1) % 6, Mac 04b3f0)
    u8  random      <- JoinInfo.random
    Hero            <- copy of JoinInfo.hero ]
s32 playerType    +0x50  remapped JoinInfo.type (3 for a person)
```
Built in `FUN_1000d8c0` case 4 (`FUN_1000f1a0` index, `FUN_1000f1c0` seat, `FUN_1000f280` type, `FUN_1000f1e0` info).
The server ignores the fields JoinInfo.slot, fc, and f10.
Client side (Mac `ClientBattleLogic_v23_06ec40`): type 3 with the client's own index becomes the client's own
JoinInfo type (LocalPlayer); type 0/2 -> 3; type 1 -> 4. So send type 3 for every person, including the receiver.
Validation (`FUN_100228d0`) rejects a non-observer with seat 0, and any index ≤ 0.

Seat colors: with `(team-1) % 6`, seats 1 to 6 take the engine's six owner colors in the order its owner names list them:
yellow, red, green, blue, pink, and purple. Observed in a replay: seat 1's castle, tiles, and corner panel are yellow, seat 2's
red, and the battle's messages call seat 1 "Yellow". Seats 3 and 4 follow from the order (static).

Where the seats stand: a map file holds one castle layout per player count. With four seats the castles go clockwise from
the top left: seat 1 top left, 2 top right, 3 bottom right, 4 bottom left. With three, seats 1 and 2 stand at the top left
and top right and seat 3 at the bottom centre, between them (map data, static). The four corner panels ignore the player
count: panel N always sits in corner N, clockwise from the top left, so with three seats seat 3's panel is still at the
bottom right while its castle is at the bottom centre (static). A four-player replay shows green's castle and panel at the
bottom right.

## 2. Index, seat, and start check

- Index `FUN_10023f40` -> `FUN_10023eb0` (Mac `FUN_000be332`/`FUN_000be2e8`): lowest `i >= 1` with no registry entry
  and no reservation flag (`registry+0x1c[i]`), then reserves it. Index 0 is never allocated (server).
- Seat (`team`) `FUN_10024c60` -> `FUN_10024c20` (Mac `FUN_00025912`/`FUN_000258ce`): lowest `t` from 1 to 4 with
  `game+0x2c[t] == NULL`, not reserved (`game+0x38[t]`), and `t <= 4` (`FUN_100ceff0` returns the constant 4).
  Only for category 1 (remote player). It returns 0 if all seats are taken, and the server then drops the
  connection (case 3).
- Both are allocated together in handshake case 3, in connection-list order. With two, three, or four persons,
  joiner k gets index k and seat k (1-4). Reservations are released only when a Commander is removed
  (`FUN_10020da0` clears `game+0x38[t]`).
- The Commander for a seat is created when the PlayerJoined is processed (BattleLogic v23, Mac 04b3f0 ->
  `FUN_00028bc0`).
- **Start check** (tick `FUN_1000ddf0`, Mac `ServerBattleLogic_v6_0cebc8`), only while phase is 0 and after the
  first connection was added (+0xb0 is 1; Mac +0xa4):
  1. Wait while a handshake is pending and `now <= deadline` (deadline = add time + 40,000 ms, Mac `FUN_000cd7ee`).
  2. If a global flag (`FUN_100021f0()+0x110`) is set, wait.
  3. `FUN_10024c00` = number of non-null Commanders. If 0: set finished (+0x28) and quit.
  4. Else drop still-pending connections and process BattleBegin (sender 0, turn 0, phase 0).
  The minimum is one player, not two. With one player the battle ends right away: BattleLogic v25 (Mac 04aa32)
  finishes as soon as the phase is ≥ 1 and fewer than two players are alive, and that player gets rank 1. The
  server must require at least two persons itself.

## 3. Battle turn structure

### 3.1 Fields
- `game+0x94` phase, `game+0x98` current seat (0 outside phase 4), `game+0x9c` battle turn,
  `game+0xa0` first eligible seat of the battle turn, `game+0xa4` phase start time (ms), `game+0xa8` time limit
  then remaining time (ms).
- Commander: `+0x14`/`+0x15` set together when the castle exists (Mac `FUN_0006fe0c`), `+0x1c` defeated
  (`FUN_0006fe1c`), `+0x18` turns-to-skip counter, `+0x24` princesses, `+0x30` cannons fired, `+0x40` cannon
  phase ended by request, `+0x78` tile placed, `+0x79` tile phase ended by request.

### 3.2 Ending a turn and starting a phase

`Game::endTurn` (`FUN_10020b50`, Mac `FUN_00032b76`) ends a turn, and `startPhase` (`FUN_1001ebe0`) starts a phase.
Ending a turn works as follows:

- In phase 8 (game over) nothing happens.
- In phase 4 the current player's turn finishes (with the KickLoserMode rule, `FUN_10014a60`, if it is set). If fewer than two players are alive the phase becomes 8. If `nextPlayer()` (`FUN_1001ea20` / `FUN_100109b0`) finds another player due in this battle turn, the phase stays 4.
- Otherwise the phase becomes the next one (after 7 it wraps to 1), leaving phase 4 clears the current-seat field (`game+0x98`), the phase's start time and limit (`timeLimit[phase]`) are recorded, and `startPhase()` runs.

The following table lists what each phase does when it starts, and how it ends:

| Phase | On start | Ends |
| --- | --- | --- |
| 1 | The battle turn counter goes up; spawns and eggs | By itself |
| 2 | Tile flags are cleared | When the players are done (tile placement, all at once) |
| 3 | Special power grows by `SpecialPowerPerTurn` | By itself |
| 4 | The current player is `game+0xa0` | When that player ends the turn (one player at a time) |
| 5 | Cannons are reset | By itself if the total number of cannons is 0, else when the players are done |
| 6, 7 | Resolution | By itself |

`nextPlayer()` looks at the seats after the current one, in order and wrapping over 1 to 4. A seat is eligible if it has a Commander, with `+0x14` set, and isn't defeated. A seat whose skip counter is above 0 is skipped and the counter goes down. Phase 4 ends when the scan comes back to the battle turn's first seat, and then there is no next player. So in phase 4, players take their turns in ascending seat order from the lowest eligible seat.

BattleBegin (BattleLogic v21) calls endTurn from phase 0: phase 1 -> turn = 1 -> phase 2.
So the interactive states are, in order: `(1,2) (1,4)x(players) (1,5) (2,2) (2,4)x... (2,5) ...`.
Phase 5 is skipped (straight to the next battle turn's phase 2) only when no living player has a castle cannon.

### 3.3 EndTurnRequest handling

The server handles an EndTurnRequest in `FUN_1000df80` (Mac `ServerBattleLogic_v29_0cdd7e`) by the following rules:

- It maps the sender to its seat, and drops a request whose turn or phase differs from the server's own.
- It drops the request when a current seat is set (`game+0x98` isn't 0) and the sender isn't that seat. In
  phases 2 and 5 no current seat is set, so any seat may send one.
- In phase 5 it marks the sender's Commander as having ended the cannon phase (`+0x40`), and emits EndTurn if no
  cannon shots are left (`FUN_10010c40`).
- In phase 2 it marks the sender's Commander as having ended the tile phase (`+0x79`), unless the seat is 5 or
  has no Commander. It emits EndTurn if the seat is invalid or every alive player placed a tile or passed
  (`FUN_10010d90`).
- In any other phase it emits EndTurn with the request's turn and phase.

EndTurnRequest is never acked and never forwarded. If a client receives one, it sends it to the server
again (Mac `ClientBattleLogic_v10_06ed36`), so a relay must not forward it.
Auto EndTurn: after a FireCannon is processed (`FUN_1000e430`, Mac v17) if no cannon shots remain;
after a PlaceTile (`FUN_1000e4f0`, Mac v18) if the phase is 2 and every alive player placed or passed.
- Shots left (`FUN_10010c40`): sum over non-defeated Commanders of `cannons - fired`, 0 if `+0x40`.
  cannons (`FUN_10042240`) = 0 without castle, else `NumberOfCannonsInCastle` (+ princesses if
  `IsNumCannonsEqualToNumPrincesses`). Captured QuickMatch rules: 2 cannons, flag false.
  Rule keys are djb2 hashes (`FUN_100efda0`: `h = 5381; h = h*33 + c`): NumberOfCannonsInCastle = -1977660154
  (ints), IsNumCannonsEqualToNumPrincesses = -1211318101 (bools), KickLoserMode = -1834786863 (bools, true).
- Clients send EndTurnRequest only when their local phase time limit runs out (once per phase, latch `+0x7c`;
  `FUN_10074fa0`). The cannon UI goes idle after the last shot without a request, so ending phase 5 early
  needs FireCannon counting. With 0 cannons the client UI sends nothing, and every client skips phase 5
  by itself (startPhase case 5).

### 3.4 Client validation of incoming messages

Clients validate each incoming message in `FUN_100239b0` -> `FUN_10022620`:

- Reliable messages except 11 and 14: `turn <= game.turn`, `0 <= phase < 9`, `0 <= player < 5 or sender == 0`.
- Reliable, except 14 and EndGame (10): `turn == game.turn and phase == game.phase`; otherwise the message is dropped.
- BattleBegin: sender 0 and phase 0. EndTurn: `player == game+0x98` (always true for sender 0).
- Orders 3, 6, 8, and 16 need phase 4 and the player to be the current seat; 4 needs phase 5; 5 is free in phase 2.
- Dropped = logged only (Mac v14/v15 04b348/04b39c); not applied, not acked.

### 3.5 Relay algorithm without simulation

The following algorithm is the project's own design for a relay that doesn't simulate the battle:

```text
state: T=0, P=0, ended4 = {}, done = {}, alive = set of joined teams, lastEndTurnTime
on BattleBegin sent:           T=1, P=2, done={}, lastEndTurnTime=now
emitEndTurn():                 broadcast EndTurn(sender 0, seq=srvSeq++, [0], -1, T, P, 0, 0) to all,
                               then advance(): 
  P==2 -> P=4, ended4={}                       (phase 3 is automatic)
  P==4 -> if every alive team is in ended4: P=5, done={}   else stay P=4
  P==5 -> T+=1, P=2, done={}
on client message m from team s (after ack + forward, see 6):
  if (m.turn, m.phase) > (T, P): resync T,P = m's values (clients are authoritative about the state)
on EndTurnRequest r from team s:
  if (r.turn, r.phase) != (T, P): drop
  P==4: if s in ended4: drop; mark every alive team < s as ended (they were skipped); ended4 += s; emitEndTurn()
  P==2: done += s; if alive ⊆ done: emitEndTurn()
  P==5: done += s; if alive ⊆ done: emitEndTurn()
on PlaceTile from s with P==2: done += s; if alive ⊆ done: emitEndTurn()
on FireCannon from s with P==5: fired[s]++; if fired[s] >= cannons: done += s; if alive ⊆ done: emitEndTurn()
on EndGame from s (reason 0/2/3) or disconnect: alive -= s; ended4 -= s; then
  P==4 and s was the current player: every client already advanced locally (Mac FUN_0003eef6 calls
  endTurn) -> advance() without sending EndTurn
  P==2/5: if alive ⊆ done: emitEndTurn()
timer: if limit(P) != -1 and now - lastEndTurnTime > limit(P) + 30000: emitEndTurn() (phase 4: also add
  the expected current team = lowest alive team not in ended4 to ended4)
```
Needs simulation (relay can only approximate): defeat by castle or princess capture (`FUN_10020da0`), skip
counters in phase 4, whether phase 5 is skipped (no cannons), exact cannon counts with
IsNumCannonsEqualToNumPrincesses, KickLoserMode effects, game over (phase 8), and the MoveUnit state hash.
An undetected defeated player makes phases 2 and 5 wait for the forced end (50 s). Heuristic: drop a seat from
`alive` after it sent nothing for a whole battle turn.

## 4. Phase time limit and forced end
- The limit per phase is the Game blob's `timeLimit` int list (the name `server/gameblob.js` uses), indexed by
  phase. The list is at Game+0xc0, and its reader `FUN_100399c0` (Mac `FUN_0004f574`) loads the list's element
  pointer at Game+0xc4; it returns -1 (no limit) for a phase below 0 or ≥ 9. Captured blobs:
  `[-1,-1,20000,-1,20000,20000,-1,-1,-1]`, so phases 2, 4, and 5 have 20,000 ms. Units: ms (game clock
  `FUN_100edc60` / Mac `FUN_0017b9f4`).
- Reset at every phase change (`FUN_10020b50`) and at every player change in phase 4 (`FUN_1001ea20`).
- Remaining = `limit - (now - start)`, frozen while paused (Mac `rg_BattleFieldLogic_v2_02887e`, v15 pause).
- Server rule (`FUN_1000ddf0` else-branch): if the phase isn't 0, the limit isn't -1, the remaining time is below
  -29,999 ms (more than 30 s past the limit), and the game isn't busy (vtable +0x10; no renderer on the server =
  false), emit EndTurn with the current turn/phase (`FUN_1000ddb0`). This forced end fires 50 s after the phase
  or player turn started.

## 5. Game end and results
- Client decides (BattleLogic v25 Mac 04aa32, run every tick): finished when it isn't busy and either the phase
  is 8, or the phase is ≥ 1 with fewer than two alive Commanders. Phase 8 is set when, after a phase-4 turn,
  fewer than two are alive (`FUN_10020b50`), or when a defeat leaves fewer than two Commanders (`FUN_10020da0`). No
  battle turn limit was found (`NumberOfTurns` is a unit attribute, Mac `FUN_0004e698`).
- Ranks: per-player stats `+0x134` (`FUN_0004bd70`). A leaving or defeated player gets rank = number of alive
  players before they left; the last survivor gets 1 (BattleLogic v20 Mac 04b0a6, v27 Mac 04a6b0).
  EndArenaState shows PLAYER_WINS/LOSES from it. Stats are stored locally (AFTER_BATTLE_STATISTICS in the
  profile, `FUN_100ed2e0`); no result upload exists.
- What the server sees:
  1. EndGame from a client: reason 0 QUIT_GAME or 1 SURRENDER -> that player lost (reliable signal).
  2. A dropped table connection -> the original host made EndGame(reason 2, sender = leaver) itself.
  3. SEAT_LEAVE `00 0e u32 playerId` on 0x15: every client sends it when its BattleLogic finishes
     normally (ArenaGameState tick `FUN_100ec8b0` -> player+0x58 `FUN_1009c410` (only in state 15 SEATED) ->
     table+0x3c `FUN_100cddd0`). Not sent on the sync-error path (CONNECTION_TO_GAME_LOST_CRC_ERROR_HEADER).
     Then EndArenaState and a new CasinoSystem login. SEAT_LEAVE marks "game over", not the winner.
  4. Client 0x16 traffic stops for defeated players: no PlaceTile or EndTurnRequest in phase 2, and no turn in
     phase 4.
- Proposed relay rule:
  1. Players who sent EndGame or disconnected lose, in that order (rank = alive count at that moment).
  2. If exactly one seat is left -> winner (reliable).
  3. Otherwise, when the first SEAT_LEAVE arrives (game over), the winner is the sender of the last order
     message (types 3, 4, 5, 6, 8, and 16) before it. Reliable for phase-4 kills (only the current player acts);
     ambiguous for cannon kills in phase 5 (simultaneous) and for players defeated earlier in three- and
     four-player battles (use the "silent for a whole battle turn" heuristic for their order). Mark such
     results as uncertain.
  4. The only fully reliable alternative is running the engine as ServerBattleLogic (or a headless witness
     client fed the same message stream) and reading the ranks.

## 6. What the server must do during the match, and what breaks clients
Must do (Mac `ServerBattleLogic_v16_0ceec0` per processed message):
1. Ack every reliable client message (type other than 14): MessageAccepted{ackSeq = m.seq, ackSender = m.sender},
   sender 0, to the sender only. Without acks the client never confirms its speculative orders (pending
   queue grows, no snapshots, no reordering).
2. Forward the message unchanged to the recipients: `[0]` -> all players except the sender; else the listed
   indexes except the sender. EndGame reason 3 -> 2. Chat (reliable 0): forward, no ack.
3. **One global order:** for each client, the ack of M must come after every message the server handled
   before M and before every message handled after M. A single-threaded relay that handles messages in
   arrival order gets this for free. Clients use the ack position to reorder and replay (Mac `FUN_000a2ad2`,
   rollback `FUN_000a2a08`).
4. EndTurn on valid requests, auto EndTurn (§3.3), and the forced end (§4). Send EndTurn to all players,
   including the requester.
5. On a dropped connection: EndGame{sender = leaver, seq = last seq seen from leaver + 1, reason 2,
   turn/phase = current} to the others.
Nothing periodic was found at the GameMessage level (no snapshot, keepalive, or hash broadcast). The MoveUnit
hash is optional: leave it 0.

Desync or abort risks:
- EndTurn with a turn/phase different from the clients' state: dropped everywhere -> stall.
- An extra EndTurn in phase 4: all clients skip the next player's turn (consistent, but unfair).
- EndGame with sender 0: clients show CONNECTION_TO_HOST_LOST and defeat every remote player, so every
  client thinks it won (Mac `ClientBattleLogic_v20` -> `FUN_0006e6fc`).
- Forwarding EndTurnRequest: receivers send it back to the server.
- Forwarding EndGame reason 3 unchanged: receivers show PLAYER_SYNC_ERROR. A nonzero wrong hash on MoveUnit:
  the receiver sends EndGame(3) and quits with CONNECTION_TO_GAME_LOST_CRC_ERROR_HEADER.
- PlayerJoined with index 0 or seat 0 (non-observer): rejected, player missing. BattleBegin when the phase or
  the sender isn't 0: rejected.
- Starting with one person: immediate win for that player.

## 7. Unknowns
1. Header field +0x40 (always 0 in server-created messages).
2. Global flag `FUN_100021f0()+0x110` that delays BattleBegin.
3. Exact eligibility details of phase-4 order (`+0x14` must be 1, skip counter `+0x18`), and KickLoserMode effects.
4. Bodies of order messages (3, 5, 6, 8, 13, and 16); needed only to detect defeats. FireCannon (4) is decoded
   in [re_match.md](re_match.md).
