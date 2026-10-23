# Players can export a replay as footage

A **replay** (CONTEXT.md) plays only on its page, for as long as the server keeps it. Players want to cut a battle in their own video editor and share it. The replay page therefore renders a replay to **footage** (CONTEXT.md): an MP4 file that the player's browser makes from the engine's picture and sound and saves on the player's device. The server sends nothing new. It is the replay text the page already fetches to play (ADR 0022), played by the engine the page already runs.

Footage shows the game's art and plays its sound, so it is a recording of the game. `docs/LEGAL.md` rule 2 keeps recordings out of every commit, issue, pull request, and CI artifact, and it still does. Footage is made by a player, on the player's machine, from the player's own copy of the game or one the server sends (ADR 0001). It never passes through this repository or the server. Ubisoft's [Video Policy](https://www.ubisoft.com/legal/documents/VideoPolicy/en-INTL) invites players to make and publish videos of its games, Let's Plays and reviews included, provided nobody charges to watch them or sells them. We rely on that policy for what players do with their footage.

ADR 0022 accepted the replay text partly because the page plays it and never offers it as a file. That still holds: footage is a picture and sound, not the replay text, and it holds no Game blob, no orders, and no snapshot. What is new is that game material leaves the site in a form the server can't take back.

## Considered options

- **Download the replay text as a file.** Rejected. It would carry the template-derived Game blob outside the server's 30-day expiry, its deletion paths, and `RG_REPLAYS=0`, and it needs the game to play, so it isn't something a player can edit or share.
- **Leave it to the operating system's screen recorder.** Rejected as the only answer. It captures the browser and the page around the battle, blurs the pixel art when it scales, and runs only in real time. Players can still use it.
- **Capture the playing canvas with `MediaRecorder`.** Rejected. It records only in real time, stalls when the tab is hidden, drops frames when the page is busy, and records the page's mute and volume.
- **Render offline with WebCodecs.** Chosen. The engine runs on its own clock (`web/emu/win32.js`), so the page can step it faster than real time, hand its frames and its sound to `VideoEncoder` and `AudioEncoder`, and get exactly 30 frames a second on the sound's clock.

## Consequences

- `RG_REPLAYS=0` stops new footage, because a replay that isn't served can't be rendered. Footage already saved can't be recalled. A notice that names footage gets the same answer as one that names replays: turn replays off.
- Footage shows the battle's player names in the engine's corner panels and lives as long as whoever keeps the file wants. The Privacy policy says that footage a visitor exports leaves the site and isn't covered by replay expiry or account deletion.
- The page bundles a second library besides Svelte's runtime: `mediabunny`, which writes the MP4 container, in a chunk the replay page loads after it starts. Like Svelte it is a development dependency, because only the build and the end-to-end tests install it (ADR 0013). Its license is MPL-2.0. `docs/LEGAL.md` rule 5 accepts GPL-3.0-compatible licenses, and MPL-2.0 is one through its secondary-license clause, so it is listed in `THIRD_PARTY_NOTICES.md` like any other. We don't modify it.
- Tests that export footage run only in the engine tier, keep the file in `tmp/e2e/`, and never upload it (ADR 0025).
- Footage needs a browser that encodes H.264 and AAC with WebCodecs, which browsers give only to a secure page: HTTPS, or localhost. A LAN server over plain HTTP (`--lan`) therefore can't offer it to anyone but the PC that runs it, at localhost. Elsewhere the button stays visible but disabled, and says why.
