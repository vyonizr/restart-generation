---
status: accepted
---

# An absent player is timed out at the phase time limit

Amends [ADR 0038](0038-a-battle-seat-outlives-its-session.md), which let the silence rules and the forced end end an absent player's turns. A live player who does nothing is ended by their own engine when the phase time limit runs out, 20 s in the battle templates. An absent player's engine isn't running, so nothing ended their turn in the player-turns phase until the forced end, 50 s after it began. The others watched the countdown reach 0 and the battle stand still for 30 s more, which looks like a bug. And the server only learned that a browser had gone when its session ended, 45–50 s after its last request, unless a reload's new login ended it sooner. So the forced end usually came first anyway.

Now the server times out an absent player as their own engine would have if it were still running:

- **Who is absent for timing.** A person, never a bot, whose seat is held (ADR 0038), who is taking it back, or who took it back in the phase or turn under way, since their engine does nothing in the phase it lands in. Also a person whose session the gateway can no longer reach, though it hasn't ended yet: a browser that has sent no request for 20 s (a live page always has a poll held at the server for at most 15 s and sends the next one at once), or a Java client whose TCP connection closed. That flag clears at the session's next request. Phases already ended stay ended, because time lost while absent isn't given back.
- **The player-turns phase.** The server sends EndTurn for an absent player's turn 3 s after its phase time limit. The 3 s matter when the server's idea of whose turn it is is wrong: the clients skipped a defeated player nobody reported, and the live player whose turn it really is ends it with their own request, which then gets in first. Otherwise one turn would be ended twice.
- **Tile placement and cannons.** An absent player is done when the phase time limit runs out, and not before. The rules that count a silent player done sooner (silent for a whole turn) or later (presumed defeated after 30 s) don't apply to them. They hold the others up exactly as long as a live player who does nothing.
- **A relaxed match.** It has no phase time limits, so an absent player is timed out at the battle template's limits, 20 s.
- **Everyone else is unchanged.** A silent player who is still connected keeps the silence rules and the forced end. The rejoin window is still 2 minutes, after which the seat drops out and is defeated.

## Considered options

- **Time out every silent seat at the phase time limit.** Rejected: the 30 s overtime lets a live player's last order arrive late over the network, and the server can't tell a slow player from a stopped one.
- **Count an absent player done at once in tile placement and cannons.** Rejected: the others should see the same wait as for a live player who does nothing, not a different pace.
- **Let the page tell the server when its tab closes** (a `pagehide` beacon). Not done: a crash, a lost network, or a sleeping phone send nothing, and the 20 s silence covers those and a closed tab alike.
- **Hold the seat until the battle ends.** Rejected again, as in ADR 0038: even at 20 s a phase, the others would have to defeat an empty seat the long way.

## Consequences

- A browser player whose network drops for more than 20 s loses the phases that run out meanwhile, which their own countdown would have ended anyway.
- A Java client that falls back from TCP to HTTP counts as a browser for the 20 s silence rule.
- `server/battle.js` reads the gateway's `api.unreachable(session)`; the gateway keeps each session's last TCP connection and marks the session when that connection closes.
