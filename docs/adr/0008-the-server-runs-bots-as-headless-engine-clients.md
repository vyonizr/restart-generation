# The server runs bots as headless engine clients

A friendly match can have bots in the empty seats (CONTEXT.md "Bot"). The engine runs AI players only on a battle's host, and this server's battle host is a relay that runs no engine (ADR 0005). So each bot is the original engine running in a worker thread on the server (`server/bot.mjs`, managed by `server/bots.js`). It logs in through the server's own HTTP SNAP endpoint with the browser client's SNAP code, as a person's browser would. It steers the menus with key presses into a ranked Quick Match and waits there. When a player with the bot switch on starts a friendly match, the server starts one bot per empty seat and sends the players and the bots to the same table. Battle code doesn't change: a bot's orders reach the relay like a person's.

In-memory patches (ADR 0007) apply to the bot's engine copy too. Three of them make the bot's own seat an AI player that plays:

- The lobby builds the bot's join info with player type 2, AI player, instead of 0, local player, so the client's own seat becomes an `rg::AIPlayer`.
- The battle doesn't end when every player is an AI player, which is what the bot sees right after its own seat joins.
- The game never reports itself busy. Its busy check waits for visual events that only a local player's battle screen plays back, and the AI doesn't act while the game is busy.

The browser client also gets two patches when the server can run bots: the friendly lobby shows and accepts **Start** for a player alone in the room. The patches apply at load, before the player sets the switch, so with the switch off a lone player's **Start** gets the game's matchmaking-failed message. The game still lets only a player with at least one friend create a room.

## Considered options

- **A person's client runs the bots.** Rejected because the load falls on that player's device, which might be a phone, the relay would need one connection to send for several players, and Java clients can't host bots.
- **Run RedLynx's `ServerBattleLogic` on the server.** It's the most faithful option and would also give real battle results, but it needs new reverse engineering and would replace the relay.

## Consequences

- The page and this server add two messages of their own, outside the original protocols: SNAP command `900` carries the bot switch, and `GET /bots` tells the page whether to show it. The engine never sees either.
- Bots need the server's own copy of the game (`RG_GAME`). Without it, the page hides the bot switch.
- Each bot is a full emulator: a worker thread with 350 to 410 MB of memory. In battle it uses little CPU, about 2% of a core, because it never draws the battle.
- A bot's password is a key that exists only in the server process, and its account is never saved.
- The AI decides at once, with no visible thinking delay, and plays at its full strength: its think budget is measured on the engine's virtual clock, so it always gets the maximum.
- Steering the menus by timed key presses depends on the engine's menus and timing. A change to either can stop a bot from reaching Quick Match; the server then gives up on it after 60 s.
- The engine's own Random hero would pick the same hero every time, since a headless engine with the same inputs runs the same way, so the bot steps to a random hero itself.
