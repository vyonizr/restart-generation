# A battle gets the full board through engine hooks

On a 240 × 320 screen the engine shows only part of a battlefield, and the player scrolls to see the rest. The engine takes its screen size from the host (`init`'s width and height), and its own replay player already shows the whole battlefield at 420 × 378. Its menus, though, are laid out for 240 × 320 and break at any other size. So the browser client boots the engine at 420 × 378, which sizes its frame buffer, and gives it a 240 × 320 screen with 240-pixel rows. Through hooks, it widens the screen to 420 × 378, with 420-pixel rows, where a battle sets up its view, in single-player and online battles alike, and narrows it back after the battle ends. Everywhere else the engine draws exactly as a stock one: a Classic battle drawn with 420-pixel rows differed from stock in an edge marker. That is the **Full board** (CONTEXT.md "Board view"), the default. **Classic** never widens. A change of view applies from the next battle, because the battle lays out its corner panels once, when it starts.

In Full board the frame is always 420 × 378, and every screen laid out for the phone sits at 240 × 320 in its middle, inside the **curtain** (CONTEXT.md). In battles the engine draws the curtain itself around its animations. The hooks narrow the engine back to 240 × 320 while the battle menu or a story dialog is up. Outside battles the page draws the engine's 240 × 320 screen inside the same curtain, which it decodes at run time from the player's own `gameplay.pak` and never stores. A hook also clears the curtain's 16-frame fade-in, which would otherwise hold up a Full board player's battle at every rescue or fight, and fades the curtain in by the level it is drawn at instead; its fade-out holds nothing up and stays. The page fades its own curtain in and out over 16 frames the same way. Online, the engine is widened only while the battle sets up its view, then again from the battlefield's first frame, so the lobby's "Game starting" screen keeps its phone layout.

The hooks run JavaScript at chosen engine instructions and change engine memory, which ADR 0007's byte patches don't. Each hook site is checked against its expected bytes before the engine runs, like those patches. If any site differs, the engine boots stock and the page offers no Full board.

## Considered options

- **Boot at 420 × 378 for good.** Rejected: the main menu and most other menus draw on top of themselves and leave stale pixels.
- **Restart the engine for each view.** Rejected: a battle, its online session and the menus all live in one engine, and the size is fixed at `init`.
- **400 × 440, single-player battles only** (the unmerged draft of this ADR, branch `wide_view`). Rejected: online battles are what players asked to see whole. 420 × 378 is the size of the engine's own replay player and of its curtain image, and it fits every online battle template, so live play and replays have one full-board size.
- **Center the phone-only screens over the full board with hooks** (the draft's way). Rejected: the soft keys stay in the wide screen's corners and a story dialog's portrait stays anchored to its bottom. Narrowing lays them out exactly as on the phone, with fewer hooks.
- **A curtain of our own design.** Rejected: the engine's own curtain already surrounds its battle animations, so the menus would sit in a different curtain than the banners. Decoding it at run time from the player's copy commits nothing from the game.
- **Keep the curtain's fade-in.** Rejected: a view must not change a battle's timing, and a Full board player would fall about half a second behind at each rescue or fight.
- **No fades at all.** Tried first, and the curtain came and went abruptly. Fading by the level alone keeps the look and the timing.
- **Lock ranked battles to one view.** Rejected: a battle is turn-based and the whole board can be reached by scrolling, so Full board saves time; it reveals nothing. It is the default, and every player chooses.

## Consequences

- Battles cost about a third more CPU per tick on the page. On a device that is too slow, the slowness notice offers Classic.
- Nothing found ties the view to what a client sends or to the battle logic. Players on different views in one battle must still end it with the same result, and the witness must agree; that is checked by hand before release.
- Behind a narrowed battle menu or story dialog, and behind the results after a Full board battle, the board is the full board's top-left corner, not the phone camera's view. `npm run test:wide` compares the results with stock only up to that backdrop: it skips them until the next menu.
- Online, the battle view is set up while the lobby's "Game starting" screen still shows, so the screen is narrowed after that tick until the battlefield is first drawn; anything the lobby draws later in that one tick is drawn at the Full board's size.
- Taller story boards still scroll vertically at 378 rows.
- `npm run test:wide` (needs `RG_GAME`) runs a Classic and a Full board engine side by side: their phases and turns must change on the same frames, and their menus must match a stock engine. Run it after any change to the hooks.
- The curtain's image format and the screen-size fields are written up in `docs/re/` before the code that uses them.
