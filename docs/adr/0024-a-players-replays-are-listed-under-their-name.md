# A player's replays are listed under their name

The replay notice after a battle (ADR 0022) was the only way to reach a replay: once a player dismissed it, or the next battle replaced it, the link was gone. Each replay is now also listed under the name of every player in it, for anyone to see, for its 30 days, and `GET /replays?name=` returns the list. That is what the original game did. Nokia's producer described its website this way: "When you click on any player name on the Reset Generation website, you will be taken to that player's 'player page' which houses a replay of every game that player has ever played" ([Pocket Gamer, July 2008](https://www.pocketgamer.com/reset-generation/n-gage-reset-generation-interviews-a-go-go-reveal-more-exciting-details/)). A listing open to anyone works the same on every server: a name-only server has no identity to check anyway (ADR 0009), and on a Discord server the names are the ones the rankings already show.

The page lists only the player's own name: **Replays** sits in a member's Account menu, beside a guest's **Sign in with Discord**, and on the "Online as" line of a name-only server, and it opens the **Replays** dialog. It is hidden when the server keeps no replays (`RG_REPLAYS=0`).

## Considered options

- **List replays only to their player.** Rejected. It needs the account's token on a Discord server, and on a name-only server anyone who types a name is that player, so the list would be private on one kind of server and public on the other. The original made them public.
- **Keep the last N replays of each player instead of 30 days.** Rejected. One replay belongs to up to four players, so a per-player count either deletes a battle from players who are still within their limit or keeps it for as long as any of them stops playing. Guests would need a time limit anyway, and a link's lifetime would depend on how much its players play. 30 days stays (ADR 0022). Reversed by [ADR 0034](0034-each-player-keeps-their-last-25-replays.md): each player keeps their last 25, shared, and a replay goes once no player has it.
- **Ask for the list with a SNAP command, as the bots' commands do.** Rejected. It works only while the player is online, and the Start screen comes before that.
- **A page for each player, `/player/<name>`, reached from other players' names.** Not yet. The rankings and friends are inside the engine, which can't link anywhere, so such a page needs its own way in. The route already answers for any name.
- **Delete a replay from the list.** Rejected. A replay belongs to every player in the battle, and none of them can agree for the others.

## Consequences

- The Privacy policy says that a player's replays are listed under their name for anyone to see, and the date it last changed moves.
- A name lists the account that holds it now. Replays are linked by account id and ids are never reused, so a new guest who gets a freed `Guest` name, or a name-only player who changes name, starts with an empty list. A wiped guest's replays stop being listed but stay watchable by link until they expire.
- When a guest signs in to a member that already exists, the guest's replays move to the member before the guest is deleted, so the list keeps them. A guest who becomes a new member keeps its id and its list.
- The route has no rate limit: what it lists is public, and each answer costs about as much as a replay page.
- On a touch device, **Replays** is on the Start screen, which is hidden while the game runs.
