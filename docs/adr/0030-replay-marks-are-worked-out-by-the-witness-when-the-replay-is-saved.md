# Replay marks are worked out by the witness when the replay is saved

A replay's timeline shows **marks** (CONTEXT.md): the turns in which a princess is rescued or a hero is knocked out. A replay holds only the Game blob and the timed orders (ADR 0022), and most order bodies are undecoded, so these **moments** exist only inside the engine's simulation. The witness already runs every battle's orders through the engine (ADR 0020). After each order it reads the Commanders' knock-out count, princess count, and defeated flag, and the battlefield's turn, phase, and current seat. When the replay is saved, the server turns those reports into seek seconds on the engine's replay clock, next to `encode()` in `server/replay.js`. The replay's `meta` stores them as `marks: [{at, moments: [{kind, seat, by?}]}]`. The page draws them on its slider and seeks to them. It never detects anything itself.

## Considered options

- **Detect moments on the replay page, with a second engine that doesn't draw.** Rejected. Every visitor would spend seconds of CPU on every replay to work out what the server already knows, and the page would need a second engine beside the one that plays.
- **Detect them from the page's own playing engine.** Rejected. It sees an animation only when it starts, which is too late for a mark that has to come before it.
- **Read them from the orders.** Rejected. Most order bodies aren't decoded (`docs/re/re_rules.md`), and a rescue depends on the whole battle state.
- **Add them to stored replays later with an offline tool.** Rejected. Replays last 30 days, so a backfill isn't worth it.
- **Store order indexes in `meta` and let the page work out the seconds.** Rejected. The page can't split the replay text into orders without reading the engine's list out of emulator memory, because order bodies carry no length.
- **The witness, when the replay is saved.** Chosen. The witness and the replay player go through the same states for every order (`.scratch/replay-marks/research/moment-detection.md`), and every moment happens inside the order that triggers it.

## Consequences

- A replay saved before marks existed, and every replay from a server without a server copy, has no marks. Its slider stays plain.
- A mark is a whole second at the start of the moment's turn. A seek runs every order up to that second without drawing (`docs/re/re_replay.md`), so the turn's orders and their animations play after it. The seconds follow the engine's smoothing of message times, not the recorded times, which can be up to 40 s off (`.scratch/replay-marks/research/mark-time.md`). A change to how the server records times, or to the smoothing, has to recompute marks the same way.
- `meta` holds seats and moment kinds only. Names come from `meta.players`, so the server keeps no new personal data and the Privacy policy doesn't change. The field is new in `/replay/ID/data`, so the change isn't breaking.
