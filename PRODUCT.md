# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who own Reset Generation (RedLynx, 2008) and want to play it again, alone or online. They have their own copy of the Windows standalone build, as `ResetGeneration-Standalone.zip` or the extracted folder, and either a desktop browser with a keyboard, or a phone or tablet on the same network as a PC that hosts the game. The page speaks to players only; hosting a server is covered in the README, not on the page.

## Product Purpose

The browser client runs the original game engine, unchanged, in an x86 emulator in the browser, and connects it to a replacement for the shut-down N-Gage Arena. Success means a player who owns the game goes from opening the page to playing in a few steps, and can play online against other people again.

## Positioning

The game itself, not a remake or a port: the original engine runs unmodified, and a replacement Arena server restores login, stats, rankings, achievements, friends, ranked Quick Match (2 to 4 players), friendly rooms, and battles. The page carries none of RedLynx's files; each player brings their own copy (ADR 0001).

## Operating Context

The page is a single static page, built from `web/` into `web/dist` (ADR 0013), that is served in one of two ways, and neither is the primary one yet:

- **By a game server with `RG_GAME` set:** the server sends the player's copy of the files, and the player goes straight to **Start**.
- **By a static host without the files:** each player first chooses their own `.zip` or folder. The page keeps the files in the browser's IndexedDB, so a player chooses them once per browser, and the files never leave the player's computer.

The page moves through these states: loading the files, choosing the files, **Start**, starting the engine, playing, the dialogs described below, and errors (missing files, unreadable files, not enough memory, the emulator stopping).

Online play depends on the server. On a server with Discord sign-in (ADR 0011), the page makes a guest on the first visit, keeps its name and a secret token in local storage, and logs the engine in with no form. The header (a line under the buttons on a touch device) shows the name and **Sign in with Discord**; a member sees an **Account** menu with **Sign out** and **Delete my account**. Coming back from Discord, a dialog asks a new member to choose a name, or asks an existing member's guest to confirm that its progress is discarded. After a guest earns fame, a one-line offer to sign in appears under the screen, at most once a day. The hero line also says how many players are online and waiting. On any other server (local, LAN), the name dialog appears at the first online login, the name is kept in local storage with no password, and **Change name** under **Start** clears it; a new name starts with fresh stats. Settings and achievements are also kept in local storage.

## Capabilities and Constraints

- Runs only the Windows standalone build. A player who owns only the Mac copy can't play.
- Runs in any desktop browser on any operating system. On a keyboard, arrow keys move, **Ctrl** or **Enter** selects (hold to drop a block), **Shift** goes back, **Esc** opens the menu. A keyboard works on every device, including a tablet with one attached.
- Phones and tablets (touch devices) play over the LAN: a PC runs the server with `--lan`, and the device opens the page it serves in current Android Chrome or iOS and iPadOS Safari. The game plays in portrait with a touch pad under the game screen: a D-pad, with **Select** (hold to drop) and **Back** side by side to its right, level with Up, **Keyboard** for typing, **Soft screen** to switch the screen finish, and **Fullscreen** where the browser supports it. Online modes work as on desktop. Nothing has been tested on a real device yet.
- Every story and hero is open from the start only on a server that isn't `--public` (ADR 0007); elsewhere they are earned. A member's saved game (story progress, settings, achievements) is kept on the server, so it follows them across browsers; a guest's stays in one browser (ADR 0014).
- The game screen is drawn by the engine at 240 × 320; the page frames it and never redraws it. An optional screen finish (CONTEXT.md) may soften how it is shown, and the player can turn it off; the engine's output is never altered.
- The page is built with Vite and Svelte (ADR 0013). The server, the emulator and the other modules Node imports stay plain JavaScript with no build step and no dependencies.
- A public server is planned (`.scratch/accounts-and-joining/spec.md`) but not live. Until one is, online play works only against a server someone runs, so the page must not claim that a public server is live.
- Undecided: whether most players arrive through a static host or a server that serves the files. The page must handle both equally.

## Brand Commitments

- Name: Restart Generation. The page is an unofficial fan revival of Reset Generation (RedLynx, 2008); the game keeps its own name.
- Required footer text: "Restart Generation is an unofficial fan revival of Reset Generation © 2008 RedLynx. It is not affiliated with or endorsed by RedLynx. Bring your own copy of the game." The last sentence, and the footer note "Windows standalone build only. Your files stay in this browser.", appear only where the player brings the files: not on a server that sends the game files itself (`RG_GAME` set). Plus a credit line for vyonizr and, once it exists, a link to the GitHub repository.
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

The game plays with a keyboard or with the touch pad on phones and tablets, so a player without a keyboard can play too, as long as a PC on their network hosts the game. The touch pad's controls are real buttons with names for screen readers, and the rest of the page still scrolls and zooms on touch devices. If a device runs the game too slowly or lacks the memory for it, the page says so plainly.
