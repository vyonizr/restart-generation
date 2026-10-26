# Rejoining a running battle: the quiet replay

Our notes on what a person's engine does when it takes back a seat in a battle that went on without it ([ADR 0038](../adr/0038-a-battle-seat-outlives-its-session.md)), and on the one change its host makes so that the engine lands in the battle ready to play. The page's helper (`shared/emu/rejoin.js`) is built from this note. Written in our own words ([legal notes](../LEGAL.md)). Addresses are Windows virtual addresses; "the logic" is the client's `ClientBattleLogic`, and its battlefield is the BattleFieldLogic at `logic+0x14` (the `Game` that `server/bot.mjs` reads the turn from). The handshake's steps are those of [re_match.md](re_match.md) §3.

The measurements are from the rejoin spike, `.scratch/rejoin/research/engine-rejoin-feasibility.md`: 2-player battles between headless engines in the emulator, a bot's engine or a person's (a local player with a battle screen, which never pressed a key), at 4× engine speed after the login. Anything no run confirmed is marked [INFERENCE].

## Finding the logic

- The client's battle logic has the vtable `10188d18`. Its tick (slot 5, `FUN_100e1ad0`) runs once per engine frame for as long as the logic exists, with the logic in ECX. A host that watches the tick's first instruction learns the logic's address in every engine, a bot's included.
- The current-logic pointer of the application object (`+0x114`) is set only in an engine with a battle screen, so the tick is the more general way in.
- Slot 0 (`FUN_100e12b0`) is the deleting destructor: it runs the destructor proper, `FUN_100e1060`, with the logic in ECX, and then frees the memory. After that the address is no longer a logic.

## The join state

- `logic+0x38` points to the object that runs the client's side of the handshake; the state number is at its `+4`. The pointer is 0 until that object exists.
- The state machine is `FUN_100e17a0`. Each state handles one handshake step: the JoinInfo it sends in state 2, the index and seat it reads in state 3 (`logic+0x84` is the index), and step 4 in state 4. State 6 means the client has joined: it is reached once step 4 has been handled, at `0x100e198b`.

## State 4: the snapshot and the history

In order, state 4 does the following:

1. It turns the battlefield's visuals off, by calling `FUN_10016300` on the battlefield with 1, loads the snapshot into the logic (`FUN_10006b10`), and turns the visuals on again with a second call to `FUN_10016300` at `0x100e189c`. That call's argument, 0, is pushed by the two bytes at `0x100e1896`.
2. It builds the logic's broadcaster and its queue of incoming messages.
3. It reads each history message with the message factory's reader (`FUN_1000c020`), marks it as coming from the network (`FUN_1000cfd0`), and hands it straight to the logic's `process` (slot 9, `FUN_100e1bf0`). The messages don't go through the incoming queue, so nothing makes them wait for the battlefield.
4. It sets state 6.

The whole history is replayed in one engine tick: 0.16 to 0.24 s of wall time for 21 to 27 messages in a person's engine. The rejoined engine's battlefield is then the same as the other engines' after the same messages (measured with bots' engines, apart from the reference counts in the headers of serialized names).

## `FUN_10016300`: the battlefield's visuals

`FUN_10016300` is a thiscall on the battlefield with one argument, which it pops on return. It keeps the argument as a "visuals off" byte at the battlefield's `+0x160`.

- **With 1** it turns the visuals off: it frees the battlefield's visualizer (`+0x13c`) and clears the pointer, so messages the logic processes change the battlefield but queue no visual events.
- **With 0** it turns them on: when the battlefield has no visualizer, it has `FUN_100130a0` make a new, empty one (the visualizer's constructor is `FUN_100375f0`). After a call with 1, that means nothing queued before survives.

## The busy backlog

A first join's history is short, so replaying it with the visuals on costs nothing. A rejoin's history is the whole battle so far, and with the visuals on, every replayed message queues its animations as if it had just been played:

- The visualizer keeps its events in a queue at its `+0x138`. After a 21-message history, 669 events were queued (measured).
- The battlefield's busy check (`FUN_1000f610`, which asks the visualizer's own check, `FUN_1002fcd0`) says busy until the battle screen has played them all.
- While the battlefield is busy, the logic's tick leaves live messages in the incoming queue (`FUN_10008250`), except in some screen states [INFERENCE: the check on `logic+0x2c`, `FUN_10039360`]. A local player's own turn waits for it too.
- So the engine plays the whole battle's animations back before it catches up. In one run it ended no phase and sent no message for over 4 minutes; in another the queue went from 669 to 215 events in about 14 s of game time and was still busy when last sampled (measured).

A bot's engine has no battle screen, and its never-busy patch (`NEVER_BUSY` in `shared/emu/host.js`) hides the backlog, so a bot jumps to the current state at once.

## The quiet replay

The host makes state 4 replay the history with the visuals off, and turns them on again before state 6:

1. Before the handshake, it writes 1 instead of 0 into the push at `0x100e1896` (`6a 00` becomes `6a 01`), in memory only ([ADR 0007](../adr/0007-patch-the-engine-in-memory.md)). The original bytes it checks also take in the instruction after the push, so the change lands only where that whole sequence matches. State 4 then loads the snapshot and replays the history with the visuals still off.
2. When the replay loop is done, state 4 frees the history's stream with a call and then, at `0x100e1988`, loads the handshake object from `logic+0x38` to set state 6 at `0x100e198b`; the logic is in ESI there. Nothing reads the flags between that call and the function's return. The host watches `0x100e1988` and there calls `FUN_10016300` on the battlefield (`logic+0x14`) with 0, putting every register back afterwards: visuals on, with an empty visualizer, inside the same engine frame.
3. It writes the original byte back, so a later join runs as it always did.

**Why not after the frame.** The spike turned the visuals on after the engine tick in which the join state reached 6. Its headless engines never looked at what `tick` returned. A page does: 0 means Quit ([re_quit.md](re_quit.md)). Done that way in the page's engine, that one tick returned 0 and the engine's clock didn't move in it. The next ticks returned nonzero again and the battle went on, but the page took the 0 for Quit, signed out, and reloaded (measured: three runs). With the stock replay, or with the visuals turned on at `0x100e1988`, no tick returned 0 (measured). [INFERENCE] The rest of that frame expects a visualizer once the logic has joined.

Measured in the spike, with a person's engine rejoining at the cannon phase of a turn with 27 history messages and the visuals turned on after the tick: right after the tick, the battlefield wasn't busy, the visual queue was empty, and the battlefield was at the battle's current state. The engine did nothing in the phase it landed in, which the relay's forced end closed, and from the next phase on it behaved as an engine that never left: its visual queue drained after each phase, and it sent its own EndTurnRequest when its time ran out.

Measured in the page (a real browser against the real gateway, a 2-player ranked battle against a bot, rejoined in tile placement with 4 history messages, the visuals turned on at `0x100e1988`): the engine reached state 6 in the next tick, landed on the battlefield, and ended its own turn when its time ran out in the next player-turn phase.

## What the player sees

The engine shows the arena lobby's list of the players in the match, with the game starting, for about 1.5 s of game time, and then the battlefield (measured, with and without the quiet replay). In the page's engine the application's battle view (`+0x9c`, which `GameHost.inBattle` reads) already exists when the join reaches state 3 (measured).

## Getting the engine to its seat

The engine takes its old table only after it has asked for a match: the server's LOCK and MATCHED_UP for the table work as an answer to its MATCHMAKING, which it sends from the hero selection of Quick Match. Sent before that, MATCHED_UP is ignored or leaves the engine half seated or stuck on the Online menu (measured; details in the spike's notes). So the page reaches the hero selection with the same timed key presses that bring a bot there (`server/bot.mjs`, [ADR 0008](../adr/0008-the-server-runs-bots-as-headless-engine-clients.md)), and the hero it picks doesn't matter: the handshake gives the engine its old seat and, through the history, its hero.
