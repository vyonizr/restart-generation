# Hot loops: the run-length sprites, their span routines and the tile grid edges

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
