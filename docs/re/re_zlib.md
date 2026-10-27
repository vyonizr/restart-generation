# The zlib code that unpacks pictures

The engine links a copy of zlib, the public compression library (zlib License), and it unpacks pictures with it. These notes cover the two zlib routines the emulator runs as fast paths (`shared/emu/fast.js`), what each leaves behind, and why they matter for the frame rate. Everything here was observed by running the engine in the emulator, with the reference replay of a 4-player battle on Classic, unless it is marked static.

## When the engine unpacks

A battle's animations (the intro, the phase and turn banners, special skills, item messages, the fight cut-in and the rescue; see [`re_screen.md`](re_screen.md)) load their pictures in their first frame. Those pictures aren't kept between animations, so every animation loads them again. The frame that does it ran 8.6 to 17 million guest instructions, against 0.17 million in a quiet frame of the same battle. That was 50 to 160 ms on a desktop, and every animation start in the battle paid it, not only the first.

The reader asks a stream (`FUN_1005aa90`, called from `0x10108df2`) for 16 KB at a time and inflates each piece into the picture; one picture read this way was 307,200 bytes. Of the instructions in such a frame, the inflate's fast loop (`FUN_100a4910`) ran 38 to 55% and the Adler-32 checksum (`FUN_100a2930`) 8 to 18%. This was measured on the first frames of a turn's animation, a fight, a rescue and the cannon phase's banner.

## The checksum, `FUN_100a2930`

A cdecl function of three arguments (the running checksum, a buffer and its length) that returns the updated Adler-32 checksum in EAX. Its low half (`a`) is the sum of the bytes plus 1 and its high half (`b`) the sum of every value `a` took, both modulo 65521.

It splits the running checksum into `a` in ECX and `b` in EDI and walks the buffer in ESI. A length of 1, a length under 16 and a null buffer each take a short path of their own. Otherwise it takes blocks of 5552 bytes (`0x15b0`), the most it can add before `b` could pass 32 bits. Each block is 347 turns (`0x15b`, counted down in EAX) of a loop that adds 16 bytes, with EBX the length left; after each block it reduces `a` and `b` by dividing. The bytes left after the last block go through the same 16-byte loop, which counts its turns down in EAX and takes 16 off EBX each turn, and then one byte at a time. Each loop leaves EAX 0 and EDX the last byte it read.

The trap at the block loop's head (`0x100a29f0`) adds the block's bytes and goes on at the division after the loop (`0x100a2a79`). That code writes EAX and then clears EDX with an XOR, which sets every flag, so the loop's own flags never show. The trap at the 16-byte loop's head (`0x100a2ab1`) goes on at the test of EBX after it (`0x100a2b3d`), which sets the flags in the same way.

## The inflate fast loop, `FUN_100a4910`

zlib's fast decoding loop: a cdecl function of two arguments, the stream and the number of output bytes free when the inflate call began (`start`). The inflate routine calls it while at least 6 input bytes and 258 output places are left. It decodes length and distance codes with the tables the inflate routine built and copies matches from the output or from the sliding window.

The stream's fields it reads and writes: the next input byte at `+0x00`, the input bytes left at `+0x04`, the next output place at `+0x0c`, the output places left at `+0x10`, the error message at `+0x18`, and the inflate state at `+0x1c`. In the state: the mode at `+0x00`, the window's size at `+0x28`, the bytes it holds at `+0x2c`, its write position at `+0x30` and its start at `+0x34`, the bit buffer at `+0x38` and its bit count at `+0x3c`, the length and distance tables at `+0x4c` and `+0x50`, and their index widths at `+0x54` and `+0x58`.

The prologue keeps those values in a 0x3c-byte frame, with four registers saved below it. Its loop keeps the input pointer in EDX, the output pointer in ESI, the bit buffer in EDI, the bit count in EBX and the state in EBP. Both pointers point at the byte before the next one. Relative to ESP in the loop, the frame holds the last safe input byte at `+0x30`, the last safe output place at `+0x34`, the output's start (where the call began writing) at `+0x44`, the window's size, hold and write position at `+0x28`, `+0x48` and `+0x1c`, its start at `+0x2c`, the two tables at `+0x20` and `+0x24`, and the two index masks at `+0x38` and `+0x3c`. The match length doesn't live in the frame: the loop keeps it in `start`'s argument slot at `+0x54`, which belongs to the caller's stack. That slot is left holding the last value the loop gave it:

- A literal reached through a second table lookup leaves 1.
- A length code leaves the length, with its extra bits added.
- A copy from the window takes off what it copied from there.
- A copy from the output, three bytes a turn while more than two are left, takes off 3 each turn.

Each turn the loop tops the bit buffer up to at least 15 bits, two input bytes at a time, and looks up a length code. A literal is written at once. A length is followed by a distance code, and its bytes come from the output already written when the distance reaches no further back than where this call began writing. Otherwise they come from the window, wrapping round its end, and then from the output. The loop stops once the input pointer reaches its last safe byte or the output its last safe place. It also stops at an end-of-block code, which sets the mode to 11. A bad length or distance code, or a distance further back than the window holds, sets the stream's message (`0x1017ca00`, `0x1017c9e8` and `0x1017c9c8`) and the mode to 27.

At the epilogue (`0x100a4d28`) the routine gives back the input bytes whose bits are still in the buffer. It writes the stream's pointers and counts, and the state's bit buffer and bit count. Then it restores the saved registers and returns. It leaves EAX the output places left, ECX the stream, EDX the input pointer, and the flags of the add that frees the frame.

The trap at the loop's head (`0x100a49a2`) does the whole loop and goes on at the epilogue with the five loop registers and the length slot set as the loop would leave them. The frame's other slots are dead once the routine returns.
