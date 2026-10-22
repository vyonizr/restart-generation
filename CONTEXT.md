# Restart Generation

A revival of Reset Generation (RedLynx, 2008) that restores its shut-down online play and runs the original game in a browser.

## Language

### Names

**Site**:
The revival as the public sees it, named Restart Generation. The game it revives stays Reset Generation, including in the copyright line and wherever the page names RedLynx's 2008 title.
_Avoid_: Reset Generation (for the site), the port, the app

### Players

**Account**:
The record the server keeps for one player: name, fame, stats, achievements, and friends. Every online player has one.
_Avoid_: profile, user, login

**Guest**:
A player with a temporary account and no sign-in; 24 hours after its last activity, the account is wiped with its fame, stats, and friends, and the name is freed. A guest plays everything a member does but stays out of the global rankings.
_Avoid_: anonymous user, unregistered user, visitor

**Member**:
A player whose account is tied to a sign-in and stays.
_Avoid_: registered user, logged-in user, account holder

**Saved game**:
The files the engine writes as a player progresses: story progress, the quick-match record, settings, and achievements. A member's saved game is kept on the server and follows them across browsers; everyone else's stays in one browser.
_Avoid_: save file, progress file, profile

**Fame**:
The score a player earns by winning ranked matches. Its level, the fame level, is what the game shows beside a name.
_Avoid_: XP, rating, points

### Running a server

**Admin**:
The person who runs a server: they decide its settings and can delete any account. A player deletes only their own.
_Avoid_: operator, owner, host

**Release**:
A numbered version of the site, made each time the public repository receives new commits. Its number tells an admin what an update to it asks of them.
_Avoid_: build, deploy, tag

**Breaking change**:
A change that makes the admin act during an update, such as a renamed setting or a client the server no longer accepts, or that makes going back to the previous release unsafe, such as a changed account database. Gameplay and page changes are never breaking.
_Avoid_: major change, incompatible update

### Online services

**Arena**:
Nokia's N-Gage Arena, the online service the game was built for. In the game, its online mode carries the same name.
_Avoid_: N-Gage servers, online backend

**SNAP**:
Nokia's SNAP Mobile protocol between a client and the Arena gateway: login, friends, rooms, and relaying game messages.
_Avoid_: N-Gage protocol

**CasinoSystem**:
RedLynx's game service inside Arena: stats, rankings, achievements, matchmaking, and friendly rooms.
_Avoid_: casino server, lobby server

### Clients and screen

**Engine**:
The game's native 32-bit Windows program, which holds all the game logic, graphics, and sound.
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
How the browser client shows the game screen: soft (the default), with the pixels smoothed and a faint pixel grid like a 2008 phone's display, or sharp, as the engine drew them. The player chooses, the choice stays in their browser, and it never changes what the engine draws.
_Avoid_: filter, shader, CRT mode, retro mode

**Touch device**:
A phone or tablet whose main input is a finger; it plays the browser client with the touch pad.
_Avoid_: mobile, handheld

**Touch pad**:
The on-screen controls under the game screen on a touch device: a D-pad and, to its right, **Select** and **Back** level with Up, then **Keyboard**, **Soft screen**, and (where the browser supports it) **Fullscreen**.
_Avoid_: virtual gamepad, on-screen keyboard

**Custom keys**:
The keys a player chose on the engine's Custom Keys screen for its seven actions: Primary, Secondary, Up, Down, Left, Right, and Chat. They are part of the saved game's settings.
_Avoid_: keybinds, key mapping, hotkeys, controls

### Game content

**Open progression**:
Every story and hero playable from the start, with nothing marked finished. It applies on any server that isn't public; on a public server they are earned and kept in the saved game.
_Avoid_: cheat, unlock hack

**Hero**:
One of the ten playable characters a player picks for a battle.
_Avoid_: character

**Story**:
One hero's campaign in Story Mode, the single-player mode, made of two missions.
_Avoid_: campaign, chapter

**Mission**:
One single-player battle inside a story.
_Avoid_: stage, level (a mission is played on a level but isn't one)

### Battles

**Battle**:
One contest between two to four players on one level.
_Avoid_: game, round

**Level**:
One of the game's 18 playfield layouts that a battle is played on. Its look is chosen separately, as the environment.
_Avoid_: stage, arena

**Bot**:
A player the computer controls in an online battle, filling a seat no person took. Player-facing text calls it "CPU", the game's own word.
_Avoid_: CPU (outside player-facing text), AI player, computer

**Person**:
A player whom a human controls, not a bot.
_Avoid_: human player, real player

**AI profile**:
One of the engine's situational weight sets that decide how a bot values its moves, such as the default one or the one used while a princess is carried.
_Avoid_: AI level, strategy

**Difficulty**:
How hard a bot plays, chosen by the player who starts a friendly match with bots: **CPU** runs the stock AI profiles; **Expert** picks its heroes from a stronger pool and also applies the AI-profile changes listed in `server/bot-ai.json`, which lists none, so its AI otherwise plays like **CPU**. It is one choice per match for all of its bots, not a setting of the server or the account.
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

**Relaxed match**:
A friendly match without phase time limits, on a server whose admin turned them off for friendly matches. Only the forced end stops a phase that no player ends.
_Avoid_: relaxed table, untimed match

**Phase**:
One step of the cycle a battle repeats: tile placement (all players at once), the player-turns phase (one player at a time), or cannons (all at once).
_Avoid_: round, stage

**Defeated player**:
A player who can no longer win the battle: their castle or princess was captured, or they left the battle or dropped out. A defeated player who stays attached watches the rest of the battle and is still a player, not an observer.
_Avoid_: eliminated player, knocked-out player

**Stopped player**:
A player whose page or bot sends nothing more while the battle goes on for the others, who still give them their turns: a sleeping phone, a hidden tab, a hung bot. The server can't tell a stopped player from a defeated one, because both are silent.
_Avoid_: stalled client, frozen page, stopped page

**Phase time limit**:
The countdown each player sees during a phase; when it runs out, the phase ends for that player.
_Avoid_: turn timer, player timeout

**Forced end**:
The server ending a phase, or a turn in the player-turns phase, that no player ended: 30 seconds after the phase time limit, or 3 minutes after it began in a relaxed match (1 minute for cannons).
_Avoid_: timeout, stall timer

**Battle template**:
The starting state of a battle for one level and player count, captured from the engine.
_Avoid_: map file, level data

**Battle seed**:
The number that fixes a battle's random events: piece order, item spawns, and the choices of bots. Every battle gets its own, so two battles from one battle template don't play out alike.
_Avoid_: random seed, the seed

**Seat**:
One player's position in a battle. It fixes the castle, the color, and the place in the turn order, and a battle hands them out at random.
_Avoid_: slot, player number, team

**Environment**:
The look of a battle's playfield: space, clouds and grass, speedball, soccer, or racetrack.
_Avoid_: stage, theme, skin
