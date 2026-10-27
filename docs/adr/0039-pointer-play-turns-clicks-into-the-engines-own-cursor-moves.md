---
status: accepted
---

# Pointer play turns clicks into the engine's own cursor moves

Desktop players asked to play a battle with the **pointer** (CONTEXT.md). The engine has no pointer input: it takes key presses, key releases, typed characters, and "release all" only, and the 2008 PC client never passed a click to it. Its battle states are a cursor (or a tile piece) moved one cell per arrow press and a Select key. The engine builds a hero's route from the cursor's trail, draws it, and plans the way back after a princess is picked up on the ground (`.scratch/pointer-play/research/battle-controls.md`). Prior art is in the same folder: tactics games, Rampart, accessibility standards, and emulators that add a pointer to key-only games.

We decided:

- **Pointer play covers the battlefield only:** tile placement, hero turns (moves, attacks, items, and special skills), and cannons. Menus, the battle menu, and chat stay on the keys. Keys, the touch pad, and a gamepad keep working beside it, with no setting.
- **The page only moves the engine's own cursor and presses Select.** Steps to a neighbouring cell are arrow presses, one for each cell the pointer crosses, so the route keeps the trail's shape. Jumps (a click away from the cursor, or the pointer entering the board) write the cursor's cell through the engine's own setter, and the engine plans the shortest route, as every game in the prior art does. Tile placement uses arrow presses only. Item and skill states that cycle through targets get the cycle key until the cursor is on the clicked cell. Everything the engine sends online is what keys would have produced.
- **On the Full board, hover moves the cursor and a click on the cursor's cell commits** (Brogue's rule). A click on another cell only moves the cursor there, which also covers a trackpad tap without hover. The route follows the pointer, so there are no waypoints of our own. An enemy hovered from a cell next to the route's end shows the engine's attack cursor, and the click attacks from that side; jumped onto, the engine picks the side.
- **On Classic, a click moves the cursor and a second click on the same cell commits** (Heroes III's rule), because the camera follows the cursor there and a hovering pointer would chase the board. A finger on a touchscreen laptop, which has no hover, gets the same rule on either board view.
- **Tile placement and cannons follow Rampart.** The piece or the aim follows the pointer; a commit drops the piece (the page holds Select for 600 ms of engine time, so nobody holds the button) or takes one shot.
- **Buttons.** Left commits, on release, and a release over another cell cancels. Right turns the piece in tile placement and moves the cursor back to the hero in a hero turn (the route is dropped); elsewhere it does nothing. The wheel does nothing. The browser's context menu is off over the game screen. Clicks on the corner panels or the curtain are ignored. A click on a cell that does nothing with Select does nothing; the page draws no hints of its own. The controls legend gets one pointer entry on desktops.

## Considered options

- **Two clicks everywhere.** Rejected on the Full board: hover-then-click is what most mouse-driven tactics games do (Wesnoth, XCOM 2, Civilization), and hover lets the route follow the pointer.
- **Hover everywhere.** Rejected on Classic: the camera follows the cursor, so a resting pointer would end up over another cell, and targets that need accuracy should stay still (Game Accessibility Guidelines).
- **Key presses only, with no cursor writes.** Rejected for jumps: a burst of arrows makes the route all columns, then all rows, an arbitrary shape, and the page can't plan the shortest route itself (the reach grid holds no costs).
- **Writing the cursor everywhere.** Rejected for tile placement: a written anchor isn't clamped or checked until the next input.
- **Explicit waypoints (XCOM 2) or drag-to-draw.** Rejected: the engine's trail already gives that control, and WCAG 2.5.7 asks for a non-drag way anyway.
- **Tapping the board on a touch device.** Rejected: a cell is about 45 CSS px on a phone's Classic screen, under a fingertip, and the touch pad was designed so that thumbs stay off the board.

## Consequences

- **The cursor write is a new engine hook.** It is checked the way ADR 0017 checks its sites, and described in `docs/re` before any code uses it (`docs/LEGAL.md`, rule 4). Without the bytes, pointer play is withheld.
- **The page reads the engine's state each tick:** the battle UI state, the cursor or piece cell, and the camera, to map a pixel to a cell (`cell = floor((pixel + camera) / tile)`, tiles 30 × 27, drawn about 4 px lower).
- **Items and special skills were checked by giving a hero each kind in memory, not in a battle that dealt them** (`docs/re/re_battle_input.md`). Every item kind that takes a target, and special-skill kinds 0, 1, 2, 3, 5, 6, 7 and 10, take pointer play. Skill kind 4 (a cursor on the diagonals only) and the confirm-only skill state don't: there the pointer does nothing and the keys play on.
