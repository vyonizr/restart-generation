# Reset Generation native transport (mt::connectivity over NAF/SNAP)

All addresses are in `ResetGeneration-Win32-Web.dll` (image base 0x10000000) unless marked "Mac". Class names come
from the RTTI in the Mac build (`libResetGenerationMacApplet.dylib`, i386 slice), matched to Windows vtables by
behaviour. "Observed" means read in code; "Inferred" means a conclusion not directly executed in code.

## 0. New tools and artifacts (scratchpad `tr\` folder)

- `tr\rgmac_i386.dylib`: the i386 slice of the Mac dylib. It is stripped, but its RTTI is intact.
- `tr\rtti_all.txt`: every gcc typeinfo, with its vtable address and slot list (`node tr\macho.js <dylib> rtti`).
- `tr\mac_named.c`: the full Ghidra decompile of the Mac build, with vtable slots renamed `<ns>_<Class>_v<slot>_<addr>`.
  Use it for any rg:: or mt:: class (for example `rg_CasinoSystemProxy_*`, `rg_CasinoMessage*`, `mt_connectivity_*`).
  Mac vtables have two destructor slots, so Mac slot n+1 is Windows slot n (byte offset +4).
- `tr\fn.sh <addr>...`: prints functions from `rg_decomp2.c`. `tr\xref.js <dll> <va>...` finds dword references.

## 1. Layer stack (observed)

```
rg::CasinoProxy / CasinoSystemProxy / CasinoTableProxy   (types 0x11, 0x15, 3)
mt::connectivity::ConnectionBase  ("connection")          vtbl 1018d6b0 / 1018d660, ctor FUN_1011da50
  + PingService (kind 0) vtbl 1018d75c, PongService (kind 1) vtbl 1018d790
mt::connectivity::DataFragmenter  ("fragmenter", 0x50000) vtbl 1018d3f8, ctor FUN_1011b130
mt::connectivity::ProtocolSNAPMobile ("naf", 0xc0000)     vtbl 1018b560, ctor FUN_1010b080
mt::SocketNAF  (socket type 4)                            vtbl 1018c9f8 (+8 OutputStream 1018c9e0, +0x14c listener 1018c9d4), ctor FUN_10110400
mt::NAFSNAPMobile (INAF bridge, DAT_101b8730)             INAF vtbl 1018b468 at bridge+0x14
Java NativeSNAPMobileInterface.send -> SNAP cmd 133 sendGamePacketToGameServer
```

How the stack is built:
- `Connectivity::init` FUN_101109a0 configures the connection factory. It sets flags `0x301`
  (`+0x20` = FUN_1000cf80), factory property 3 = 0x20, property 10 (wanted MTU) = 0x400, and property 4 (fragment size) = 0x400.
- FUN_10117710 then adds protocols to the stack:
  - Flag 0x100: the stack MTU (property 10, naf FUN_1010af80 returns 876) is below 1024, so it adds the fragmenter
    (capability 8).
  - Flag 8: it sets the fragment size to min(1024, 876) = 876 (FUN_101175d0 -> FUN_1011ae60). The fragment payload
    size is therefore 874 bytes.
  - Flag 0x200: it would add "datagram" (0xb0000), but the fragmenter's capability bits 0x308 already include 0x200,
    so it doesn't.
  - Flag 0x10 (flowctrl) isn't set.
- Capabilities: naf 0x181 (FUN_1010af70), fragmenter 0x308 (FUN_1011ac20), datagram 0x300, flowctrl 0x10.
- The naf protocol adds no header. Send (FUN_1010aff0 / FUN_1010b030) writes each fragment's bytes straight into the
  SocketNAF output stream. Receive (FUN_101138e0) passes the socket input stream up unchanged.
- The SocketNAF output stream `write(buf,len)` (FUN_1010fb90) is one `INAF::send` (slot 3, FUN_10109930), which is one
  SNAP game packet. Each fragment is written with a single write (FUN_1011f580), so **one fragment = one SNAP packet**
  when the client sends.

## 2. Wire format (byte-exact)

All integers are **little-endian**. The stream byte-swap flag (bit 2, setter FUN_100f3730) is never set for network
streams. The only caller passes false (FUN_100e1a85), and MemoryStreams are built with flags=1 (binary, no swap):
FUN_100f3800(…,1,1).

### 2.1 SNAP game packet payload = 1..n fragmenter frames

```
off size field
0   2    u16 hdr = (frag_index << 10) | payload_len      (payload_len <= 874, mask 0x3FF; index mask 0xFC00)
2   len  payload bytes
```
- Field widths come from FUN_1011ac50: the length mask is 2^k-1 for the smallest 2^k >= 874, so k=10. That gives
  len mask 0x3FF, index mask 0xFC00, and shift 10. Before the property-4 resize the default would have been 254
  (k=8). The resize happens at stack build time, so 874 applies.
- Sender (FUN_1011b260): the first fragment has index 1, the following ones 2, 3, …, and the **last fragment has its
  index rewritten to 0**. A message that fits in one fragment therefore has index 0, so `hdr = len`.
- Receiver (FUN_1011acb0 deframer + FUN_1011ad80 reassembly; expected index starts at 1):
  - index == expected: append and increment expected.
  - index == 0: append, the message is complete, reset expected to 1.
  - anything else: drop the fragment.
  - The receiver parses a byte stream, so frames can be concatenated in one SNAP packet or split across packets.
- A zero-length frame (`00 00`) is consumed and never delivered upward (FUN_1011ad80 returns 0 when len == 0).
- No checksum, sequence/ack, compression, encryption, or address fields exist at any transport layer (observed:
  fragmenter, naf, and SocketNAF add nothing else). Reliability is assumed from SNAP (the naf protocol claims tcp/ip
  capability, Mac FUN_001a841a list {0xc0000,0x1000,0x100,2}).

### 2.2 Reassembled message = TypedPacket

```
0  u8  type          (TypedPacket write FUN_1011f7c0, read FUN_1011bd00: valid if type < 0x10 + cfg byte)
1  ..  body          (type-specific)
```
Receive dispatch is in FUN_1011cec0. If a handler is registered for the type (conn slot +0x30 = FUN_1011d250), its
`+8(type, conn, stream)` is called. Otherwise the body is queued per type (conn+0x60[type]) for polling.

Types actually used by this game (constant registrations or sends found in code):

| type | name / use | direction | evidence |
|---|---|---|---|
| 1 | MT_PING | both | PingService sends (FUN_1011ec70/FUN_1011eba0). PongService handles (FUN_1011ef30) |
| 2 | MT_PONG | both | PingService handles (FUN_1011edc0). PongService sends |
| 3 | MT_GAMESERVER, carries an mt "Message" key/value block (§4.3) | client→server | FUN_10103430 → conn+0x64(3,msg). Senders FUN_10047fc0 (CasinoSystem onConnected) and FUN_100ce340 (table) |
| 0x0C | ping config [u32 timeout_ms][u32 interval_ms] | server→client | handler FUN_10116f30, registered for every connection in FUN_10117fe0 |
| 0x11 | rg casino messages (CasinoMessage*) | both | CasinoProxy FUN_10046d10 registers 0x11. Sends in FUN_100468d0, FUN_10046c80, FUN_10046e00… |
| 0x15 | table / in-game messages | both, via the table room | FUN_100cdd00 registers 0x15. FUN_100ce340 sends |

Types 4 (MT_GAMEROOM), 5 (MT_USER), 6 (MT_HOSTMIGRATION), 7 (MT_SERVICE_DISCOVERY), and 8 (MT_STATS_AUTH) are only
given names (FUN_10116eb0 → conn+0x40 = FUN_1009a7e0, which does nothing). No handler or sender for them was found
(grep for constant registrations and sends in both builds). Inferred: they are unused in this client.

### 2.3 Example frames
- Server MT_PING handshake: `05 00 01 20 4E 00 00` (len 5, type 1, u32 20000).
- Client MT_PONG handshake ack: `02 00 02 00`.
- Periodic ping/pong: `02 00 01 <seq>` / `02 00 02 <seq>` (seq 1..255, wraps skipping 0, FUN_1011eba0).
- Ping config: `09 00 0C <u32 timeout> <u32 interval>`.

## 3. What the client does after onConnected and the room join (question 2)

Observed sequence:
1. SocketNAF connect (FUN_10110210) puts the socket in state 6 (connecting). If the bridge isn't connected yet,
   it calls `INAF::login`. `onArenaLoginCompleted` (0x200) then runs FUN_1010fd80, which calls `INAF::joinRoom(path)`
   (slot 6 = FUN_10109a60). It calls `createRoom` (slot 5) instead if the URL has a `hosted` parameter that isn't
   `no`. The address is `naf://rg.com:80/CasinoSystem` (FUN_10003760 at 0x10003817), so the room is "CasinoSystem".
2. `onConnected` (0x10000) only sets the bridge flag `bridge+0x38` (FUN_10109d90 → FUN_10109920). The socket's
   0x10000 handler (LAB_1010ff40) does **nothing**.
3. **The socket goes 6 → 7 (connected) only inside the data handler** LAB_1010ff60 (registered by FUN_101100c0 for
   event bit 0). That handler runs when `onDataReceived` arrives with `roomName` equal to the socket's room
   (address `room` parameter, else the path). The Java side always passes the current `gameRoomName`
   (SNAPMobileClient event 117), so it matches.
4. Until then, `Connection::send` (FUN_1011c2e0) drops every message because `socket->isConnected()`
   (FUN_10113bc0: state ∈ {2,7,8,9}) is false. Connection update state 6 (FUN_1011e570) waits for the socket and
   gives up after the connect timeout. The CasinoProxy uses `connect(80000)` (FUN_10046d10), so the client fails
   with reason 1 after 80 s. **This is why the client sits at "Connecting..." and sends nothing.**
5. On the first received packet, FUN_1011d660 sets connection state 7 and calls listeners' `+8 onConnected`.
   - CasinoProxy (vtbl 1017af5c, FUN_10047fc0) immediately sends a **type 3** Message (§4.3) with string map
     `{name:<user>, roomname:"CasinoSystem", passwd:"", pid:"0"}`, byte map `{1:"1",2:"0",3:"-1"}`, and both flags 0.
   - If the user state < 4 (FUN_10097200), it then sends a **type 0x11 CasinoMessage, kind 0, code 0**
     (FUN_100468d0 → FUN_10095470): body `u32 <proxy+0x34>`, then one mt::String (FUN_10095590). Probably
     CASINOSYSTEM_LOGIN. Payload meaning belongs to the casino agent.
   - Services are activated. About 100 ms later the PingService sends `MT_PING [u32 20000]`.

**Minimal server action (inferred from the above):** after SNAP `joinGameRoom("CasinoSystem")` succeeds, send that
client one game packet (event 117) in the room. Any bytes switch the socket to connected. The bytes are then parsed
as frames, so use a valid frame. We recommend the MT_PING handshake `05 00 01 20 4E 00 00`. The client answers
`02 00 02 00`, which also verifies the framing. Then:
- Answer the client's `MT_PING [u32]` with `MT_PONG [00]` within 20 s.
- Answer each `MT_PING [seq]` with `MT_PONG [seq]`.
- If either reply is missing, PingService fails (FUN_1011f9e0(3)) and the connection closes with reason 3
  (FUN_1011e400 → FUN_1011d7b0).
- A server can send `0x0C [timeout][interval]` to lengthen the ping limits (setters FUN_1011f8f0 / FUN_1011f8d0
  apply unless the globals DAT_101b8290 / DAT_101b8294 override them).
- No server reply to type 3 is required. No handler is registered for type 3 on the client (inferred: it is
  information for the room's game server).

## 4. Serialization primitives (payload decoding)

### 4.1 Stream primitives (Windows; OutputStream writes are non-virtual, InputStream reads are vtable slots)
| writer | bytes | reader (InputStream vtbl 10189d40 slot) |
|---|---|---|
| FUN_100f45f0 writeU8 / FUN_100f4520 writeS8 / FUN_100f46c0 writeBool | 1 | +0x18 / +0x1c FUN_100f6330 |
| FUN_100f4440 write16 | 2 LE | +0x10 / +0x14 FUN_100f6300 |
| FUN_100f4240 writeU32 / FUN_100f4340 writeS32 | 4 LE | +0x08 FUN_100f62b0 / +0x0c FUN_100f6260 |
| float | 4 | +0x04 FUN_100f6350 |
| double | 8 | +0x00 FUN_100f6390 |
| raw `write(buf,len)` = vtbl slot 0 | n | +0x28 read(buf,len) FUN_100f3c70 |

Text mode (flag bit0 = 0) formats numbers as text, but network streams are binary.

### 4.2 mt::String (write FUN_100efee0, read FUN_100f0000, size FUN_100ef110 = 12 + bytes)
```
u32 hdr     bits 28..30 = encoding: 0 = 8-bit, 1 = 8-bit with hidden length, 2 = UTF-16LE; low 28 bits = refcount (ignored on read)
u32 length  characters
u32 count   characters (equal to length for encodings 0 and 2)
bytes       count * (enc==2 ? 2 : 1), no terminator
```
To build an ASCII string on the server: `00000000 | len | len | ascii`. Readers must accept encoding 2.

### 4.3 mt "Message" (vtbl 1018ae7c; write FUN_101042f0, read FUN_10103460; builders FUN_10103ee0, FUN_101037a0 put(key,val))
```
u8 nStr ; nStr × { mt::String key ; mt::String value }          (FUN_10103ab0 / FUN_10103830; hash order)
u8 nByte; nByte × { u8 key ; mt::String value }                 (FUN_101039d0 / FUN_10104190)
u8 hasAddress ; [Address, parsed by connectivity+0x18 factory]  (FUN_10103460)
u8 hasExtra   ; [object of FUN_101046c0 class]
```
Known keys: `name` (DAT_10177508), `passwd`, `pid` (DAT_1018ae50, decimal), `roomname`. Byte keys 1, 2, 3 default
to "1", "0", "-1" (FUN_10103eb0).

### 4.4 CasinoMessage envelope (base ctor FUN_10099be0, write FUN_100994b0)
```
u16 LE = kind | (code << 8)   → byte0 = kind (0 request, 1 response, 2 event; Mac rg_CasinoSystemProxy_v19 → FUN_001115dc / FUN_00111e78 / FUN_00110900), byte1 = code
then the subclass fields, e.g. FUN_10095590: u32, mt::String ; FUN_100956f0: u32
```

## 5. Routing, host, and timeouts (question 3)

- The transport is point-to-point per SNAP room. One Connection = one SocketNAF = one joined room. No packet
  carries a source or destination id. The client can't tell senders apart: `onDataReceived` has only the room name,
  and FUN_1011cec0 always treats the sender as the connection peer. Types 3, 0x11, and 0x15 differ only by the type
  byte. Inferred: the SNAP server decides delivery. For the "CasinoSystem" room, the server-side CasinoSystem
  consumes everything (types 1, 2, 3, 0x11) and answers in the same room. For table rooms (connection created in
  FUN_100cdd00, type 0x15, connect timeout 1,800,000 ms, up to 4 attempts), the server must relay packets between
  the room members. Exact relay rules (broadcast to all others, or host↔guest only) are unknown.
- Host: a table address with `hosted` other than `no` makes that client `createRoom` (FUN_1010fd80 / FUN_10110210).
  Others `joinRoom`. `SocketNAF::isListening` (vtbl slot +0x54 = FUN_10107700) always returns 0, so the host is
  also a plain client of the SNAP server. The host role is game logic (Mac `rg::ServerBattleLogic`,
  `HostMultiplayerGameState`). MT_HOSTMIGRATION isn't implemented at the transport layer (no handler).
- Timeouts:
  - Connection connect timeout: default 10,000 ms (`conn+0x6c`). The CasinoProxy uses 80,000 ms. Exceeding it means
    disconnect reason 1. A socket error means reason 5 (FUN_1011e570).
  - PingService: timeout 20,000 ms, interval 25,000 ms (FUN_1011f910). The handshake fails if there's no
    `PONG [00]` within 20 s of the first PING. In state 2, a ping without a reply for more than 20 s
    (FUN_1011fa30) fails it.
  - A Ping failure closes the connection with reason 3. A Pong failure (an unexpected type) only marks that service.

## 6. Event plumbing (reference)

- Dispatcher DAT_101b8734 (vtbl 1018b55c, base 1018cac0). `post(mask, data)` = FUN_101107d0 calls `listener+8({mask,data})`.
  Listeners declare masks in vtable slot 1: bridge 0x150000 (FUN_10109d80), SocketNAF 0x150601 (FUN_1010fd30).
- Data event from `onDataReceived` (1010a760): `{u32 3, u32 len, u8* buf (dispatcher+0x60 = direct buffer), jstring room}`.
  SocketNAF: LAB_1010ff60 → writes into the input MemoryStream (`+0x2d8`) and sets the readable flag.
- INAF slots (vtbl 1018b468): 0 dtor, 1 init, 2 login, 3 send, 4 moveToRoom, 5 createRoom, 6 joinRoom, 7 leaveRoom,
  9 logout, 12 isConnected (bridge+0x38), 13 isLoggedIn, 14/15 add/remove listener, 16-19 login screen.

## 7. Unknowns

1. Server reply semantics for the type-3 Message: what the original server sent back, if anything. The client
   registers no handler for type 3.
2. Table-room relay rules between host and guests, and how table addresses (with `hosted=`) reach the client.
   They come from casino data. See FUN_100cdd00 (`this->+0xc()->+0x28()`).
3. The value of the TypedPacket type limit (`0x10 + byte from FUN_10110ae0`). It is at least 0x16, because types 0x11
   and 0x15 work.
4. The string in the casino LOGIN request (FUN_10038a30) and the u32 at CasinoProxy+0x34. These belong to the casino
   agent.
5. Whether a zero-length onDataReceived (len 0) reaches native code. The Java side always sends the packet length,
   so a 0-byte payload might not be delivered. Use a non-empty frame.
6. `Address` serialization (Message hasAddress branch, connectivity+0x18) wasn't decoded. The client sends flag 0.
7. PPC Mac byte order wasn't checked. Windows and Mac i386 are little-endian with no swap.
