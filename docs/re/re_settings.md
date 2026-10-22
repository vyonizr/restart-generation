# The settings file and custom keys

This note describes how the engine keeps a player's settings, and in particular the keys chosen on its **Custom Keys** screen (see Custom keys in the [glossary](../../CONTEXT.md)). The page reads the keys from this file to show them under the game screen and to make the touch pad press the right keys. Addresses are in the Windows engine, `ResetGeneration-Win32-Web.dll`.

## Where it lives and when it is written

The file is `settings.cfg` in the engine's home folder. The page sets that folder to `C:\RG`, so the file sits next to the `.pak` files in the emulator's file system. The engine reads it once at start (`FUN_10004900`). If the file is missing, or its last four bytes are not the end marker described in [Layout](#layout), every setting returns to its default (`FUN_10004010`).

The engine writes the whole file again when the player leaves the configuration screen they entered. From the main menu, that is **Settings**: backing out of **Custom Keys** to **Settings** writes nothing, and backing out of **Settings** to the main menu writes the file. In a battle, **Custom Keys** is in the battle menu itself, so backing out of it writes the file. Choosing a key alone doesn't write anything. This was checked in the emulator with `game.dirtyFiles()`. The writer is `FUN_10004be0`. The Mac build calls its own writer from the destructor of the configuration screen's state.

## Layout

The file is little-endian throughout and holds the following fields:

| Offset | Size | Holds |
| --- | --- | --- |
| 0 | 3 × u8 | Three on/off flags. The first is believed to be sound on or off. |
| 3 | 4 × i32 | Four numbers. Two are believed to be the sound and music volumes, from 0 to 11. The last is the language. |
| 19 | u32 | The key block's marker: `KEYS` read as a little-endian number, so the bytes on disk spell `SYEK`. |
| 23 | Variable | 13 key lists, one per action, in the order of the following table. |
| end − 4 | u32 | End marker `0x600dc0de`. |

Each key list is a u32 count, followed by that many u32 entries. In each entry, the high 16 bits are the input device and the low 16 bits are the engine's key ID. The keyboard is device 1, both in the standalone build's own file and in every file the emulator wrote. No file we've seen names another device. The reader (`FUN_10004900`, with `FUN_10003b40` per list) empties each action before filling it. A cut-off file ends without the end marker, so it gets the defaults, not a partial set of keys.

The following table lists the 13 key lists in file order:

| List | Action | Shown on Custom Keys as |
| --- | --- | --- |
| 1 | Menu select | (follows Primary) |
| 2 | Menu back | (follows Secondary) |
| 3 | Menu left | (follows Left) |
| 4 | Menu right | (follows Right) |
| 5 | Menu up | (follows Up) |
| 6 | Menu down | (follows Down) |
| 7 | Primary | Primary |
| 8 | Secondary | Secondary |
| 9 | Left | Left |
| 10 | Right | Right |
| 11 | Up | Up |
| 12 | Down | Down |
| 13 | Chat | Chat |

The action numbers the engine uses internally are 4, 5, 2, 3, 0, 1, 0x4e, 0x4f, 0x4c, 0x4d, 0x4a, 0x4b, and 0x52 (`FUN_10003990` turns the screen's names into the last seven).

## What a rebind does

The player picks a row on **Custom Keys**, then presses a key. The screen takes only the arrows, Enter, Space, Ctrl, Shift, the digits, and the letters. Any other key shows a prompt that the key is reserved, and the screen waits for another key (`FUN_10051c20`). Pressing the key that's already bound cancels.

Once a key is accepted, the action's list is emptied and the new key goes first:

- **Up, Down, Left, and Right** become that one key, and so does the matching menu action. The arrow keys stop working for that direction until the player binds them again.
- **Primary** becomes the key, then Enter and keypad Enter. Menu select gets the same list. So Enter always selects, whatever key the player chose.
- **Secondary** becomes the key, then Esc and Backspace. Menu back gets the same list. So Esc always goes back, and in a battle it opens the menu.
- **Chat** becomes the key alone. It has no menu twin.

The first key in a list is therefore the one the player chose. **Default Keys** puts back the defaults listed in [Defaults](#defaults).

These were checked in the emulator. After Primary was rebound to Z, Ctrl no longer selected in menus or in the battle menu, and a real Enter (Java key code 10) still did. After Up was rebound to W, the Up arrow no longer moved in menus and W did.

## Defaults

`FUN_10003cc0` sets the following defaults, and the standalone build ships them in its own file:

| Action | Keys, in order |
| --- | --- |
| Primary and menu select | Ctrl, Enter, keypad Enter |
| Secondary and menu back | Shift, Esc, Backspace |
| Up, Down, Left, Right, and their menu twins | The arrow keys |
| Chat | E |

With no `settings.cfg`, the engine writes its defaults when it next writes the file. The `deinit` export does that, and it was checked in the emulator. The first 19 bytes are then flags 1, 1, and 0, followed by the numbers 4, 4, 4, and a language value that depends on the language the page passes to `init`: 126 for `en`, 139 for `fi`, and 157 for `de`. With the default keys, the whole file is 163 bytes.

## Key IDs

`FUN_100012c0` turns a Java key code and key location into an engine key ID, and `FUN_10001e70` turns it back. These are the IDs a written file can hold for the keyboard:

| Key ID | Key | Java key code |
| --- | --- | --- |
| 1, 2, 3, 4 | Up, Down, Left, Right arrow | 38, 40, 37, 39 |
| 5 | Enter | 10 |
| 6 | Space | 32 |
| 8 | Backspace | 8 |
| 9, 10 | Ctrl (left, right) | 17 |
| 11, 12 | Shift (left, right) | 16 |
| 21 | Esc | 27 |
| 22-31 | 0-9 | 48-57 |
| 32-57 | A-Z | 65-90 |
| 82 | Keypad Enter | 10, at key location 4 |

The Java Native Interface (JNI) key entry folds the right-hand location into the left one before the lookup, so a right Ctrl or Shift arrives as the left one. The engine also has IDs for keys the **Custom Keys** screen refuses, such as F1-F12 (102-113), Tab (7), and Alt (13, 14). A written file never binds them.
