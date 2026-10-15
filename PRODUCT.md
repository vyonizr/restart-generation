# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who own Reset Generation (RedLynx, 2009) and want to play it again, alone or online. They have their own copy of the Windows standalone build, as `ResetGeneration-Standalone.zip` or the extracted folder, and a desktop browser with a keyboard. The page speaks to players only; hosting a server is covered in the README, not on the page.

## Product Purpose

The browser client runs the original game engine, unchanged, in an x86 emulator in the browser, and connects it to a replacement for the shut-down N-Gage Arena. Success means a player who owns the game goes from opening the page to playing in a few steps, and can play online against other people again.

## Positioning

The game itself, not a remake or a port: the original engine runs unmodified, and a replacement Arena server restores login, stats, rankings, achievements, friends, ranked Quick Match (2 to 4 players), friendly rooms, and battles. The page carries none of RedLynx's files; each player brings their own copy (ADR 0001).

## Operating Context

The page is a single static page (`web/index.html`, `web/main.js`) that is served in one of two ways, and neither is the primary one yet:

- **By a game server with `RG_GAME` set:** the server sends the player's copy of the files, and the player goes straight to **Start**.
- **By a static host without the files:** each player first chooses their own `.zip` or folder. The page keeps the files in the browser's IndexedDB, so a player chooses them once per browser, and the files never leave the player's computer.

The page moves through these states: loading the files, choosing the files, **Start**, starting the engine, playing, the Arena login dialog (shown only if the server rejects the guest login), and errors (missing files, unreadable files, the emulator stopping). Online play uses an automatic guest name (such as `Guest123456`) kept in local storage, so stats carry over between visits. Settings and achievements are also kept in local storage.

## Capabilities and Constraints

- Runs only the Windows standalone build. A player who owns only the Mac copy can't play.
- Runs in any desktop browser on any operating system. The game needs a keyboard: arrow keys move, **Ctrl** or **Enter** selects (hold to drop a block), **Shift** goes back, **Esc** opens the menu.
- Phones: the page lays out cleanly, and the play area says "Reset Generation needs a keyboard. Open this page on a computer to play." There are no touch controls.
- The game screen is drawn by the engine at 240 × 320; the page frames it and never redraws it.
- Plain HTML, CSS and JavaScript modules with no build step and no dependencies.
- There is no public game server yet. Online play works only against a server someone runs, so the page must not claim that a public server is live.
- Undecided: whether most players arrive through a static host or a server that serves the files. The page must handle both equally.

## Brand Commitments

- Name: Reset Generation. The page is an unofficial fan revival.
- Required footer text: "Reset Generation © 2009 RedLynx. This is an unofficial fan revival, not affiliated with or endorsed by RedLynx or Ubisoft. Bring your own copy of the game." Plus a credit line for vyonizr and, once it exists, a link to the GitHub repository.
- No RedLynx or Ubisoft logos, and nothing that reads as an official RedLynx or Ubisoft site.

## Evidence on Hand

- No screenshots, art or other assets derived from the game ship with the page or the repository (ADR 0001). The only game imagery is the engine's own screen, after the player's files load.
- No repository URL yet.
- No public server, player counts, testimonials or press. Don't invent them.

## Product Principles

1. The game leads. Everything around it helps a player reach **Start** and then gets out of the way.
2. The player's files stay theirs. Say plainly that the files stay in the browser, and never ship or imply anything derived from the game.
3. Honest about status. Say what works today; don't claim a live server, official backing, or support for the Mac build.
4. One page for both hosting modes. Choosing files and going straight to **Start** are both first-class paths.

## Accessibility & Inclusion

Playing needs a keyboard, so the game is for desktop browsers. On a phone, the page stays readable and says plainly why the game can't be played there.
