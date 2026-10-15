# Run the original engine in an x86 emulator

Browsers don't run Java applets, and the game's engine is a native 32-bit Windows DLL, so the original client can't run in a browser. The engine needs little of Windows: it imports only KERNEL32 and the WINMM function `timeGetTime`, and all its input, graphics and sound go through JNI to the Java client. So the browser client runs the unchanged engine in a JavaScript x86 interpreter (`web/emu`), with stand-ins for those Windows functions and a fake JNI environment. A basic-block compiler, `web/emu/jit.js`, translates the engine's code to JavaScript, which runs about six times faster than the interpreter (220 million against 30 million instructions per second in Node).

## Considered options

- **Port or rewrite the engine.** Rejected because no source or symbols exist, the decompiled engine is about 9 MB of C, and a port would drift from the original game.
- **Run the Java client in a Java runtime for the browser, such as CheerpJ.** Rejected because the game logic is in the native engine, which such a runtime can't load through JNI.
- **Use an existing emulator.** Unicorn has no build for npm, and v86 emulates a whole PC that needs an operating system image.

## Consequences

- The compiler must behave exactly like the interpreter. `web/tools/difftest.mjs` runs both in lockstep and compares their state; run it after any change to `cpu.js`, `fpu.js` or `jit.js`.
- x87 floating point uses 64-bit doubles, which matches the 53-bit precision that MSVC sets. Nothing compares it with real hardware.
- Only the Windows build runs. The Mac build is a different binary.
- Heavy menu transitions can drop frames.
