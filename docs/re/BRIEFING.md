# Reset Generation native-protocol reverse-engineering briefing

This briefing records the starting state of the reverse-engineering (RE) analysis. [re_transport.md](re_transport.md)
§3 answers its open question: the client waits for the server to send the first packet.

Goal: revive online play of Reset Generation (RedLynx, 2008 web and standalone build of the N-Gage 2.0 game) by
writing a replacement server. At the start, the Java SNAP Mobile gateway layer was complete and working (see the
[protocol description](../protocol.md) and `server/gateway.js`). What remained was the protocol spoken by the engine,
which travels as opaque byte payloads inside SNAP game packets.

## Starting facts

- Engine: `ResetGeneration-Win32-Web.dll` in the standalone build's `ResetGeneration` folder (x86, Microsoft Visual
  C++ (MSVC) 7.1, image base `0x10000000`, no run-time type information (RTTI), no symbols except Java Native
  Interface (JNI) exports).
- Full Ghidra decompile (all functions, including vtable-only ones): `SCRATCH\rg_decomp2.c` (9&nbsp;MB). Each function
  starts with a line `// ==== <name> @ <addr>`. Function index (name, address, line count): `SCRATCH\funcs.txt`, from
  the first, smaller decompile; it wasn't kept.
- Strings with file offsets: `SCRATCH\dll_strings.txt`. For `.rdata`, an offset is roughly the virtual address (VA)
  minus `0x10000000`; use `pe.js` for exact offsets.
- Portable Executable (PE) helper: `node SCRATCH\pe.js <dll> dwords <hexva> <count>`, `str <hexva>`, or
  `bytes <hexva> <count>` (dumps vtables and strings).
- dumpbin disassembly: `SCRATCH\disasm.txt` (lines like `  1010A760: mov ...`).
- To decompile specific addresses, which also creates missing functions, run the following in PowerShell:

  ```powershell
  $env:JAVA_HOME = "SCRATCH\tools\jdk\jdk-21.0.12.1+1"
  & "SCRATCH\tools\ghidra\ghidra_12.1.4_PUBLIC\support\analyzeHeadless.bat" "SCRATCH\ghproj" rg `
    -process ResetGeneration-Win32-Web.dll -noanalysis -scriptPath "SCRATCH\ghscripts" `
    -postScript DecompileAt.java "SCRATCH\OUTPUT.c" 10109930 1010b240
  ```

  Replace `OUTPUT` with a name for the output file. Only one Ghidra process can open the project at a time; if it is
  locked, wait and retry.
- `SCRATCH` is the analysis output folder (see [Names used in the notes](README.md#names-used-in-the-notes)).
- Decompiled Java (for reference): `SCRATCH\src_main` (`rg.*`), `SCRATCH\src_sm2` (SNAP client).

### Java and native interface

- Java `NativeSNAPMobileInterface` methods are called from native code through a bridge object (global
  `DAT_101b8730`, ctor `FUN_1010a420`, method IDs set in `FUN_10109b70`: `+0x44` init, `+0x48` login, `+0x4c` logout,
  `+0x50` moveToRoom, `+0x54` createRoom, `+0x58` leaveRoom, `+0x5c` joinRoom, `+0x60` send `(I)I`, `+0x64`
  isLoggedIn, and others).
- Send primitive: `FUN_10109930(this=bridge+0x14, buf, len)` copies into the shared direct ByteBuffer (2,048 bytes,
  maximum transmission unit (MTU) 876) and calls Java `send(len)`. Java turns that into SNAP command 133
  (sendGamePacketToGameServer).
- Receive: Java calls native `onDataReceived(len, roomName)` (`1010a760`) after putting the bytes in the same buffer.
  It posts event flag 3 (unconfirmed) to the dispatcher object `DAT_101b8734` (vtable `1018b55c`, ctor
  `FUN_1010a710`) through `FUN_101107d0`. `onConnected` posts 0x10000, `onArenaLoginCompleted` 0x200,
  `onArenaLoginCancelled` 0x100000, `onArenaLogoutCompleted` 0x400, `onDisconnectedFromGameRoom` 0x40000, and
  `onDisconnectedFromNAF` 0x100000.
- Bridge vtables: `1018b4d8`, `1018b4b8`, `1018b468` (slot 3 = send), `1018b45c`; dispatcher `1018b55c`; `1018b508`.
- `FUN_10003760` builds an address with `naf://%s:%u/%s` (host `rg.com`, unconfirmed; service `CasinoSystem`) and
  registers it.
- `FUN_10116eb0` registers message-type names: 1 `MT_PING`, 2 `MT_PONG`, 3 `MT_GAMESERVER`, 4 `MT_GAMEROOM`,
  5 `MT_USER`, 6 `MT_HOSTMIGRATION`, 7 `MT_SERVICE_DISCOVERY`, 8 `MT_STATS_AUTH`.
- `FUN_10047fc0` builds something with the key and value `roomname` = `CasinoSystem` (`FUN_10103xxx` helpers).
- Casino strings (`CASINOSYSTEM_LOGIN`, `CASINO_ENTER`, `CASINO_MATCHMAKING`, `CASINO_MATCHED_UP`, `SEAT_RESERVE`,
  `SEAT_TAKE`, `GET_RANKINGS`, `REGISTER_FRIENDS`, `FRIENDLY_CASINO_*`, `type=`, `; action=`, `REQUEST`, `RESPONSE`,
  `EVENT`, and others) are referenced by `FUN_100994e0` (40 references), `FUN_1009bbc0`, `FUN_1009bdb0`,
  `FUN_1009a800`, `FUN_100c7320`, `FUN_100d8aa0`, and `FUN_100da810`.

### Observed at runtime against our server

After SNAP login, the client joins the game room `CasinoSystem` (it never creates it; the server must provide it),
gets `onConnected`, shows its connecting dialog, and then sends nothing (no command 133). So it was probably waiting
for the server to send something first (for example `MT_SERVICE_DISCOVERY`, a PING, or a casino message). This was
the top question. Answered: see [re_transport.md](re_transport.md) §3.

## Rules

- Read-only analysis: don't modify the game files.
- Ground every claim in a function address. Separate what you observed in code from what you infer.
- Report byte-exact layouts (offsets, sizes, endianness, string encoding and length prefixes) where you can.
