# The server relays battles

Superseded by [ADR 0020](0020-the-server-follows-every-battle-with-a-witness.md).

In Arena, a battle had no host client: RedLynx's server ran the battle logic, `ServerBattleLogic`, as player 0. That code shipped only on the server, so `server/battle.js` stands in for it as a relay that runs no simulation. It acknowledges and forwards orders, ends turns, and follows the turn and phase of the clients that are ahead. The clients compute the result locally and send none, so the server decides the winner by a heuristic: a player who leaves loses, the last player standing wins, and otherwise the team that sent the last order wins. The relay was the only design available when it was built, because the engine could run only inside the Java client on Windows.

## Considered options

- **Run the engine on the server, as `ServerBattleLogic` or as a client that watches the same messages, and read the real result.** Not possible when the relay was built. The emulator in `web/emu` runs the engine in Node, so this option can be built, and it's the way to replace the heuristic.

## Consequences

- A ranked result can be wrong. For example, all players fire cannons at the same time, so when cannon fire makes the last kill, the last order doesn't identify the winner.
- The server trusts the clients for the turn state and sends a state hash of 0, so a modified client can misreport.
