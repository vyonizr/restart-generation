# Battle input: the states, the cursor, and what a pointer can read and write

Our notes on how the engine takes a local player's input in a battle, as far as **pointer play** (CONTEXT.md "Pointer play", [ADR 0039](../adr/0039-pointer-play-turns-clicks-into-the-engines-own-cursor-moves.md)) relies on it: which battle UI state is on, where the cursor and the tile piece are, how each state's arrows move them, the engine's own setter of the cursor's cell, pixel to cell, and the corner panels. `shared/emu/pointer.js` is built from this note. Written in our own words ([legal notes](../LEGAL.md)). Addresses are Windows virtual addresses; `app` is the object the global at `0x101b828c` points to, `bv = [app+0x9c]` the battle view while a battle is on, and `game = [bv+4]` its `Game`.

Everything here was observed by running the engine in the emulator (`GameHost` from `shared/emu/host.js`, booted with the Full board) unless it is marked static (read, not run) or [INFERENCE]. The battle is the 4-player Arcade battle of `tools/emu/wide-test.mjs` (its keys up to tick 900, an 11 × 11 map, the local player in seat 1, its hero unit 5), on the Full board and on Classic. A tick is one engine frame. The earlier spike's notes, which this note confirms and extends, are in `.scratch/pointer-play/research/battle-controls.md`; `tools/emu/pointer-test.mjs` reruns the core of it on both board views, and the item and skill tables come from the throwaway `tmp/pointer/kinds.mjs` (gitignored). Where the local player's manager is was also measured online, in the browser client ("The local player and its manager", "Online play").

## The states

A battle's screens are UI states run by the local player's manager `M` (vtable `0x101869a8`); the state now is `S = [M+4]`. Where `M` is, offline and online, is below ("The local player and its manager"). A state has three vtables: its own at `S+0`, an input vtable at `S+8`, whose second entry is the state's key handler, and a third at `S+0xc`. The states a local player gives battle input in:

| State | Vtable (first entry) | Input vtable | Key handler |
| --- | --- | --- | --- |
| PlaceTile, a tile piece | `0x10186860` (`0x100b2bb0`) | `0x10186858` | `FUN_100d5410` |
| UseTileItem, an item placed as a tile piece | `0x10188ea0` (`0x100e2ae0`) | `0x10188e98` | `FUN_100d5410`, the same |
| MoveUnit, the hero's turn | `0x101868b4` (`0x100b5180`) | `0x101868ac` | `FUN_100b5df0` |
| FireCannon, the cannons | `0x10186964` (`0x100b7d40`) | `0x1018695c` | `FUN_100b76f0` |
| UseItem, an item with a target | `0x10186914` (`0x100b71c0`) | `0x1018690c` | `FUN_100b6710` |
| UseSpecialSkill, a special skill with a target | `0x101892e0` (`0x100ea150`) | `0x101892d8` | `FUN_100e9e60` |

Every key handler first calls the shared one, `FUN_1008e0d0`, which opens chat (`0x52`) and the battle menu (Back, `0x4f`) and, while the state's byte `S+0x2c` is set, passes the event to the cursor (`FUN_10073fd0`, below). The shared constructor `FUN_1008d5a0` sets `S+0x2c`; the two special skills that choose a direction clear it (static).

The other states of a battle take no battle input of their own: IdleUIState (`0x101880d4`, others' turns, the intro) and ObserverUIState (`0x1018800c`, after a defeat), where only the cursor moves ("Others' turns and the observer", below), AutoSelectActionUIState (`0x1018807c`, after a move, which picks the next state), AttackUIState (`0x10188e50`, a full special power), the battle menu, a story message, and chat entry (TextMessageUIState, made by `FUN_100c28c0`). Measured: from the tick after a Select that sent its order, the state is AutoSelectAction or Idle.

### The local player and its manager

`M` belongs to the local player, in the battle logic's player list. A host reaches that list from the battle view, the same way offline and online (static, measured below):

- **The battle logic isn't in the app object online.** Offline it is `[app+0x114]` while a battle is on ([`re_screen.md`](re_screen.md) "Changing the size while the engine runs"). That pointer is set by the local battle's own screen (`FUN_100c2d70`, from its `+0x84`). Online the arena game state (`FUN_100ec440`) holds the client's logic at its own `+0x24`, and `[app+0x114]` stayed 0 on the host and the guest (measured).
- **From the battle view to the list.** The logic's battlefield is at `logic+0x14`. When its visuals are made (`FUN_100130a0`), the battlefield builds a game for the battle view (`FUN_100375f0`), which keeps the battlefield at its `+0x12c`. It then sets the battle view up with that game (`FUN_1002e3f0`), which keeps it at `bv+4`. The logic's setup (`FUN_10006b10`, run by both the local logic and, after the snapshot, the client's) hands the battlefield the logic's player list `logic+0x18`, which it keeps at `+0x144` (`FUN_1001a720`).
- **The player list.** The players by index at `[+0x10]`, `+0xc` slots of them, and the index of the local player at `+0x24`, −1 while there is none. A player's kind is at `+4`, its index at `+8`, the list at `+0x18`.
- **How a player is added** (`FUN_100243c0`). The list makes the player by its kind (`FUN_10073180`; the kinds are in [`re_rules.md`](re_rules.md): 0 LocalPlayer, 1 LocalObserver, 2 AIPlayer, 3 RemotePlayer, 4 RemoteObserver, 5 unnamed). It runs the player's setup, the fourth entry of its vtable, and stores it at its index. A player of kind 0 or 1 becomes the local one if there is none yet.
- **When the index is looked for again** (`FUN_10023d20`). After a player leaves the list (`FUN_10023d70`) and after a snapshot is loaded (`FUN_100246e0`), the list looks for the local index again: the next index below the old one, going round, whose player is of kind 0 or 1, or −1.
- **The manager.** A local player's setup (`FUN_100754e0`) makes its cursor, keeps it at `+0x68`, and makes `M` (`FUN_100b7d60`), which it keeps at `+0x20`. `M` keeps the game at `+0x3c` and the player at `+0x40`. Its constructor starts it in IdleUIState at `+4`. A new state is first put at `M+8`, and `FUN_10044900` moves it to `+4`.
- **Which players have one.** Only LocalPlayer (vtable `0x1017fb18`), LocalObserver (`0x101867c8`) and kind 5 (`0x101867a4`) run that setup; `FUN_100b7d60` has no other caller. Kind 5 isn't counted as local by the list, and we haven't seen one. AIPlayers (`0x101867ec`) and RemotePlayers have no manager.
- **A defeat.** A LocalPlayer that is knocked out is replaced at the same index by a LocalObserver (`FUN_100245b0`). The old player leaves the list, which sets the index to −1, and the new one sets it back. The observer's setup makes a new `M` and puts ObserverUIState in it (`FUN_100b0e10`).
- **Online.** The server sends every person as a RemotePlayer. The client's logic turns the one at its own index into the kind its JoinInfo gave, LocalPlayer ([`re_rules.md`](re_rules.md)). So the local player is in the list at the client's own index, as offline.

So `M = [P+0x20]`, with the list `L = [[[bv+4]+0x12c]+0x144]`, `P = [[L+0x10] + 4·[L+0x24]]`, and `[P+4]` 0 or 1. `pointer.js` reads it so and checks the code above as it checks its other sites.

An earlier route, `[[app+0x8c]+0x84]`, gave this player only by luck. `[app+0x8c]` is a 0x28-byte object made on first use (app slot 0x23, `FUN_10005710`), so `+0x84` is past its end. In the Arcade battle the player list lay 0x40 bytes after it, and the list's `+0x44` held the local player (measured). Online it held 0 on the host and, on the guest, an object that led to no battle state (measured with the throwaway `tmp/pointer-modes/`), so pointer play read no state in online battles.

Measured every tick of a battle against a scan of memory for every `M` whose `+4` is a battle state (the throwaway `tmp/pointer-online/`, gitignored):

- **Offline**, the Arcade battle above, on each board view to its end (11,814 battle ticks): the route gave `M` on every tick, and each of 270 scans, one every 50 ticks, found that one `M` and no other. The battlefield it went through was `[app+0x114]+0x14` on every tick. The local index was 1 of 5 slots, the CPUs AIPlayers at 2 to 4. The LocalPlayer's `M` showed Idle, PlaceTile, MoveUnit and FireCannon. When the local player was knocked out (tick 12436, "Observer" below), a LocalObserver took index 1 with a new `M`, which showed ObserverUIState until the battle ended. With the battle view gone, the route then gave nothing.
- **Online**, a friendly room of two people and two bots (two pages of the browser client on one server, set up as `e2e/engine/dialogs.spec.mjs` does), on the host and the guest, Full board: from the tick the battle view was set, the route gave nothing for 6 ticks on the host and 7 on the guest, while the local index was still −1 (before the client's own PlayerJoined), and then `M` on every tick of the first 2,745 (host) and 2,753 (guest) ticks of battle. Each of 9 scans per page, one every 300 ticks, found that one `M` and no other. The local index was 1 on the host and 4 on the guest, of 5 slots, the player a LocalPlayer; its `M` showed Idle, PlaceTile, MoveUnit and FireCannon. A defeat and a battle's end online weren't reached in this run.

### When no input applies

Even in one of the six states, the player's input does nothing, or the board isn't what is on screen, at these times:

- **A curtain animation plays:** the battle view's animation chain (the intro, the phase and turn banners) while `[bv+0x2a4]+0x50` is set, a rescue while `[[bv+0x2a0]+8]` isn't 0, a fight while `[[bv+0x29c]+0x14]` is 1 ([`re_screen.md`](re_screen.md)). On the Full board the screen then shows the 240 × 320 inset. Measured: PlaceTile was the state from tick 900, under the round's banners until tick 982; a hero turn's MoveUnit came 69 ticks before its banner ended (ticks 3139 to 3208 in round 2); FireCannon, 69 ticks (2392 to 2461).
- **The cursor isn't active:** the cursor's byte `+0x5b` is 0. The cursor's arrow handler and PlaceTile's arrows do nothing then (static).
- **The state is done:** a dropped piece (`S+0xb8` set; the state was Idle three ticks after the drop, measured), every cannon shot taken (`S+0x80`, the shots taken, reached `S+0x84`, the shots allowed; Idle followed at once, measured), an item used (`S+0x88`), an item that takes no target (`S+0x94`, below), a special skill confirmed (`S+0x84`) or with no target to choose (`S+0x74`, below).

## The cursor

Each local player has one cursor object, `C = [S+0x28]`, the same in every battle state (spike, measured). Its fields: `+4` the game (the map's columns and rows at `+0x20` and `+0x24`), `+0x14` and `+0x18` a pixel offset (0 in every read), `+0x1c` its kind (what it is drawn as: 14 over an enemy hero in the hero turn), `+0x24` and `+0x28` its cell, `+0x5a` drawn, `+0x5b` active.

`FUN_10073fd0` moves it one cell for an arrow while `+0x5b` is set and clamps the cell to the map; it also plays the move's sound for some cursor kinds (static).

### The setter

`FUN_10073ea0` sets the cursor's cell (static, the whole function byte-checked by `pointer.js`). It is a thiscall on the cursor with two stack arguments: a pointer to two dwords, the column and the row, and a byte; it writes both into `+0x24` and `+0x28`, and when the byte isn't 0 clamps each into the map, 0 to columns − 1 and 0 to rows − 1, from `[C+4]`. It calls nothing and returns popping its 8 bytes of arguments. The item and special skill states put the cursor on a target through it, with the byte set.

Called by a host between two ticks with the byte set (measured):

- **Hero turn:** the cursor set from the hero at (2,2) to (2,4) had MoveUnit's path `[2,2 2,3 2,4]`, cost 300, after the next tick: the shortest path, as the spike found for a plain write of the cell. On Classic the camera followed, gliding from (−40, −40) to (129, 16) over about 40 ticks.
- **Cannons:** the cursor set to (7,4), Select, set to (3,6), Select: FireCannon (7,4) and (3,6).
- **Item and skill states that move the cursor freely** (below): Select used the set cell.

The setter doesn't play the cursor's move sound, and it updates nothing a state keeps of its own: the bomb item's blast mask follows the cursor only on a key event (static, `FUN_100b6710`), so it would stay where it was. A tile piece's anchor isn't the cursor (below).

## Pixel to cell

The camera is at `bv+0x2b0` and `+0x2b4` in 16.16; the engine draws with its whole part, the high 16 bits (spike, measured on Classic). With the view `[bv+8]`, whose `+8` and `+0xc` are the map's columns and rows and `+0x20` and `+0x24` the tile's size, 30 × 27:

- `cell x = floor((pixel x + camera x) / 30)`, exactly;
- `cell y = floor((pixel y − 4 + camera y) / 27)`: what the player sees is drawn about 4 pixels lower than the engine's grid (spike, measured: the piece's and the cursor's pixels, and the highlight draw adds 4 to y, static).

On the Arcade map the Full board's camera stays at (−45, −40), which centers the board on 420 × 378; on Classic it follows the cursor, clamped from −40 to the map's size minus the screen's plus 40 (spike, measured). The screen is 420 × 378 in a Full board battle and 240 × 320 on Classic (`GameHost.width` and `height`).

## The corner panels

The battle HUD's four corner panels are at `[[bv+0x1b8]+8]`, `0x6c` bytes each, the first top left, then top right, bottom right, bottom left. `FUN_1008a500` places each from the screen size: its image is `[panel+0]` (an image of the display's class, its width at `+0x18` and height at `+0x1c`), its corner, which is also the seat it shows, at `+8`, its place at `+0xc` and `+0x10`, and where it is now at `+0x3c` and `+0x40`. Each frame it glides a quarter of the way to its place, and it is drawn, whole, only while its seat has a hero (static, `FUN_1008ac90`). A seat's hero is the first unit in the game's unit list (`[game+0x6c]`, nodes with the next node at `+4` and the unit at `+8`) that is a hero (`+0x34` is 0), isn't a princess (`+0xe4` is 0; the princesses are hero units with 2 there, measured) and belongs to the seat (`+0x30`; static, `FUN_100251a0` and `FUN_1000cf60`).

Measured on the Full board: each image is 53 × 48, placed at (−8, −17), (375, −17), (375, 347) and (−8, 347). Two engines in lockstep, one with its panels moved off the screen, differed only inside those four rectangles, clipped to the screen (x 0 to 44 and 375 to 419, y 0 to 30 and 347 to 377), on 1,383 to 1,389 of each rectangle's 1,395 visible pixels. On Classic the same code placed them at (−8, −17), (195, −17), (195, 289) and (−8, 289). On the Arcade map the Full board's panels don't overlap the map; on Classic they do, as the camera scrolls.

## Tile placement

PlaceTile and UseTileItem share their base (static, `FUN_100d47e0`) and their key handler. The piece's anchor cell is at `S+0x84` and `+0x88`, the rotation in degrees at `S+0xb4`, the shape inline at `S+0x8c`: its count at `S+0x8c+0x24` and a pointer to its cells, one pair of dwords each, as offsets from the anchor with the rotation applied, at `S+0x8c+8`. `S+0xb8` is set once dropped and `S+0xb9` while the piece can't drop where it is (spike).

- **Arrows** (`FUN_100d51e0`) move the anchor one cell and the cursor with it, then `FUN_100d48c0` clamps the anchor so that every cell of the piece, the anchor plus each offset, is on the map. The anchor itself can therefore be off the map: −1 with offsets of 1 and 2 (measured).
- **Select:** a release less than 500 ms of engine time after the press turns the piece 90°; holding it longer drops the piece, retrying every tick while it is held (spike). Measured here: Select held for 600 ms of engine time (19 ticks) at the anchor (0,0) sent PlaceTile (0, 0, 90, 5), the anchor, the rotation and the player, and a hold on a blocked spot sent nothing and left the state on. A press and its release queued in the same tick don't turn the piece; a release one or more ticks after the press does (measured with a throwaway script while pointer play was built).

## The hero turn

MoveUnit keeps the acting hero at `S+0x80`. A unit's cell is at `+0x38` and `+0x3c`, its id at `+0x28`, its seat at `+0x30`, its kind at `+0x34` (0 for a hero), its held item at `+0xf0`, and its hero data at `+0x58`, whose `+0x2c` is its special skill (static, `FUN_100402f0`, `FUN_10040d00`, `FUN_10040e60`; measured: our hero's cell and the cursor's were (2,2) at the turn's start). Arrows move the cursor freely, and the engine builds the path from the cursor's moves (spike). Measured here:

- Three Rights from the hero at (2,2), a tick apart: MoveUnit for unit 5 with the path `[2,2 3,2 4,2 5,2]`, the attack flag 0.
- With red's hero, unit 8, on the next cell (6,2): one Right put the cursor on it, its kind 14, the path still `[5,2]`; Select sent MoveUnit with the path `[5,2]` and the attack flag set, then Attack (5, 8), and red's hero went from 100 to 85.
- At the start of each of three hero turns on each board view, the cursor was on the hero's cell (`pointer-test.mjs`).
- On Classic, with the hero at (0,2) on its third turn, the cursor set on (1,1), inside the reach area, and Select sent nothing; why wasn't looked into. Select on another reachable cell moved it.

In MoveUnit's message (type 3) the unit is at `+0x44`, the path's cells at `[+0x4c]` with their count at `+0x54`, and the attack flag at the byte `+0x68`; Attack (type 6) has the attacker at `+0x44` and the target at `+0x48`; FireCannon (type 4) the aim at `+0x44` and `+0x48`; PlaceTile (type 5) the anchor, the rotation and the player from `+0x44`; a target order (type 8, below) the cell at `+0x44` and `+0x48` and the hero at `+0x4c`. `+0x1c` is the sender's seat. They are read in `FUN_1000bb40` as it sends them.

## Items

After a move, AutoSelectAction (`FUN_100d55a0`) looks at the hero's item: kinds 2, 4 and 12 (`0xc`) give UseTileItem, any other item UseItem (static). An item is a game object (`FUN_1006d8d0` makes one: its id at `+0x28`, its kind at `+0x54`). The kinds a hero holds rather than uses at once are 0, 2, 4, 8, 9, 12, 17 (`0x11`), 19 (`0x13`) and 21 (`0x15`) (static, the item gain `FUN_100193f0`).

UseItem keeps the hero at `S+0x80` and the item at `S+0x8c`. Its start (`FUN_100b6fc0`) sets the state up by the item's kind, and its key handler (`FUN_100b6710`) gives the arrows their meaning:

- **A target list:** kind 19 sets `S+0x9c` and fills a list of candidate cells at `S+0xa0` (the first node; the last at `S+0xa4`, the count at `S+0xa8`; each node has the previous node at `+0`, the next at `+4` and the cell at `+8` and `+0xc`), with the cursor on the node at `S+0xac`. Down and Right go to the next node, Up and Left to the previous one, each wrapping round, and the cursor is put on its cell through the setter.
- **A direction:** kind 9. An arrow picks that side of the hero and puts the cursor on a cell out along it (`FUN_1008db60`): about a third of the way from the hero to the map's edge on the first press, then two cells further for each press the same way (the cursor's own step plus one). The start points it up or down, or left or right on a map wider than high, toward the middle (static, `FUN_1008d550`).
- **Free:** kinds 0, 8, 17 and 21 leave the arrows to the cursor. Kind 8 shows a blast mask (`BombMask`) around the cursor, moved on each key event.
- **No target:** any other kind sets `S+0x94`, and the state ends on its next update.

Select sends a target order, type 8, with the cursor's cell and the hero, and sets `S+0x88`; on the hero's own cell a direction item sends nothing.

Measured, each with an item of that kind made in memory (`FUN_1006d8d0`) and put in our hero's `+0xf0` before the first move's Select, on the Full board, our hero at (2,2):

| Kind | State, arrows | Commit |
| --- | --- | --- |
| 0 | UseItem; each arrow one cell | Cursor set to (3,2), Select: type 8 (3, 2, 5) |
| 8 | UseItem; each arrow one cell | Moved to (3,2) by arrows, Select: type 8 (3, 2, 5) |
| 9 | UseItem, starting at (2,5); Right (5,2), Down (2,5), Left (1,2), Up (2,1), Right (5,2), Right again (7,2), again (9,2) | Select: type 8 (9, 2, 5) |
| 17 | UseItem; each arrow one cell | Cursor set to (3,2), Select: type 8 (3, 2, 5) |
| 19 | UseItem, the list the four castles' cells (2,2), (9,2), (9,9), (2,9), from (2,2); Right (9,2), Down (9,9), Left (9,2), Up (2,2) | Select on (9,9): type 8 (9, 9, 5) |
| 21 | UseItem; each arrow one cell | Cursor set to (3,2), Select: type 8 (3, 2, 5) |
| 2, 4, 12 | UseTileItem; each arrow moved the anchor one cell | Select held 600 ms: PlaceTile with the anchor, (3,3) for 2 and 4 after a blocked (0,0), (0,0) for 12, rotation 0 |

## Special skills

When the player's special power is full (the player's `+0x28` at least the setting `MaxSpecialPowerAmount`, static `FUN_10042380`) and the hero may act, AutoSelectAction gives AttackUIState. For skills 8 and 9 it shows a mask and waits for Select, which sends the special-power order (type 16) itself, or Back (static). For any other skill it sends type 16 at once and gives UseSpecialSkill (measured: type 16, then UseSpecialSkill, the next tick).

UseSpecialSkill keeps the hero at `S+0x88`. Its start (`FUN_100ea2a0`) sets it up by the hero's skill, its arrows are `FUN_100e9920`, its directions `FUN_100e9180`, its Select `FUN_100e8c20`:

- **A target list:** skills 6 and 7 build the same kind of list as the item state's, at the same offsets; Down and Right go forward, Up and Left back, wrapping round. An empty list sets `S+0x74`, and the state ends.
- **A direction:** skills 0 and 3 clear `S+0x2c`, so the cursor takes no arrow itself. An arrow puts the cursor on the hero's neighbour that way; for skill 0 a second press the same way puts it on the far end of the skill's line. A press toward the map's edge from a hero on that edge turns to the other side (static).
- **Free:** skills 1, 2, 5 and 10 leave the arrows to the cursor, with a mask of the cells Select accepts drawn around the hero (`TubeSuckMask`, `JumpMask`, `WizardDamageMask`; skill 5 has none).
- **Skill 4** moves the cursor along the hero's diagonals only, a cell at a time in its own way (`FUN_100e8aa0`, `FUN_100e71d0`). Skills 8 and 9 stay in AttackUIState (above).

A Select on a cell the skill accepts sends a target order (type 8) with the cell and the hero and sets `S+0x84`; skill 5 waits for as many cells as the setting `NumMonsterBonanzaMonsters` (static), which here was one Select.

Measured, each with the hero's skill written into its hero data (`[hero+0x58]+0x2c`) and the power to 1000 before the first move's Select, on the Full board, our hero at (2,2); our hero's own skill is 1. A skill written this way isn't one the hero has its data for: after a skill 0 or 7 target order the engine faulted some 150 to 200 ticks later, so these runs show the input and the order, not the skill's play.

| Skill | State, arrows | Commit |
| --- | --- | --- |
| 0 | Direction, starting at (2,3); Right (3,2), Down (2,3), Left (1,2), Up (2,1), Right (3,2), Right again (9,2) | Select: type 8 (9, 2, 5) |
| 1 | Free; each arrow one cell | Cursor set to (3,2), not a cell the skill accepts: nothing sent; the turn ended at its time limit |
| 2 | Free; each arrow one cell | Cursor set to (3,2), Select: type 8 (3, 2, 5) |
| 3 | Direction, starting at (2,3); Right (3,2), Down (2,3), Left (1,2), Up (2,1), Right (3,2), Right again (3,2) | Select: type 8 (3, 2, 5), then EndTurnRequest |
| 4 | UseSpecialSkill with no input taken here; the turn ended at its time limit | — |
| 5 | Free; each arrow one cell | Cursor set to (3,2), Select: type 8 (3, 2, 5), then EndTurnRequest |
| 6 | A list of the three enemy heroes' cells (9,2), (9,9), (2,9), from (9,2); Right (9,9), Down (2,9), Left (9,9), Up (9,2) | Select on (2,9): type 8 (2, 9, 5), then MoveUnit for that enemy hero |
| 7 | The same list and arrows | Select on (2,9): type 8 (2, 9, 5) |
| 8, 9 | UseSpecialSkill with no input taken, and the turn ended at its time limit: [INFERENCE] AttackUIState found the hero's skill in another copy of the game than the one written. Static only | — |
| 10 | Free; each arrow one cell | Cursor set to (3,2), Select: type 8 (3, 2, 5), then EndTurnRequest |

## Online play

Nothing a client sends depends on how the cursor got to its cell, except MoveUnit's path, which is the route the cursor took or the engine's shortest path after the setter (spike, measured). A target order carries the cursor's cell. Run online: only where the local player's manager is ("The local player and its manager"), on the host and the guest of a friendly room with bots. The orders a pointer produces online weren't checked in this note.

## Others' turns and the observer

What the cursor does while the local player isn't acting: in IdleUIState (`0x101880d4`: the intro and the other players' turns) and in ObserverUIState (`0x1018800c`, after the local player is defeated). Measured in the same Arcade battle, on the Full board and on Classic, mostly with two engines in lockstep where only one gets the input under test (the throwaway `tmp/pointer/info-harness.mjs`, gitignored). Pointer play moves the cursor in both (`pointer.js` reads them as `watch`), and `tools/emu/pointer-test.mjs` checks the reach area under a jump and an arrow in another player's turn.

### The two states

- **The name.** The state at `0x101880d4` names itself IdleUIState (static, `FUN_100d59e0`); earlier notes called it InfoUIState. The engine's InfoUIState is a different state (vtable `0x10188138`) that builds the info menu; it isn't a battle state.
- **Input.** Both states' key handler, the second entry of the input vtables `0x101880cc` and `0x10188004`, is `FUN_100d5bf0`, a single jump to the shared one, `FUN_1008e0d0` (static). The first entries of their own vtables are `0x100d5c20` (Idle) and `0x100cfeb0` (Observer). Their update is the shared `FUN_1008e2f0`. Idle's start sets the cursor's kind to 0 and then runs the shared start. Its draw is the shared draw plus the acting hero's face in its corner panel (`FUN_100d5ae0`). Observer's start and draw are the shared ones (static).
- **The cursor** is the same object as in the other states, `[S+0x28]`, which is also the local player's `[player+0x68]` with `player = [S+0x18]`. Its active byte `+0x5b` and drawn byte `+0x5a` were 1 throughout, in the intro, in others' turns and in Observer (measured).
- **Its kind is 0** in both states, over heroes too (measured). Kind 0 is drawn in the acting seat's colour rather than the owner's (static, `FUN_10073ac0`; measured red in red's turn, green in green's). It is an arrowhead on each side of the cell with a jagged blob in that colour over the right one. The hero turn's kind 1 is four corner marks. No kind is set apart for looking at things.
- **Arrows and the setter** both move the cursor's cell at `+0x24` and `+0x28` (measured in both states).

### What the engine shows for the cell under the cursor

After each key event that reaches the shared handler, and when a state starts, `FUN_1008da30` looks at the cursor's cell (static):

- It takes the unit at the cell's `+0x54`. That has to be a unit that isn't a princess (`+0xe4` is 0) and that the local seat can see: its `+0x100` is 0, or it is our seat's (`FUN_100409f0`). Two state bytes allow it, `S+0x56` for our seat's units and `S+0x55` for the others'. The base constructor sets both.
- **A unit that passes** turns on highlight slot 1 of the local player (slots of `0x24` bytes from `[player+0x70]`, `+0x21` on, `+0x20` changed). The slot gets the reach area of that unit's seat's hero: the engine's cost field from the hero (`FUN_10072130`) with its movement budget (`FUN_10040950`), each reachable cell in the seat's colour (`FUN_1008d7e0`). A unit whose byte `+0x13c` is set gets a frog's jump mask instead (`FUN_10026480`). Measured: the slot keeps the map's columns and rows at `+4` and `+8` and its cells at `[+0x18]`, one dword a cell by rows, the seat (1 to 4) on each cell of the area, the hero's own cell included, and 0 elsewhere. A slot turned off keeps its cells.
- **Any other cell** turns slot 1 off.
- **The update** hands the first slot that is on to the battle view each tick; `[player+0x78]` is the slot shown, −1 for none.

Measured, a cursor moved by an arrow onto each target and read 2 and 40 ticks later:

| Under the cursor | Drawn |
| --- | --- |
| Each of the four heroes: ours, the acting one, the two others waiting | That hero's reach area, its cells outlined and tinted in the hero's colour |
| A castle, an item on the ground, an empty cell | Nothing more than the cursor |

- No path, panel or other cursor icon was drawn.
- Castle and item cells have no unit at `+0x54`; the heroes' cells do. The Arcade battle has no monster, so monsters weren't tried. [INFERENCE] By the code, a monster cell would draw its seat's hero's area if it has one.

**The area changes only on a key event.**

- The setter moves the cursor but leaves the slot as it was. Our hero's area stayed on screen after the setter took the cursor to an empty cell, and setting the cursor onto heroes drew no area (measured).
- The area is a snapshot. Red's hero moved from (8,3) to (8,4) with its area showing; the area stayed where it had been drawn until the next arrow (measured).
- A host can call `FUN_1008da30` itself between two ticks: a fastcall with `ecx` = `S` and no stack arguments. Called after the setter, it drew the hovered hero's area (measured, in Idle), and an empty cell turned the slot off. Pointer play's jump does so in both states.

**A name label** is started once a tick, so it follows the setter too (static, `FUN_1008d900`, its state at `[app+0x128]`).

- While the cursor is on a unit it can see, the engine waits the setting `HeroNameDisplayDelay`. It then types the owner's player name above the unit, a letter every `HeroNameDisplaySpeed` ms.
- Measured: after a jump onto a hero, the label's state went from waiting to shown within 40 ticks, but no pixel changed. [INFERENCE] This local battle's players have empty names; online, the names would show.

**Select does nothing** (measured: a tap, a 20-tick hold, Enter and Space each left the frame identical to the twin's and sent nothing). Back opens the battle menu, in Observer too. The shared handler knows only chat, the battle menu (Back, or code `0x54` twice within 500 ms), and the cursor's arrows (static).

### The camera

The local player's update turns the camera toward its cursor every tick unless `[player+0xb0]` is set (static, `FUN_10073e00`), and it was 0 in every read.

- **Idle on Classic:** arrows took the cursor to (8,8), and the camera glided to (130, 17). It stayed there through the turns of the three other players and into the cannon phase. The twin, whose cursor stayed on our hero, kept (−40, −40) all along.
- **Other heroes** never moved the camera: on Classic a player sees the others' moves only where its own cursor is.
- **Observer on Classic:** arrows and the setter both moved the camera.
- **On the Full board** the camera stays put on this map.

### What a moved cursor carries into the next state

- **The hero turn** starts with the cursor on the hero (measured).
- **The cannon phase** starts with the cursor where Idle left it: at (8,8) against (2,2) in the twin.
- **Tile placement** starts with the piece's anchor on that cell: anchor (8,8) against (2,2) (measured).

### The intro

- **Timing (measured):** the intro is Idle from the battle's first tick (720) to 882, under the battle view's animation chain for all of it. On the Full board the screen shows the 240 × 320 inset then.
- **Arrows** move the cursor, and the frame doesn't change (measured).
- **Tick 814:** the engine puts the cursor on (1,2), the local castle's cell, over any earlier move.
- **A move after 814** carries into tile placement: anchor (0,2) against (1,2) in the twin.

### Observer

In this local battle, Observer came at tick 12436, once the local player was knocked out, and lasted until about 12531, when the battle ended by itself (measured, both views).

- **What worked as in Idle (measured):** arrows; an enemy hero's reach area on an arrow onto it; the setter leaving the old area; Select doing nothing; Back opening the menu; the camera following the cursor on Classic.
- [INFERENCE] Online, Observer lasts until the others finish the battle.

### Is a cursor moved in these states safe?

- **Static:** the key handler sends nothing. The area writes only the local player's highlight slots and a cost field it allocates and frees.
- **Measured:**
  - On the Full board, one twin hovered four heroes, a castle, an item and empty cells, and pressed Select, Enter and Space.
  - On Classic, one twin moved its cursor in Idle for a whole round.
  - Both pairs sent the same orders on the same ticks and kept the same units on the same cells. Their frames were identical at the next hero turn, once both cursors were back on the hero.
  - Their heaps differed: an EndTurnRequest read at the send held different leftover bytes where a body would be. EndTurnRequest has no body on the wire ([`re_rules.md`](re_rules.md)).
- **What a player would see:** a cursor left elsewhere moves the Classic camera away from the acting heroes. It also changes where the cannons' aim and the next tile piece start.
- Nothing here was run online.
