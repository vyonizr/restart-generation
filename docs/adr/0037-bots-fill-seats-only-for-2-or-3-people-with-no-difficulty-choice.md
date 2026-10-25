---
status: accepted
---

# Bots fill seats only for 2 or 3 people, with no difficulty choice

ADR 0012 added a second bot difficulty, **Expert**. It drew its hero from a strong-hero pool and ran the AI-profile changes in `server/bot-ai.json`, a file that listed none. Self-play never showed Expert to be harder, so the choice asked players to decide something that changed nothing they could feel. ADR 0008 also patched the engine's friendly lobby so that a player alone could press **Start** and play against bots only. The game's Arcade Mode already offers that offline.

We decided:

- **One kind of bot.** It runs the game's own AI profiles with a random hero. `server/bot-heroes.json` and `server/bot-ai.json` are gone. The server applies no AI-profile changes. `server/aiprofiles.js` stays for `tools/selfplay.mjs` and `tools/tune.mjs`, which take their changes from files named on the command line.
- **A yes/no question.** With 2 or 3 people listed, the player who presses **Start** sees "Fill the empty seats with CPU players?" with **No** and **Yes**. **Yes** is highlighted first, and Back answers **No**.
- **No bots for a player alone.** The lobby patch `LONE_START` is gone. As in the original game, **Start** appears only once another member is listed. If people leave while the question is open and only the starter remains, the question closes. The Start goes on to the server, which answers with the game's matchmaking-failed dialog.

## Considered options

- **Remove only the Expert button.** Rejected: the server would keep a level that no page can ask for.
- **Give CPU bots Expert's strong-hero pool.** Rejected: AGGRESSOR was the only hero clearly above 50 % (ADR 0012), and it would change what CPU means without anyone asking for it.
- **Ask a player alone, with No cancelling the Start.** Rejected: the only answer that does anything is Yes, so the question costs a press and adds nothing.

## Consequences

- Command 900's P1 is `1` (yes) or `0` (no). An older page that still sends `2` (Expert) gets the same bots as `1`. Command 901 answers `ask`, `go` or `gone`. It no longer answers `level`, and it answers `go` for a player alone.
- An older page that still has `LONE_START` lets a player alone press Start. The server answers it with the matchmaking-failed dialog, as it does for any Start with too few players.
- Retuned AI profiles would again need a decision, and a file the server applies, if self-play ever shows a set that plays stronger (ADR 0012).
