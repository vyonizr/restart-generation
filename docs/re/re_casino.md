# CasinoSystem protocol in the engine: RE notes

Source: `ResetGeneration-Win32-Web.dll` (image base 0x10000000), the engine. These reverse-engineering (RE) notes give every address as a virtual address (VA) in that file.
"Observed" = read directly from the decompile or disassembly. "Inferred" = our reasoning, not proven.
Look up functions with `tools/re/fn.sh` (see [Lookup tools](README.md#lookup-tools)). The other helpers these notes mention weren't kept: `casino\fn.sh`, `callers.sh`, `dis.sh`, `find.js` (finds a dword in the image), and `mk.js`.

An MT type is a message type of the engine's message layer (MT, after its `mt` C++ namespace). NAF is the engine's socket layer over SNAP (`INAF`, `SocketNAF`, and `naf://` addresses; see [re_transport.md](re_transport.md)). `RB` is the response base (`u8 result, u32 value`); §4 defines the other byte-layout abbreviations.

## 0. Summary for the server author

1. CasinoSystem messages are carried on the NAF "connection" session as message type 0x11 (decimal 17).
   Casino-specific traffic uses type 0x12 (PUBLIC, ranked casino) or type 0x13 (FRIENDLY casino).
   Table (seat) traffic uses type 0x15 on a second session opened to the address given in CASINO_MATCHED_UP.
   The join-room key/value message goes out as type 3 (MT_GAMESERVER).
2. Every CasinoSystem message starts with a 2-byte header: `[kind u8][action u8]`, kind 0=REQUEST, 1=RESPONSE, 2=EVENT.
3. All integers are little-endian (packet streams are created with ios flags = 1: binary, no byte-swap bit 4).
4. Strings are the engine's internal string object: `u32 flags, u32 len, u32 len, len bytes` (no NUL). See §2.2.
5. The client sends nothing until the session reports "connected" (`FUN_10047fc0`). That callback sends the following, in order:
   (a) a type-3 MT_GAMESERVER key/value message with `name=<player name>` and `roomname=CasinoSystem`,
   (b) REQUEST CASINOSYSTEM_LOGIN (type 0x11). If no packet arrives, the transport-level session connect isn't completing; the casino layer isn't the cause (see §1).
6. To leave the `LOGIN_CONNECTING` dialog, the server must answer LOGIN with RESPONSE CASINOSYSTEM_LOGIN containing the player profile and a PUBLIC casino descriptor (§00). The client then goes to LOGGED_IN and opens the arena menu.

## 00. Login reply bytes

The captured LOGIN request is the following:

```text
00 00 | 01 00 00 00 | 01 00 00 00 19 00 00 00 19 00 00 00 "Reset Generation v. 1.1.3"
```

It matches §4 exactly: header kind 0, action 0, `u32 1`, then a String whose first u32 (`1`) is the sender's string header word (refcount 1, encoding bits 28-30 = 0).

The client expects RESPONSE kind 1, action 0 on MT type 0x11. The following 146-byte body answers it:

```text
01 00                                  header: kind=1 RESPONSE, action=0 CASINOSYSTEM_LOGIN
00                                     u8  result  (not checked by the LOGIN handler)
00 00 00 00                            u32 value   (unused)
03 00 00 00                            Profile: u32 count = 3
  01 00 00 00 02 00 00 00 02 00 00 00 69 64                                  "id"
  01 00 00 00 01 00 00 00 01 00 00 00 31                                     "1"
  01 00 00 00 04 00 00 00 04 00 00 00 6e 61 6d 65                            "name"
  01 00 00 00 0f 00 00 00 0f 00 00 00 44 55 4d 4d 59 5f 55 53 45 52 5f 66 65 38 33   "DUMMY_USER_fe83"
  01 00 00 00 04 00 00 00 04 00 00 00 66 61 6d 65                            "fame"
  01 00 00 00 01 00 00 00 01 00 00 00 30                                     "0"
01                                     u8  hasCasino = 1   (must be 1 on the first login; see the following list)
01                                     CasinoInfo.type = 1 PUBLIC
01 00 00 00                            CasinoInfo.id = 1
00 00 00 00 00 00 00 00 00 00 00 00    inLobby, waiting, playing
01 00 00 00 06 00 00 00 06 00 00 00 47 6c 6f 62 61 6c   CasinoInfo.name "Global"
```

The example strings carry refcount 1 (flags `01 00 00 00`); the reader ignores it, and a server can send 0 (§2.2).

This reply is enough to leave the login screen. Before the player reaches a lobby, the profile also needs `fameLevel`, or the lobby draw dereferences NULL ([re_friends.md](re_friends.md) §4).

The same body as continuous hex is the following:

```text
01 00 00 00 00 00 00 03 00 00 00 01 00 00 00 02
00 00 00 02 00 00 00 69 64 01 00 00 00 01 00 00
00 01 00 00 00 31 01 00 00 00 04 00 00 00 04 00
00 00 6e 61 6d 65 01 00 00 00 0f 00 00 00 0f 00
00 00 44 55 4d 4d 59 5f 55 53 45 52 5f 66 65 38
33 01 00 00 00 04 00 00 00 04 00 00 00 66 61 6d
65 01 00 00 00 01 00 00 00 01 00 00 00 30 01 01
01 00 00 00 00 00 00 00 00 00 00 00 00 00 00 00
01 00 00 00 06 00 00 00 06 00 00 00 47 6c 6f 62
61 6c
```

Success and failure fields:
- There is no success field. `FUN_10047460` case 0 never reads `result`; receiving this message means success. Parser: `FUN_100979e0` (verified in disassembly 10097A86-10097AC0: profile, then u8 flag, then CasinoInfo only if the flag is nonzero).
- `hasCasino` must be 1 with a valid CasinoInfo the first time. With 0, the handler finds no current casino (`main->vt+0x1c` = main+8 is NULL), builds a casino object from a NULL info (`FUN_10097be0` calls `info->vt+0x10`) and crashes (inferred from the code path).
- CasinoInfo `type` must be 1 (PUBLIC) so it becomes the ranked casino (`FUN_10094b60`); type 0 makes the factory return NULL (`FUN_10048e70`).
- Profile key `id` must be a decimal string; the client uses it to recognize itself in later lists. Keep `name` equal to the name sent in the type-3 message. Don't send `type=REMOTE` for this player (the map is merged into the local profile, `FUN_100495a0`).
- To reject a version, send RESPONSE VERSION_NOT_SUPPORTED instead: `01 22 00 00 00 00 00`. The login menu then shows an error (`FUN_100c54d0`).

What happens next on the client:
1. Player state goes LOGGING_IN (3) -> LOGGED_IN (4) (`FUN_10049070` -> `FUN_100972f0`).
2. Login-menu listener `FUN_100c6380` leaves the `LOGIN_CONNECTING` dialog. If the presence bridge (app+0x84) exists and the login menu has registered with it (the login-menu tick `FUN_100c5fd0` does that once), the listener requests the friend list (SNAP command 302, see [re_friends.md](re_friends.md) §1.5) and opens the arena menu (`FUN_100c5ec0` -> `FUN_100d9040`) 7.5 s later. Otherwise it opens the arena menu at once.
3. The login-menu tick sends `00 05 00 00 00 00` GET_STATISTICS once it sees state 4 (`FUN_100c5fd0` -> `FUN_10046500`). It can be skipped if the menu switches first. Reply `01 05 RB StatsRecord` (§4).
4. The client doesn't send CASINOSYSTEM_UPDATE or a casino-list request after login. The public casino comes only from the LOGIN reply. Further traffic is player-driven: GLOBAL_RANKED_GAME -> CASINO_ENTER on MT type 0x12; LINK:RANKINGS -> GET_RANKINGS; CREATE_FRIENDLY_ARENA -> CASINO_CREATE; FRIENDLY_UPDATE polling only when friendly casinos exist. Achievements upload (GET_ACHIEVEMENTS request) comes from `FUN_10046750`; its trigger was not traced.

## 1. Transport facts

The following table lists transport facts found while tracing the casino layer. [re_transport.md](re_transport.md) covers the transport in full.

| Fact | Evidence |
|---|---|
| Session object class: ctor `FUN_1011da50` (0x7c bytes, "connection"), vtable `1018d6b0`. Created by net manager `FUN_10117fe0`, which also registers a handler for type 0xc on every session and calls `FUN_10116eb0` (MT_* names 1-8). | `FUN_10117fe0` |
| Session vtable slots used by the casino code: `+0x30 registerHandler(u8 type, listener)` (`FUN_1011d250`, map at +0x68), `+0x34 unregisterHandler(type)` (`FUN_1011d390`), `+0x58 connect(timeoutMs)` (`FUN_1011ea10`), `+0x5c disconnect` (`FUN_1011e100`), `+0x64 send(u8 type, msg)` (`FUN_1011c2a0`: wraps msg with `msg->size()` and calls `+0x60`), `+0x8c addListener`, `+0x90 removeListener`. | vtable dump `1018d6b0` |
| Incoming messages are dispatched by the type byte to the registered listener's slot 2 `onMessage(?, ?, istream)`. | `FUN_10047f50`, `FUN_10098600`, `FUN_100ce4e0` |
| Message types used: 3 = MT_GAMESERVER (join-room key/value), 0x11 = CasinoSystem, 0x12 = public casino, 0x13 = friendly casino, 0x15 = table. | `FUN_10047fc0`, `FUN_100468d0`, `FUN_10097be0`, `FUN_100cdd00` |
| CasinoSystem address is a local static list (built in `FUN_10003760` from `"naf://%s:%u/%s"`). `FUN_10110ec0` iterates it synchronously and calls listener `FUN_10046d10`, which requires the address flag `isServer` (+0x20) and then does `netmgr->createSession(addr)` (`+0x70`), `addListener`, `registerHandler(0x11)`, `connect(80000)`. No server-side discovery message is needed before the connect. | `FUN_10047340`, `FUN_10110ec0`, `FUN_10046d10` |
| On session "connected" (listener vtable `1017af5c` slot 2 = `FUN_10047fc0`) the client sends MT_GAMESERVER (type 3) key/value message (class vtable `1018ae7c`, writer `FUN_101042f0`) with `name`=player name and `roomname`=`CasinoSystem`, then the LOGIN request on type 0x11. | `FUN_10047fc0`, `FUN_10103430`, `FUN_101037a0` |
| Packet stream class `FUN_1011f180` (ios flags = 1, binary, little-endian). The read side `istream` methods (`vtable 1018b028`): `+8` u32, `+0xc` i32, `+0x10/+0x14` u16, `+0x18/+0x1c` u8, `+0x20` bool (1 byte), `+0x28` raw read. Byte swap only if ios flag bit 4 is set; no casino stream sets it. | `FUN_100f62b0`, `FUN_100f6300`, `FUN_100f4340`, `FUN_1011f180` |
| Table session: `connect(1800000)` retried up to 4 times. | `FUN_100cdd00` |

## 2. Primitive encodings

### 2.1 Integers
- `u8`: 1 byte. `u16`, `u32`, and `i32`: little-endian. Writers: `FUN_100f45f0` (u8), `FUN_100f4440` (u16), `FUN_100f4340` (u32), `FUN_100f4240` (i32), `FUN_100f46c0` (bool, 1 byte).

### 2.2 String
Writer `FUN_100efee0`, reader `FUN_100f0000`, size `FUN_100ef110` (12 + bytes). The layout is the following:

```text
u32 flags   ; bits 28..30 = encoding (0 = 8-bit, 1 = 8-bit with hidden length prefix, 2 = UTF-16LE). Low 28 bits = sender's refcount (garbage, ignored by reader).
u32 length  ; characters; stored as the string length
u32 count   ; characters; reader uses this one * (enc==2 ? 2 : 1) as the raw byte count
bytes[count * width]   ; no terminator
```

Send `flags=0, length=n, count=n, n ASCII bytes`. The reader fails if the encoding is greater than 2 (`FUN_100f0000` at 100F008A).

### 2.3 Header
The header base class has vtable `10182298`. The header is `[kind u8][action u8]`, written as one little-endian u16 = `kind | action<<8` (`FUN_100994b0`, read `FUN_10099490`, ctor `FUN_10099be0(this, kind, action)`). Size 2 (`FUN_100994d0`).

### 2.4 Base payloads
The following table lists the base payload classes that most messages reuse:

| Class | Vtable | Layout after header | Evidence |
|---|---|---|---|
| Generic REQUEST | `10181e74` | `u32 value` | `FUN_10095690`, `FUN_100956f0`, `FUN_100956d0` |
| Generic RESPONSE (also base of all responses) | `10181e94` | `u8 result, u32 value` (7 bytes including the header) | `FUN_10095790`, `FUN_10095810`, `FUN_100957d0`, `FUN_10095870` |
| Generic EVENT (also base of all events) | `10182154` | `String subject` (usually the player id as decimal text) | `FUN_100988d0`, `FUN_10098880` |
| Header-only REQUEST | `101821b4`, `101821f8` | nothing | `FUN_10098ce0`, `FUN_10098de0` |

`result`: 0 = success (inferred). Observed special values: SEAT_RESERVE result 3 = failure (`FUN_100cde40`), LOCK_PLAYER_IN_GAME client reply 0 = ok and 2 = refused (`FUN_100469c0`), FRIENDLY_CASINO_START nonzero result = failure (`FUN_10047460` case 0x1c).

### 2.5 Profile
The player property map (vtable `1017b118`). Write `FUN_10049710`, read `FUN_10049340`, size `FUN_10049870`. The layout is the following:

```text
u32 count
count * { String key, String value }
```

Keys seen: `id` (decimal player id; the client uses it to recognize itself, `FUN_10047240`), `name` (`FUN_100472c0`), `fame` (decimal), `fameLevel` (decimal; the lobby draw `FUN_100eb6d0` reads it, see [re_friends.md](re_friends.md) §4), `type` (`LOCAL` or `REMOTE`, `FUN_100494f0`, `FUN_100ce050`), `heroType`, and `random` (used for matchmaking, `FUN_10097dc0`).
The LOGIN response profile is merged into the local player's map, overwriting keys (`FUN_10049ba0` -> `FUN_100495a0`). Inferred: don't send `type=REMOTE` for the local player.

### 2.6 CasinoInfo
Vtable `101827a0`; the PUBLIC subclass is `10182868`, and the FRIENDLY subclass is `101828b0`. Write `FUN_1009a9d0`, read `FUN_1009a960` (through factory `FUN_10048e70`), size `FUN_1009aa20` = 0x11 + String. The layout is the following:

```text
u8     type        ; 1 = PUBLIC (ranked casino), 2 = FRIENDLY; 0 = UNKNOWN -> factory returns NULL
u32    id          ; casino id
u32    inLobby     ; +0x10
u32    waiting     ; +0x14 (shown as WAITING)
u32    playing     ; +0x18 (shown as PLAYING); PLAYERS_IN_LOBBY shows inLobby+playing (FUN_1009a940)
String name        ; +0x0c; friendly casinos are looked up by name (FUN_10094c50)
```

Labels from `FUN_100da350` and `FUN_1009a800` (toString "type=..; name=..; id=..").
A casino object created from an info registers casino channel 0x12 for PUBLIC and 0x13 for FRIENDLY (`FUN_10097be0` at 10097C4F-10097C6C).

### 2.7 Address
A NAF address (vtable `1018cbe4`). Factory read `FUN_1011bc10` (reads kind; `FUN_1011ba80` accepts only kind 0), body read `FUN_101112f0`, write `FUN_10111330`, size `FUN_10111370` = 3 + String. The layout is the following:

```text
u8     kind        ; must be 0
u8     platform    ; 0 Unknown, 1 Win32, 2 Linux, 3 MacOSX, 4 N-Gage, 0xff (FUN_10111730)
String address     ; for example "naf://host:port/service" style (inferred, see FUN_10003760)
u8     isServer    ; 1 = server
```

### 2.8 TableDescriptor
The payload of CASINO_MATCHED_UP (vtable `10187eb0`). Read `FUN_100ce760`, write `FUN_100ce7c0`, size `FUN_100ce820`, toString `FUN_100ce610` ("name=..; id=..; nplrs=a/b; skill=.."). The layout is the following:

```text
String id          ; +0x04
String name        ; +0x08 ; used as roomname in the MT_GAMESERVER join on the table session (FUN_100ce340)
u8     nplrs       ; +0x0c ; incremented/decremented as seats are taken/left (FUN_100ceeb0, FUN_100cef40)
u8     maxplrs     ; +0x0d
i32    skill       ; +0x10
Address server     ; +0x18 ; the client opens a new session to this address (FUN_100cdd00)
```

### 2.9 StatsRecord
Vtable `10181da4`, 0x44 bytes. Write `FUN_100943a0`, read `FUN_10094480`. The size function `FUN_10094390` ignores the two lists; it looks unused. The layout is the following:

```text
String name        ; +0x04
i32 fameLevel      ; +0x08 (UI shows value-1)
i32 fame           ; +0x0c
i32 unk10          ; +0x10 (passed as char flag to the fame widget, FUN_10050a20)
i32 rank           ; +0x18 (RANK)
i32 totalMatches   ; +0x1c (if < 6, the UI shows NO_RANK_YET and the number of matches left before a rank)
i32 wins           ; +0x20 (WINS)
i32 rescues        ; +0x24 (RESCUES)
i32 favouriteHero  ; +0x28 (-1..9)
i32 unk14          ; +0x14 (written last of the scalars)
u32 n1, n1 * i32   ; +0x2c list: PLAY_POINTS
u32 n2, n2 * i32   ; +0x38 list: BELTS
```

Labels from `FUN_10050a20` (stats page), `FUN_100506a0`, and `FUN_100d93e0` (ranking row = `rank  name  fameLevel-1  fame`).

How the badge is chosen: the stats page (`FUN_10050a20` -> `FUN_10050860`) and every ranking row (`FUN_100d93e0` -> `FUN_100506a0`) write `fameLevel - 1` into the row's text, and the menu's text drawer reads that number back and draws it as a frame of `data/menus/gfx/fame.gfx`, which the menu loads once (`+0xd4`). Nothing between the record and the draw checks the number against the sheet. The sheet has 14 frames ([re_looks.md](re_looks.md)), so `fameLevel` 1 to 14 shows the 14 badges from the lowest up, and any other value shows the wrong picture: seen on the Rankings screen, levels 16 to 22 came out as small gem-like scraps instead of a badge. The client never works a level out from fame; the server decides both numbers, and the original server's rule left no trace in the client ([re_match.md](re_match.md) open question 3).

### 2.10 Achievements blob
Vtable `1017aa00`, 50 u32 counters.
- In the GET_ACHIEVEMENTS request: the first 48 bytes (12 × u32) raw (`FUN_10041f10`, size `FUN_10041e50` = 0x30).
- In the GET_ACHIEVEMENTS response: all 200 bytes (50 × u32) raw (`FUN_10041fb0` and `FUN_10041fd0`, size `FUN_10041e60` = 200).

## 3. Message kinds and action ids

Enum-to-name: `FUN_100994e0`. Factory: `FUN_10048da0` reads the header, then REQUEST -> `FUN_10048460`, RESPONSE -> `FUN_10048a40`, EVENT -> `FUN_10048720`. The factory is shared by all three listeners (CasinoSystem `FUN_10047f50`, casino `FUN_10098600`, table `FUN_100ce4e0`). The engine contains parsers for some server-side requests (shutdown, activate, and check state) that the client never sends.

The following table lists every action id, what the client does with each message kind, and the channel (MT type) the action uses:

| Id | Name | Client sends (REQUEST) | Client parses RESPONSE | Client parses EVENT | Channel |
|---|---|---|---|---|---|
| 0x00 | CASINOSYSTEM_LOGIN | yes `FUN_10095470` | special `FUN_100979e0` | special `FUN_10098a00` (friend online) | 0x11 |
| 0x01 | CASINOSYSTEM_LOGOUT | yes generic u32=0 `FUN_10046940` | generic | generic (friend offline) | 0x11 |
| 0x02 | CASINOSYSTEM_UPDATE | - | generic (ignored) | special `FUN_100991b0` (parsed, ignored by handler) | 0x11 |
| 0x03 | CASINOSYSTEM_F_CASINO | - | special `FUN_10097770` (friendly casino list) | generic | 0x11 |
| 0x04 | GET_RANKINGS | yes generic u32=0 `FUN_10046b80` | special `FUN_1009a5b0` | generic | 0x11 |
| 0x05 | GET_STATISTICS | yes generic u32=0 `FUN_10046c00` | special `FUN_1009a200` | generic | 0x11 |
| 0x06 | GET_ACHIEVEMENTS | yes `FUN_100958f0` (uploads 48 bytes) | special `FUN_10097600` | generic | 0x11 |
| 0x07 | CASINOSYSTEM_GET_FRIENDLY_CASINO_LIST | yes generic u32=0 `FUN_10046b00` | generic (ignored) | generic | 0x11 |
| 0x08 | CASINO_ENTER | yes generic u32=casinoId `FUN_10097ff0` | special `FUN_10099d70` | special `FUN_10099370` | 0x12/0x13 |
| 0x09 | CASINO_MATCHMAKING | yes `FUN_10098aa0` | special `FUN_10099fa0` | special `FUN_10098f00` | 0x12/0x13 |
| 0x0a | CASINO_CANCEL_MATCHMAKING | yes generic u32=0 `FUN_10097ae0` | generic | generic | 0x12/0x13 |
| 0x0b | CASINO_EXIT | yes generic u32=0 `FUN_10097b60` | generic | generic | 0x12/0x13 |
| 0x0c | SEAT_RESERVE | yes generic u32=playerId `FUN_100ce1a0` | generic | generic | 0x15 |
| 0x0d | SEAT_TAKE | yes generic u32=playerId `FUN_100ce340` | generic | generic | 0x15 |
| 0x0e | SEAT_LEAVE | yes generic u32=playerId `FUN_100cddd0` | generic | generic | 0x15 |
| 0x0f | SEAT_RESERVATION_EXPIRED | - | generic | generic | 0x15 |
| 0x10 | SEATING_FAILED | - | generic (ignored) | generic (ignored) | Unknown |
| 0x11 | GAME_START_FAILED | server REQUEST on 0x15 handled `FUN_100ce4e0` | generic | generic | 0x15 |
| 0x12 | TABLE_CLOSED | - | generic (ignored) | generic (ignored) | Unknown |
| 0x13 | TABLE_TERMINATED | - | generic (ignored) | generic (ignored) | Unknown |
| 0x14 | CASINO_CREATE | yes generic u32=0 `FUN_10046a80` | special `FUN_10097010` | generic | 0x11 |
| 0x15 | FRIENDLY_CASINO_ENTERED | - | generic | special `FUN_10098780` | 0x11 |
| 0x16 | FRIENDLY_CASINO_LEFT | - | generic | special `FUN_10098780` | 0x11 |
| 0x17 | FRIENDLY_CASINO_PLAYING | - | generic (ignored) | generic (ignored) | 0x11 |
| 0x18 | FRIENDLY_CASINO_UNAVAIL | - | generic (handled: listeners +0x20) | generic | 0x11 |
| 0x19 | FRIENDLY_UPDATE | yes generic u32=casinoId `FUN_10048120` | special `FUN_10096f20` | generic | 0x11 |
| 0x1a | CASINO_SHUTDOWN | (server-side request parser `FUN_10098de0`) | generic | generic (handled: disconnect) | 0x11 |
| 0x1b | CASINO_ACTIVATE | (server-side request parser `FUN_10098d30`, u32) | generic | generic | - |
| 0x1c | FRIENDLY_CASINO_START | yes generic u32=casinoId `FUN_10046e00` | generic (handled) | generic | 0x11 |
| 0x1d | LOCK_PLAYER_IN_GAME | server REQUEST, client replies RESPONSE `FUN_100469c0` | generic | generic | 0x11 |
| 0x1e | UNLOCK_PLAYER_FROM_GAME | server REQUEST, no reply `FUN_100469c0` | generic | generic | 0x11 |
| 0x1f | CASINO_MATCHED_UP | - | generic | special `FUN_10098fc0` | 0x12/0x13 |
| 0x20 | (unnamed; falls to "<invalid action>") | - | - | - | - |
| 0x21 | REGISTER_FRIENDS | yes `FUN_10095bc0` | generic (ignored) | generic | 0x11 |
| 0x22 | VERSION_NOT_SUPPORTED | - | generic (handled: error 1) | generic | 0x11 |
| 0x23 | FRIEND_REMOVE | yes `FUN_10095f50(0x23)` | special `FUN_10048980` | generic | 0x11 |
| 0x24 | FRIEND_ADD | yes `FUN_10095f50(0x24)` | special `FUN_10048980` (ignored) | generic | 0x11 |
| 0x25 | CASINO_NOT_FOUND | - | generic (handled) | generic | 0x11 |
| 0x26 | CASINO_CHECK_STATE | (server-side request parser `FUN_10098ce0`, header only) | generic | generic | - |
| 0x27-0x2a | PRESENCE_SUBSCRIBE, UNSUBSCRIBE, ACCEPT, DECLINE | not referenced by any constructor or handler found | - | - | - |

"generic" = class in §2.4. "ignored" = parsed, but the switch in the handler has no action for it.

## 4. Per-message byte layouts

The layouts give the bytes after the transport framing. `H(k,a)` = 2-byte header. `S` = String (§2.2). `P` = Profile (§2.5). `CI` = CasinoInfo (§2.6). `TD` = TableDescriptor (§2.8). `SR` = StatsRecord (§2.9). `RB` = response base `u8 result, u32 value`.

### Client-to-server messages
The following table lists the messages the client sends:

| Message | Bytes | Evidence |
|---|---|---|
| LOGIN req (0x11) | `00 00` `u32 1` `S "Reset Generation v. 1.1.3"` | `FUN_10095470`, `FUN_10095590`, `FUN_10038a30`; u32 = `FUN_10047340` param_2 = 1 from `FUN_10097090` at 100970A9 |
| LOGOUT req (0x11) | `00 01` `u32 0` | `FUN_10046940` |
| GET_RANKINGS req | `00 04` `u32 0` | `FUN_10046b80` |
| GET_STATISTICS req | `00 05` `u32 0` | `FUN_10046c00` |
| GET_ACHIEVEMENTS req | `00 06` `48 raw bytes` | `FUN_100958f0`, `FUN_100959e0` |
| GET_FRIENDLY_CASINO_LIST req | `00 07` `u32 0` | `FUN_10046b00` |
| CASINO_ENTER req (0x12/0x13) | `00 08` `u32 casinoId` | `FUN_10097ff0` |
| CASINO_MATCHMAKING req (0x12/0x13) | `00 09` `S heroType` `S random` (values of profile keys `heroType`, `random`) | `FUN_10098aa0`, `FUN_10098ba0`, `FUN_10097dc0` at 10097E64-10097E70 |
| CANCEL_MATCHMAKING req | `00 0a` `u32 0` | `FUN_10097ae0` |
| CASINO_EXIT req | `00 0b` `u32 0` | `FUN_10097b60` |
| SEAT_RESERVE req (0x15) | `00 0c` `u32 playerId` | `FUN_100ce1a0` |
| SEAT_TAKE req (0x15) | `00 0d` `u32 playerId` | `FUN_100ce340` |
| SEAT_LEAVE req (0x15) | `00 0e` `u32 playerId` | `FUN_100cddd0` |
| CASINO_CREATE req | `00 14` `u32 0` | `FUN_10046a80` |
| FRIENDLY_UPDATE req | `00 19` `u32 casinoId` (one per friendly casino) | `FUN_10048120` |
| FRIENDLY_CASINO_START req | `00 1c` `u32 casinoId` | `FUN_10046e00`, caller at 100EAEB5 |
| LOCK_PLAYER_IN_GAME resp | `01 1d` `u8 result (0 ok / 2 refused)` `u32 0` | `FUN_100469c0` |
| REGISTER_FRIENDS req | `00 21` `u8 n` `n * S friend` | `FUN_10095bc0`, `FUN_10095d00` |
| FRIEND_REMOVE req | `00 23` `S friend` | `FUN_10095f50`, `FUN_10098880` |
| FRIEND_ADD req | `00 24` `S friend` | same |

### Server-to-client responses
The following table lists the responses the client handles and what it does with each:

| Message | Bytes | Client action | Evidence |
|---|---|---|---|
| LOGIN resp | `01 00` RB `P self` `u8 hasCasino` `[CI publicCasino]` | merges profile; creates PUBLIC casino (main+8) or FRIENDLY (list); player -> LOGGED_IN (4); notifies listeners; result not checked | `FUN_100979e0` (and disassembly 10097A86-10097AC0), `FUN_10097930`, handler `FUN_10047460` case 0 |
| LOGOUT resp | `01 01` RB | player logged out, disconnect | `FUN_10047460` case 1 |
| F_CASINO resp | `01 03` RB `u8 n` `n * CI` | replaces friendly casino list | `FUN_10097770`, `FUN_10097690` (disassembly 10097690-100976D4) |
| GET_RANKINGS resp | `01 04` RB `u32 n1, n1*SR` (TOP_10_PLAYERS) `u32 n2, n2*SR` (FRIENDS_RANKING) `u32 n3, n3*SR` (NEAR_YOU) | rankings page | `FUN_1009a2f0`, `FUN_1009a500`, `FUN_10097380`, UI `FUN_100d93e0` |
| GET_STATISTICS resp | `01 05` RB `SR` | stats page | `FUN_1009a200`, `FUN_100973c0` |
| GET_ACHIEVEMENTS resp | `01 06` RB `200 raw bytes` | achievements | `FUN_10097600`, `FUN_10097400` |
| CASINO_ENTER resp (on 0x12/0x13) | `01 08` RB `P` `CI` | copies inLobby and waiting into the casino, adds player, player -> ENTERED_CASINO (9) | `FUN_10099d70`, `FUN_10099ce0`, handler `FUN_100980a0` case 8 |
| MATCHMAKING resp (0x12/0x13) | `01 09` RB `u8 n` `n * P` (other waiting players) | listener notifications only | `FUN_10099fa0`, `FUN_10099f10`, `FUN_100980a0` case 9 |
| CANCEL_MATCHMAKING resp | `01 0a` RB | player +0x78 | `FUN_100980a0` case 10 |
| CASINO_EXIT resp | `01 0b` RB | player -> EXITED_CASINO (7), unregisters channel | `FUN_100980a0` case 0xb |
| SEAT_RESERVE resp (0x15) | `01 0c` RB | result ≠ 3 -> SEAT_RESERVED; result 3 -> close table session | `FUN_100cde40` |
| SEAT_TAKE resp (0x15) | `01 0d` RB | player -> SEATED (0xf) | `FUN_100cde40`, `FUN_1009c160` |
| SEAT_LEAVE resp (0x15) | `01 0e` RB | player unseated, removes listener | `FUN_100cde40` |
| SEAT_RESERVATION_EXPIRED resp (0x15) | `01 0f` RB | player -> UNSEATED, close | `FUN_100cde40` |
| CASINO_CREATE resp | `01 14` RB `CI friendlyCasino` | adds casino, listeners +0x10 | `FUN_10097010`, `FUN_10096fd0`, `FUN_10047460` case 0x14 |
| FRIENDLY_CASINO_UNAVAIL resp | `01 18` RB | listeners +0x20 | `FUN_10047460` case 0x18 |
| FRIENDLY_UPDATE resp | `01 19` RB `u32 casinoId` `u32 inLobby` `u32 waiting` `u32 playing` | updates counts; removes casino if inLobby + playing = 0 | `FUN_10096f20`, `FUN_10096eb0`, `FUN_10047460` case 0x19 |
| FRIENDLY_CASINO_START resp | `01 1c` RB | result ≠ 0 -> player unlock | `FUN_10047460` case 0x1c |
| VERSION_NOT_SUPPORTED resp | `01 22` RB | listeners +0xc(1); login menu shows error | `FUN_10047460` case 0x22, `FUN_100c54d0` |
| FRIEND_REMOVE resp | `01 23` RB `CI` | removes that friend's friendly casino | `FUN_10048980`, `FUN_10047460` case 0x23 |
| FRIEND_ADD resp | `01 24` RB `CI` | ignored | same class |
| CASINO_NOT_FOUND resp | `01 25` RB (value = casinoId) | removes friendly casino, player -> LOGGED_IN | `FUN_10047460` case 0x25 |

### Server-to-client events and requests
The following table lists the events and requests the server sends and what the client does with each:

| Message | Bytes | Client action | Evidence |
|---|---|---|---|
| LOGIN event (0x11) | `02 00` `S id` `P friend` | friend online; adds player object | `FUN_10098a00`, `FUN_10047bf0` case 0 |
| LOGOUT event (0x11) | `02 01` `S id` | friend offline | `FUN_10047bf0` case 1 |
| UPDATE event (0x11) | `02 02` `S` `u8 n` `n * CI` | parsed, ignored | `FUN_100991b0`, `FUN_100990d0`, `FUN_10099120` |
| CASINO_ENTER event (0x12/0x13) | `02 08` `S id` `P` | someone entered the casino | `FUN_10099370`, `FUN_100982b0` case 8 |
| MATCHMAKING event (0x12/0x13) | `02 09` `S id` `P` | someone started matchmaking (ignored if same id as self) | `FUN_10098f00`, `FUN_100982b0` case 9 |
| CANCEL_MATCHMAKING event | `02 0a` `S id` | listener | `FUN_100982b0` case 10 |
| CASINO_EXIT event | `02 0b` `S id` | listener | `FUN_100982b0` case 0xb |
| SEAT_* events (0x15) | `02 0c/0d/0e/0f` `S id` | table listeners (0xe also closes the table session if the leaver is LOCAL) | `FUN_100ce230` |
| FRIENDLY_CASINO_ENTERED event (0x11) | `02 15` `S id` `CI` `S casinoName` | adds friendly casino | `FUN_10098780`, `FUN_100986f0`, `FUN_10047bf0` case 0x15 |
| FRIENDLY_CASINO_LEFT event (0x11) | `02 16` `S id` `CI` `S casinoName` | removes casino | same, case 0x16 |
| CASINO_SHUTDOWN event (0x11) | `02 1a` `S` | disconnect, listeners +0xc(3) | `FUN_10047bf0` case 0x1a |
| CASINO_MATCHED_UP event (0x12/0x13) | `02 1f` `S` `TD` | creates table, disconnects the casino session, player -> SEAT_RESERVED -> BEING_SEATED, opens the table session | `FUN_10098fc0`, `FUN_100982b0` case 0x1f (disassembly 100983AF-1009840E) |
| LOCK_PLAYER_IN_GAME req (0x11) | `00 1d` `u32` | player lock, client replies RESPONSE 0x1d | `FUN_100469c0` |
| UNLOCK_PLAYER_FROM_GAME req (0x11) | `00 1e` `u32` | player unlock | `FUN_100469c0` |
| GAME_START_FAILED req (0x15) | `00 11` `u32` | table listeners +0x1c(2), close table session | `FUN_100ce4e0` |

## 5. Client state machine

### 5.1 Player states
The player state is at player +8 (toString `FUN_1009bbc0`, vtable `1017b020`). The states are the following:

0 INIT, 1 INITED, 2 LOGGED_OUT, 3 LOGGING_IN, 4 LOGGED_IN, 5 LOGGING_OUT, 6 INIT, 7 EXITED_CASINO, 8 ENTERING_CASINO, 9 ENTERED_CASINO, 10 EXITING_CASINO, 11 RESERVING_SEAT (= matchmaking requested), 12 SEAT_RESERVED, 13 BEING_SEATED, 14 UNSEATED, 15 SEATED, 16 BEING_UNSEATED.

Player methods (vtable `1017b020`): `+0x10` login (`FUN_10097090`: state 3, `casinoSystem->connect(player,1)`), `+0x4c` enterCasino (`FUN_1009b9b0`: state 8, `casino->enter`), `+0x50` exitCasino (`FUN_1009c350`), `+0x54` startMatchmaking (`FUN_1009c3c0`: needs state 9, state 11), `+0x58` leaveSeat (`FUN_1009c410`), `+0x5c` cancelMatchmaking (`FUN_1009c450`), `+0x60` enteredCasino (state 9), `+0x64` beginSeating (`FUN_10049090`: state 13, `table->connect`), `+0x68` exitedCasino (7), `+0x6c` seatReserved (12), `+0x74` seated (15), `+0x78` unseated, `+0x7c` expired (14).

### 5.2 CasinoSystem client
The object sits at app slot 0x3a (ctor `FUN_10047050`, vtable `1017af90`). Its connection state at +0x18 is set through `FUN_1010ef00`: 1 = connecting (`FUN_10047340`), 2 = connected (`FUN_10047fc0`), 3 = disconnected (`FUN_100482c0`).

### 5.3 Login screen
The login menu's tick is `FUN_100c5fd0`, and its draw function is `FUN_100c5ab0`. The login runs as follows:
1. The SNAP/NAF login object (menu+0x2c) reaches a logged-in state; the menu calls `player->login(casinoSystem)` (`FUN_100c5fd0`).
2. `FUN_10047340` -> `FUN_10110ec0` -> `FUN_10046d10`: create session to the static `naf://.../CasinoSystem` address, register 0x11, `connect(80000)`.
3. Transport reports connected -> `FUN_10047fc0`: send MT_GAMESERVER `{name, roomname=CasinoSystem}` (type 3) and LOGIN (type 0x11).
4. Server sends LOGIN response -> player LOGGED_IN -> player listener `FUN_100c6380` -> `FUN_100c5ec0` opens the arena menu (`FUN_100d9040`), 7.5 s later if the listener requested the friend list (§00). The tick also sends GET_STATISTICS once the state is 4 (`FUN_100c5fd0` -> `FUN_10046500`).

The dialog text in `FUN_100c5ab0` depends on the SNAP login object state: 3 -> `LOGIN_LOGGING_IN`, 1 -> `CANCEL_LOGIN`, other -> `LOGIN_CONNECTING`. The `LOGIN_CONNECTING` dialog stays until step 4. Errors: VERSION_NOT_SUPPORTED -> listener `FUN_100c54d0` sets error flags; casino disconnect -> `+0xc(0)`.

### 5.4 Ranked happy path
The GLOBAL_RANKED_GAME menu entry starts the following sequence:
1. Arena menu tick `FUN_100d8700`: if player state is 4 or 7, take the PUBLIC casino (`main->vt+0x1c` = main+8) and call `player->enterCasino` -> CASINO_ENTER req `00 08 u32 id` on 0x12. (The casino handler for 0x12 is registered just before, `FUN_10097ff0`.)
2. Server: RESPONSE CASINO_ENTER on 0x12 -> state 9. Matchmaking menu (`FUN_100e33a0`; it calls `player->+0x54`, seen in `FUN_100e3670`) sends CASINO_MATCHMAKING `00 09 S heroType S random` -> state 11. RESPONSE MATCHMAKING is optional (listener only).
3. Server: EVENT CASINO_MATCHED_UP on 0x12 with a TableDescriptor -> client disconnects the CasinoSystem session (`[esi+2Ch]->+0x5c` at 100983F5), state 12 then 13, opens a new session to `TD.server`, registers type 0x15, `connect(1800000)`.
4. Table session connected (`FUN_100cded0` sets a flag) -> table tick `FUN_100ce4c0` -> `FUN_100ce340`: sends MT_GAMESERVER join `{name, id, roomname=TD.name}` (type 3) and SEAT_TAKE `00 0d u32 playerId` (type 0x15).
5. Server: RESPONSE SEAT_TAKE -> state 15 SEATED. No casino message starts the match (see §6).

Failure paths: MATCHMAKING_FAILED dialog (`FUN_100eb070` and `FUN_100eb170`), GAME_START_FAILED request, and SEAT_RESERVATION_EXPIRED.

### 5.5 Friendly casinos
- Create: CREATE_FRIENDLY_ARENA (only if the friends list isn't empty, `FUN_100d8aa0`) -> CASINO_CREATE `00 14 u32 0` (0x11) -> RESPONSE `01 14 RB CI(type 2)` -> casino added (channel 0x13).
- List: GET_FRIENDLY_CASINO_LIST `00 07` (0x11). Inferred: server replies RESPONSE 0x03 F_CASINO (`01 03 RB u8 n n*CI`) because response 7 is ignored and response 3 carries the list.
- Status poll: FRIENDLY_UPDATE `00 19 u32 casinoId` per casino (`FUN_10048120`, from `FUN_100d85b0`) -> RESPONSE `01 19 RB u32 id u32 inLobby u32 waiting u32 playing`.
- Join: JOIN_FRIENDLY_ARENA or `FRIEND_<id>` -> `FUN_100d8940` -> `player->enterCasino(casino)` -> CASINO_ENTER on 0x13.
- Start: any lobby member sends FRIENDLY_CASINO_START `00 1c u32 casinoId` (0x11). For the server's reply sequence (LOCK_PLAYER_IN_GAME, then CASINO_MATCHED_UP on 0x13), see [re_friends.md](re_friends.md) §3.5.
- Friend notifications: EVENT FRIENDLY_CASINO_ENTERED and FRIENDLY_CASINO_LEFT (0x11).
- Friends: REGISTER_FRIENDS (`FUN_10046e90`, caller at 10096B2D), FRIEND_ADD and FRIEND_REMOVE (`FUN_10046f20` and `FUN_10046fb0`).

### 5.6 Rankings, statistics, and achievements
- LINK:RANKINGS -> GET_RANKINGS `00 04 u32 0` -> RESPONSE with three StatsRecord lists (top 10, friends, near you). The UI shows FRIENDS_RANKING only if the friends list has more than one entry, and NEAR_YOU only if it isn't empty (`FUN_100d93e0`).
- GET_STATISTICS sent automatically after login -> RESPONSE `01 05 RB SR` (YOUR_STATS).
- Achievements: `FUN_10046c80` (called from 1004677F) uploads local counters in the GET_ACHIEVEMENTS request; the RESPONSE returns 200 bytes.

## 6. In-match traffic

Observed:
- After MATCHED_UP the client leaves the CasinoSystem session and opens a separate NAF session to `TD.server` (`FUN_100cdd00`). On that session it registers only type 0x15 for casino-layer traffic and sends an MT_GAMESERVER (type 3) join with `roomname = TD.name` (`FUN_100ce340`).
- The table object (`FUN_100cdf10`, vtable `10187dd0`) tracks reserved (+0x14) and seated (+0x10) players and `TD.nplrs`.

Settled in other notes:
- `TD.server` is a `naf://` address. The client joins the SNAP room named by the address's `room` parameter, else by its path ([re_transport.md](re_transport.md) §3). A replacement server can point `TD.server` at itself with a per-table room name.
- Superseded by [re_match.md](re_match.md) §4.1: the server is the host (sender id 0), clients never host, and MT_HOSTMIGRATION is unused. re_match.md §4 describes the in-match traffic.

## 7. Minimal server script (inferred)
1. Let the client connect to the "CasinoSystem" room; make sure the transport reports the session as connected ([re_transport.md](re_transport.md) §3).
2. Receive the type-3 join (`name`, `roomname=CasinoSystem`). It needs no reply (re_transport.md §3).
3. Receive type 0x11 `00 00 01000000 S"Reset Generation v. 1.1.3"`. Reply type 0x11 with the following:

   ```text
   01 00 | 00 | 00000000 | P{id=PLAYER_ID, name=SNAP_USER_NAME, fame=0, fameLevel=1} | 01 | CI{type=1, id=1, 0, 0, 0, name="Global"}
   ```

4. Answer GET_STATISTICS with `01 05 00 00000000 SR{...}`; answer GET_RANKINGS, GET_FRIENDLY_CASINO_LIST (with F_CASINO n=0), and GET_ACHIEVEMENTS (200 zero bytes). REGISTER_FRIENDS needs no reply.
5. On type 0x12 CASINO_ENTER, reply type 0x12 `01 08 00 00000000 P{...} CI{public}`.
6. On type 0x12 CASINO_MATCHMAKING, pair players; send each player the following on type 0x12:

   ```text
   02 1f S"PLAYER_ID" TD{id, name, nplrs=0, maxplrs, skill, Address{0, 1, "naf://HOST:PORT/TABLE_ROOM", 1}}
   ```

7. On the table session, on type 0x15 SEAT_TAKE, reply type 0x15 `01 0d 00 00000000`.

In these layouts, the names in capitals stand for values:
- `PLAYER_ID`: the player's decimal id.
- `SNAP_USER_NAME`: the player's SNAP user name.
- `HOST:PORT`: the server's address.
- `TABLE_ROOM`: the SNAP room name for the table.

## 8. Unknowns
1. Answered: see [re_transport.md](re_transport.md) §2 for the framing of a type-0x11 message.
2. Answered: see re_transport.md §3. The session reports connected only after the server sends a first game packet in the room, and the MT_GAMESERVER join (type 3) needs no reply.
3. Meaning of the LOGIN request u32 (always 1) and of the response-base u32 for most responses.
4. Full list of `result` codes (only 0, 2, and 3 observed in use).
5. StatsRecord fields +0x10 and +0x14. CasinoInfo semantics come from UI labels only.
6. Partly answered: the client joins the SNAP room named by the address's `room` parameter, else its path (re_transport.md §3). Still open: whether the casino session must be dropped on MATCHED_UP (observed call to session `+0x5c` = `FUN_1011e100` disconnect).
7. Answered for the friendly flow after FRIENDLY_CASINO_START: see [re_friends.md](re_friends.md) §3.5. Still open: who calls table `+0x2c` (SEAT_RESERVE); in the ranked flow the client never sends SEAT_RESERVE, only SEAT_TAKE.
8. Answered: see [re_match.md](re_match.md) §1.3.
9. Answered: see re_friends.md §3.4.
10. PRESENCE_* (0x27-0x2a), SEATING_FAILED, TABLE_CLOSED, TABLE_TERMINATED, and FRIENDLY_CASINO_PLAYING: no client constructor or handler found; the client ignores them.
11. Whether 0xc (registered by the net manager on every session) is a transport keep-alive or something else.
