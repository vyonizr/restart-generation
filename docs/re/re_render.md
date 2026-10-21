# Hot loops: sprites, scene objects, the curved band, line blends, sprung points and the tile grid edges

Our notes on the engine routines that took the largest share of a battle's emulated instructions, written in our own words (docs/LEGAL.md). `web/emu/fast.js` replaces their hot loops with JavaScript built from this note. Offsets are from the object in ECX ("this") unless stated. Stack slots are given as `[esp+n]` at the instruction named, after the routine's own pushes.

## The sprite object

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

`FUN_100a0430(mode)` stores the mode and picks the span routine from it, the surface format and whether the sprite has a palette. On a 32-bit surface: mode 0 copies (`0x1009f710` with a palette; without one, `FUN_1009f2c0` and the `+0x64` byte set, so the second segment is a plain copy); mode 1 blends at the object's alpha (`FUN_1009f830` with a palette, `FUN_1009f2c0` without); mode 2 blends at each pixel's alpha (`FUN_1009f8c0` with a palette, `FUN_1009f340` without); mode 3 adds (`0x1009f750` / `0x1009f540`); mode 4 is `FUN_1009f600`. In an Arcade battle we saw only `FUN_1009f8c0` at alpha 0xff and `FUN_1009f340` at alpha 0xff and 192, with the `+0x64` byte clear.

## The run data

A frame is its rows one after another. A row is a list of runs; the row ends once the runs' pixel counts add up to at least the width. Each run is:

1. a dword: how many bytes of screen to step over (transparent pixels);
2. a dword n1, then n1 bytes of pixels: the first segment;
3. a dword n2, then n2 bytes of pixels: the second segment.

Lengths are in bytes; the blitters turn them into pixels by shifting right by the bytes-per-pixel shift (2 for 32-bit). Both blitters walk the data with an index counted in 16-bit units, so every byte length is halved before it is added, and the frame table's byte offset is halved to start. Pixels are ARGB for a direct-color sprite. For an indexed one the low 12 bits are the palette index and the top byte is that pixel's alpha. Since only the second segment may be copied straight, it presumably holds the opaque pixels and the first the semi-transparent edge.

## FUN_100a1880: draw a frame that fits

`FUN_100a1880(dst, shift, pitch, x, y, frame)`, a thiscall that pops its six arguments (`ret 0x18`). `dst` is the surface's pixel base, `shift` the bytes-per-pixel shift, `pitch` the surface's row length in pixels, `(x, y)` the frame's top-left corner and `frame` the animation frame. `FUN_100a02c0` calls it for each sprite it draws.

It first gets the run data base through the virtual method at `+0x0c`. Unless the frame is wholly inside the clip (x ≥ left, x + width < right, y ≥ top, y + height ≤ bottom), it passes the same six arguments to the virtual method at `+0x60`, which is `FUN_100a1a40`, and returns.

Otherwise it keeps a byte offset into the surface, starting at (pitch × y + x) << shift. For each run it adds the step to the offset, calls the span routine for the first segment (`span(dst + offset, its pixels, n1 pixels, alpha)`, with ECX the sprite), adds n1 to the offset, then either copies the second segment's n2 bytes to `dst + offset` (when `+0x64` is set) or calls the span routine for it the same way, and adds n2. At the end of each row the offset moves on by (pitch − width) << shift.

### Its row loop, `0x100a1900`

This is the loop head, reached once the clip test passed and height is positive. Registers: EBX the data index (16-bit units), EDI the surface offset, EBP the sprite, EDX the data base, ECX the shift argument, ESI the height. Stack: `[esp+0x10]` the data base, `[esp+0x14]` the surface offset saved after a run's first segment, `[esp+0x1c]` dst, `[esp+0x20]` shift, `[esp+0x24]` pitch, `[esp+0x28]` the row number, `[esp+0x2c]` the last segment length (the first segment's pixel count, then the second segment's byte count), `[esp+0x30]` the pixels done in the current row, which is cleared at the start of each row.

The loop ends at `0x100a1a04`, the epilogue, with EAX the row number (now the height), ECX the shift argument, EDX the data base (unchanged when the width isn't positive), ESI the height, EBX and EDI where the data and surface ended, and the flags of comparing the row number with the height.

## FUN_100a1a40: draw a frame against the clip

Same arguments and stack cleanup. It does nothing if the frame lies wholly above the clip (y < top − height) or at or below it (y ≥ bottom). Rows above the top are skipped: it walks their runs to advance the data index without drawing, and advances the surface offset by those rows up front. The number of rows to draw is the height, or the rows down to the bottom when the frame crosses it, less the rows skipped. (When a frame crosses both the top and the bottom, the bottom count is taken before the skipped rows are removed, so it draws that many rows past the bottom. We keep that.)

Each segment is cut to the clip horizontally: where it starts left of the left edge, its first pixels up to the edge (at most the whole segment) are skipped in both the data and the surface; where it ends past the right edge, its count stops at the edge (never below 0). The span routine gets the remaining count, which can be 0. The copy of a second segment uses the same cut. A segment whose byte length isn't positive is stepped over without a call.

### The skipping loop, `0x100a1ae0`

Walks one skipped row per pass. Registers: EBX the data index, EDI the data base, EBP the shift argument, ESI the row's pixel count so far. Stack: `[esp+0x1c]` the rows left to skip, `[esp+0x2c]` the width. It ends at `0x100a1b30` with `[esp+0x1c]` 0, ECX the width, ESI the last row's pixel count (0 when the width isn't positive), EDX reloaded from `[esp+0x38]` (the y argument) when the width is positive, and the flags of decrementing `[esp+0x1c]` to 0, whose carry is from the last comparison of the row's pixel count with the width, or from testing the width.

### The drawing loop, `0x100a1b70`

One row per pass. Registers: EAX the surface offset, EBX the data index, ESI the sprite, EDI the data base, EBP the shift argument. Stack: `[esp+0x10]` the sprite, `[esp+0x14]` the data base, `[esp+0x18]` the pixels cut from the left of the last second segment, `[esp+0x1c]` the last segment length (the first segment's pixels, then the second's bytes), `[esp+0x20]` the rows left, `[esp+0x28]` dst, `[esp+0x2c]` the surface offset as last stored (after a run's first segment, plus its second segment's left cut), `[esp+0x30]` pitch, `[esp+0x34]` the x argument, `[esp+0x38]` the pixels done in the row, `[esp+0x3c]` the last segment's pixel count.

It ends at `0x100a1d7a` with `[esp+0x20]` 0, ECX 0, EDX the end-of-row step (pitch − width) << shift, ESI the sprite and EDI the data base, and the flags of adding that step to the offset and then decrementing the row count to 0.

## The span routines

Each is `span(dst, src, count, alpha)` with ECX the sprite, popping its four arguments (`ret 0x10`). Each writes `count` pixels at `dst` from the pixels at `src`, and does nothing when `count` isn't positive.

- `FUN_1009f2c0`: at alpha 0xff, copies the pixels. Below it, blends each pixel's three color channels toward the source by alpha/256 and clears the top byte.
- `FUN_1009f340`: at alpha 0xff, blends toward the source by the source pixel's own alpha. Below, by (source alpha + 1) × alpha / 256. Either way, a blend amount of exactly 0x40 or 0x80 takes a shortcut that adds shifted copies of both pixels, which can differ from the general formula in the low bits.
- `FUN_1009f8c0`: the source is a palette index and alpha. At alpha 0xff, it blends toward the palette color like `FUN_1009f340` at 0xff, shortcuts included. Below, it blends toward the palette color by (source alpha × alpha) / 256, with no shortcuts and the top byte cleared, like `FUN_1009f2c0`.

The other span routines `FUN_100a0430` can pick aren't reimplemented; the JavaScript blitters call them in the guest.

## FUN_100846d0: the edges of a tile grid

`FUN_100846d0(grid)`, a thiscall that pops its one argument (`ret 4`). The object's `+0x14` describes the grid: its `+0x08` is the number of columns and `+0x0c` the number of rows. The argument's `+0x04` points at the cells, row by row, 12 bytes each: a value, then a 4-bit mask and a packed word that this routine fills. `FUN_10086120` stamps a shape's values into the cells and then calls it.

For every cell whose value isn't 0, it looks at the four neighbors: above, below, right and left, in that order. A neighbor outside the grid, or holding a different value, is an edge. The mask gets bit 0 for an edge above, bit 1 below, bit 2 right and bit 3 left. The packed word holds one byte per side, from the top byte down in the same order: the cell's value where that side is an edge, 0 where it isn't (built by shifting left 8 and or-ing in each side's full value, so a value above 0xff spills into the higher bytes). Cells holding 0 are left alone.

### Its row loop, `0x100846f1`

Reached once the row count is positive. Registers: EAX the grid description, EBP the row, ESI 0, ECX the object. Stack: `[esp+0x14]` the object, `[esp+0x18]` the row, `[esp+0x30]` the argument. Each cell clears `[esp+0x10]` (the mask), `[esp+0x1c]` (the value below), `[esp+0x20]` (the value right) and `[esp+0x28]` (always 0, the "no edge" value for the left side) first, and a nonzero cell leaves its column + 1 in `[esp+0x24]`.

It ends at `0x100848a8` with EBP and `[esp+0x18]` the row count, EAX the grid description, ECX the object, EDX the row count, ESI 0, and the flags of comparing the row with the row count. When the column count is positive, EDI is the column count and EBX the byte offset of the last cell (12 × its index); otherwise EDI is 0 and EBX unchanged.

## FUN_10052de0: draw one scene object

`FUN_10052de0(obj, pos, look, frame)`, a thiscall on the scene renderer that pops its four arguments (`ret 0x10`). The battle's per-frame draw (`FUN_1007a580` and the routines under it) calls it a few hundred times a tick, once for each object it puts on the screen. `obj` is a drawable: its `+0x24` is its image and its `+0x28` the cache that keeps the image loaded. `pos` points at the x and y to draw at, `look`'s `+0x08` is the level (alpha) the draw is made at, and `frame` is the animation frame.

The renderer's `+0x04` is the screen, another drawable whose image's `+0x04` holds the pixel base (`+0x00`) and the row length in pixels (`+0x04`). The renderer's `+0x0c` is the table a run-length image adds through (copied into the image at each draw), and its `+0x18`, `+0x1c`, `+0x20`, `+0x24` are the clip rectangle: right (exclusive), left, top, bottom (exclusive).

Nothing happens when `obj` is 0. Otherwise it tells `obj`'s cache that the image is in use (`FUN_1004a060`, below), twice, and stops if `obj` has no image. It then tells the screen's cache the same thing three times, stopping after the first if the screen has no image, and reads the pixel base and row length through the screen image's virtual method `+0x0c` (`FUN_10112570`, which returns the image's `+0x04`). Last it calls the virtual method `+0x50` of `obj`'s image with (renderer, pixel base, pointer to a pair, x, y, level, frame), ECX the image. The pair is two dwords in the routine's own locals: the row length, then the screen's `+0x1c`.

Every way out restores EBX, ESI, EDI and EBP, leaves EAX, ECX and EDX as the last call left them (as at entry when `obj` is 0), and leaves the flags of the epilogue's `add esp, 8`, made when ESP is 8 below its value at entry.

In a battle the image's `+0x50` was `FUN_1009e940` (the run-length image below) for all but a few percent of the calls; the rest were `FUN_100a02c0` (the sprite of the first sections) and `FUN_1009d640`.

### The image cache: FUN_1004a060 and FUN_10053800

`FUN_1004a060(obj)` (ECX `obj`, no stack arguments) does nothing when `obj`'s `+0x28` is 0. Otherwise it calls that cache's virtual method `+0x0c` with (`obj`, 0), which in a battle is always `FUN_10053800` (the cache's vtable is `0x1017bd8c`).

`FUN_10053800(obj, lock)`, a thiscall on the cache popping two arguments. A nonzero low byte of `lock` brackets the work with the virtual methods `+0x04` and `+0x08` of the cache's `+0x1c`. When `obj`'s image (`+0x24`) is 0 or its byte `+0x2c` is set, it loads the image first, making room in the cache's budget (`FUN_10053450`). The common case is neither: the image is loaded and the routine only marks it as most recently used.

The cache keeps a list of nodes from newest (the cache's `+0x14`) to oldest (`+0x10`). A node's `+0x00` points at the next older node and `+0x04` at the next newer one, 0 at either end. `obj`'s node is its `+0x44` (`FUN_100533a0` returns it). Unless the node is 0 or already the newest, the routine unlinks it (pointing its neighbours at each other, and making its newer neighbour the oldest when it was the oldest), then puts it in front: its newer link becomes 0, its older link the old newest node, whose newer link becomes the node, and the cache's `+0x14` becomes the node.

## The run-length image

A second kind of image, with the vtable `0x10182a88`. Its frames are palette-indexed runs. Offsets are from the image.

| Offset | Holds |
| --- | --- |
| `+0x04` | A holder whose `+0x00` is the base of the run data. The virtual method `+0x0c` (`FUN_1009d8b0`, a jump to `FUN_10112570`) returns the holder. |
| `+0x0c` | The table mode 3 adds through: one row of 256 bytes per level, indexed by each color channel (`FUN_1009da10`). Set from the renderer's `+0x0c` before each draw. |
| `+0x14` | The size: its `+0x18` is the width, `+0x1c` the height and `+0x20` a pixel format, which must be 2 (32-bit) for the image to be drawn. |
| `+0x20` | The draw mode: 0 fills, 1 blends at the level, 2 blends at each color's own alpha, 3 adds; any other draws nothing. |
| `+0x2d` | A byte: when set the image is drawn mirrored, by other routines (`FUN_1009e760`). Never set in a battle we watched. |
| `+0x2e` | A byte: when set, every frame uses the colors of the palette object at `+0x48` (its `+0x08`, or none when `+0x48` is 0), read through the virtual method `+0x3c` (`FUN_1004a790`). When clear, the frame's own palette is entry `frame` of the table at `+0x54`. |
| `+0x30`, `+0x34`, `+0x38`, `+0x3c` | The clip: bottom (exclusive), top, left, right (exclusive). |
| `+0x40` | The frame count, returned by the virtual method `+0x1c` (`FUN_100b7f40`). |
| `+0x44` | A table with one dword per frame: where its run data starts, in bytes from the base. |
| `+0x64` | The level, 0 to 255. Mode 1 blends by its low byte; mode 2 at exactly 0xff rescales each color's alpha a to (a + 1) × 255 / 256. |
| `+0x70` | When nonzero, the draw is sent to the virtual method `+0x58` instead. Never set in a battle we watched. |

A frame's rows follow each other. A row is a list of runs that ends once their lengths reach the width. A run is one 16-bit code when its top nibble isn't 0: the nibble is the length and the low 12 bits the color index. When the top nibble is 0, the code is the length and the next code is the color index. An index with bit 15 set is drawn with the palette color at its low 15 bits; any other run is transparent and only advances the screen position.

### FUN_1009e940: draw a frame of the image

`FUN_1009e940(renderer, dst, pair, x, y, level, frame)`, a thiscall that pops its seven arguments (`ret 0x1c`): the virtual method `+0x50` that `FUN_10052de0` calls. When `+0x70` is set it passes everything on to `+0x58` and returns. A frame that is negative, or not below the frame count, becomes frame 0 (the count is only asked for when the frame isn't negative). It copies the renderer's clip into the image's clip and stores the level at `+0x64`.

For an image that isn't mirrored it then gives up, drawing nothing, when x is at or right of the clip's right edge, when x + width is left of the left edge, when y is at or below the bottom edge, when y + height is above the top edge, or when the pixel format isn't 2, in that order. Each of these returns with EAX the x argument, and with ECX and EDX: the width and the left edge; x + width and the left edge; y and the left edge; y and the top edge; y and the format less 2. Otherwise it copies the renderer's `+0x0c` to the image's `+0x0c` and draws with `FUN_1009e550(dst, 2, row length, x, y, frame)`, the row length being the pair's first dword, and returns with what that left in EAX, ECX and EDX. The comparisons are signed.

### FUN_1009e550: draw a frame that fits

`FUN_1009e550(dst, shift, pitch, x, y, frame)`, a thiscall popping six arguments (`ret 0x18`). When the frame isn't wholly inside the clip (x below left, x above right − width, y below top or y above bottom − height), it passes the same arguments to `FUN_1009de90` and returns with what that left in EAX, ECX and EDX.

Otherwise it starts at the frame's run data (the table's byte offset, halved, as an index in 16-bit codes) and at the screen offset (pitch × y + x) << shift, and picks the frame's palette (EDX holds the palette when it comes from the table, the image's vtable when it comes from the palette object). With a height that isn't positive it returns there, with EAX the pitch, ECX the shift and EDX as just said. Else it draws each row's runs, each opaque one in the draw mode, and after each row moves the screen offset on by (pitch − width) << shift. It returns with EAX that row step, ECX 0 and EDX the last run's length << shift (EDX as above when the width isn't positive).

Its row loop, `0x1009e600`, has the registers EBX the data index, EBP the screen offset, ESI the image, and the stack `[esp+0x10]` the width, `[esp+0x14]` the rows left, `[esp+0x18]` the data base, `[esp+0x1c]` the row step, `[esp+0x24]` dst, `[esp+0x28]` the shift, `[esp+0x2c]` the pixels done in the row, `[esp+0x30]` the last code read, `[esp+0x34]` the data index after the last run, and `[esp+0x38]` the palette. It ends at `0x1009e719` with the rows left 0, EAX the row step, ECX 0, EDX as above, EBX the data index, EBP the screen offset, and the flags of adding the row step to the offset and then decrementing the row count to 0.

### FUN_1009de90: draw a frame against the clip

Same arguments and cleanup. It works out how many rows to draw (the height, or the rows down to the bottom edge if fewer), how many rows at the top to step over without drawing (those above the top edge, or 0), how many pixels to cut at the left of each row (those left of the left edge, or 0) and where to stop on the right (the width, or the pixels up to the right edge if fewer). It reads the run data and palette as `FUN_1009e550` does and starts at the screen offset (pitch × y + x) << shift. With no rows to draw it returns there, with EAX the pitch, ECX the shift and EDX that offset.

Otherwise it walks every run of every row it draws, as `FUN_1009e550` does, but draws an opaque run only in rows past the stepped-over ones, and only its pixels between the left cut and the right stop. Mode 2 here blends at each color's alpha without the rescaling at level 0xff. It returns with EAX the row step, ECX the number of rows drawn and EDX the screen offset after the last row.

Its row loop, `0x1009df68`, keeps everything on the stack: `[esp+0x10]` the width, `[esp+0x14]` the row, `[esp+0x18]` the palette, `[esp+0x1c]` the data base, `[esp+0x20]` the left cut, `[esp+0x24]` the right stop, `[esp+0x28]` the rows stepped over, `[esp+0x2c]` the rows to draw, `[esp+0x30]` the row step, `[esp+0x38]` dst, `[esp+0x3c]` the shift, `[esp+0x40]` the pixels done in the row, `[esp+0x44]` the screen offset, `[esp+0x48]` the data index and `[esp+0x4c]` the last run's length. It ends at `0x1009e0a9` with EAX the row step, ECX the row (now the rows to draw), EDX the screen offset, EBX the last run's length, EBP the rows to draw, EDI the pixels done in the last row, and the flags of comparing the row with the rows to draw.

## FUN_10078810: a curved band between two points

`FUN_10078810(source, dx, dy, row, plain)`, a thiscall that pops five arguments (`ret 0x14`), on an object we call the band. It draws a band of `+0x34` pixels' width along a curve from one point to another in `+0x30` steps, one short horizontal line per step, with colors from a table and a darker edge. In the battle we watched, the benchmark's window reached it only in its last ~650 ticks, and only with sound pulled as the page pulls it: twice a tick, once with `plain` set and once without, each time with 640 steps.

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

It returns at once unless the game object's mode (the global at `0x101b828c`, its `+0x2c`, its `+0x04`) is 2. It gets the screen from `source`'s virtual method `+0x10` (`FUN_10112570`, the source's `+0x04`), a drawable like `FUN_10052de0`'s, and copies its `+0x18` and `+0x1c` into `+0x44` and `+0x48`. From the two points it works out a cap for the second part's shade: the slope (the y distance divided by the length >> 14, the length from the table square root `FUN_100f3590` of the coordinates >> 10) shifted down by `+0x10`, plus `+0x04`, and no more than 255 − `+0x00`. Taking the points in order of y (the band is "swapped" when the end is above the start, which also starts the width at 1), it walks from the upper point in equal x and y steps, (lower − upper) / steps.

Each step i draws one line. Its left edge is the walk's x less half the width, in whole pixels. Its line is the walk's y plus a sag: ((i − steps/2)² << 8) / `+0x38`, less `+0x3c` << 8, shifted left 8 more, all in 16.16 and truncated toward zero by the division. In the first part the shade starts at `+0x00` and grows by `+0x0c` whenever that line is below the last step's; the second time it does, the first part ends there, before drawing that step. The second part starts on the same step, with the width back at `+0x34` and the shade at `+0x04` + `+0x00`; each step adds `+0x08` to it, up to `+0x00` plus the cap. When swapped, the width grows by 1 per step in the first part until it reaches `+0x34` + 6, then drops to `+0x34`; when not swapped, the second part narrows the end: the step `steps − +0x34 − 6` sets the width to `+0x34` + 6, and each later step takes 1 off it.

A step draws with the color at `row` × 256 + shade of the table, at (left − dx, line − dy): a fill of the width (`FUN_10078510`), then a darkening (`FUN_10078460`, shift 1, mask 0x7f7f7f) of the width less 2, one pixel further left and on the walk's own line (its y, not the sagged one), less dy. Which of these a step does depends on `plain` and on being swapped: in the first part, not swapped draws both, or nothing when `plain`; swapped draws both, or only the fill when `plain`. In the second part, not swapped draws both, or only the fill when `plain`; swapped draws both, or nothing when `plain`.

### Its first loop, `0x1007893c`

The test at the loop head, reached once with the setup done. Registers: EAX 0, ECX and EBP the step count, EBX the upper point's y, EDI the lower point's y, ESI the band, and the flags of comparing the step count with 0. Stack: `[esp+0x00]` to `[esp+0x0c]` the caller's EDI, EBP, EBX and ESI, `[esp+0x10]` the step (0), `[esp+0x14]` the screen, `[esp+0x18]` the swapped state (0, or 1 until the width has grown, then 2), `[esp+0x1c]` the shade cap less `+0x00`, `[esp+0x20]` the shade, `[esp+0x24]` the times the line moved down, `[esp+0x28]` the last line, `[esp+0x2c]` the walk's x, `[esp+0x30]` its y, `[esp+0x34]` and `[esp+0x38]` the x and y steps, `[esp+0x3c]` the return address, `[esp+0x40]` the width, then the arguments from `[esp+0x44]` (dx, dy, row, plain).

The routine ends at `0x10078c03`, which pops the four registers, adds 0x2c to ESP and returns. There EAX is the step it stopped at (the step count, or 0 with no steps) and EDX the step count, and ECX the x step when the second part ran at least one step, else `+0x00`.

### The spans: FUN_10078510 and FUN_10078460

`FUN_10078510(screen, x, y, count, color)` and `FUN_10078460(screen, x, y, count, shift, mask)` are thiscalls on the band that pop their arguments (`ret 0x14` and `ret 0x18`). Both do nothing unless y is in 0 to `+0x48` (exclusive); they stop count at the band's `+0x44`, and drop the pixels left of 0. The pixels come from the screen as in `FUN_10052de0`: they tell its cache it's in use, twice, and read the pixel base and row length through its image's virtual method `+0x0c`. `FUN_10078510` fills the pixels with color. `FUN_10078460` sets each pixel whose top byte isn't 0x33 to (pixel >> shift) & mask with a top byte of 0x33, so that a pixel is darkened once however many lines cross it.

## FUN_100529e0 and FUN_10052ac0: blend a line toward a color

`FUN_100529e0(screen, x, y, count, color, amount)` blends a row of count pixels starting at (x, y) of a drawable toward a color; `FUN_10052ac0(screen, x, y, count, color, amount)` does the same for a column. Both pop their six arguments (`ret 0x18`) and take nothing in ECX. In a battle they're called from the code just after `FUN_100846d0` and from `FUN_10085250`, some forty times a tick, for lines of 26 to 30 pixels, on a screen without a cache (`+0x28` 0).

The drawable is the kind `FUN_10052de0` draws to: `+0x18` its width, `+0x1c` its height, and its image's virtual method `+0x0c` (`FUN_10112570`) returning the holder of the pixel base and row length. Each routine tells the drawable's cache it's in use (`FUN_1004a060`) and reads the row length first; then it does nothing when the line's fixed coordinate (y for a row, x for a column) is negative or not below the height (row) or width (column). Otherwise it stops count at that edge, drops the pixels before 0 along the line, tells the cache again and reads the pixel base. When pixels are left, each is blended toward color by amount/256 as the span routine `FUN_1009f2c0` does below alpha 0xff: its three color channels move, its top byte is cleared.

Exit state, with EBX, ESI, EDI and EBP restored:

- Line off the screen: EAX the fixed coordinate; ECX the image for a row, the row length for a column; EDX as at entry (the drawable has no cache); the flags of testing the coordinate or comparing it with the edge.
- No pixels left: EAX the holder for a row, the pixel base for a column; ECX the pixel base for a row, the row length for a column; EDX the address of the first pixel; the flags of comparing the pixels dropped with the count.
- Drawn: EAX the last pixel's red and blue (its value before, & 0xff00ff); ECX the last blend's red and blue for a row, the row length × 4 for a column; EDX the address past the last pixel (one row length × 4 on for a column); the flags of adding 4 (or the row length × 4) to the address and then decrementing the count to 0.

## FUN_1006ca60: move a sprung point

`FUN_1006ca60()`, a thiscall without arguments (`ret`), is the virtual method `+0x18` of a 0x7c-byte object (vtable `0x1017d934`) that we take to be a point on springs: its position x, y, z at `+0x04`, `+0x08`, `+0x0c` and its velocity at `+0x10`, `+0x14`, `+0x18`. Each call is one tick of it:

1. A countdown at `+0x78` drops by 1 while positive; when it isn't, `+0x74` drops by 64 instead, to no less than 0.
2. The z velocity gets (−24 × z) >> 8 plus 4096, is then scaled by 220/256 (multiplied, then shifted right 8), and gets `+0x70`, a push other code sets (the caller clears it before each round).
3. The x velocity, unless it is 0, gets (−x << 3) >> 8 and is scaled by 200/256; the y velocity likewise with y. A velocity that is 0 stays 0.
4. The position moves by the velocity.

All arithmetic is 32-bit with arithmetic shifts. It returns with EAX the new z, ECX the object, EDX the z velocity, and the flags of adding the z velocity to the old z.

### The loop that calls it, `0x100383c0`

`FUN_10038160` calls the virtual method `+0x18` of each object in an array, the 121 sprung points in the battle we watched. At the loop head ESI is the owner, whose `+0x08` is the count and `+0x0c` the array of 0x7c-byte objects; EDI is the index and EBP the byte offset of the object (0x7c × the index). Each pass calls the method with ECX the object and EDX its vtable, then reloads EAX with the count, adds 1 to the index and 0x7c to the offset, and goes on while the index is below the count, which it rereads each pass. The loop ends at `0x100383d6` with EAX the count, EDI the index, EBP the offset, ECX and EDX as the last call left them, and the flags of comparing the index with the count.
