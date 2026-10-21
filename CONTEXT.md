# Restart Generation

A revival of Reset Generation (RedLynx, 2008) that restores its shut-down online play and runs the original game in a browser.

## Language

### Names

**Site**:
The revival as the public sees it, named Restart Generation. The game it revives stays Reset Generation, including in the copyright line and wherever the page names RedLynx's 2008 title.
_Avoid_: Reset Generation (for the site), the port, the app

### Players

**Account**:
The record the server keeps for one player: name, fame, stats, achievements and friends. Every online player has one.
_Avoid_: profile, user, login

**Guest**:
A player with a temporary account and no sign-in. The account is wiped 24 hours after its last activity, taking its fame, stats and friends with it, and the name is freed. A guest plays everything a member does but stays out of the global rankings.
_Avoid_: anonymous user, unregistered user, visitor

**Member**:
A player whose account is tied to a sign-in and stays.
_Avoid_: registered user, logged-in user, account holder

**Saved game**:
The files the engine writes as a player progresses: story progress, the quick-match record, settings and achievements. A member's saved game is kept on the server and follows them across browsers; everyone else's stays in one browser.
_Avoid_: save file, progress file, profile

**Fame**:
The score a player earns by winning ranked matches. Its level, the fame level, is what the game shows beside a name.
_Avoid_: XP, rating, points

### Running a server

**Admin**:
The person who runs a server: they decide its settings and can delete any account. A player deletes only their own.
_Avoid_: operator, owner, host

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

**Quit**:
The player confirming Quit on the game's main menu, which ends the engine; the browser client then starts over as a refresh would. Leaving a battle or leaving Arena is not quitting.
_Avoid_: exit, close, shut down

**Screen finish**:
How the browser client shows the game screen: soft, with the pixels smoothed and a faint pixel grid like a 2008 phone's display, or sharp, as the engine drew them. It's on by default and a player's choice, kept in their browser. It changes only how the screen looks, never what the engine draws.
_Avoid_: filter, shader, CRT mode, retro mode

**Touch device**:
A phone or tablet whose main input is a finger; it plays the browser client with the touch pad.
_Avoid_: mobile, handheld

**Touch pad**:
The on-screen controls under the game screen on a touch device: a D-pad, then Select and Back side by side to its right level with Up, and a Keyboard button below that.
_Avoid_: virtual gamepad, on-screen keyboard

**Custom keys**:
The keys a player chose on the engine's Custom Keys screen for its seven actions: Primary, Secondary, Up, Down, Left, Right and Chat. They are part of the saved game's settings. The page calls Primary and Secondary by the touch pad's names, Select and Back.
_Avoid_: keybinds, key mapping, hotkeys, controls

**Open progression**:
Every Story and Hero playable from the start, with nothing marked finished. It applies on any server that isn't public; on a public server they are earned and kept in the saved game.
_Avoid_: cheat, unlock hack

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

**Bot**:
A player the computer controls in an online battle, filling a seat no person took. Player-facing text calls it "CPU", the game's own word.
_Avoid_: CPU (outside player-facing text), AI player, computer

**AI profile**:
One of the engine's situational weight sets that decide how a Bot values its moves, such as the default one or the one used while a princess is carried.
_Avoid_: AI level, strategy

**Difficulty**:
How hard a Bot plays, chosen by the player who starts a friendly match with Bots: CPU runs the AI profiles as the game shipped them, Expert runs the retuned ones. It is one choice per match for all of its Bots, not a setting of the server or the account.
_Avoid_: AI level, skill

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

**Battle seed**:
The number that fixes a battle's random events: piece order, item spawns and the choices of bots. Every battle gets its own, so two battles from one battle template don't play out alike.
_Avoid_: random seed, the seed

**Seat**:
One player's position in a battle. It fixes the castle, the colour and the place in the turn order, and a battle hands them out at random.
_Avoid_: slot, player number, team

**Environment**:
The look of a battle's playfield: space, clouds and grass, speedball, soccer or racetrack.
_Avoid_: stage, theme, skin
