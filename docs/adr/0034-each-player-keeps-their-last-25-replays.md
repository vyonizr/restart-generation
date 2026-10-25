---
status: accepted
---

# Each player keeps their last 25 replays

This decision replaces the 30 days of ADR 0022 and reverses the option "Keep the last N replays of each player instead of 30 days" that ADR 0024 rejected.

A replay was kept for 30 days. A player who came back after a month found an empty **Replays** list, while one who played every evening had a list longer than anyone scrolls. The original kept "a replay of every game that player has ever played" (ADR 0024). Games that keep replays on their servers keep the last few matches instead of a period: Overwatch 10, Halo 3's Theater 25, Brawl Stars' and Clash Royale's battle logs 25.

Each player now keeps the replays of their last 25 battles. A replay belongs to up to four players, so it is shared: a battle leaves a player's list when that player has played 25 newer ones, and the server deletes the replay once it is in the last 25 of no player whose account still exists. A new battle that pushes a player past 25 takes the oldest one off their list at once. There is no time limit any more. ADR 0024's objections are answered this way:

- **A per-player count deletes a battle from players who are still within their limit.** It doesn't: leaving one player's list deletes nothing while another player still has it.
- **Or it keeps a battle as long as any of them stops playing.** It does, and that is bounded: at most 25 replays per account, a few kilobytes each.
- **Guests would need a time limit anyway.** A guest's account is wiped a day after its last game (CONTEXT.md "Guest"), which takes the guest's replays off its list like any other account that no longer exists.
- **A link's lifetime would depend on how much its players play.** It does. A link shared after a battle works until every player in it has played 25 more battles, or deleted their account. That is the cost, and the reason to record this decision.

## Considered options

- **Keep 30 days.** Rejected for the reasons above: the list is empty for someone who plays once a month and endless for someone who plays daily.
- **The last N per player, and 30 days on top.** Rejected. The count already bounds storage, so the second limit only adds a rule players have to learn.
- **N set by the admin (`RG_REPLAYS_KEEP`).** Rejected. The only reason to change it is storage, which 25 per account doesn't strain, and a fixed number keeps the Privacy policy the same on every server.
- **N = 10, as Overwatch.** Rejected. Our battles are shorter, and the dialog shows about 17 at once.

## Consequences

- `server/replays.js` drops a player's rows past their newest 25 when it saves a battle, and its hourly sweep drops the rows of accounts that no longer exist, then deletes every replay no row holds. A server that starts with older replays applies the same rule to them on its first sweep.
- Each player's row also records their seat, so the **Replays** dialog can say whether the listed player won and which hero they played, even when their name in the replay is no longer the account's name. Replays saved before that get the seat from the names they recorded, where a name still matches.
- `GET /replays` lists at most 25 replays and no longer says when a replay expires.
- The replay page's gone state no longer says "expired". The Privacy policy, the hosting guide, and the product and design docs say "the last 25 battles" instead of 30 days, and the Privacy policy's date moves.
- Account deletion still deletes every replay of a battle the account played (ADR 0024), and `RG_REPLAYS=0` still keeps none.
