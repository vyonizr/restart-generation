# Reverse-engineering notes

These notes record how the game's native engine talks to the server. The server in `server/` and the protocol description in `docs/protocol.md` are built from them. Addresses are virtual addresses in the Windows `ResetGeneration-Win32-Web.dll` (image base `0x10000000`) unless a note marks them **Mac**.

The repository doesn't include the analysis output the notes were written from: the decompiled C and Java, the disassembly, the extracted Mac binary and the Ghidra projects. That output is derived from RedLynx's copyrighted code, so it isn't published. If you own the game, you can rebuild it from the standalone `.zip`. See [Regenerate the analysis](#regenerate-the-analysis).

These notes are ours, written in our own words (docs/LEGAL.md). They name functions and addresses so that someone with their own copy can find what a note is about, and they describe byte layouts and behaviour because a server has to match them. They must not hold pasted pseudocode, listings, game text or data, and nothing here may be translated line by line into code: write what the original does here first, then implement from the note. The scripts in `tools/re/` and `tools/rgtrace/` only run on a copy of the game that you own. If a rights holder asks, these notes and scripts are the first thing to remove (ADR 0018).

## Notes

| File | Covers |
| --- | --- |
| `BRIEFING.md` | Starting point: the Java-to-native glue, message types, and the first open question. |
| `re_transport.md` | The native transport over SNAP: layer stack, wire format, serialization primitives, routing and timeouts. |
| `re_casino.md` | CasinoSystem: message kinds and actions, byte layouts, the login reply, and the client state machine. |
| `re_match.md` | Match start, the join handshake, and in-match traffic. |
| `re_friends.md` | The native friend list, casino friend messages, friendly arenas, and messages that crash the client. |
| `re_rules.md` | ServerBattleLogic rules: turn structure, turn timer, game end and results. |
| `re_settings.md` | The settings file: its layout, the custom keys it holds, and what a rebind does. |
| `re_quit.md` | How the engine reports Quit through `tick`, and what the Java client did then. |
| `re_render.md` | The run-length sprite blitters, their data format and span routines, the tile grid edge pass, and the loop states `web/emu/fast.js` reproduces. |

### Names used in the notes

The notes were written against a scratch folder. Read their paths as follows:

- `SCRATCH\` and "scratchpad" are the `analysis/` folder that the steps below create.
- `tr\` is `analysis/tr/`, the Mac build's output. The scripts the notes run from `tr\` (`macho.js`, `xref.js`, `fn.sh`) are in `tools/re/`.
- `ghscripts\` is `tools/re/ghidra/`.
- A few one-off helpers the notes mention weren't kept: `casino\fn.sh`, `callers.sh`, `dis.sh`, `find.js`, `mk.js`, `fr_hex.js`, and `funcs.txt`.

## Regenerate the analysis

The steps write everything into `analysis/` at the repository root, which `.gitignore` excludes. They use Git Bash on Windows; on other systems, use `analyzeHeadless` instead of `analyzeHeadless.bat` and skip the `dumpbin` step.

You need:

- `ResetGeneration-Standalone.zip`.
- Node.js 18 or later.
- JDK 21, for Ghidra and cfr.
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

3. Import and analyze the engine DLL, then decompile every function. `VtableFunctions.java` first creates the functions that are reachable only through vtables, which Ghidra's analysis misses. This takes several minutes. Ghidra refuses a project path that has a folder starting with a dot, such as `.cache`; on Windows, `analyzeHeadless.bat` then waits for a keypress.

   ```sh
   mkdir -p analysis/ghproj
   "$GH" analysis/ghproj rg -import $D/ResetGeneration-Win32-Web.dll
   "$GH" analysis/ghproj rg -process ResetGeneration-Win32-Web.dll -scriptPath tools/re/ghidra \
     -preScript VtableFunctions.java -postScript DecompileAll.java analysis/rg_decomp2.c
   ```

4. List the DLL's strings, and optionally disassemble it:

   ```sh
   node tools/re/strings.js $D/ResetGeneration-Win32-Web.dll > analysis/dll_strings.txt
   dumpbin //disasm:nobytes $D/ResetGeneration-Win32-Web.dll > analysis/disasm.txt
   ```

5. Decompile the Mac build. Unlike the Windows DLL, it has C++ type information, so its vtables give class names to functions. `ren.js` writes `mac_named.c`, the decompile with those names.

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

Run these from the repository root.

| Command | Does |
| --- | --- |
| `tools/re/fn.sh <addr>...` | Prints Windows functions from `analysis/rg_decomp2.c`, such as `fn.sh 10109930`. |
| `tools/re/mfn.sh <name-or-addr>...` | Prints Mac functions from `analysis/tr/mac_named.c`. |
| `node tools/re/pe.js <dll> dwords <va> <n>` | Dumps dwords at a virtual address, such as a vtable. `str <va>` and `bytes <va> <n>` print a string or raw bytes. |
| `node tools/re/xref.js <dll> <va>...` | Finds the addresses that hold a pointer to each virtual address. |
| `node tools/re/findref.js <file> <hexdword>` | Finds a dword by file offset. |
| `node tools/re/macho.js <dylib> segs\|dwords\|xref\|rtti` | Reads the Mac binary's segments, data, references and type information. |
| `node tools/re/sym.js <dylib>` | Prints the Mac binary's symbol table. |
| `tools/rgtrace/rgtrace.c` | Debugger for the running Java client; see its header. With an address argument, it prints that function's callers. |

To decompile addresses Ghidra didn't recognize as functions, run `DecompileAt.java` against the project:

```sh
"$GH" analysis/ghproj rg -process ResetGeneration-Win32-Web.dll -noanalysis -scriptPath tools/re/ghidra \
  -postScript DecompileAt.java analysis/out.c 10109930 1010b240
```

Only one Ghidra process can open a project at a time.
