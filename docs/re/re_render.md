# Hot loops: sprites, tile grid edges, scene objects, the curved band, line blends, sprung points, and the fight's picture effects

Our notes on the engine routines that took the largest share of a battle's emulated instructions, written in our own words (see [LEGAL.md](../LEGAL.md)). [`shared/emu/fast.js`](../../shared/emu/fast.js) replaces their hot loops with JavaScript built from this note. Offsets are from the object in ECX ("this") unless stated. Stack slots are given as `[esp+n]` at the instruction named, after the routine's own pushes.

## The sprite object

The sprite object holds the following fields:

| Offset | Holds |
| --- | --- |
| `+0x04` | The image resource. Its first dword is the base of the sprite's run data. The object's virtual method at vtable `+0x0c` (`0x10112570`) just returns this pointer. |
| `+0x14` | The target surface; its `+0x20` is the pixel format (2 is the 32-bit format a battle uses). |
| `+0x20` | The draw mode set by `FUN_100a0430`. |
| `+0x30`, `+0x34`, `+0x38`, `+0x3c` | The clip rectangle: bottom (exclusive), top, left, right (exclusive), in pixels. `FUN_100a02c0` copies it, and the alpha at `+0x60`, from its arguments before each draw. |
| `+0x44` | A table of dwords, one per animation frame: where that frame's run data starts, in bytes from the base. |
| `+0x48` | The palette object for indexed sprites (0 for direct color). Its `+0x08` is the palette: dwords of ARGB. |
| `+0x50`, `+0x54` | Width in pixels and height in rows. |
| `+0x60` | Alpha, 0 to 255; 0xff means "as drawn". |
| `+0x64` | A byte: when set, the second segment of each run is copied straight to the screen instead of going through the span routine. |
| `+0x68` | The span routine the blitters call for each segment. |

`FUN_100a0430(mode)` stores the mode and picks the span routine from it, the surface format, and whether the sprite has a palette. On a 32-bit surface: mode 0 copies (`0x1009f710` with a palette; without one, `FUN_1009f2c0` and the `+0x64` byte set, so the second segment is a plain copy); mode 1 blends at the object's alpha (`FUN_1009f830` with a palette, `FUN_1009f2c0` without); mode 2 blends at each pixel's alpha (`FUN_1009f8c0` with a palette, `FUN_1009f340` without); mode 3 adds (`0x1009f750` / `0x1009f540`); mode 4 is `FUN_1009f600`. In an Arcade battle we saw only `FUN_1009f8c0` at alpha 0xff and `FUN_1009f340` at alpha 0xff and 192, with the `+0x64` byte clear.

## The run data

A frame is its rows one after another. A row is a list of runs; the row ends once the runs' pixel counts add up to at least the width. Each run is:

1. a dword: how many bytes of screen to step over (transparent pixels);
2. a dword n1, then n1 bytes of pixels: the first segment;
3. a dword n2, then n2 bytes of pixels: the second segment.

Lengths are in bytes; the blitters turn them into pixels by shifting right by the bytes-per-pixel shift (2 for 32-bit). Both blitters walk the data with an index counted in 16-bit units, so every byte length is halved before it is added, and the frame table's byte offset is halved to start. Pixels are ARGB for a direct-color sprite. For an indexed one the low 12 bits are the palette index and the top byte is that pixel's alpha. Since only the second segment may be copied straight, it presumably holds the opaque pixels and the first the semi-transparent edge.

## Draw a sprite frame inside the clip

`FUN_100a1880(dst, shift, pitch, x, y, frame)`, a thiscall that pops its six arguments (`ret 0x18`). `dst` is the surface's pixel base, `shift` the bytes-per-pixel shift, `pitch` the surface's row length in pixels, `(x, y)` the frame's top-left corner, and `frame` the animation frame. `FUN_100a02c0` calls it for each sprite it draws.

It first gets the run data base through the virtual method at `+0x0c`. Unless the frame is wholly inside the clip (x ≥ left, x + width < right, y ≥ top, y + height ≤ bottom), it passes the same six arguments to the virtual method at `+0x60`, which is `FUN_100a1a40`, and returns.

Otherwise it keeps a byte offset into the surface, starting at (pitch × y + x) << shift. For each run it adds the step to the offset, calls the span routine for the first segment (`span(dst + offset, its pixels, n1 pixels, alpha)`, with ECX the sprite), adds n1 to the offset, then either copies the second segment's n2 bytes to `dst + offset` (when `+0x64` is set) or calls the span routine for it the same way, and adds n2. At the end of each row the offset moves on by (pitch − width) << shift.

### The row loop of the sprite blitter

The loop head at `0x100a1900` is reached once the clip test passed and the height is positive. There, the registers and stack slots hold the following values:

| Location | Holds |
| --- | --- |
| EBX | The data index, in 16-bit units |
| EDI | The surface offset |
| EBP | The sprite |
| EDX | The data base |
| ECX | The shift argument |
| ESI | The height |
| `[esp+0x10]` | The data base |
| `[esp+0x14]` | The surface offset saved after a run's first segment |
| `[esp+0x1c]` | `dst` |
| `[esp+0x20]` | `shift` |
| `[esp+0x24]` | `pitch` |
| `[esp+0x28]` | The row number |
| `[esp+0x2c]` | The last segment length: the first segment's pixel count, then the second segment's byte count |
| `[esp+0x30]` | The pixels done in the current row, cleared at the start of each row |

The loop ends at `0x100a1a04`, the epilogue, with EAX the row number (now the height), ECX the shift argument, EDX the data base (unchanged when the width isn't positive), ESI the height, EBX and EDI where the data and surface ended, and the flags of comparing the row number with the height.

## Draw a sprite frame against the clip

`FUN_100a1a40` has the same arguments and stack cleanup as `FUN_100a1880`. It does nothing if the frame lies wholly above the clip (y < top − height) or at or below it (y ≥ bottom). Rows above the top are skipped: it walks their runs to advance the data index without drawing, and advances the surface offset by those rows up front. The number of rows to draw is the height, or the rows down to the bottom when the frame crosses it, less the rows skipped. (When a frame crosses both the top and the bottom, the bottom count is taken before the skipped rows are removed, so it draws that many rows past the bottom. We keep that.)

Each segment is cut to the clip horizontally: where it starts left of the left edge, its first pixels up to the edge (at most the whole segment) are skipped in both the data and the surface; where it ends past the right edge, its count stops at the edge (never below 0). The span routine gets the remaining count, which can be 0. The copy of a second segment uses the same cut. A segment whose byte length isn't positive is stepped over without a call.

### The skipping loop

The loop at `0x100a1ae0` walks one skipped row per pass. At its head, the registers and stack slots hold the following values:

| Location | Holds |
| --- | --- |
| EBX | The data index |
| EDI | The data base |
| EBP | The shift argument |
| ESI | The row's pixel count so far |
| `[esp+0x1c]` | The rows left to skip |
| `[esp+0x2c]` | The width |

It ends at `0x100a1b30` with `[esp+0x1c]` 0, ECX the width, ESI the last row's pixel count (0 when the width isn't positive), EDX reloaded from `[esp+0x38]` (the y argument) when the width is positive, and the flags of decrementing `[esp+0x1c]` to 0, whose carry is from the last comparison of the row's pixel count with the width, or from testing the width.

### The drawing loop

The loop at `0x100a1b70` draws one row per pass. At its head, the registers and stack slots hold the following values:

| Location | Holds |
| --- | --- |
| EAX | The surface offset |
| EBX | The data index |
| ESI | The sprite |
| EDI | The data base |
| EBP | The shift argument |
| `[esp+0x10]` | The sprite |
| `[esp+0x14]` | The data base |
| `[esp+0x18]` | The pixels cut from the left of the last second segment |
| `[esp+0x1c]` | The last segment length: the first segment's pixels, then the second's bytes |
| `[esp+0x20]` | The rows left |
| `[esp+0x28]` | `dst` |
| `[esp+0x2c]` | The surface offset as last stored: after a run's first segment, plus its second segment's left cut |
| `[esp+0x30]` | `pitch` |
| `[esp+0x34]` | The x argument |
| `[esp+0x38]` | The pixels done in the row |
| `[esp+0x3c]` | The last segment's pixel count |

It ends at `0x100a1d7a` with `[esp+0x20]` 0, ECX 0, EDX the end-of-row step (pitch − width) << shift, ESI the sprite, EDI the data base, and the flags of adding that step to the offset and then decrementing the row count to 0.

## The span routines

Each is `span(dst, src, count, alpha)` with ECX the sprite, popping its four arguments (`ret 0x10`). Each writes `count` pixels at `dst` from the pixels at `src`, and does nothing when `count` isn't positive.

- `FUN_1009f2c0`: at alpha 0xff, copies the pixels. Below it, blends each pixel's three color channels toward the source by alpha/256 and clears the top byte.
- `FUN_1009f340`: at alpha 0xff, blends toward the source by the source pixel's own alpha. Below, by (source alpha + 1) × alpha / 256. Either way, a blend amount of exactly 0x40 or 0x80 takes a shortcut that adds shifted copies of both pixels, which can differ from the general formula in the low bits.
- `FUN_1009f8c0`: the source is a palette index and alpha. At alpha 0xff, it blends toward the palette color like `FUN_1009f340` at 0xff, shortcuts included. Below, it blends toward the palette color by (source alpha × alpha) / 256, with no shortcuts and the top byte cleared, like `FUN_1009f2c0`.

The other span routines `FUN_100a0430` can pick aren't reimplemented; the JavaScript blitters call them in the guest.

## The edges of a tile grid

`FUN_100846d0(grid)`, a thiscall that pops its one argument (`ret 4`). The object's `+0x14` describes the grid: its `+0x08` is the number of columns and `+0x0c` the number of rows. The argument's `+0x04` points at the cells, row by row, 12 bytes each: a value, then a 4-bit mask and a packed word that this routine fills. `FUN_10086120` stamps a shape's values into the cells and then calls it.

For every cell whose value isn't 0, it looks at the four neighbors: above, below, right, and left, in that order. A neighbor outside the grid, or holding a different value, is an edge. The mask gets bit 0 for an edge above, bit 1 below, bit 2 right, and bit 3 left. The packed word holds one byte per side, from the top byte down in the same order: the cell's value where that side is an edge, 0 where it isn't (built by shifting left 8 and or-ing in each side's full value, so a value above 0xff spills into the higher bytes). Cells holding 0 are left alone.

### The tile grid row loop

The loop at `0x100846f1` is reached once the row count is positive. At its head, the registers and stack slots hold the following values:

| Location | Holds |
| --- | --- |
| EAX | The grid description |
| EBP | The row |
| ESI | 0 |
| ECX | The object |
| `[esp+0x14]` | The object |
| `[esp+0x18]` | The row |
| `[esp+0x30]` | The argument |

Each cell first clears `[esp+0x10]` (the mask), `[esp+0x1c]` (the value below), `[esp+0x20]` (the value right), and `[esp+0x28]` (always 0, the "no edge" value for the left side), and a nonzero cell leaves its column + 1 in `[esp+0x24]`.

It ends at `0x100848a8` with EBP and `[esp+0x18]` the row count, EAX the grid description, ECX the object, EDX the row count, ESI 0, and the flags of comparing the row with the row count. When the column count is positive, EDI is the column count and EBX the byte offset of the last cell (12 × its index); otherwise EDI is 0 and EBX unchanged.

## Draw one scene object

`FUN_10052de0(obj, pos, look, frame)`, a thiscall on the scene renderer that pops its four arguments (`ret 0x10`). The battle's per-frame draw (`FUN_1007a580` and the routines under it) calls it a few hundred times a tick, once for each object it puts on the screen. `obj` is a drawable: its `+0x24` is its image and its `+0x28` the cache that keeps the image loaded. `pos` points at the x and y to draw at, `look`'s `+0x08` is the level (alpha) the draw is made at, and `frame` is the animation frame.

The renderer's `+0x04` is the screen, another drawable whose image's `+0x04` holds the pixel base (`+0x00`) and the row length in pixels (`+0x04`). The renderer's `+0x0c` is the table a run-length image adds through (copied into the image at each draw), and its `+0x18`, `+0x1c`, `+0x20`, and `+0x24` are the clip rectangle: right (exclusive), left, top, and bottom (exclusive).

Nothing happens when `obj` is 0. Otherwise it tells `obj`'s cache that the image is in use (`FUN_1004a060`; see [The image cache](#the-image-cache)), twice, and stops if `obj` has no image. It then tells the screen's cache the same thing three times, stopping after the first if the screen has no image, and reads the pixel base and row length through the screen image's virtual method `+0x0c` (`FUN_10112570`, which returns the image's `+0x04`). Last it calls the virtual method `+0x50` of `obj`'s image with (renderer, pixel base, pointer to a pair, x, y, level, frame), ECX the image. The pair is two dwords in the routine's own locals: the row length, then the screen's `+0x1c`.

Every way out restores EBX, ESI, EDI, and EBP, leaves EAX, ECX, and EDX as the last call left them (as at entry when `obj` is 0), and leaves the flags of the epilogue's `add esp, 8`, made when ESP is 8 below its value at entry.

In a battle the image's `+0x50` was `FUN_1009e940` (see [The run-length image](#the-run-length-image)) for all but a few percent of the calls; the rest were `FUN_100a02c0` (the sprite described in [The sprite object](#the-sprite-object)) and `FUN_1009d640`.

### The image cache

`FUN_1004a060(obj)` (ECX `obj`, no stack arguments) does nothing when `obj`'s `+0x28` is 0. Otherwise it calls that cache's virtual method `+0x0c` with (`obj`, 0), which in a battle is always `FUN_10053800` (the cache's vtable is `0x1017bd8c`).

`FUN_10053800(obj, lock)`, a thiscall on the cache popping two arguments. A nonzero low byte of `lock` brackets the work with the virtual methods `+0x04` and `+0x08` of the cache's `+0x1c`. When `obj`'s image (`+0x24`) is 0 or its byte `+0x2c` is set, it loads the image first, making room in the cache's budget (`FUN_10053450`). The common case is neither: the image is loaded and the routine only marks it as most recently used.

The cache keeps a list of nodes from newest (the cache's `+0x14`) to oldest (`+0x10`). A node's `+0x00` points at the next older node and `+0x04` at the next newer one, 0 at either end. `obj`'s node is its `+0x44` (`FUN_100533a0` returns it). Unless the node is 0 or already the newest, the routine unlinks it (pointing its neighbors at each other, and making its newer neighbor the oldest when it was the oldest), then puts it in front: its newer link becomes 0, its older link the old newest node, whose newer link becomes the node, and the cache's `+0x14` becomes the node.

## The battle view's effects

The battle view keeps a list of short effects drawn on the battlefield, such as an egg's splat on the hero it hits. The list is at `+0x31c` of the battle view (the object `FUN_1002c1a0` draws): `+0x31c` is the count, and `+0x320` the array of 0x1c-byte entries. An entry's `+0x00` is its image, 0 when the entry is free, `+0x04` and `+0x08` its cell (x, then y), and `+0x0c`, `+0x10` and `+0x14` three more values from the caller; `+0x18` starts at 0.

`FUN_1002ea10(image, x, y, a, b, c)`, a thiscall on the battle view that pops its six arguments (`ret 0x18`), adds an effect. It walks the whole list and writes the new effect into every free entry it finds, not only the first. Then it grows the list by one entry (`FUN_1002d7b0`) and writes the effect there as well. A list with n free entries therefore holds n + 1 copies of the new effect afterwards, and the list is one entry longer after every call, whatever was free. The egg's hit (`FUN_10034bb0`, the battle view's handler of event 0x72) adds its splat this way; six other places in the battle UI call it too.

In its per-frame draw, `FUN_1002c1a0` queues one call of `FUN_1002b7a0` with the renderer's virtual method `+0x0c` for each entry that isn't free, at the depth 10 × the entry's y + 18. Each `FUN_1002b7a0(renderer, view)` call draws every entry that isn't free through the renderer's virtual method `+0x14`, centered on its cell and 5 pixels up. A frame with k entries set thus makes k² draws.

The list never shrinks, while entries become free again once their effects end (every entry was free at each egg hit we saw; we didn't trace what frees them), so a battle's later effects find many free entries. In a 4-player battle we replayed, the list held 35, 58 and 63 entries at three egg hits, all of them free, so the splat was set 36, 59 and 64 times and drawn 1,296, 3,481 and 4,096 times a frame for the 15 ticks it plays. The splat's image is a sprite (see [The sprite object](#the-sprite-object)) that no fast path draws, which made those ticks cost 13 to 39 million guest instructions each, against about 0.1 million for the battle's other ticks.

### The revival's change

The engine is patched in memory (`EFFECT_ONCE` in `shared/emu/host.js`) so that `FUN_1002ea10` skips the walk: the jump at `0x1002ea33`, taken when the list is empty, is always taken. The new effect is then written only into the entry the list grows by. The list grows exactly as before and its last entry is the same, so effects are drawn in the same order with the latest on top; only the extra copies in free entries are gone. Over the whole replay above, every frame and every sound block were identical with and without the patch, on Classic and on the Full board, and the egg hits' ticks fell to about 0.1 million guest instructions.

## The run-length image

A second kind of image, with the vtable `0x10182a88`. Its frames are palette-indexed runs. Offsets are from the image, which holds the following fields:

| Offset | Holds |
| --- | --- |
| `+0x04` | A holder whose `+0x00` is the base of the run data. The virtual method `+0x0c` (`FUN_1009d8b0`, a jump to `FUN_10112570`) returns the holder. |
| `+0x0c` | The table mode 3 adds through: one row of 256 bytes per level, indexed by each color channel (`FUN_1009da10`). Set from the renderer's `+0x0c` before each draw. |
| `+0x14` | The size: its `+0x18` is the width, `+0x1c` the height and `+0x20` a pixel format, which must be 2 (32-bit) for the image to be drawn. |
| `+0x20` | The draw mode: 0 fills, 1 blends at the level, 2 blends at each color's own alpha, 3 adds; any other draws nothing. |
| `+0x2d` | A byte: when set the image is drawn mirrored (see [Draw a mirrored run-length frame](#draw-a-mirrored-run-length-frame)). Clear on the battlefield we watched; set on one of the two fighters of a fight cut-in. |
| `+0x2e` | A byte: when set, every frame uses the colors of the palette object at `+0x48` (its `+0x08`, or none when `+0x48` is 0), read through the virtual method `+0x3c` (`FUN_1004a790`). When clear, the frame's own palette is entry `frame` of the table at `+0x54`. |
| `+0x30`, `+0x34`, `+0x38`, `+0x3c` | The clip: bottom (exclusive), top, left, right (exclusive). |
| `+0x40` | The frame count, returned by the virtual method `+0x1c` (`FUN_100b7f40`). |
| `+0x44` | A table with one dword per frame: where its run data starts, in bytes from the base. |
| `+0x64` | The level, 0 to 255. Mode 1 blends by its low byte; mode 2 at exactly 0xff rescales each color's alpha a to (a + 1) × 255 / 256. |
| `+0x70` | When nonzero, the draw is sent to the virtual method `+0x58` instead. Never set in a battle we watched. |

A frame's rows follow each other. A row is a list of runs that ends once their lengths reach the width. A run is one 16-bit code when its top nibble isn't 0: the nibble is the length and the low 12 bits the color index. When the top nibble is 0, the code is the length and the next code is the color index. An index with bit 15 set is drawn with the palette color at its low 15 bits; any other run is transparent and only advances the screen position.

### Draw a frame of the run-length image

`FUN_1009e940(renderer, dst, pair, x, y, level, frame)`, a thiscall that pops its seven arguments (`ret 0x1c`): the virtual method `+0x50` that `FUN_10052de0` calls. When `+0x70` is set it passes everything on to `+0x58` and returns. A frame that is negative, or not below the frame count, becomes frame 0 (the count is only asked for when the frame isn't negative). It copies the renderer's clip into the image's clip and stores the level at `+0x64`.

For an image that isn't mirrored it then gives up, drawing nothing, when x is at or right of the clip's right edge, when x + width is left of the left edge, when y is at or below the bottom edge, when y + height is above the top edge, or when the pixel format isn't 2, in that order. Each of these returns with EAX the x argument, and with ECX and EDX: the width and the left edge; x + width and the left edge; y and the left edge; y and the top edge; y and the format less 2. Otherwise it copies the renderer's `+0x0c` to the image's `+0x0c` and draws with `FUN_1009e550(dst, 2, row length, x, y, frame)`, the row length being the pair's first dword, and returns with what that left in EAX, ECX, and EDX. The comparisons are signed.

A mirrored image skips the two tests on x. Its x becomes w − x instead, w being the `+0x18` of what the renderer's virtual method `+0x10` returns (the screen's width, we take it [INFERENCE]). The tests on y and the format follow as above, and it draws with `FUN_1009e760(dst, 2, row length, w − x, y, frame)`.

### Draw a run-length frame inside the clip

`FUN_1009e550(dst, shift, pitch, x, y, frame)`, a thiscall popping six arguments (`ret 0x18`). When the frame isn't wholly inside the clip (x below left, x above right − width, y below top, or y above bottom − height), it passes the same arguments to `FUN_1009de90` and returns with what that left in EAX, ECX, and EDX.

Otherwise it starts at the frame's run data (the table's byte offset, halved, as an index in 16-bit codes) and at the screen offset (pitch × y + x) << shift, and picks the frame's palette (EDX holds the palette when it comes from the table, the image's vtable when it comes from the palette object). With a height that isn't positive it returns there, with EAX the pitch, ECX the shift, and EDX as just said. Else it draws each row's runs, each opaque one in the draw mode, and after each row moves the screen offset on by (pitch − width) << shift. It returns with EAX that row step, ECX 0, and EDX the last run's length << shift (EDX holds the palette or the vtable, as at the early return, when the width isn't positive).

Its row loop, at `0x1009e600`, holds the following values at its head:

| Location | Holds |
| --- | --- |
| EBX | The data index |
| EBP | The screen offset |
| ESI | The image |
| `[esp+0x10]` | The width |
| `[esp+0x14]` | The rows left |
| `[esp+0x18]` | The data base |
| `[esp+0x1c]` | The row step |
| `[esp+0x24]` | `dst` |
| `[esp+0x28]` | The shift |
| `[esp+0x2c]` | The pixels done in the row |
| `[esp+0x30]` | The last code read |
| `[esp+0x34]` | The data index after the last run |
| `[esp+0x38]` | The palette |

It ends at `0x1009e719` with the rows left 0, EAX the row step, ECX 0, EDX as the routine returns it (see the preceding paragraph), EBX the data index, EBP the screen offset, and the flags of adding the row step to the offset and then decrementing the row count to 0.

### Draw a run-length frame against the clip

`FUN_1009de90` has the same arguments and cleanup as `FUN_1009e550`. It works out how many rows to draw (the height, or the rows down to the bottom edge if fewer), how many rows at the top to step over without drawing (those above the top edge, or 0), how many pixels to cut at the left of each row (those left of the left edge, or 0), and where to stop on the right (the width, or the pixels up to the right edge if fewer). It reads the run data and palette as `FUN_1009e550` does and starts at the screen offset (pitch × y + x) << shift. With no rows to draw it returns there, with EAX the pitch, ECX the shift, and EDX that offset.

Otherwise it walks every run of every row it draws, as `FUN_1009e550` does, but draws an opaque run only in rows past the stepped-over ones, and only its pixels between the left cut and the right stop. Mode 2 here blends at each color's alpha without the rescaling at level 0xff. It returns with EAX the row step, ECX the number of rows drawn, and EDX the screen offset after the last row.

Its row loop, at `0x1009df68`, keeps everything on the stack:

| Location | Holds |
| --- | --- |
| `[esp+0x10]` | The width |
| `[esp+0x14]` | The row |
| `[esp+0x18]` | The palette |
| `[esp+0x1c]` | The data base |
| `[esp+0x20]` | The left cut |
| `[esp+0x24]` | The right stop |
| `[esp+0x28]` | The rows stepped over |
| `[esp+0x2c]` | The rows to draw |
| `[esp+0x30]` | The row step |
| `[esp+0x38]` | `dst` |
| `[esp+0x3c]` | The shift |
| `[esp+0x40]` | The pixels done in the row |
| `[esp+0x44]` | The screen offset |
| `[esp+0x48]` | The data index |
| `[esp+0x4c]` | The last run's length |

It ends at `0x1009e0a9` with EAX the row step, ECX the row (now the rows to draw), EDX the screen offset, EBX the last run's length, EBP the rows to draw, EDI the pixels done in the last row, and the flags of comparing the row with the rows to draw.

### Draw a mirrored run-length frame

`FUN_1009e760(dst, shift, pitch, x, y, frame)` and `FUN_1009e0d0`, with the same arguments, draw a frame flipped left to right, with x its right edge: the first pixel of each row lands at x − 1, the next at x − 2, and so on. Both are thiscalls popping six arguments (`ret 0x18`) that read the run data and palette as `FUN_1009e550` does. `FUN_1009e760` is the case wholly inside the clip: x − width at or right of the left edge, x at or left of the right edge, y at or below the top edge, and y at or above bottom − height, signed. Any other frame it passes on to `FUN_1009e0d0` and returns with what that left in EAX, ECX, and EDX. `fast.js` reproduces only `FUN_1009e0d0`'s row loop: in a fight cut-in we watched, the mirrored fighter took that path on every frame, 92.5 % of a middle tick's guest instructions on the Full board.

`FUN_1009e0d0` works out the following:

- The rows to draw: the height, or the rows down to the bottom edge (bottom − y) if fewer.
- The rows at the top to step over without drawing: top − y, or 0.
- The cut: the pixels of each row, counted in run order, that lie at or right of the right edge, x − right, or 0.
- The stop: the width, or x − left if fewer.

It starts at the screen offset (pitch × y + x) << shift. With no rows to draw, it returns there with EAX the pitch, ECX the shift, and EDX the rows to draw. Otherwise the row step is (pitch + width) << shift, which takes the offset from the left end of one row to the right end of the next.

It walks every run of every row, keeping the pixels done in the row. A run of length n, with d pixels done before it, has a skip of cut − d when d is below the cut, else 0. The skip isn't capped at n. Its count is n − skip, or stop − skip − d when d + n is past the stop, and can be 0 or negative. The offset first moves left by count << shift. An opaque run, in a row past the stepped-over ones and with a positive count, then draws count pixels from dst + offset − skip × 4 rightward, in the image's draw mode, as `FUN_1009de90` does: mode 2 at each color's own alpha, without the rescaling at level 0xff. A mode above 3 draws nothing. Last, the offset moves left by (n − count) << shift, which makes n << shift in all.

Its row loop, at `0x1009e1b0`, holds the following values at its head:

| Location | Holds |
| --- | --- |
| EAX, `[esp+0x30]` | The row step |
| EBX | The image |
| EBP | The screen offset |
| ESI | The y argument |
| `[esp+0x10]` | The width |
| `[esp+0x14]` | The palette |
| `[esp+0x18]` | The rows to draw |
| `[esp+0x1c]` | The data base |
| `[esp+0x20]` | The cut |
| `[esp+0x24]` | The stop |
| `[esp+0x28]` | The rows stepped over |
| `[esp+0x38]` | `dst` |
| `[esp+0x3c]` | The shift |
| `[esp+0x40]` | The row, 0 |
| `[esp+0x44]` | The data index |

Each row clears EDI and `[esp+0x48]`, the pixels done in the row. Each run leaves its length at `[esp+0x2c]` and `[esp+0x4c]`, and its count in ESI.

It ends at `0x1009e2f7`, the epilogue, with the following values:

- EAX the row step.
- ECX, EDX, and `[esp+0x40]` the rows to draw.
- EBP the screen offset after the last row.
- The flags of comparing the row with the rows to draw.
- When the width is positive: ESI the last run's count, and EDI one of three values. After a run drawn in mode 0, it is the address after the last pixel written. After one drawn in another mode, it is the address of the first pixel. After a run not drawn, it is the count << shift.
- When the width isn't positive: ESI the y argument and EDI 0.

## A curved band between two points

`FUN_10078810(source, dx, dy, row, plain)`, a thiscall that pops five arguments (`ret 0x14`), on an object we call the band. It draws a band of `+0x34` pixels' width along a curve from one point to another in `+0x30` steps, one short horizontal line per step, with colors from a table and a darker edge. In the battle we measured, it ran only in the last 650 or so ticks of the measurement, and only when the emulator's audio was read at the rate the browser client reads it. There it ran twice a tick, once with `plain` set and once without, each time with 640 steps.

The band holds the following fields:

| Offset | Holds |
| --- | --- |
| `+0x00` | The starting shade: an index into a row of the color table. |
| `+0x04` | The shade the second part starts from, added to `+0x00`. |
| `+0x08` | How much the shade grows per step in the second part. |
| `+0x0c` | How much the shade grows when the curve moves down a line in the first part. |
| `+0x10` | A shift for the slope term of the shade cap. |
| `+0x14`, `+0x18` | The start point, x and y in 16.16 fixed point. |
| `+0x1c`, `+0x20` | The end point. |
| `+0x2c` | The color table: rows of 256 dwords. |
| `+0x30` | The number of steps. |
| `+0x34` | The band's width in pixels. |
| `+0x38`, `+0x3c` | The divisor and the offset of the curve's sag. |
| `+0x44`, `+0x48` | The screen's width and height, copied in at each call. |

It returns at once unless the game object's mode (the global at `0x101b828c`, its `+0x2c`, its `+0x04`) is 2. It gets the screen from `source`'s virtual method `+0x10` (`FUN_10112570`, the source's `+0x04`), a drawable like `FUN_10052de0`'s, and copies its `+0x18` and `+0x1c` into `+0x44` and `+0x48`.

From the two points it works out a cap for the second part's shade: the slope (the y distance divided by the length >> 14, the length from the table square root `FUN_100f3590` of the coordinates >> 10) shifted down by `+0x10`, plus `+0x04`, and no more than 255 − `+0x00`.

Taking the points in order of y (the band is "swapped" when the end is above the start, which also starts the width at 1), it walks from the upper point in equal x and y steps, (lower − upper) / steps.

Each step i draws one line. Its left edge is the walk's x less half the width, in whole pixels.

Its line is the walk's y plus a sag: ((i − steps/2)² << 8) / `+0x38`, less `+0x3c` << 8, shifted left 8 more, all in 16.16 and truncated toward zero by the division.

In the first part the shade starts at `+0x00` and grows by `+0x0c` whenever that line is below the last step's; the second time it does, the first part ends there, before drawing that step. The second part starts on the same step, with the width back at `+0x34` and the shade at `+0x04` + `+0x00`; each step adds `+0x08` to it, up to `+0x00` plus the cap.

When swapped, the width grows by 1 per step in the first part until it reaches `+0x34` + 6, then drops to `+0x34`; when not swapped, the second part narrows the end: the step `steps − +0x34 − 6` sets the width to `+0x34` + 6, and each later step takes 1 off it.

A step draws with the color at `row` × 256 + shade of the table, at (left − dx, line − dy): a fill of the width (`FUN_10078510`), then a darkening (`FUN_10078460`, shift 1, mask 0x7f7f7f) of the width less 2, one pixel further left and on the walk's own line (its y, not the sagged one), less dy. Which of these a step does depends on `plain` and on being swapped: in the first part, not swapped draws both, or nothing when `plain`; swapped draws both, or only the fill when `plain`. In the second part, not swapped draws both, or only the fill when `plain`; swapped draws both, or nothing when `plain`.

### The curved band's first loop

The test at the head of the first loop, at `0x1007893c`, is reached once, with the setup done. There the flags hold the result of comparing the step count with 0, and the registers and stack slots hold the following values:

| Location | Holds |
| --- | --- |
| EAX | 0 |
| ECX, EBP | The step count |
| EBX | The upper point's y |
| EDI | The lower point's y |
| ESI | The band |
| `[esp+0x00]` to `[esp+0x0c]` | The caller's EDI, EBP, EBX, and ESI |
| `[esp+0x10]` | The step (0) |
| `[esp+0x14]` | The screen |
| `[esp+0x18]` | The swapped state: 0, or 1 until the width has grown, then 2 |
| `[esp+0x1c]` | The shade cap less `+0x00` |
| `[esp+0x20]` | The shade |
| `[esp+0x24]` | The times the line moved down |
| `[esp+0x28]` | The last line |
| `[esp+0x2c]` | The walk's x |
| `[esp+0x30]` | The walk's y |
| `[esp+0x34]`, `[esp+0x38]` | The x and y steps |
| `[esp+0x3c]` | The return address |
| `[esp+0x40]` | The width |
| `[esp+0x44]` onward | The arguments: dx, dy, row, and plain |

The routine ends at `0x10078c03`, which pops the four registers, adds 0x2c to ESP, and returns. There EAX is the step it stopped at (the step count, or 0 with no steps), EDX the step count, and ECX the x step when the second part ran at least one step, else `+0x00`.

### The band's span routines

`FUN_10078510(screen, x, y, count, color)` and `FUN_10078460(screen, x, y, count, shift, mask)` are thiscalls on the band that pop their arguments (`ret 0x14` and `ret 0x18`). Both do nothing unless y is in 0 to `+0x48` (exclusive); they stop count at the band's `+0x44`, and drop the pixels left of 0. The pixels come from the screen as in `FUN_10052de0`: they tell its cache it's in use, twice, and read the pixel base and row length through its image's virtual method `+0x0c`. `FUN_10078510` fills the pixels with color. `FUN_10078460` sets each pixel whose top byte isn't 0x33 to (pixel >> shift) & mask with a top byte of 0x33, so that a pixel is darkened once however many lines cross it.

## Blend a line toward a color

`FUN_100529e0(screen, x, y, count, color, amount)` blends a row of count pixels starting at (x, y) of a drawable toward a color; `FUN_10052ac0(screen, x, y, count, color, amount)` does the same for a column. Both pop their six arguments (`ret 0x18`) and take nothing in ECX. In a battle they're called from the code just after `FUN_100846d0` and from `FUN_10085250`, some forty times a tick, for lines of 26 to 30 pixels, on a screen without a cache (`+0x28` 0).

The drawable is the kind `FUN_10052de0` draws to: `+0x18` its width, `+0x1c` its height, and its image's virtual method `+0x0c` (`FUN_10112570`) returning the holder of the pixel base and row length. Each routine tells the drawable's cache it's in use (`FUN_1004a060`) and reads the row length first; then it does nothing when the line's fixed coordinate (y for a row, x for a column) is negative or not below the height (row) or width (column). Otherwise it stops count at that edge, drops the pixels before 0 along the line, tells the cache again, and reads the pixel base. When pixels are left, each is blended toward color by amount/256 as the span routine `FUN_1009f2c0` does below alpha 0xff: its three color channels move, and its top byte is cleared.

Exit state, with EBX, ESI, EDI, and EBP restored:

- Line off the screen: EAX the fixed coordinate; ECX the image for a row, the row length for a column; EDX as at entry (the drawable has no cache); the flags of testing the coordinate or comparing it with the edge.
- No pixels left: EAX the holder for a row, the pixel base for a column; ECX the pixel base for a row, the row length for a column; EDX the address of the first pixel; the flags of comparing the pixels dropped with the count.
- Drawn: EAX the last pixel's red and blue (its value before, & 0xff00ff); ECX the last blend's red and blue for a row, the row length × 4 for a column; EDX the address past the last pixel (one row length × 4 on for a column); the flags of adding 4 (or the row length × 4) to the address and then decrementing the count to 0.

## Move a sprung point

`FUN_1006ca60()`, a thiscall without arguments (`ret`), is the virtual method `+0x18` of a 0x7c-byte object (vtable `0x1017d934`) that we take to be a point on springs: its position x, y, z at `+0x04`, `+0x08`, `+0x0c` and its velocity at `+0x10`, `+0x14`, `+0x18`. Each call is one tick of it:

1. A countdown at `+0x78` drops by 1 while positive; when it isn't, `+0x74` drops by 64 instead, to no less than 0.
2. The z velocity gets (−24 × z) >> 8 plus 4096, is then scaled by 220/256 (multiplied, then shifted right 8), and gets `+0x70`, a push other code sets (the caller clears it before each round).
3. The x velocity, unless it is 0, gets (−x << 3) >> 8 and is scaled by 200/256; the y velocity likewise with y. A velocity that is 0 stays 0.
4. The position moves by the velocity.

All arithmetic is 32-bit with arithmetic shifts. It returns with EAX the new z, ECX the object, EDX the z velocity, and the flags of adding the z velocity to the old z.

### The loop that moves the sprung points

`FUN_10038160` calls the virtual method `+0x18` of each object in an array, the 121 sprung points in the battle we watched. Its loop head is at `0x100383c0`. There ESI is the owner, whose `+0x08` is the count and `+0x0c` the array of 0x7c-byte objects; EDI is the index and EBP the byte offset of the object (0x7c × the index). Each pass calls the method with ECX the object and EDX its vtable, then reloads EAX with the count, adds 1 to the index and 0x7c to the offset, and goes on while the index is below the count, which it rereads each pass. The loop ends at `0x100383d6` with EAX the count, EDI the index, EBP the offset, ECX and EDX as the last call left them, and the flags of comparing the index with the count.

## Set the alpha byte of a rectangle

`FUN_10052bb0(drawable, x, y, w, h, alpha)` pops its six arguments (`ret 0x18`) and takes nothing in ECX. It is the virtual method `+0x3c` of a graphics context, but doesn't use the context. It sets the top byte of every pixel of the w × h rectangle at (x, y) of the drawable to the low byte of `alpha`, and leaves the three color bytes alone. The drawable is the kind `FUN_10052de0` draws to: `+0x18` its width, `+0x1c` its height, `+0x20` its pixel format, `+0x24` its image, and `+0x28` its cache.

The menus call it on small images. In the battle view's large-screen mode ([re_screen.md](re_screen.md) "The battle view's large-screen mode") it runs on every frame the curtain is up. There the battle view clears its 240 × 320 offscreen (`bv+0x334`) through the offscreen's context (`bv+0x338`), then calls this method with (offscreen, 0, 0, its width, its height, alpha). The offscreen has no cache. We saw three of these calls:

- `FUN_1002c1a0` during a fight, returning to `0x1002c22c`, with alpha 0xff000000.
- `FUN_10027d80` during a rescue, returning to `0x10027dcd`, with 0xff000000.
- `FUN_1002b5a0` for the animation chain, returning to `0x1002b62e`, with 0.

The low byte of either alpha is 0, so every pixel's top byte becomes 0.

It first cuts the rectangle to the drawable. When x − width + w isn't negative (tested by its sign), w becomes width − x; likewise h becomes height − y. Then a negative x becomes 0, and −x becomes the left cut; a negative y becomes 0, and −y the top cut. The cut w and h come from the x and y as passed, before they're set to 0. It then tells the cache that the image is in use (`FUN_1004a060`) and reads the row length through the image's virtual method `+0x0c`. The first pixel is at row length × y + x − left cut, in pixels, with x and y as they now are.

What follows depends on the format:

- **Format 2 (32-bit pixels).** It tells the cache again and stops if the image is 0. It tells the cache a third time and reads the pixel base. It draws h − top cut rows, or none when the top cut isn't below h. Each row steps over the left cut's pixels. When the left cut is below w, the next w − left cut pixels each become (pixel & 0xffffff) | (alpha << 24). The row then steps (row length − w) × 4 bytes to the next row.
- **Format 4 (16-bit pixels).** It walks the same rows the same way, without the check for a missing image. Each pixel becomes its low 12 bits | (alpha << 12), kept to 16 bits.
- **Any other format.** It does nothing after the first call to the cache.

Every way out restores EBX, ESI, EDI, and EBP.

### The alpha fill's 32-bit loop

The loop head at `0x10052d00` is reached once with at least one row to draw; its closing jump comes back to it for each further row. At its head, the registers and stack slots hold the following values:

| Location | Holds |
| --- | --- |
| EAX | The address of the row's first pixel, less the left cut |
| EBX | w, after the cut |
| EDX | The image's vtable |
| EDI | The left cut |
| EBP | The rows left |
| ESI, `[esp+0x24]` | The step from the end of a row to the start of the next, (row length − w) × 4 |
| `[esp+0x30]` | `alpha` |

The loop ends at `0x10052d39`, the epilogue. There EBP is 0, EAX is the address after the last row's step, and the flags are those of adding the step and then decrementing the rows to 0. When the left cut is below w, ECX is 0, EDX alpha << 24, and ESI the last pixel written. Otherwise ECX is the left cut × 4, and EDX and ESI are as at the loop head.

## The fight cut-in's picture effects

When a fight starts, the fight cut-in (`bv+0x29c`) takes a picture of the whole screen into its `+0x04`, a drawable of the kind `FUN_10052de0` draws to. Its `+0x08` is a second picture of the same kind and size. Its draw, `FUN_100828a0`, draws the first picture at (0, 0) every frame ([re_screen.md](re_screen.md) "The rescue's backdrop"). Before that, it changes the picture with one of two passes. While the cut-in's `+0x10` is positive (the fight's last draws), it calls `FUN_100825b0`, draws the picture, and does nothing else. Otherwise, while its `+0x0c` is below 32 (its first 32 draws), it calls `FUN_100824a0`. In the fight we watched, those were ticks 4766–4772 and 4602–4633.

Both are thiscalls on the cut-in, without arguments (`ret`). Both first read the display's width and height: `FUN_100021f0` returns the game object (the global at `0x101b828c`), whose `+0x2c` is the display, whose virtual method `+0x14` returns its surface, with the width at `+0x18` and the height at `+0x1c`. Before each read of a picture's pixel base or row length, they tell that picture's cache that it's in use (`FUN_1004a060`). They then read the base or row length through the picture's image's virtual method `+0x0c`, as `FUN_10052de0` does. The passes cover the display's width × height at each picture's own row length, whatever the picture's size. On the Full board the display and both pictures are 420 × 378.

Each channel moves by a fixed step toward a target, red first, then green, then blue. When the channel is above the target plus the step, the step is taken off. When it's then below the target less the step, the step is added. These are signed comparisons, and the second can't undo the first. So a channel within the step of its target stays as it is. The pixel gets the three channels back with a top byte of 0, whatever its top byte was. No channel leaves 0 to 255.

The cache calls don't change any pixels. For a loaded picture they only move its node to the front of the cache's newest-first list ("The image cache"). A first prototype skipped them, and its frames came out the same. Skipping them still leaves the list in another order, though, so memory differs and the cache could later drop another image. `fast.js` therefore traps only the two loops, after the guest has made the calls.

### Gray the picture

`FUN_100824a0` moves each pixel of the picture 3 levels toward its own gray. The target of each channel is m, the sum of the pixel's three channels divided by 3 and rounded down. The engine computes m with a one-operand `imul` by 0x55555556, which gives exactly that for these sums.

The test at `0x100824f4`, after the routine has checked that the height is positive, is reached once, with the calls done. There the registers and stack slots hold the following values:

| Location | Holds |
| --- | --- |
| EAX | The row length |
| EBX | The height |
| EBP | The pixel base |
| ESI, EDI | The picture |
| `[esp+0x1c]` | The width |

The loop keeps the row length × 4 at `[esp+0x18]` and the rows left at `[esp+0x10]`. For each pixel it keeps the pixel as read at `[esp+0x14]`. It walks the rows from the top and each row from the left, and moves on by the row length after each row.

It ends at `0x10082599`, the epilogue, with the following values:

- EAX 0 and `[esp+0x10]` 0.
- ECX and `[esp+0x18]` the row length × 4.
- EBP the pixel base plus height × row length × 4.
- The flags of adding the row length × 4 to EBP and then decrementing the rows to 0.
- When the width is positive: EBX the width, EDX the last pixel's m + 3, ESI and EDI its new blue and green, and `[esp+0x14]` its value before.
- When it isn't: EBX 0, and EDX, ESI, and EDI as at `0x100824f4`.

### Fade toward the second picture

`FUN_100825b0` moves each pixel of the first picture 9 levels toward the pixel at the same place in the second picture. The target of each channel is that channel of the second picture's pixel, which is read just before the first picture's pixel is written. The routine reads, in this order, the first picture's pixel base, the second's pixel base, the first's row length, and the second's row length.

The test at `0x10082635`, after the routine has checked that the height is positive, is reached once, with the calls done. There the registers and stack slots hold the following values:

| Location | Holds |
| --- | --- |
| EAX | The second picture's row length |
| EBX | The height |
| EBP, `[esp+0x1c]` | The first picture's pixel base |
| EDI | The first picture's row length |
| ESI | The second picture |
| `[esp+0x14]` | The second picture's pixel base |
| `[esp+0x30]` | The width |

The loop keeps the following values:

- The first picture's row length × 4 at `[esp+0x28]`, and the second's at `[esp+0x2c]`.
- The rows left at `[esp+0x20]`.
- The two rows' starts at `[esp+0x1c]` and `[esp+0x14]`.
- In a row with a positive width: the distance from the first picture's row to the second's at `[esp+0x24]`, the pixels left at `[esp+0x18]`, and the second picture's pixel's blue at `[esp+0x10]`.

It ends at `0x1008272b`, the epilogue, with the following values:

- EAX 0 and `[esp+0x20]` 0.
- ECX and `[esp+0x14]` the second picture's pixel base plus height × its row length × 4.
- EDX the first picture's row length × 4.
- EBP and `[esp+0x1c]` the first picture's pixel base plus height × its row length × 4.
- The flags of adding the first picture's row length × 4 to EBP and then decrementing the rows to 0.
- When the width is positive: EBX the last pixel's new green, ESI the address just after the last row in the first picture, EDI the last second-picture pixel's blue + 9, `[esp+0x10]` that blue, `[esp+0x18]` 0, and `[esp+0x24]` the last row's distance.
- When it isn't: EBX the height, ESI the second picture, and EDI the first picture's row length.
