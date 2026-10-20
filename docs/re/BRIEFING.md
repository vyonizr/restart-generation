# Reset Generation native-protocol RE briefing

Goal: revive online play of Reset Generation (RedLynx, 2008 web/standalone build of the N-Gage 2.0 game) by
writing a replacement server. The Java SNAP Mobile gateway layer is DONE and working (see
docs/protocol.md and server/gateway.js). What remains is the
protocol spoken by the native engine DLL, which travels as opaque byte payloads inside SNAP game packets.

## Facts established so far
- Native engine: ResetGeneration-Win32-Web.dll in the standalone build's ResetGeneration folder
  (x86, MSVC 7.1, image base 0x10000000, no RTTI, no symbols except JNI exports).
- Full Ghidra decompile (all functions incl. vtable-only ones): SCRATCH\rg_decomp2.c (9 MB). Each function starts with a
  line `// ==== <name> @ <addr>`. Function index (name addr linecount): SCRATCH\funcs.txt (from the first, smaller decompile).
- Strings with file offsets(=VA-0x10000000 for .rdata roughly; use pe.js for exact): SCRATCH\dll_strings.txt
- PE helper: `node SCRATCH\pe.js <dll> dwords <hexva> <count>` | `str <hexva>` | `bytes <hexva> <count>` (dump vtables/strings).
- dumpbin disassembly: SCRATCH\disasm.txt (`  1010A760: mov ...` lines).
- Decompile specific addresses (creates missing functions): in PowerShell
  `$env:JAVA_HOME="SCRATCH\tools\jdk\jdk-21.0.12.1+1"; & "SCRATCH\tools\ghidra\ghidra_12.1.4_PUBLIC\support\analyzeHeadless.bat" "SCRATCH\ghproj" rg -process ResetGeneration-Win32-Web.dll -noanalysis -scriptPath "SCRATCH\ghscripts" -postScript DecompileAt.java "SCRATCH\<out>.c" 10109930 1010b240`
  (only one Ghidra process can open the project at a time; if it is locked, wait and retry).
- SCRATCH = the analysis output folder (see README.md in this folder).
- Decompiled Java (for reference): SCRATCH\src_main (rg.*), SCRATCH\src_sm2 (SNAP client).

### Java <-> native glue
- Java `NativeSNAPMobileInterface` methods are called from native through a bridge object (global DAT_101b8730,
  ctor FUN_1010a420, method IDs set in FUN_10109b70: +0x44 init, +0x48 login, +0x4c logout, +0x50 moveToRoom,
  +0x54 createRoom, +0x58 leaveRoom, +0x5c joinRoom, +0x60 send "(I)I", +0x64 isLoggedIn, ...).
- Send primitive: FUN_10109930(this=bridge+0x14, buf, len) copies into the shared direct ByteBuffer (2048 bytes, MTU 876)
  and calls Java send(len). Java turns that into SNAP command 133 (sendGamePacketToGameServer).
- Receive: Java calls native onDataReceived(len, roomName) (1010a760) after putting the bytes in the same buffer;
  it posts event flag 3? to the dispatcher object DAT_101b8734 (vtable 1018b55c, ctor FUN_1010a710) via FUN_101107d0.
  onConnected posts 0x10000, onArenaLoginCompleted 0x200, onArenaLoginCancelled 0x100000, onArenaLogoutCompleted 0x400,
  onDisconnectedFromGameRoom 0x40000, onDisconnectedFromNAF 0x100000.
- Bridge vtables: 1018b4d8, 1018b4b8, 1018b468 (slot3 = send), 1018b45c; dispatcher 1018b55c; 1018b508.
- FUN_10003760 builds an address with "naf://%s:%u/%s" (host "rg.com"?, service "CasinoSystem") and registers it.
- FUN_10116eb0 registers message-type names: 1 MT_PING, 2 MT_PONG, 3 MT_GAMESERVER, 4 MT_GAMEROOM, 5 MT_USER,
  6 MT_HOSTMIGRATION, 7 MT_SERVICE_DISCOVERY, 8 MT_STATS_AUTH.
- FUN_10047fc0 builds something with key/value "roomname"="CasinoSystem" (FUN_10103xxx helpers).
- Casino strings (CASINOSYSTEM_LOGIN, CASINO_ENTER, CASINO_MATCHMAKING, CASINO_MATCHED_UP, SEAT_RESERVE, SEAT_TAKE,
  GET_RANKINGS, REGISTER_FRIENDS, FRIENDLY_CASINO_*, "type=", "; action=", REQUEST/RESPONSE/EVENT ...) are referenced by
  FUN_100994e0 (40 refs), FUN_1009bbc0, FUN_1009bdb0, FUN_1009a800, FUN_100c7320, FUN_100d8aa0, FUN_100da810.

### Observed at runtime against our server
After SNAP login the client joins game room "CasinoSystem" (it never creates it; server must provide it), gets
onConnected, shows "Connecting...", and then sends NOTHING (no command 133). So it is probably waiting for the server
to send something first (e.g. MT_SERVICE_DISCOVERY, a PING, or a casino message) - this is the top question.

## Rules
- Read-only analysis: do not modify the game files.
- Ground every claim in a function address. Separate what you observed in code from what you infer.
- Report byte-exact layouts (offsets, sizes, endianness, string encoding/length prefixes) where you can.
