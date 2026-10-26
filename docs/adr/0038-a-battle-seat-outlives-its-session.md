---
status: accepted
---

# A battle seat outlives its session

Until now, a player dropped out the moment their SNAP session ended. That happens after 45 s of silence, or at once when a reload's new login replaces the old session (ADR 0004, ADR 0009). `battle.leave()` then broadcast EndGame reason 2, which every engine treats as a defeat that can't be undone. So a reload, a crash, or a phone asleep for a minute lost the battle, and a ranked one cost fame.

Now the end of a session and the end of a seat are separate:

- **A held seat.** When a session ends during a running battle without the engine leaving it (no EndGame of its own, no SEAT_LEAVE), the server holds the seat for a **rejoin window** of 2 minutes, fixed in code. The player is an **absent player** (CONTEXT.md). The others see a stopped player: the silence rules and the forced end end their turns, nobody waits for them, and no page tells the others anything. Only when the window runs out does the server send EndGame reason 2. Leaving through the game's own menus stays immediate and final.
- **A seat belongs to the account.** A new session of the same account takes the held seat. The latest login wins, so a second tab or a second device takes the seat over, and on a server that isn't public, anyone using the name does too (ADR 0009 already accepts that).
- **The way back is Quick Match.** The engine takes its old table only after it sends MATCHMAKING. Sent earlier, MATCHED_UP is ignored or breaks the session (`.scratch/rejoin/research/engine-rejoin-feasibility.md`). The server answers any MATCHMAKING from an account with a held seat with LOCK and MATCHED_UP for that table, on the casino type the engine asked on. That holds for friendly matches too: `finishMatch` reads the table's own `ranked`, so a friendly result stays stat-free.
- **Rejoin or Leave, before Start.** Before Start, the page asks the server whether the account holds a seat, with the same credentials as its login (the name, or on a Discord server the name and token), so nobody else can see or give up a member's seat. A seat its old session still plays counts as held, with the whole window ahead: after a reload the old session stays seated until the page's new login ends it, and the page asks before that login. If it does, Start gives way to a card that asks "Rejoin?" and shows the kind of match, the seats with the player's own marked, and the time left as a meter and a clock, with a large **Rejoin** and, under it, a secondary **Leave**. The card explains with these, not with sentences, and the full wording goes to screen readers only.
  - **Rejoin** starts the engine and the page presses the menu keys itself, as `server/bot.mjs` does, from the start screen to Quick Match and a hero, while the player's input waits. The card lists those steps as they pass. If the drive fails, a strip at the foot of the screen shows Arena → Quick Match → Hero, the clock, and **Leave**, so the player can do it by hand before the window ends.
  - **Leave** gives the seat up at once. The server sends EndGame reason 0, as when a player leaves through the game's menus, so the others see that the player left rather than disconnected, and the battle counts as a defeat. The page then goes on to Start as usual.
  - **When the window ran out** while the page was closed, the card says "Dropped out" with the player's seat hollow, and **OK** goes on to Start.
- **The rejoin handshake.** The server rebinds the seat to the new session and keeps its index, team, and hero. It sends step 3 with the old index and team and step 4 with the pre-join snapshot and the whole history. It never sends a second PlayerJoined, which would reset the seat's Commander in every engine. Battle frames for the new session wait until step 4, but its pings don't, because the engine's PingService closes the table connection about 10 s after a missing PONG. The silence rules then count the seat as having acted through the current turn, or its next tile phase would end on it at once.
- **A replay without animations.** The page's engine replays the history with the battlefield's visuals off and switches them back on inside the join itself, before it marks itself joined (an in-memory patch and a hook, armed only while a rejoin is pending, ADR 0007, `docs/re/re_rejoin.md`). Without the patch, it queues every replayed animation and stays busy for minutes; switched back on one frame later instead, the engine reports that frame as its last, which the page takes for Quit. The player does nothing in the phase they land in, and from the next phase on they play normally. Time lost while absent isn't given back.

## Considered options

- **Stretch the 45 s idle logout.** Rejected: a reload ends the session at once whatever the limit, and a longer logout keeps a closed browser in rooms and lobbies.
- **Hold the seat until the battle ends.** Rejected: the others could play against an empty seat for the whole battle, three minutes per phase in a relaxed match.
- **Pause the battle for an absent player.** Rejected, as already decided for short network drops (`.scratch/touch-over-internet/issues/04-while-the-connection-is-lost.md`): it would let any player stall every battle.
- **Let the server pull the engine back as soon as it enters Arena.** Rejected because the engine doesn't allow it: before CASINO_ENTER, MATCHED_UP breaks the session, and on the hero-selection screen the engine joins the room but never takes its seat (measured).
- **Undo an EndGame for a player who comes back.** Rejected: once survivors have it, the seat is defeated in their engines, and in a 2-player battle the survivor wins at once (measured).
- **A page notice telling the others who is absent.** Rejected for now: the engine can't show it, and it would be the first battle UI the page draws outside the engine. It can be added later without changing this decision.

## Consequences

- A friendly-match player who rejoins goes back to the Quick Match lobby after the battle, not to their friendly room. Whether the engine's own statistics in the saved game count that battle as a Quick Match hasn't been checked.
- `casino.onLeave` keeps the bots running while a person's seat is held. Otherwise a battle of one person and bots would end during the window.
- The page needs one new request to the server, `POST /seat` (`docs/protocol.md`), carrying the login's credentials. It asks whether the account holds a seat (which kind of match, its seats, the player's own seat, and how long is left), or with `leave` gives it up. To show "Dropped out", the server remembers an account's last seat that dropped out, in memory, until that account next asks.
- Measured: 2-player battles between headless engines at every phase, a 4-player one (a seat rejoined in tile placement, and all four engines and the witness agreed on the ranks), and one person's rejoin in a real browser during tile placement. The Discord sign-in path in a browser hasn't been run.
