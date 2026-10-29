# Playing a battle back: the engine's replay player

Our notes on the replay player inside the engine, the one the original website used to show a finished Arena battle, and on what a server must hand it. Replays (`server/replay.js`, `web/src/replay.js`, [ADR 0022](../adr/0022-replays-send-a-battles-game-blob-to-anyone-with-the-link.md)) are built from this note. Written in our own words ([legal notes](../LEGAL.md)). Addresses are Windows virtual addresses; "the logic" is a `ServerBattleLogic` and its battlefield is the BattleFieldLogic at `logic+0x14` ([re_rules.md](re_rules.md)).

Everything here was observed by running the engine in the emulator in player mode on battles that bots played on the relay, unless it is marked static (read, not run) or [INFERENCE]. The measurements are in `.scratch/match-replays/research/replay-feasibility.md`.

## Player mode

The Java client had two modes. Given a `replay` address, it downloaded that file as text, handed it to the engine with `setReplayData` (`10002280`), and started the engine with `init` mode 1 at 420 × 378 instead of mode 0 at 240 × 320. The text is copied up to its first NUL and read only during `init` (static), so the mode can't change later: a page that plays a replay needs its own engine.

In mode 1 the engine skips its menus. It draws the whole battle view in the 420 × 378 frame: the battle's opening banner, then the battlefield, framed wider than on a phone, with the corner panels. It draws no menus and no result screen. The client ignores keys in player mode (static), and the strip below the frame belongs to the host.

The engine moves its battle visuals on only while its sound is drained. A host that stops pulling sound, for instance because the browser's audio clock is suspended, sees the replay stall at the first turn. Pulling 1024 bytes for each 64 ms of engine time keeps it moving.

## The replay text

`setReplayData` takes one string:

1. **Encoding.** Base64 with the standard alphabet, its length a multiple of 4. The engine's own encoder (`FUN_100f4800`) packs a final 1 or 2 bytes into the low bits of the last group instead of the high bits: one byte `b` becomes the characters for `b >> 6` and `b & 63`, then `==`; two bytes, read as `v = b0 << 8 | b1`, become the characters for `v >> 12`, `(v >> 6) & 63` and `v & 63`, then `=`. The decoder (`FUN_100f4a50`) expects that packing, so standard base64 of a length that isn't a multiple of 3 is rejected.
2. **Compression.** The decoded bytes are a little-endian u32 with the uncompressed length, then a zlib stream. The engine's size check (`FUN_10091ca0`) accepts only the header bytes `78 5e`, which zlib writes at compression levels 2 to 5. Other headers make the engine allocate with length -1 and fault.
3. **Contents.** The Game blob, as each client gets it in handshake step 1 ([re_match.md](re_match.md) §3), then pairs of a little-endian u32 time in milliseconds and one whole GameMessage (header and body), back to back to the end. There is no snapshot and no header of its own; the Game blob starts with the engine's version.

The engine never accepts the uncompressed form, which is what its own recorder writes to `replay.rgr` (below).

## What the engine does with it

The app start (`FUN_10008570`) decodes and inflates the text and enters the replay state (`FUN_10044400`). That state builds a `Game`, reads it from the start of the bytes (`FUN_1003e440`), prepares it (`FUN_100400c0`) and constructs the replay logic (`FUN_10006410`, vtable `10177578`) on the rest. The constructor reads every (time, message) pair into a list, and the time of the BattleBegin becomes the start of playback. Times are smoothed as they are read: each time moves halfway, rounded up, from the previous *smoothed* time towards its recorded one, and nothing is smoothed while the previous smoothed time is 0. So only differences matter, the first time should not be 0, and the lag of the PlayerJoined messages before BattleBegin carries into every later time. Raw recorded times put a moment up to 40 s away from the engine's clock in a human battle (`.scratch/replay-marks/research/mark-time.md`, measured over 801 messages).

The logic starts as any `ServerBattleLogic` does: it builds the battlefield from the `Game` alone. Every PlayerJoined becomes a remote player. At BattleBegin it keeps a snapshot of itself for seeking. Its start (`FUN_10005fb0`) also stores it in the app object, the one the engine's global at `101b828c` points to, at `+0x110`: every replay JNI call finds the logic there. The pointer is 0 until the logic exists, a few frames after `init`, so a host must not call the replay controls before then.

### Playback

- Each frame the playback clock moves on by the frame's time, twice as fast with double speed, unless paused. When the battlefield isn't busy, the next message is processed once the clock passes its time after BattleBegin; messages before BattleBegin go at once. With skip-empty, a gap longer than 0.5 s first jumps the clock to 0.5 s before the message.
- `setReplayMode(skip, double)` sets skip-empty (on by default) and double speed (off by default). `playReplay` and `pauseReplay` start and stop the clock.
- `getTime` is the playback clock in whole seconds, rounded down and capped at `getTotalTime`; the clock itself is an unsigned count of ms after BattleBegin at `logic+0xb8`. `getTotalTime` is the span from the first to the last message time, plus 2 seconds.
- `setTime(s)` reloads the BattleBegin snapshot and processes, without visuals, every message up to `s` seconds after BattleBegin. A seek took 0.2 to 0.5 s. Seeking straight to the end once left the rank table reversed, so results must not be read from a replay.
- A seek before the logic has processed BattleBegin, while its battlefield's phase (`+0x94`) is still 0, has no snapshot to reload: the battle never begins and has no seats, its clock runs on, the logic reads finished, and no later seek mends it. In the seed's played battles that is the first 2 frames after the logic exists (5 frames after `init`) in the 2-player ones and the first 4 in the 4-player one (measured), so `GameHost.replayLoaded` waits for the phase to be 1 or more.
- The engine never stops on its own. After the last message the logic finishes the battle and stays there. `isReplayVisualizationInProgress` tells whether the battlefield is still animating.
- The clock can run ahead of the picture when moves come faster than their animations, as with bots.

### Defeats

The replay logic keeps each seat's state as the witness's logic does ([re_witness.md](re_witness.md) "Defeats"): the battlefield at `logic+0x14`, its Commander slots at `+0x2c` (seat-indexed, the count at `+0x28`), the phase at `+0x94`. A seat is defeated once its Commander's defeated flag `+0x1c` is set or its slot is cleared; both happen while the defeating message is processed. The Commander's `+0x24` is the princesses it holds, which rise by one for the seat whose hero rescued another seat's princess, in the same message. The page reads these through `GameHost.replaySeats` once the phase is 1 or more, after BattleBegin.

The battle view's rescue (`bv+0x2a0`, [re_screen.md](re_screen.md)) is nonzero at its `+8` while a rescue animation runs and ends (`GameHost.rescuePlaying`).

Observed in a 4-player bot battle played back in the player (no host hooks), sampled every frame: each of the three rescues defeated its seat and raised the rescuer's princesses in the same frame; the rescue animation started 17, 21 and 444 frames later (0.6 s, 0.7 s and 14.7 s, the last behind other animations) and ran 3.8 to 4.4 s. The clock had reached the total time while the battle still had 165 s of messages to show: these defeats were processed at engine times after the clock stopped, as the picture caught up.

## The original player's controls

The Java client drew a 32-pixel strip under the frame (static):

- **Play and pause,** one button, showing pause while playing. The replay starts playing as soon as it has loaded. Pressing play at the end starts again from 0.
- **Skip-empty and double speed,** two toggles; skip-empty shows as on from the start, matching the engine's default.
- **A time slider** from 0 to the total time, with the time as minutes and seconds under it. Pressing the slider pauses; dragging seeks whenever the time crosses a 5-second step; letting go seeks to the 5-second step below the release point and resumes if the replay was playing.
- **Volume,** and **Stop,** which closed the player.
- **The end.** Once the time reaches the total and nothing is animating, the player pauses, dims the battle view and shows one large play button, which seeks to 0 and plays. With bots' battles that is too early: the picture still has moves to show, with a few frames of nothing animating between two of them (see "Defeats"), so the replay page also waits for the logic's finished flag (`logic+0x28`).

## Who made the replays

The client never uploads one: the Java client only downloads, and nothing sends `replay.rgr` anywhere. The screen after an Arena battle sent players to the game's website to watch. [INFERENCE] The Arena server, which ran the logic as the battle's network host, recorded it there, compressed it and served it to the player.

The engine's own recorder: a `ServerBattleLogic` built with flag bit 1 (`logic+0x90 & 2`) writes the `Game` (`FUN_1003c4a0`), then every message it processes with the system time, into a memory stream, and at its stop (`FUN_1000d620`) writes that stream as base64 to `replay.rgr`. Only one client state builds such a logic (`FUN_100ca920`), and it can't be reached ([ADR 0006](../adr/0006-capture-battle-templates-from-a-live-client.md)).

## Making a relayed battle replay as it was played

Our server keeps everything the text needs: the table's Game blob and its history of reliable messages in relay order, PlayerJoined and BattleBegin included. It has to add the time each message reached the relay.

One field differs between a replay and the battle the players saw. Each table starts from a captured snapshot, and the snapshot keeps the next-monster kind (`battlefield+0xac`) of the battle it was captured from. The battlefield's constructor sets that field from its first random draw, modulo 3 (`FUN_1000fb10`), and each monster wave moves it on by one (`FUN_10013f60`). A replay builds its battlefield from the `Game` alone, so it takes the value from the table's seed. In a 130-message battle the two differed, and the replay ended at turn 6 instead of 10.

The table therefore writes into its snapshot the value its seed gives: the draw the server already takes after seeding the random generator, modulo 3. The field sits after the random generator's 56 bytes in the snapshot's battlefield section: skip two i32s; a list of i32 (an i32 count, then the entries); a list of pairs (a u32 count, then 8 bytes each); two bytes and one i32; the field is the next i32. With that value, five battles replayed to the same final turn and ranks as the players' own engines.
