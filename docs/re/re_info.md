# The info menu: its sheet, its text, and its pictures

Our notes on how the engine's **info menu** (CONTEXT.md) is stored and drawn, and on the files the page's **guide** reads from the player's copy to show the same content ([ADR 0033](../adr/0033-the-guide-reads-the-info-menu-from-the-players-copy.md)). Written in our own words ([legal notes](../LEGAL.md)): it describes layouts and rules, and holds none of the game's text or pictures. Checked on one copy of the Windows standalone build, partly by reading the engine and partly by running it in `web/emu`.

## The sheet

The menu is the sheet file `data/menus/info_menu.xml` in `menus.pak`. It looks like XML but isn't well formed: some elements close with a different tag name than they open with, so it can't go through an XML parser. The engine reads it with its own tolerant reader, and so must anything else.

The file holds a `<database>` of sheet variables and several `<sheet>` blocks, each named by its first `<name>`:

- **The menu itself** has a list of `BUTTON` components. Each has a `<text>`, the text key of its label, and an `<action type="LINK">` naming the sheet it opens. Four of them open the instructions, the items, the heroes and the about page.
- **The instructions** sheet has one `RG_SCROLLING_TEXT` component with a list of `<item type="…">` elements, read top to bottom. `PLAIN_TEXT` is a heading and `SMALL_TEXT` a paragraph, in the small font; both hold a text key. `IMAGES` holds one or more image specs separated by `|`, drawn side by side. In the copy we read there are 14 items: 4 headings, 6 paragraphs and 4 pictures. Any other item type makes the engine log an error and stop reading the list.
- **The items** and **the heroes** sheets each have a `SCROLLING_CONTAINER` of `STATUS` components, one per row: a `<text>` with the text key of the row's title, and a `<description>`. The items sheet has 23 rows and the heroes sheet 10. The items list isn't the list of pickups the battles generate: it also describes creatures and pieces of the board, and it leaves some pickups out.
- A `<description>` that starts with `[` holds an image spec up to the `]`, then the text key of the row's sentence. One that starts with `$` names a sheet variable that the engine fills in.

### The heroes' rows

Every hero row's description is the variable `$<TYPE>_DESCR`, where `<TYPE>` is the hero's engine identifier, the same as its `<text>`. The sheet declares those variables with a placeholder. When the menu opens, `FUN_10045620` sets each of them, for each hero type in the engine's own order (`FUN_100941c0`, the order of `HERO_TYPES` in `web/heroes.js`), to an image spec and a text key: the portrait is frame *i* of `data/menus/gfx/heroes.gfx`, where *i* is the hero's place in that order, drawn with palette 5, and the sentence is the text key `DESC_<TYPE>`.

The engine's hero order can't be read from the game's data: `heroes.xml` and the sheet list the heroes in two other orders, and the one file in the same order, `hero_selection_cfg.xml`, is read by name. `heroes.gfx` has one more frame, after the ten portraits, which the info menu doesn't use.

## Image specs

An image spec is a path, then optionally `,` and a frame number, then optionally `:` and a palette digit, then a rectangle `(x,y;w,h)` (`FUN_100a0710`). Without a frame number the frame is 0. A frame number at or past the file's frame count draws frame 0, which two of the item rows rely on.

The rectangle doesn't crop the picture. `x` and `y` move it from the row's origin, `w` is how far the row's text starts to its right, and `h` is the row's least height. The whole frame is drawn.

Without a palette digit, the picture keeps its own colors. With one, it is drawn with that entry of the engine's table of palettes (`FUN_10043550`); only one character is read, so only digits 0 to 9 can be written:

| Digit | Palette |
| --- | --- |
| 0 to 5 | `palette_default.pal`, with `palette_color_0N.pal` laid over it, N being the digit plus 1 |
| 6 | `palette_default.pal`, with `palette_color_metal.pal` laid over it and the rest made gray |
| 7 to 9 | `palette_castle.pal`, with a color palette laid over it |

The info menu only uses digit 5, for the portraits.

## The `.gfx` image, kind 1

The info menu's pictures are all in `menus.pak` under `data/menus/gfx/`. They share the header that [re_screen.md](re_screen.md) describes, but their kind, at `+0x04`, is 1, not the curtain's 4:

| Offset | Holds |
| --- | --- |
| `+0x00` | A u32, 2. |
| `+0x04` | A u32, the kind: 1. |
| `+0x08` | A u32, the width. |
| `+0x0c` | A u32, the height. |
| `+0x10` | A u16, the frame count. |
| `+0x12` | A u16, the pixel format: 0 for 32-bit color, 1 for palette indexes. |
| `+0x14` | Values the pictures don't need. |
| `+0x24` | One u32 per frame: the frame's length in bytes. |

The frames follow the lengths, back to back, in order. A frame is its rows from the top. A row is a list of runs, and it ends once its runs reach the width. A run is a u32 count of transparent bytes to skip, then a u32 count of bytes of pixels, then those pixels, 4 bytes each. Both counts are in bytes, so a pixel is 4 of them. In every file we read, each frame's runs end exactly at its length.

A pixel is a little-endian u32. With format 0 it is a color: alpha in the top byte, then red, green and blue. The alpha isn't premultiplied. With format 1, the low 12 bits are an index into the palette the image is drawn with, and the top byte is the alpha. Only the portraits use format 1.

## Palette files

The palettes are in `base.pak` under `data/base/`: `palette_default.pal`, `palette_castle.pal`, `palette_color_01.pal` to `palette_color_06.pal` and `palette_color_metal.pal`. A palette file is three u32 values, the entry count, 2 (for 32-bit entries) and a first slot, followed by the entries, colors laid out as in a format 0 pixel (`FUN_100543a0`).

To lay a palette over another (`FUN_10043400`), the engine copies the top palette's entries into the bottom one from the bottom palette's first slot on, and stops at the end of either. The top palette's own first slot is ignored. In the copy we read, the default palette has 404 entries and its first slot is 389, and each color palette has 15 entries, so a color palette replaces the last 15 entries of the default one.

## Text

The text is in `base.pak` under `data/base/lang/`, one file per language, `<name>.lng`. Each line is a text key, a space, and the text, and lines end with CR LF. In the copy we read there are eight languages, each file with the same 1,465 keys.

A file that starts with the bytes EF BB BF is UTF-8, one that starts with FF FE is UTF-16 little-endian, and any other is read one byte per character (`FUN_1010ee40`). The 8-bit files decode cleanly as Windows-1252, which we take them to be.

A key missing from the language's file shows the engine's placeholder text for a missing string. The sheet's resolver checks for the key first and shows the key itself if it's missing (`FUN_100f8280`).

### Escapes and key names

When the instructions sheet is built (`FUN_10051170`), every text item that doesn't start with `$` goes through these steps, in order:

1. Its text is looked up.
2. Each two-character sequence of a backslash and `n` becomes a line break.
3. If the text holds `<`, the six key tokens `<P>`, `<S>`, `<L>`, `<R>`, `<U>` and `<D>` become the names of the keys bound to Primary, Secondary, Left, Right, Up and Down (`FUN_100a0bd0`).

A key token takes the first entry of its action's list in `settings.cfg` ([re_settings.md](re_settings.md)), whatever its device: lists 7 to 12 in file order for the six tokens. For a keyboard entry, the name is the text key `KEY_NAME_` followed by the entry's key ID in decimal (`FUN_100017c0`); every language's file has the names of IDs 0 to 113. Another device's entry, an empty list, or an ID past 113 shows the engine's placeholder text. In the copy we read, only `<P>` occurs, in the instruction paragraphs.

Elsewhere, a single backslash also becomes a line break when scrolling text is drawn. No info menu text holds one. In the sheet, `|` and `~` are layout: `|` separates the pictures of an `IMAGES` item, and in a `STATUS` description that doesn't start with `[`, `|` and `~` split the text into a table. The info menu has no such description.

## The language

The engine takes a language code from `init` (`FUN_1010b650`), as an exact, case-sensitive match:

| Code | Language ID | File name |
| --- | --- | --- |
| `en` | 126 | `english` |
| `fr` | 142 | `french` |
| `it` | 208 | `italian` |
| `de` | 157 | `german` |
| `es` | 409 | `spanish` |
| `ru` | 363 | `russian` |
| `zh-cn` | 84 | `chinese-simplified` |
| `zh-tw`, `zh` | 83 | `chinese-traditional` |
| `fi` | 139 | `finnish` |
| `se` | 417 | `swedish` |

Any other code gives the ID −1. The ID becomes a file name through a switch over hundreds of language names (`FUN_1010b8b0`), and the file is opened from `data/base/lang/`. The copy we read has no `finnish` or `swedish` file.

Then `settings.cfg` wins: the engine reads it after `init` and replaces the language ID with the i32 at offset 15 of the file, the last of its four numbers ([re_settings.md](re_settings.md)). Choosing a language in the game's settings writes that ID there. So a player whose saved game has a `settings.cfg` sees its language, whatever code the page passed.

There is no fallback to English. A language ID whose file is missing leaves the engine with no text at all, and it shows placeholders. With the ID −1 and no `settings.cfg`, the first lookup of a text never returns, and the emulator hangs.

## What the guide does with this

- It reads the same sheet, text and pictures from the player's copy, in the browser, and keeps them in memory only.
- It takes the language from `settings.cfg` as the engine does, or from the code the page passes when there is no such file. Where that language has no file, it uses English, which the engine doesn't do.
- It ignores the rectangles, which only place the pictures inside the phone's screen, and shows each picture at its own pixels: whole in the instructions, and in the heroes' and items' lists cut to the box of its visible pixels, so that it can sit centred on its plate. The items' frames are 30 × 38 with each icon drawn against the bottom edge, up to 22 pixels below the top; the heroes' portraits sit near the middle of theirs.
- Where the engine would show its placeholder for a key name, the guide uses the name of key ID 5, Enter, which the engine always keeps on Primary.
- If the sheet, a text, a picture or a palette is missing or isn't in the form described here, the page has no guide.
