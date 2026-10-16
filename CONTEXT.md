# Reset Generation revival

A revival of Reset Generation (RedLynx, 2009) that restores its shut-down online play and runs the original game in a browser.

## Language

### Online services

**Arena**:
Nokia's N-Gage Arena, the online service the game was built for, and the game's online mode as a whole.
_Avoid_: N-Gage servers, online backend

**SNAP**:
Nokia's SNAP Mobile protocol between a client and the Arena gateway: login, friends, rooms, and relaying game messages.
_Avoid_: N-Gage protocol

**CasinoSystem**:
RedLynx's game service inside Arena: stats, rankings, achievements, matchmaking, and friendly rooms.
_Avoid_: casino server, lobby server

### Game

**Engine**:
The game's native 32-bit Windows program, which holds all the game logic, graphics and sound.
_Avoid_: DLL, native library, game binary

**Java client**:
The original standalone program that hosts the engine and connects it to Arena.
_Avoid_: applet, launcher

**Browser client**:
The web page that runs the original engine in an emulator and connects it to Arena.
_Avoid_: web version, port

**Touch device**:
A phone or tablet whose main input is a finger; it plays the browser client with the touch pad.
_Avoid_: mobile, handheld

**Touch pad**:
The on-screen controls under the game screen on a touch device: a D-pad, Select, Back, Menu and Keyboard.
_Avoid_: virtual gamepad, on-screen keyboard

**Hero**:
One of the ten playable characters a player picks for a battle.
_Avoid_: character

**Story**:
One hero's campaign in Story Mode, the single-player mode, made of two missions.
_Avoid_: campaign, chapter

**Mission**:
One single-player battle inside a story.
_Avoid_: level, stage

**Battle**:
One match between two to four players on one level.
_Avoid_: game, round

**Observer**:
Someone attached to a battle who doesn't play in it. A player who waits while other players take their turns is still a player, not an observer.
_Avoid_: spectator, watching player

**Ranked match**:
A battle arranged by matchmaking, whose result changes the players' stats.
_Avoid_: quick match game

**Friendly match**:
A battle between players who gathered in a friendly room; its result changes no stats.
_Avoid_: private match, custom game

**Phase**:
One step of a battle turn in which players act: tile placement (all at once), player turns (one at a time), or cannons (all at once).
_Avoid_: round, stage

**Phase time limit**:
The countdown each player sees during a phase; when it runs out, the phase ends for that player.
_Avoid_: turn timer, player timeout

**Battle template**:
The starting state of a battle for one level and player count, captured from the engine.
_Avoid_: map file, level data
