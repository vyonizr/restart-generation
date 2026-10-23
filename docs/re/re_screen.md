# The screen size, the battle view's curtain, and the `.gfx` image

Our notes on what the engine does with its screen size, and on the parts of it that the **Full board** (CONTEXT.md "Board view") relies on: changing the size while the engine runs, the battle view's own large-screen mode with its **curtain**, the battle UI states a host can read, and the image container the curtain is stored in. [ADR 0017](../adr/0017-a-battle-gets-the-full-board-through-engine-hooks.md) and the browser client's hooks are built from this note. Written in our own words ([legal notes](../LEGAL.md)). Addresses are Windows virtual addresses. `app` is the app object that the global at `0x101b828c` points to, and `bv` is the battle view, `[app+0x9c]`.

Everything here was observed by running the engine in the emulator (`GameHost` from `web/emu/host.js`), unless it is marked static (read, not run) or [INFERENCE]. A tick is one engine frame, about 33 ms of game time. Tick numbers are from a 4-player Arcade battle that starts at tick 720 and that the player leaves through the battle menu's Exit, which ends it at tick 1456. The measurements are in `.scratch/full-board/research/full-board-spike.md` and `.scratch/full-board/research/full-board-curtain.md`.

## The screen size

The screen size enters the engine only through `init`'s width and height. `init` builds the display, app slot 0xb (`app+0x2c`), through `FUN_10003390` and `FUN_10003190`, which hand the size to the graphics system (`FUN_1000a2a0`). The display's surface is `[display+0xc]`, with the vtable `0x1017b130`. It holds the following fields:

| Offset | Holds |
| --- | --- |
| `+0x18` | The width. |
| `+0x1c` | The height. |
| `+0x20` | The pixel format, 2 for 32-bit. |
| `+0x24` | An object whose `+4` points at the pixel descriptor: its `+0` is the address of the host's frame buffer and its `+4` the pitch, in pixels. `init` sets both through `FUN_10009af0`, once it has the buffer's address from `GetDirectBufferAddress`. The pitch is the surface's width at that moment. |

The dword just before the pixel descriptor holds the width and height again, as two 16-bit values. Nothing read it in any run we traced. Many sprites and widgets hold a width and height too, but those are clip rectangles that are copied in again at each draw ([re_render.md](re_render.md) "Draw one scene object"), not copies of the screen size.

We watched every read of the width, the height, the pitch, the 16-bit pair and the buffer address over a whole Arcade run, from the menus through a battle to the results:

| When | Functions |
| --- | --- |
| Every frame, on every screen | `FUN_10052de0` (buffer address, pitch and height), `FUN_10052270`, `FUN_10053000`; `FUN_100cd010` and `FUN_100522d0` on most ticks. |
| Menus, once per screen build | `FUN_100f94a0`, which copies the current width and height into the GUI root's size and then lays the screen out from its menu file. |
| Menus, every frame | `FUN_100ccc30` and `FUN_1009e940` on the title and main menu, `FUN_100dc960` on the hero screen, and helpers at startup. |
| A battle, once at its start | `FUN_10028f20` (the battle view's setup), `FUN_1008a500`, and `FUN_1002e3f0`, which calls `FUN_10028f20`. |
| A battle, every frame | `FUN_100528d0`, `FUN_1007e890`, `FUN_100c0480`, `FUN_100c0260`, `FUN_100c0730`, `FUN_10052330`, `FUN_100529e0` and `FUN_10052ac0`; `FUN_100936f0` during the intro banners, and `FUN_1008d4a0` while the battle menu is open. |
| Transitions | `FUN_10009b20` (at startup and at a battle's end) makes a new image of the current width × height and copies the screen into it row by row with the pitch; `FUN_100dab70` grays the screen in place at a battle's end; `FUN_100dac30` draws the results screens. |

`FUN_10028f20` copies the width and height into the battle view and works out how many columns and rows of tiles fit, at 30 × 27 pixels a tile at the standard scale. It also sizes a buffer with one entry per visible cell. The battle's HUD is laid out from the size in the same tick. None of the battle logic's or the `Game`'s functions (`0x1000d…` to `0x10024…`) read the size (static), and no message layout ([re_match.md](re_match.md), [re_rules.md](re_rules.md)) has a field for it. [INFERENCE] Nothing a client sends depends on its screen size.

### Why the menus break at other sizes

Menus and battles take their size from the same fields. A menu screen takes the current width and height as its root's size when it is built, but its menu file places most containers at absolute positions on a 240 × 320 screen, so only the centered or relative items follow a wider root. [INFERENCE: this matches what the unmerged `wide_view` draft of ADR 0017 found.] Booted at 420 × 378, the main menu and most other menus draw their art and entries over each other and leave stale pixels on the right.

## Changing the size while the engine runs

Writing the surface's `+0x18` and `+0x1c` changes the size the engine draws at, from the next read on. The working scheme keeps the pitch at 420 for the whole run. The host gives the engine a frame buffer of 420 × 379 pixels and either calls `init` with 420 × 378 and narrows the width and height to 240 × 320 right after boot, or calls `init` with 240 × 320 and sets the pitch to 420 before the first frame. The engine then draws a 240 × 320 screen into the top-left corner of the buffer, and a page shows the top-left width × height of it at a row length of 420.

- **Widening.** The host writes 420 × 378 on entry to `FUN_10028f20`. It is called from `FUN_10006b10` (the battle logic's setup) and from `FUN_1002e3f0`, in the battle's first tick, right after `FUN_1000ecd0` (the local `ServerBattleLogic`'s constructor).
- **Narrowing.** The host writes 240 × 320 back once the battle has ended. The battle view `app+0x9c` and the battle logic `app+0x114` (app slot 0x45) are both set at the battle's start and both cleared in its last tick, the same tick in which `FUN_10006840` (`BATTLE_OVER` in `server/bot.mjs`) runs, so a host can poll either after each tick. `app+0x110` (slot 0x44) is no use here: it stayed 0 through local battles, because only `FUN_10005fb0`, a client-logic path, fills it ([re_replay.md](re_replay.md)). [INFERENCE] It is set in online and replay battles only.

With this scheme the menus before and after a battle were pixel-identical to a stock 240 × 320 engine, and the battle was pixel-identical to a stock engine booted at 420 × 378, over two Arcade battles in a row.

A battle left at 240 × 320 with the pitch at 420 is not quite stock, though: observed with `web/tools/wide-test.mjs`, a 12 × 8 pixel marker at the screen's right edge, partway through the first Arcade battle, differed from a stock engine's. With the pitch set back to 240 for that battle it was pixel-identical. So the Full board's host (ADR 0017) keeps the pitch at 240 everywhere but in a Full board battle: it sets 420 when it widens at `FUN_10028f20` and 240 again only after the tick in which the battle ended. The snapshot of the battle's end is taken inside that tick, at 420, so it is a crop as described below, not garbled.

What goes wrong otherwise:

- **Widening late.** Widening between ticks, one tick after `FUN_10028f20`, or later in the battle, shows the whole board, but the corner HUD panels stay where a 240 × 320 screen has them: the top-right one at x ≈ 200 and the bottom ones at y ≈ 290. The HUD is laid out inside the battle's first tick, so writing the size alone has to happen at or before `FUN_10028f20`. Narrowing in the middle of a battle has the same problem. A change of board view in the middle of a battle therefore lays the battle view out again, as "Changing the board view in a battle" below describes.
- **Changing the pitch.** Setting the pitch to 420 when widening and back to 240 when narrowing also works, except for the snapshot that `FUN_10009b20` takes as the battle ends. It copies a frame drawn at pitch 420 using pitch 240, and the results screens' backdrop comes out garbled. With a constant pitch the snapshot is a crop: the results backdrop is the top-left 240 × 320 of the grayed full board rather than stock's view, while the results themselves are stock.

### Online battles

Static, [INFERENCE], and not run online. `FUN_100eb6d0` sets the online lobby's label to its "Game starting" text, and the battle view is set up while that lobby is still on the screen, so widening at `FUN_10028f20` would draw the lobby at 420 × 378 for a moment. Every battle UI state's draw calls the battle draw `FUN_1002c1a0`, so the first `FUN_1002c1a0` after `FUN_10028f20` marks the battlefield's first frame. Locally both run in tick 720. ADR 0017 therefore widens while `FUN_10028f20` sets the view up and again from that first battle draw, and keeps the screen narrow in between. It narrows after the setup's tick, not inside it, because the battle lays its corners out later in that tick; whatever the lobby draws after the setup in that one tick is drawn at 420 × 378. Observed in a friendly battle against CPU players on a development server: the lobby's "Game starting" screen looked stock inside the curtain, and the battle came up on the Full board.

## The battle view's large-screen mode

`FUN_1002e3f0` sets up the battle view and calls `FUN_10028f20`. At its end it reads the display's width, and when the width is above 240 it does the following:

- Sets the byte `bv+0x328`, the large-screen mode.
- Creates a 240 × 320 offscreen surface at `bv+0x334` with its own graphics context at `bv+0x338`.
- Loads `data/gameplay/ui/animframe.gfx`, the curtain, into `bv+0x1b4`.

Probed at tick 740 at 420 × 378: the offscreen is a surface with the display's vtable `0x1017b130`, 240 × 320, with its own pixel buffer at pitch 240, and the curtain is a 420 × 378 drawable. The flag was set, the fade-in counter `bv+0x32c` was 0 and the fade-out counter `bv+0x330` was 16.

Three small routines use these fields, and each does nothing when the flag is clear:

- `FUN_10027d80` clears the offscreen and returns its graphics context. With the flag clear it returns the main screen's context, `app+0x30`.
- `FUN_10028a70` copies the offscreen onto the main screen at the fixed position (0x5a, 0x1d), that is (90, 29).
- `FUN_10028ae0(level)` draws the curtain at (0, 0) at the given level (alpha).

So the curtain is one image with a hole, drawn over a 240 × 320 inset in the middle of a 420 × 378 screen. At tick 740 the engine drew a 240 × 320 sprite at (90, 29) and then a 420 × 378 run-length image at (0, 0). Both the position and the image's size are constants. [INFERENCE] At any other screen size, such as the `wide_view` draft's 400 × 440, the inset and the curtain would be misplaced.

### What goes through the curtain

Three animation players of the battle view draw into the offscreen and then call `FUN_10028a70` and `FUN_10028ae0`:

| Player | Plays | How |
| --- | --- | --- |
| The fight cut-in, `bv+0x29c` | A fight, which needs a hero against a hero (`FUN_10030e20`). Its state at `+0x14` is 1 while running and 2 when done. | The offscreen is cleared to opaque black and the fight is drawn into it (`FUN_100828a0`). Static: no fight happened in our runs. |
| The rescue, `bv+0x2a0` | A princess rescued, or not. Its state at `+0x8` is 1 while running, 2 while ending, and 0 when idle. | `FUN_100831a0` draws it into the context `FUN_10027d80` returns. |
| The animation chain, `bv+0x2a4` | The battle's intro, the phase banners, item messages (`FUN_10076ed0`), special skills, a hero's game over (`FUN_10074d00`), and a story rescue. Its byte `+0x50` is 1 while one plays; `FUN_100282f0` reads it too. | `FUN_1002b5a0` draws it the same way. Each of these starts through `FUN_10075ef0` and then `FUN_100758d0` or `FUN_1002a550`, which play on `bv+0x2a4`. |

The intro, the phase banners and a rescue were observed inside the curtain. The inset's opaque pixels matched a stock 240 × 320 engine: the intro's at the same tick, and the banners' and the rescue art's 16 frames late (see below). The battle's message list (`FUN_10083a00` on `bv+0x1b8`), which shows texts such as a castle being captured, draws on the main screen at full-size positions, not in the curtain (static, and seen in replay frames). A player knocked out goes to the observer state with the full board and no curtain.

A phase banner looks cut off at the inset's right edge. That is not a layout fault: the chain animation draws the banner as stock does, its text slides in from beyond the right edge of a 240-wide area, and a long banner is cut at both edges on a stock phone screen too. At 420 × 378 the phone screen's edge happens to be visible next to the curtain.

### The fades

When a curtain animation starts, the curtain fades in over 16 frames, with `bv+0x32c` counting down from 16 to 0. While it fades in, the animation is neither drawn nor advanced. When the animation ends, the curtain fades out over 16 frames, counted by `bv+0x330`. So at 420 × 378 every curtain animation ends 16 frames later than on a stock phone screen.

Phase banners don't hold the battle up: in a run without a rescue, the phases and turns changed on exactly the same ticks at 240 × 320 and at 420 × 378 over 9,000 ticks. A rescue does hold it up. After the first rescue, the 420 × 378 engine ran 18 ticks behind the 240 × 320 one (the cannon phase began at tick 7134 in the narrow engine and 7152 in the wide one), then 26 to 28 ticks behind, and the battle ended 35 ticks later (tick 12531 against 12566). [INFERENCE] A fight, which reports itself done only at its state 2, delays the battle the same way. A local battle drawn with the curtain therefore drifts from stock.

It is the fade-in that holds the battle back, not the fade-out. Observed with only `bv+0x32c` cleared after each tick: over an Arcade battle with a rescue, the phases and turns changed on the same ticks as on a stock 240 × 320 engine, and every curtain still faded out, its level stepping down by 16 from 255 to 0 over the animation's last 16 frames. The level is the argument of `FUN_10028ae0`, a thiscall that takes it as its only stack argument; the curtain is drawn once a frame while it is up. The Full board's host (ADR 0017) clears the fade-in counter and fades the curtain in by that argument instead: it lowers the level to 32, 64, and so on up to 255 over the first 8 frames the curtain is drawn, and lowers the fade-out's levels twice as fast, so the curtain is gone halfway through the engine's own fade-out. This changes nothing but the picture.

## The battle UI states

A battle's screens are UI states, run by a UI state manager `M`. `M` is `[[[app+0x8c]+0x84]+0x20]`: `[app+0x8c]+0x84` is the idle UI state, and its `+0x20` points back at `M`. `M+4` is the current state, which a host can tell by its vtable. The class names come from the string after each vtable, and are [INFERENCE] for the states that look shared.

| State | Vtable | Notes |
| --- | --- | --- |
| `IngameMenuState`, the battle menu | `0x10187028` | From the tick Esc is pressed (1280) to the tick it closes (1355). |
| `MessageUIState`, a story message | `0x101869f8` | One per message. Between two messages the state is `0x101880d4` for one tick. |
| PlaceTile | `0x10186860` | Placing a tile. |
| `InfoUIState` | `0x101880d4` | Not the player's turn, and the battle's intro. |
| `MoveUnitUIState`, `FireCannonUIState` | | The hero's turn and the cannon phase. |
| `ObserverUIState` | | After the local player is knocked out. |
| `TextMessageUIState` | | Chat entry; its draw is `FUN_100c2a00`. |

While the battle menu is up, `FUN_100d5d90` runs every frame: it grays the width × height of the screen through `FUN_1008d4a0`, and its `FUN_10045c50` draws the menu. `FUN_100f94a0` runs once, when the menu opens, and it was the only menu screen build during a battle. While a story message is up, its draw `FUN_100b8570` runs every frame.

At 420 × 378 these two are laid out for a phone but not inside the curtain. The battle menu's wheel stays at its 240 × 320 position, its title bar is centered at x 210, and its Select and Back soft keys sit in the 420 × 378 screen's bottom corners. A story message's text box stays at its 240 × 320 position, while the princess's portrait is anchored to the bottom, 58 pixels lower than stock. Chat entry is centered at 420 and works.

Narrowing the width and height to 240 × 320 while they are up lays them out exactly as stock. The host narrowed on entry to `FUN_100f94a0` while `app+0x114` is set, and on entry to `FUN_100d5d90` and `FUN_100b8570`, and widened again after the tick once `M+4` no longer was the battle menu or a story message. The battle menu, its Exit confirmation, and the story messages then matched stock, apart from the board behind them, which is the top-left corner of the full board rather than the phone camera's view. After widening, the engine was pixel-identical to a stock 420 × 378 engine again, so the narrowing leaves nothing behind. The tick in which such a state closes is still drawn narrow, one frame each time.

## Changing the board view in a battle

A host can move a battle between 240 × 320 and 420 × 378 between two ticks by running again the part of the battle view's setup that depends on the screen size, and keeping what that part would throw away. Observed over whole Arcade battles switched back and forth up to twelve times: from the switching tick on, every frame matched a stock 240 × 320 engine while the battle was on Classic and a never-switched Full board engine while it was on the Full board, phases and turns changed on the same ticks, and after the battle the heap held the same blocks as the engine it then matched. The measurements are in `.scratch/full-board/research/midswitch.md`.

### What the setup lays out from the size

`FUN_1002e3f0` sets the battle view up in the battle's first tick. The parts of it that depend on the screen size:

- `FUN_10028f20`, a thiscall whose one stack argument is the battle's `Game` (`[bv+4]`), the source of the map's columns and rows. It writes the screen size, the map's size in cells and pixels, the visible columns and rows, and the tile size into the view `[bv+8]`. It sets the camera's bounds through `FUN_10028360` with a zero margin. It also zeroes the cell highlights: one dword per map cell at `[bv+0x288]` (`[bv+0x284]` of them, reallocated only when the map's size changes), and the tile renderer's pointer to them at `renderer+0x28`, where `renderer` is `[bv+0xc]`. The highlights mark the cells a special skill can target (static: no cell was highlighted in our runs). Called without its argument, it reads a stray stack value and lays the view out for a 1 × 1 map, so no tile is drawn.
- `FUN_10028360(bv, margin)`, where `margin` points at two dwords. It sets the camera's bounds in `view+0x28` to `+0x34`, 16.16 fixed point: from minus the margin to the map's size minus the screen's plus the margin, or, when the map and its margins together are narrower than the screen, both at the value that centers the map: minus half, rounded down, of the pixels the screen has over the map. Later in the setup the playfield calls it again with its own margin, 40 × 40 on the Arcade map, so a second call of `FUN_10028f20` loses that margin unless the host calls `FUN_10028360` again with it.
- `FUN_10087440(renderer, view)` copies the view into the tile renderer, which draws from its copy.
- The HUD's four corner panels at `[[bv+0x1b8]+8]`, `0x6c` bytes each. `FUN_1008a500(panel, corner, game)`, with the corners numbered 1 to 4, places a panel from the screen size: its home at `+0xc` and `+0x10`, where it is now at `+0x3c` and `+0x40`. A panel glides a quarter of the way home each frame, so keeping its distance from home keeps any glide in progress.
- The camera's first target, and the large-screen mode at the setup's end ("The battle view's large-screen mode" above).

### The camera

The camera's position is at `bv+0x2b0` and `+0x2b4`, its target at `+0x2b8` and `+0x2bc`, all 16.16. `FUN_10073e00` turns the camera to a cell: its object holds the cell at `+0x24` and `+0x28` and an offset in pixels at `+0x14` and `+0x18`. The target is that point plus half a tile minus half the screen. `FUN_10029080` clamps it: first down to the upper bound, then up to the lower bound, so the lower bound wins when the two cross. The setup's first target is 0, or the upper bound when that is below 1 (in 16.16), then raised to the lower bound, with the bounds worked out with no margin, since the playfield's margin comes later. `FUN_100290e0`, called once a frame from the battle view's update `FUN_1002be10`, moves the position an eighth of the way to the target (an arithmetic shift) and adds the battle's shake. Nothing else writes these fields (static).

A camera at one size isn't one at the other: on the Arcade map the Full board's camera stays centered, since the whole board fits, while Classic's follows the cursor. Moving the camera straight to the new size's target leaves the view up to 30 frames behind a never-switched engine, or 1 pixel off until the camera next moves, because the engine's glide stops a fraction short of its target. Exact frames need the other size's camera kept beside the engine's, every frame: its target worked out by the same formula with the other size and the playfield's margin, and its position moved by the same eighth plus the same shake. A switch swaps the two.

### The large-screen mode

Widening in a battle does what the setup's end does above a 240-pixel screen: it sets `bv+0x328`, makes the 240 × 320 offscreen (`FUN_1004ad50`, then `FUN_1004a000` on it) and its graphics context (`FUN_1000a2e0`), and loads the curtain (`FUN_100f0e10` builds the name, the image store at `app+0x34` loads it). The setup pushes the address of the curtain's name with a `push` at `0x1002e9a4`, so the address is the dword at `0x1002e9a5`. Narrowing releases those three objects as the battle view's teardown `FUN_1002bc10` does, through the image store's and the context's own release methods, and clears the flag; with the flag clear every curtain path draws straight on the screen, as on a stock phone.

The fade-out counter `bv+0x330` needs the value a Full board battle would have at that moment. A battle on Classic never counts it down and leaves it at 16, which fades a curtain out over the board for the first frames after widening. A Full board battle has it at 16 minus the ticks since the last curtain animation played, and at 0 from 16 ticks on.

### When it can't happen

- **Inside a frame.** Between two ticks no frame is half drawn and no guest register is live; a frame's update and draw then both run at the new size.
- **During a rescue or a fight.** Both draw over a picture of the board taken as they start (`FUN_100831a0` and, static, `FUN_100828a0`), so after a switch they keep the old size's board behind them: on the Arcade run, 72 frames of the rest of a rescue differed. A switch waits while the rescue's state `[[bv+0x2a0]+8]` isn't 0 or the fight's `[[bv+0x29c]+0x14]` is 1.
- **Before the battlefield is first drawn**, the setup hasn't finished laying the battle out.

While the battle menu or a story dialog is up, a switch to the Full board lays the battle out at 420 × 378 and then narrows the screen to 240 × 320 again, as the narrowing hooks would. A switch takes about 27 ms of a tick to the Full board, most of it the curtain's loading, and 3.5 ms to Classic.

## The `.gfx` image container

The curtain is stored as `data/gameplay/ui/animframe.gfx` in `gameplay.pak` (its entry's path hash is `0x3053e862`; `web/pak.js` describes the `.pak` container and its hash). In the copy we read, the file is 91,148 bytes: a 420 × 378 run-length image with one frame.

A `.gfx` file starts with a 40-byte header of little-endian fields:

| Offset | Holds |
| --- | --- |
| `+0x00` | A u32, 2. |
| `+0x04` | A u32, the kind: 4 for a run-length image. |
| `+0x08` | A u32, the width. |
| `+0x0c` | A u32, the height. |
| `+0x10` | A u16, the frame count. |
| `+0x12` | A u16 flag. |
| `+0x14` | Zeros. |
| `+0x24` | A u32, the length of the data that follows the header. |

The data holds, in order, the frame's 16-bit run codes, then the palette as ARGB dwords, then a u32 palette offset and a u32 palette count. The palette offset counts from the start of the data, so the codes fill the data up to it. The curtain's codes take 88,820 bytes and its palette has 570 entries. The codes are those of [re_render.md](re_render.md) "The run-length image": a row is a list of runs that ends once their lengths reach the width. A run whose color index has bit 15 set is drawn with the palette entry at the index's low 15 bits; any other run is transparent.

Decoded this way, the curtain's transparent hole covers 73,119 pixels, with the bounding box x 94 to 326 and y 33 to 346. The curtain therefore overlaps the 240 × 320 inset at (90, 29) by 2 to 4 pixels on each side. Compared with the engine's frame during a battle intro, with the curtain at level 255, all 85,641 of its opaque pixels matched. Decoding took 11.6 ms.
