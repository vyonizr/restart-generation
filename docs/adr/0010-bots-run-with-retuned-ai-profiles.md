# Bots run with retuned AI profiles

Bots play at the engine's own strength (ADR 0008), and that proved too easy: the engine AI is a greedy, one-move-ahead scorer with no lookahead, so a skilled player beats it with no risk. The engine has no difficulty setting. Its strength comes from six situational AI profiles, plain integer weights in `data/gameplay/ai/AIS*.xml` inside `gameplay.pak`. The server retunes the four working profiles (`AISD`, `AISGTP`, `AISGH`, `AISROP`) for the Bots' engines only. A committed deltas file lists `profile / key / value` triples. At start the server applies them to the XML read from the player's own `gameplay.pak`, rebuilds the pak in memory, and gives it to each Bot's engine before boot. The engine reads each profile once per process, so the override must be in place before the first AI player is built. `AISMT` (mind-tricked) and `AISF` (frogged) stay stock because their behavior is deliberate. People's engines never see the change.

This is a second kind of in-memory change beside the patches of ADR 0007: replaced data instead of replaced code. ADR 0007 forbids file changes in the player's game copy, in browser storage and on disk. The Bot's pak exists only in the server process's memory, and the original stays untouched.

## Considered options

- **Load the `Agressive/` profiles in the game's data.** Rejected: they are a stale snapshot from before special skills, threat fields and movement-cost distances existed. They lack about 75 of the live keys, which would load as 0, and use tile-based distance thresholds (3 and 7) where the live files use movement cost (1200 and 2100). The engine never loads them, and no mission sets the `AIType` that would select them.
- **Raise the AI's think budget.** Rejected: the budget only paces how many board cells the analysis handles per tick. It changes how fast the AI decides, not how well, and it is already at its cap on the virtual clock.
- **Choose moves on the server.** Rejected: it duplicates the game rules outside the engine, and the server only relays battles (ADR 0005).
- **Add lookahead inside the engine.** Deferred, not rejected. It is the only change that fixes short-term-only play, but it means reverse engineering and patching the scorer. It is worth doing only if weight tuning plateaus below the target.
- **Commit modified copies of the XML files.** Rejected by ADR 0001: players bring their own game files. Deltas applied to the player's own copy keep game data out of the repo.

## Consequences

- The strength target is that a competent human wins about half the time against 1 Bot. The gate is self-play: the stock Bot against the retuned Bot over 20 battles, and the retuned Bot wins at least 70%. That shows "stronger than stock", not "stronger against humans", so a human playtest decides.
- Bots don't cheat: no hidden information, no bonus resources.
- A delta whose key is missing from the player's XML fails at server start, which catches a game-version mismatch.
- The server needs a pak writer. `tools/re/pakx.js` only extracts.
- One fixed strength for all Bots and heroes stay random. A difficulty choice or a hero restriction would be a new decision.
