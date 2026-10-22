# The server follows every battle with a witness

This decision replaces ADR 0005.

Until now, the server relayed battles and guessed the winner: the last player standing, or else the team that sent the last order. ADR 0005 says the battle logic, `ServerBattleLogic`, "shipped only on the server". That is wrong. The engine DLL contains it, and single-player and the engine's own QuickMatch mode use it (`docs/re/re_match.md`, section 1). What only the Arena server did was run it as the host of an online battle.

Now a server with a **server copy** of the game (CONTEXT.md) runs one engine in a worker thread, the **witness**. The witness follows every battle, ranked and friendly, from the relay's own message history (`table.history`). It does this the way the engine's own replay logic does, so it needs no seat and no connection. The engine then decides two things that the server used to guess:

- **The result.** Every player the witness ranks first gets the win and +10 fame. A tie gives two winners. If nobody is ranked first, nobody wins. Each player's own result screen shows the same ranks, so the stats always match it.
- **Defeats.** The server stops waiting for a player the moment the witness sees their defeat. A phase ends as soon as every remaining player is done, and a defeated player's turn is skipped. No living player loses time.

The relay stays as it is: it acknowledges, orders and forwards messages, and it sends the EndTurn messages that move the clients on. The silence guesses stay as well (`server/battle.js`): with a witness they only speed up battles with a stopped player, and without one they work as before.

A server without a server copy, or one whose witness fails, records a **guessed result** (CONTEXT.md). The admin sees why in the log. Players aren't told, because their own result screens are correct either way.

To give a server a copy without sending it to every visitor, the two become separate settings. `RG_GAME` is the server copy, which the witness and the bots run. `RG_SEND_GAME=1` sends that copy to visitors (ADR 0001). The `RG_CONTACT` rule in `docs/LEGAL.md` moves from `RG_GAME` to `RG_SEND_GAME`. This ADR is the record that `docs/LEGAL.md` requires for that change.

## Considered options

- **Keep guessing (ADR 0005).** Rejected. A ranked result could be wrong, and in a relaxed match a defeat the server missed held a phase for up to 3 minutes. The guesses stay only as the fallback.
- **Run the engine as the battle's host, as the Arena server did.** That would mean a network-host `ServerBattleLogic` that checks orders and state hashes. Rejected:
  - It replaces the relay and its liveness tests.
  - Catching cheats was ruled out of scope.
  - In the measured runs, a host-mode logic hung on the second battle in the same engine. Its acknowledgements go through a connection hub that has no connections.
- **A witness client that joins each battle as an observer over SNAP.** Rejected. The relay has no observer seat. It also needs a SNAP session and a login, and it costs a whole client per battle. Fed from `table.history`, the witness needs none of that.
- **One engine per battle.** Rejected. One engine (272 MB) followed several battles at once with the same results as one engine each, at 1 to 5 ms per message.
- **A witness for ranked matches only, with friendly matches left to the admin.** Rejected once one shared engine was measured. A witness costs the same for 1 battle as for 20. Relaxed friendly matches, which stall the longest after a missed defeat, gain the most.
- **Keep `RG_GAME` meaning "send", and add a separate setting for a copy that is only run.** Rejected. Sending the game is the legally risky act (`docs/LEGAL.md`), so it has to be an explicit choice of its own, never a side effect of giving the server a copy.

## Consequences

- **A breaking change.** An admin whose server sends the game must add `RG_SEND_GAME=1` when updating. The release is a `feat!` with a `BREAKING CHANGE:` footer.
- **The server copy costs memory.** The witness takes about 272 MB and grows about 5 MB per battle, because the engine frees nothing. The server restarts it after a fixed number of battles, and a restarted witness catches up from the history of every battle still running in under a second.
- **ADR 0008 is unchanged.** A public server still runs no bots, even with a server copy.
- **Three engine details** are described in [`docs/re/re_witness.md`](../re/re_witness.md) before any code uses them (`docs/LEGAL.md`, rule 4):
  - the default battle settings must be loaded before a Game is built;
  - the battlefield must never report itself busy;
  - one finish-check clause, which ends a battle that has no local player, is patched off, in memory only (ADR 0007).
- **The witness doesn't prove an honest client.** A modified client can still misreport its own turn state, as ADR 0005 noted. The witness only reproduces what honest engines compute.
- **Two cases have never been observed:**
  - **The original Java client.** It runs the same engine DLL (an identical SHA-256), but the emulator's floating point has never been compared with real hardware in a witnessed battle.
  - **Two players defeated in one step.** The tie rule above covers it whatever the engine computes.
