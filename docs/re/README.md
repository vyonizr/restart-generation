# Reverse-engineering notes

These notes record how the game's native engine talks to the server. The server in `server/` and the [protocol description](../protocol.md) are built from them. Addresses are virtual addresses in the Windows `ResetGeneration-Win32-Web.dll` file (image base `0x10000000`) unless a note marks them as Mac addresses.

The repository doesn't include the analysis output the notes were written from: the decompiled C and Java, the disassembly, the extracted Mac binary, and the Ghidra projects. That output is derived from RedLynx's copyrighted code, so it isn't published. If you own the game, you can rebuild it from the standalone `.zip`. See [Regenerate the analysis](#regenerate-the-analysis).

These notes are ours, written in our own words ([legal notes](../LEGAL.md)). They name functions and addresses so that someone with their own copy can find what a note is about, and they describe byte layouts and behavior because a server has to match them. They must not hold pasted pseudocode, listings, game text or data, and nothing here may be translated line by line into code: write what the original does here first, then implement from the note. The scripts in `tools/re/` and `tools/rgtrace/` only run on a copy of the game that you own. If a rights holder asks, these notes and scripts are the first thing to remove ([architecture decision record (ADR) 0018](../adr/0018-publishing-with-legal-guardrails.md)).

## Notes

The following table lists the notes and what each covers:

| File | Covers |
| --- | --- |
| [`BRIEFING.md`](BRIEFING.md) | Starting point: the Java and native interface, message types, and the first open question. |
| [`re_transport.md`](re_transport.md) | The native transport over SNAP: layer stack, wire format, serialization primitives, routing, and timeouts. |
| [`re_casino.md`](re_casino.md) | CasinoSystem: message kinds and actions, byte layouts, the login reply, and the client state machine. |
| [`re_match.md`](re_match.md) | Match start, the join handshake, and in-match traffic. |
| [`re_friends.md`](re_friends.md) | The native friend list, casino friend messages, friendly rooms, and messages that crash the client. |
| [`re_rules.md`](re_rules.md) | ServerBattleLogic rules: turn structure, phase time limits, game end, and results. |
| [`re_witness.md`](re_witness.md) | Following a relayed battle with the engine's own battle logic: building it outside the menus, its three patches, feeding it messages, and reading defeats and ranks. |
| [`re_replay.md`](re_replay.md) | The engine's replay player: player mode, the replay text it reads, playback and seeking, the original player's controls, and the snapshot field a relayed battle must fix to replay as played. |
| [`re_settings.md`](re_settings.md) | The settings file: its layout, the custom keys it holds, and what a rebind does. |
| [`re_quit.md`](re_quit.md) | How the engine reports Quit through `tick`, and what the Java client did then. |
| [`re_render.md`](re_render.md) | The engine's hottest drawing and update routines in a battle: the run-length sprite blitters, their data format and span routines; the scene object draw, its image cache and the run-length image; the curved band; the line blends; the sprung points; the tile grid edge pass; and the loop states `web/emu/fast.js` reproduces. |
| [`re_screen.md`](re_screen.md) | The screen size: where it lives, who reads it, and changing it while the engine runs; the battle view's large-screen mode with its curtain and fades; the battle UI states a host can read; and the `.gfx` image container. |

### Names used in the notes

The notes were written against a scratch folder. Read their paths as follows:

- `SCRATCH\` and "scratchpad" are the `analysis/` folder that the steps in [Regenerate the analysis](#regenerate-the-analysis) create.
- `SCRATCH\pe.js` is `tools/re/pe.js`, and `SCRATCH\ghscripts\` and `ghscripts\` are `tools/re/ghidra/`. `SCRATCH\tools\` is your own JDK and Ghidra installation (step 1).
- `tr\` is `analysis/tr/`, the Mac build's output. The scripts the notes run from `tr\` (`macho.js`, `xref.js`, `fn.sh`, `mfn.sh`) are in `tools/re/`.
- A few one-off helpers the notes mention weren't kept: `casino\fn.sh`, `callers.sh`, `dis.sh`, `find.js`, `mk.js`, `fr_hex.js`, and `funcs.txt`.

## Regenerate the analysis

The steps write everything into `analysis/` at the repository root, which `.gitignore` excludes. They use Git Bash on Windows; on other systems, use `analyzeHeadless` instead of `analyzeHeadless.bat` and skip the `dumpbin` step.

You need:

- `ResetGeneration-Standalone.zip`.
- Node.js 18 or later.
- Java Development Kit (JDK) 21, for Ghidra and cfr.
- [Ghidra](https://github.com/NationalSecurityAgency/ghidra/releases) 12.1.4.
- [cfr](https://github.com/leibnitz27/cfr/releases) 0.152, to decompile the Java client.
- Optional: Visual Studio's `dumpbin`, for `disasm.txt`.

1. Set the tool paths and unpack the game:

   ```sh
   export JAVA_HOME=/path/to/jdk-21
   GH=/path/to/ghidra_12.1.4_PUBLIC/support/analyzeHeadless.bat
   CFR=/path/to/cfr-0.152.jar
   mkdir -p analysis && unzip -q /path/to/ResetGeneration-Standalone.zip -d analysis
   G=analysis/ResetGeneration-Standalone; D=$G/ResetGeneration
   ```

2. Decompile the Java client (`rg.*`) and the SNAP Mobile library:

   ```sh
   "$JAVA_HOME/bin/java" -jar "$CFR" $G/ResetGeneration.jar --outputdir analysis/src_main --extraclasspath $G/lib/rg-signed.jar
   "$JAVA_HOME/bin/java" -jar "$CFR" $G/lib/rg-signed.jar --outputdir analysis/src_sm2 --renamedupmembers true
   ```

3. Import and analyze the engine, then decompile every function. `VtableFunctions.java` first creates the functions that are reachable only through vtables, which Ghidra's analysis misses. This takes several minutes. Ghidra refuses a project path that has a folder starting with a dot, such as `.cache`; on Windows, `analyzeHeadless.bat` then waits for a keypress.

   ```sh
   mkdir -p analysis/ghproj
   "$GH" analysis/ghproj rg -import $D/ResetGeneration-Win32-Web.dll
   "$GH" analysis/ghproj rg -process ResetGeneration-Win32-Web.dll -scriptPath tools/re/ghidra \
     -preScript VtableFunctions.java -postScript DecompileAll.java analysis/rg_decomp2.c
   ```

4. List the engine's strings, and optionally disassemble it:

   ```sh
   node tools/re/strings.js $D/ResetGeneration-Win32-Web.dll > analysis/dll_strings.txt
   dumpbin //disasm:nobytes $D/ResetGeneration-Win32-Web.dll > analysis/disasm.txt
   ```

5. Decompile the Mac build. Unlike the Windows build, it has C++ type information, so its vtables give class names to functions. `ren.js` writes `mac_named.c`, the decompile with those names.

   ```sh
   mkdir -p analysis/tr/ghmac
   node tools/re/fat.js $D/libResetGenerationMacApplet.dylib analysis/tr/rgmac_i386.dylib
   "$GH" analysis/tr/ghmac mac -import analysis/tr/rgmac_i386.dylib -scriptPath tools/re/ghidra \
     -postScript DecompileAll.java analysis/tr/mac_decomp.c
   node tools/re/macho.js analysis/tr/rgmac_i386.dylib rtti > analysis/tr/rtti_all.txt
   (cd analysis/tr && node ../../tools/re/mkmap.js && node ../../tools/re/ren.js)
   ```

6. Optional: unpack a data archive, for example the menus:

   ```sh
   node tools/re/pakx.js $D/menus.pak analysis/pak/menus
   ```

## Lookup tools

Run the following lookup tools from the repository root:

| Command | Purpose |
| --- | --- |
| `tools/re/fn.sh ADDRESS...` | Prints Windows functions from `analysis/rg_decomp2.c`, such as `fn.sh 10109930`. |
| `tools/re/mfn.sh NAME_OR_ADDRESS...` | Prints Mac functions from `analysis/tr/mac_named.c`. |
| `node tools/re/pe.js DLL dwords VA COUNT` | Dumps dwords at a virtual address, such as a vtable. `str VA` and `bytes VA COUNT` print a string or raw bytes. |
| `node tools/re/xref.js DLL VA...` | Finds the addresses that hold a pointer to each virtual address. |
| `node tools/re/findref.js FILE HEX_DWORD` | Prints the file offset of each little-endian occurrence of a dword in a file. |
| `node tools/re/macho.js DYLIB segs\|dwords\|xref\|rtti` | Reads the Mac binary's segments, data, references, and type information. |
| `node tools/re/sym.js DYLIB` | Prints the Mac binary's symbol table. |
| `tools/rgtrace/rgtrace.c` | Source for a debugger of the running Java client; build it as its header describes. With an address argument, the debugger prints that function's callers. |

Replace the following:

- `ADDRESS`: a Windows function address in hexadecimal, without `0x`.
- `NAME_OR_ADDRESS`: a Mac function name or address.
- `DLL`: the path to `ResetGeneration-Win32-Web.dll`.
- `VA`: a virtual address in hexadecimal.
- `COUNT`: the number of dwords or bytes to print.
- `FILE`: the file to search.
- `HEX_DWORD`: the dword to find, in hexadecimal.
- `DYLIB`: the path to the Mac binary, such as `analysis/tr/rgmac_i386.dylib`.

To decompile addresses Ghidra didn't recognize as functions, run `DecompileAt.java` against the project:

```sh
"$GH" analysis/ghproj rg -process ResetGeneration-Win32-Web.dll -noanalysis -scriptPath tools/re/ghidra \
  -postScript DecompileAt.java analysis/out.c 10109930 1010b240
```

Only one Ghidra process can open a project at a time.
