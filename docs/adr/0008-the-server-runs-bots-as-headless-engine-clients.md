# The server runs bots as headless engine clients

A friendly match can have bots in the empty seats (CONTEXT.md "Bot"). The engine runs AI players only on a battle's host, and this server's battle host is a relay that runs no engine (ADR 0005). So each bot is the original engine running in a worker thread on the server (`server/bot.mjs`, managed by `server/bots.js`). It logs in through the server's own HTTP SNAP endpoint with the browser client's SNAP code, as a person's browser would. It steers the menus with key presses into a ranked Quick Match and waits there. When a friendly match starts with bots, the server starts one bot per empty seat and sends the players and the bots to the same table. Battle code doesn't change: a bot's orders reach the relay like a person's.

In-memory patches (ADR 0007) apply to the bot's engine copy too. Three of them make the bot's own seat an AI player that plays:

- The lobby builds the bot's join info with player type 2, AI player, instead of 0, local player, so the client's own seat becomes an `rg::AIPlayer`.
- The battle doesn't end when every player is an AI player, which is what the bot sees right after its own seat joins.
- The game never reports itself busy. Its busy check waits for visual events that only a local player's battle screen plays back, and the AI doesn't act while the game is busy.

A bot's engine can also run retuned AI profiles, as data in its own copy of `gameplay.pak`; ADR 0010 covers that.

The browser client also gets two patches when the server can run bots: the friendly lobby shows and accepts **Start** for a player alone in the room, who gets bots in every empty seat without being asked. When 2 or 3 people are listed, the page holds the engine's start message, asks "Fill the empty seats with CPU players?" in a box over the game, and sends the answer before the start message goes on. Select answers Yes and Back answers No. Any member who presses **Start** can answer, not only the host. The server tells the page whether to ask, and the page drops the held start if another member started the match meanwhile. With 4 people listed, or on a server that can't run bots, **Start** works as before. The game still lets only a player with at least one friend create a room.

## Considered options

- **A person's client runs the bots.** Rejected because the load falls on that player's device, which might be a phone, the relay would need one connection to send for several players, and Java clients can't host bots.
- **Run RedLynx's `ServerBattleLogic` on the server.** It's the most faithful option and would also give real battle results, but it needs new reverse engineering and would replace the relay.
- **A switch on the page.** The first design: a checkbox the browser remembered, sent at login. Replaced because players overlooked it and it fixed the choice for every match instead of the one being started.
- **A prompt inside the engine.** The engine has no yes/no dialog its code can call: each one is a sheet in `menus.pak`, and only screens with a menu-event listener get the answer, which the friendly lobby lacks. It would need a rebuilt `menus.pak`, text in five languages and a trap on the lobby's key handler, and any mismatch in a player's game files would skip the patch (ADR 0007). The page's box needs none of that. Revisit only if the box looks out of place.

## Consequences

- The page and this server add three messages of their own, outside the original protocols:
  - SNAP command `901` asks what **Start** in a room does about bots: `ask`, `go` or `gone`.
  - SNAP command `900` carries the answer for the next start.
  - `GET /bots` tells the page whether to apply the patches and ask.

  The engine never sees them. The page recognizes the start message by its bytes.
- While the box is open the player is already locked into "Game starting", so it has no Cancel.
- Bots need the server's own copy of the game (`RG_GAME`). Without it, the page never asks and applies no bot patches.
- Each bot is a full emulator: a worker thread with 350 to 410 MB of memory. In battle it uses little CPU, about 2% of a core, because it never draws the battle.
- A bot's password is a key that exists only in the server process, and its account is never saved.
- The AI decides at once, with no visible thinking delay, and plays at its full strength: its think budget is measured on the engine's virtual clock, so it always gets the maximum.
- Steering the menus by timed key presses depends on the engine's menus and timing. A change to either can stop a bot from reaching Quick Match; the server then gives up on it after 60 s.
- The engine's own Random hero would pick the same hero every time, since a headless engine with the same inputs runs the same way, so the bot steps to a random hero itself.
