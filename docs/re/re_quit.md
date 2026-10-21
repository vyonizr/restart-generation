# How the engine ends: Quit

Our notes on how the Windows engine tells its host that the player quit, and what its host did next. Written in our own words (docs/LEGAL.md).

## The engine's side

- The engine never ends the process itself. The main menu's Quit, once the player confirms it in its yes/no dialog, is handled by the startup menu's event handler (`FUN_1008fa80`). That handler tells the engine's owning state object to stop; it doesn't call ExitProcess or TerminateProcess. The DLL imports those two only for the C runtime's own exit and fatal-error paths.
- The stop is reported through the return value of the `NativeGameEngine.tick` export (`0x10002c00`): nonzero while the game runs, 0 once it has ended. Ghidra types the export as void, so we confirmed this by running it rather than reading it.
- Observed in the emulator: after the confirming key press, `tick` keeps returning nonzero for six calls while the menu buttons animate away, leaving the title art. From then on it returns 0 on every call, and keys don't bring it back. A tick that returns 0 still runs briefly but no longer redraws the screen. Opening the dialog with Esc or by choosing the Quit item ends the same way.
- The battle menu's Exit and its yes/no dialog only leave the battle: `tick` stays nonzero and the game goes back to the menus. The Arena menu's exit also goes back to the main menu.
- Quitting writes no files. The `NativeGameEngine.deinit` export runs cleanly afterwards and rewrites `settings.cfg` and `achievements.dat`, with the same bytes they already had.

## What the Java client did

The Java client called `tick` once per frame and kept looping while it returned true. When it returned false, the client shut down in order: it logged out of SNAP and released the SNAP native side, stopped sound, called the engine's `deinit`, and released graphics. Then the standalone build exited the process, and the applet build navigated its frame to the page named by its `returnurl` parameter.

## What the browser client does

On the first 0 it stops ticking, saves (waiting for a member's upload to the server), signs out of Arena if still signed in, and reloads the page. It doesn't call `deinit`, since a reload frees the emulator and `deinit` changes no files.
