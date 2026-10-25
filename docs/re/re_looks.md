# What the environments and the fame badges look like

The **Replays** dialog draws each replay's environment as a small sketch and marks a ranked match with a winged badge ([ADR 0034](../adr/0034-each-player-keeps-their-last-25-replays.md)). This note says, in our own words, what the original shows, so the sketches are drawn from it and not from the game's art. Nothing here is a copy of a picture: no frame, color table, or pixel was taken over.

## The five environments

A battle's look is its Game blob's `Environment` (`+0x120`, 0 to 4; [protocol.md](../protocol.md) "Battle templates"). We watched one replay five times on the replay page's Full board, changing only that value, so the level, castles and units stayed the same. The purple and orange pipes at the board's sides and the corner panels are the same in all five.

| # | Environment | What the battlefield looks like |
| --- | --- | --- |
| 0 | Space | A black sky with a sparse scatter of tiny white and pale blue stars. The board is deep navy-blue tiles in two close shades, with small light-blue dots where four tiles meet. It has no frame and floats on the black. |
| 1 | Clouds and grass | A bright blue sky with white, rounded clouds. The board is a floating square of grass checkered in two greens, edged with a yellow-and-black hazard stripe, with a small propeller unit at each corner holding it up. |
| 2 | Speedball | A metal arena in cool lavender and violet greys. Light violet floor tiles in two shades sit inside a darker violet wall that has a gate in the middle of each side, with small orange arrows by the gates. An orange dashed line runs just inside the wall, and thin orange-red lines cross the floor through a small square at its center. |
| 3 | Soccer | A grass pitch striped in a lighter and a darker green, with white lines: the boundary, a center circle and spot, and corner arcs with small flags. A crowd of small orange-brown spectators stands along all four sides. |
| 4 | Racetrack | Grey asphalt checkered in two greys, with a few dark skid marks. Stacks of black tyres stand around the edges, and red-and-white kerb stripes mark the board's corners. |

## The fame badges

The game shows a player's fame level as a small badge (the profile's `fameLevel`, shown as the level less one; [re_casino.md](re_casino.md) §2.9). The badges are `data/menus/gfx/fame.gfx` in `menus.pak`, the path the engine names next to its `FAME`, `HIGHEST_FAME` and `NO_RANK_YET` strings: a `.gfx` of kind 1 ([re_info.md](re_info.md)), 40 × 16 pixels, 32-bit colors, with 14 frames, one per level from the lowest.

They climb like military insignia, and from the second level on they have wings:

- A small teal gem, first alone, then with short white wings, then with longer wings and a little crest.
- One, two, then three bronze bars, the second and third winged.
- One, two, then three silver bars, likewise winged, the third trimmed in gold.
- One gold coin with small rays, then two coins on gold wings.
- One gold star, then two gold stars on wings.
- At the top, a gold star on a broad pair of gold wings.

So the game's sign of standing is a winged badge, not a trophy. Our **Ranked** icon is our own line drawing of the idea: a plain bar between two wings of two feathers each, the wings level with the top of the bar.
