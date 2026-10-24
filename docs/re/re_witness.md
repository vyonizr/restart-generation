# Following a battle with the engine: the witness

Our notes on how a server can run the engine's own battle logic beside a battle it relays, without menus, a seat, or a connection, and read who was defeated and who won. The server's witness (`server/witness.mjs`, [ADR 0020](../adr/0020-the-server-follows-every-battle-with-a-witness.md)) is built from this note. Written in our own words ([legal notes](../LEGAL.md)). Addresses are Windows virtual addresses; "the logic" is a `ServerBattleLogic`, and its battlefield is the BattleFieldLogic at `logic+0x14` ([re_rules.md](re_rules.md)).

Everything here was observed by running the engine in the emulator, following battles that bots played on the relay and that the relay recorded, unless it is marked [INFERENCE].

## The engine's own precedent

The engine already replays battles: a `ServerBattleLogic` subclass (vtable `10177578`, constructor `FUN_10006410`, created by `FUN_10044310`) reads a Game and a recorded list of messages from one stream and feeds the messages back through the logic's `process`. It turns every PlayerJoined into a remote player (type 3, `FUN_10006110`). The witness does the same, fed live from the relay's message history instead of a recording.

## Calling into the engine

The witness calls engine functions directly, as the C++ code would: `this` in ECX and the arguments on the stack. Memory comes from the engine's own `operator new` (`FUN_1014ffa4`, cdecl). Bytes reach the engine's readers through a memory stream: `FUN_100f3800(this, 1, 1)` builds one in 0x40 bytes, with its input side at `+0` and its output side at `+8`. Writing bytes through the output side's first virtual method (buffer, length) fills it, and the input side then reads them from the start.

## Boot: the default battle settings first

- The engine boots as a host would boot it (`GameHost.boot()`), and then runs engine frames.
- A `Game` (constructor `FUN_1003f2d0`, 0x25c bytes) takes its tile-shape count from the default battle settings, which the constructor imports (`FUN_1003de20`; only that import sets the count, through `FUN_1003db40`). `Game::read` (`FUN_1003e440`) never sets it.
- The default battle settings are loaded during the first engine frames. A `Game` built before they are loaded has a count of 0, and the first tile it deals is taken modulo 0 (`FUN_100104a0`): the CPU faults with a divide error on BattleBegin.
- How to tell they are loaded: build a probe `Game` after each frame and read its tile-shape count at `Game+0x11c`. It is above 0 from the third frame on. The first frame also creates an engine-wide object that the battlefield's constructor needs.
- After that the witness runs no more frames, so the engine's menus never run and its clock never moves.

## Three patches, in memory only

Each one is written only over the original bytes ([ADR 0007](../adr/0007-patch-the-engine-in-memory.md)):

- **Never busy.** The battlefield's busy check (`FUN_1000f610`) returns "not busy" at once, the same patch the bots use (`server/bot.mjs`). It waits for the battlefield's visual events, which only a battle screen plays back. The finish check (`FUN_1000d4c0`) waits for "not busy", so without the patch the battle is never marked finished and the winner is never ranked (observed: phase 8 reached, winner's rank still -1).
- **No early finish.** The finish check has a clause that ends the battle when the logic isn't a network host and has no local player. The witness has only remote players, so without the patch the battle "finishes" at turn 1. The conditional jump at `1000d4da` that guards the clause becomes an unconditional jump over it.
- **Client mode.** The server logic's FireCannon and PlaceTile handlers (vtable `101779a0`, slots 16 and 17: `FUN_1000e430` and `FUN_1000e4f0`) call the base handlers (`FUN_10007970` and `FUN_100078e0`) and then make their own EndTurn after the last shot or tile. The witness points both slots at the base handlers, so the logic moves on only on the relay's EndTurn messages, in step with the clients. Without this, the relay's EndTurn arrives after the logic has already moved on, and the engine's validator drops it (19 times in a 130-message battle); the ranks were the same either way.

## Starting a table

1. Build a `Game` (`FUN_1003f2d0`) and read the table's Game blob into it with `Game::read` (`FUN_1003e440`), the blob each client gets in handshake step 1 ([re_match.md](re_match.md) §3).
2. Prepare it for a logic with `FUN_100400c0`, as the replay state `FUN_10044310` does before it builds its logic.
3. Build the logic (constructor `FUN_1000ecd0`, 0xb4 bytes) on that `Game` with no connection hub, no listener and flags 0, and call its start method (vtable slot 4, `FUN_1000eeb0`). That builds the battlefield from the `Game` and arms the start check.
4. Clear the start check (`logic+0xb0`), so that only the relay's BattleBegin starts the battle.
5. Load the table's pre-join snapshot into the logic with `FUN_10006b10`, as each client does in handshake step 4 (`FUN_100e17a0`). The logic's state then matches every client's starting state byte for byte.

Several tables can live in one engine, each with its own `Game` and logic; their messages can be fed in any interleaving. The engine's shared message queue, battle object, and current-logic pointer didn't interfere. The current-logic pointer is read only by screen code, which the witness never runs.

## Feeding one message

Each relayed message goes in as the raw bytes of a whole GameMessage (header and body, as the relay keeps it):

1. The message factory (`FUN_10005710`) reads it from a stream with `FUN_1000c020`.
2. The message is marked as coming from the network (`FUN_1000cfd0` with 1), as the client's history replay does, and gets a reference (`FUN_100f3e60`).
3. `ServerBattleLogic::process` (`FUN_1000e150`) handles it.
4. The logic's tick (`FUN_1000ddf0`) runs twice, for the automatic phases and the game-over check.

The logic's own forced end can't fire, because its clock never moves. A finished logic (a nonzero byte at `logic+0x28`) takes no more messages, as in the clients.

## Reading defeats and ranks

- **Defeats.** The battlefield's Commander array (`BattleFieldLogic+0x2c`, with its slot count at `+0x28`, indexed by seat) gets a Commander for a seat when its PlayerJoined is processed. When the seat is defeated, by a capture or by an EndGame, its slot is cleared while the defeating message is processed. A seat that had a Commander and has none is therefore defeated.
- **Ranks.** The per-player stats list is at `logic+0x1c`: its entry count at `+0xc` and its entry pointers at `+0x10`, indexed by player index. The rank is at entry `+0x134`: -1 while unranked, then the number of players still alive when the player fell, and 1 for the winner, as `server/bot.mjs` reads them. The relay gives each player the same index as its seat. They are final once the logic is finished.
- [INFERENCE] If two players fall in one step, both may get the same rank, so a battle may have two players at rank 1, or none. It was never observed.

## Reading moments

The witness also tells the server each moment (CONTEXT.md) and the message that brought it about, for the replay's marks ([ADR 0030](../adr/0030-replay-marks-are-worked-out-by-the-witness-when-the-replay-is-saved.md)). The detail and the observations behind it are in `.scratch/replay-marks/research/moment-detection.md`. After each message it compares the state with the state after the message before:

- **The index.** The worker counts the messages it was given for the table since its start, including the ones a finished logic no longer takes. That count is the message's place in the table's history, since the relay records and feeds each message in one step and the replay text keeps every one.
- **Each seat's Commander,** read through its slot every time, because a defeated seat's Commander is freed later and its memory reused: the knock-out count at `+0x20`, which rises by one each time the seat's hero is knocked out, and the princesses at `+0x24`, the seat's own princess while she is home plus every princess it rescued.
- **What each hero carries.** The battlefield's unit list starts at `+0x6c` (a node is `+4` next, `+8` unit). A unit whose kind at `+0xe4` is 0 is a hero, its owner seat is at `+0x30`, a removed unit has a nonzero byte at `+0x34`, and a hero's carried princess is at `+0xec`, with her owner at her own `+0x30`.
- **A rescue** raises the rescuer's princess count while its hero carried another seat's princess before the message. When the hero carried nothing before it, the princess came to it within the same message: a knock-out handed it the victim's princess while it stood in its own castle, and the rescue defeated her seat, whose slot is now clear. Bringing its own princess home raises the count too, and is not a rescue.
- **A knock-out** raises the knock-out count. A seat defeated in the same message has no slot left to read, so a knock-out of its hero then goes unseen; the rescue that defeated it marks that turn anyway.
- **The turn.** The battlefield's battle turn (`+0x9c`), phase (`+0x94`) and current seat (`+0x98`). Each moment names the last message after which those three changed before its own: the opener of the turn it happened in (BattleBegin, an EndTurn, or the current player's EndGame).

## Why the logic doesn't run as a network host

The Arena server ran the logic as a network host (flags `logic+0x90` bit 0), which also avoids the early-finish clause. But a host logic acknowledges each message through its connection hub, and the witness's hub has no connections. The second battle followed in the same engine then looped forever in `FUN_1005c140`, called from `FUN_10112750` (observed). The witness therefore runs it with flags 0 and patches the clause.

## Cost

Measured with recorded 2-player battles: the engine boots in about 2 s; starting a table takes 15 to 70 ms; a message takes 1 to 5 ms; the booted engine holds about 270 MB; a whole battle's history replays in 0.06 to 0.74 s. Every battle followed leaves about 0.4 MB of the emulated heap and about 4 MB of the worker's own memory behind, even with the logic destroyed at the end (vtable slot 0, `FUN_1000f140`), so a long-running witness is restarted from time to time.
