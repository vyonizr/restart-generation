---
version: 1
slug: "web-ui-replay-svelte"
primary_target: "web/src/lib/replay/Replay.svelte"
related_targets: ["web/src/lib/replay/ReplayBroadcast.svelte","web/src/lib/replay/ReplayScreen.svelte","web/src/lib/replay/ReplayControls.svelte","web/src/lib/replay/ReplayKeys.svelte","web/src/styles/replay.css","web/src/lib/replay/replay.svelte.js","web/replay/index.html"]
---

# Surface brief: the replay page

The replay page, `/replay/<id>`, plays one online battle again in the engine's own replay player (CONTEXT.md "Replay", ADR 0022). It is built from `web/replay/index.html`, `web/src/replay.js`, `web/src/lib/replay/Replay.svelte` and the `Replay*` components, `web/src/lib/replay/replay.svelte.js`, and `web/src/styles/replay.css` on the shared `web/src/styles/stage.css`. The game page's notice line offers it after each battle (`web/src/lib/replay/replay-notice.js`). This brief kept its `web-ui-replay-svelte` name from before the move to `web/src` (ADR 0035).

Mode: **Experience**. The battle leads; the frame recedes.

Audience and job: a player who just finished a battle, opening it in a new tab, or anyone given its link, often from a chat app's preview. They press **Watch** once the game files are in, and watch; they scrub, speed up or skip idle time, and share the link. Success: the battle plays to its end and the result lands.

Decided in a prototype round of three layouts (Broadcast replay, Stage with control strip, Theater; branch `prototype/replay-layouts`): Broadcast replay.

## Direction contract

THESIS: A finished battle shown the way television shows a replay: the engine's 420 × 378 view as the broadcast picture, a REPLAY bug on its corner, and the players as a lower third. It refuses the generic video player: a black box with an overlaid control bar and nothing about who played.

OWN-WORLD: The game page's Stage, unchanged: ink ground, one crimson, Anton uppercase, Raleway, Roboto Mono for the clock only, square corners, the outlined ghost name behind. Crimson marks the REPLAY tag and the play button only; white marks each player's place when the replay ends. Each seat's square takes its color in the battle.

STORY: The visitor sees who played and on what before the game loads (the lower third and the facts line), presses Watch, watches the battle with the seats under it, each defeated seat turning hollow as the game shows its defeat, and at the end the view dims to the result while each winner's seat gets its crown.

FIRST VIEWPORT: A `72px` header with the name (a link home) alone. Centered: the battle view at the largest size that fits with the strip under it, a title band flush over it (the crimson REPLAY tag, the day and the kind of match, Share and Download replay at its right end); under it, flush, the lower third with one cell per seat (a square in the seat's color with the seat number, the name in Anton over the hero), then the ink control strip (crimson play, the time slider, `m:ss / m:ss`, Skip idle, 2×, mute and volume). Under that, Soft screen on the right, then the key legend. Footer strip as on every page.

FORM: Broadcast replay, position 1 of the prototype's three, chosen by the user over Stage with control strip and Theater.

FINISH: the engine's frame is never covered while it plays: the tag sits on the frame's corner outside its HUD, and the end screen dims it only when the replay is over.
