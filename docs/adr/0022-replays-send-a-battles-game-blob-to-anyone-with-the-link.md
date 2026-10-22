# Replays send a battle's Game blob to anyone with the link

A **replay** (CONTEXT.md) plays in the engine's own replay player, the one the original website used. That player reads two things: the battle's Game blob and the battle's orders, each with the time it was received. It reads nothing else ([re_replay.md](../re/re_replay.md), "The replay text"). The Game blob comes from a battle template, and `docs/LEGAL.md` said templates are never sent to a browser. We accept sending it, because every player of a battle already receives that Game blob, together with the snapshot, when the battle starts (`docs/re/re_match.md`, section 3). A replay sends the same Game blob, without the snapshot, to anyone who has the link. It plays only in a browser that has the game: the visitor's own copy, or one the server sends (ADR 0001). The page fetches it to play it and never offers it as a file to download.

## Considered options

- **Only the battle's own players can fetch it.** Rejected. Sharing a link to a battle is the point of the feature, as it was on the original site.
- **Keep the Game blob on the server and send only the orders.** Not possible. The engine's player builds the battle's starting state from the Game blob alone, and the replay data has nowhere to put anything else.

## Consequences

- The template rule in `docs/LEGAL.md` changes with this ADR, which is the record it requires: the templates themselves stay on the server, and a battle's Game blob goes to the battle's players and to anyone with its replay link.
- An admin can turn replays off. That stops this exposure without stopping online play, which helps if a notice names replays.
