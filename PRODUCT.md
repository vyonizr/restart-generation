# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

People who own Reset Generation (RedLynx, 2008) and want to play it again, alone or online. They have their own copy of the Windows standalone build, as `ResetGeneration-Standalone.zip` or the extracted folder, and either a desktop browser with a keyboard, or a phone or tablet that opens a public server's address or is on the same network as a PC that hosts the game. The page speaks to players only; hosting a server is covered in [Run a server](docs/HOSTING.md), not on the page.

## Product Purpose

The browser client runs the original game engine, unchanged, in an x86 emulator in the browser, and connects it to a replacement for the shut-down N-Gage Arena. Success means a player who owns the game goes from opening the page to playing in a few steps, and can play online against other people again.

## Positioning

The game itself, not a remake or a port: the original engine runs unmodified, and a replacement Arena server restores login, stats, rankings, achievements, friends, ranked matches through **Quick Match** (two to four players), friendly rooms, and battles. The page carries none of RedLynx's files; each player brings their own copy ([architecture decision record (ADR) 0001](docs/adr/0001-players-bring-their-own-game-files.md)).

## Operating Context

The page is a single static page, built from `web/` into `web/dist` ([ADR 0013](docs/adr/0013-the-page-is-built-with-vite-and-svelte.md)), that is served in one of these ways:

- **By a game server that sends the game (`RG_SEND_GAME=1`, with its server copy in `RG_GAME`):** the server sends its copy of the files, and the player goes straight to **Start**.
- **By a static host, or a game server that doesn't send the game:** each player first chooses their own `.zip` or folder. The page keeps the files in the browser's IndexedDB, so a player chooses them once per browser, and the files never leave the player's computer.

The page moves through these states: loading the files, choosing the files, **Start**, starting the engine, playing, the dialogs described in the following paragraphs, and errors (missing files, unreadable files, not enough memory, the emulator stopping).

Online play depends on the server:

- **With Discord sign-in ([ADR 0011](docs/adr/0011-guests-and-members-with-discord-sign-in.md)):** the page makes a guest on the first visit, keeps its name and a secret token in local storage, and logs the engine in with no form. The header, or the who line on a touch device, shows the name, **Replays**, and **Sign in with Discord**; a member sees an **Account** menu with **Replays**, **Download my data**, **Sign out**, and **Delete my account**. When the player comes back from Discord, a dialog asks a new member to choose a name. When that Discord account already has a player, a dialog asks the player to confirm that their guest progress and this browser's saved game are discarded. After a guest earns fame, a one-line offer to sign in appears under the screen, at most once a day.
- **Without accounts (local, LAN):** the name dialog appears at the first online login, the name is kept in local storage with no password ([ADR 0009](docs/adr/0009-a-name-is-the-whole-identity.md)), and **Change name** under **Start** clears it; a new name starts with fresh stats. Settings and achievements are also kept in local storage.

When a server answers, the page shows how many players are online: in the online row under the screen on a desktop, and on the Start screen on a touch device.

A public server also serves two reading pages, **Terms** (`/terms`) and the **Privacy policy** (`/privacy`), filled in with its admin, its hosting provider, and its contact ([ADR 0021](docs/adr/0021-public-servers-publish-terms-and-a-privacy-policy.md)). Playing online there accepts both; nothing blocks play to ask.

After each online battle, the notice line under the screen says the battle is saved as a **replay** ([CONTEXT.md](CONTEXT.md)) and offers **Watch replay**, which opens the replay page in a new tab, and **Copy link**; it stays until the player dismisses it or their next battle starts. The replay page (`/replay/<id>`) plays the battle again in the engine's own replay player, as the original website did, at 420 × 378: the battle view as a broadcast replay, with a crimson **REPLAY** tag on its corner, the seats under it as a lower third (seat, name, hero, and each player's place once it ends), then our own control strip (play or pause, a time slider with the time, **Skip idle**, **2×**, mute and volume). Space, the arrow keys, F and M work too, and a gamepad's bottom button and D-pad. The end screen dims the battle and gives the result and **Watch again**. The page gets the game files as the game page does, and asks for **Watch** before it plays, so the sound can start. A replay is kept 30 days; after that, or on a server with replays off, the page says it's gone ([ADR 0022](docs/adr/0022-replays-send-a-battles-game-blob-to-anyone-with-the-link.md)). A pasted link shows a text-only preview: players, heroes, kind of match, environment and day.

A replay whose battle the engine hasn't built after 10 seconds of its own time, such as damaged data or a development seed's placeholder, never will: the page says **Can't play**, with **Play the game**, instead of staying black.

**Export footage**, beside **Copy link** in the replay page's header, saves the replay as [footage](CONTEXT.md): an MP4 file to cut in a video editor and share ([ADR 0028](docs/adr/0028-players-can-export-a-replay-as-footage.md)). The page renders it on its own engine, faster than real time, with a progress bar and **Cancel** over the battle view: the whole battle at 1× with idle time skipped, the engine's picture only, three times its size at 30 frames a second, with its sound. Then the replay waits at the start for **Play**. It needs a browser that encodes H.264 and AAC (WebCodecs), on a secure page: over HTTPS, or at localhost. On a LAN address over plain HTTP the button stays disabled and the page says to open the replay over HTTPS or at localhost; in a browser that can't encode, it says to try Chrome or Edge.

**Replays** lists every replay under the player's name, newest first, for anyone to see, for its 30 days ([ADR 0024](docs/adr/0024-a-players-replays-are-listed-under-their-name.md)), so a dismissed notice loses nothing. On a Discord server it sits in a member's **Account** menu and beside a guest's **Sign in with Discord**; on a server without accounts, on the "Online as" line under **Start**. It opens the **Replays** dialog, with **Watch** and **Copy link** for each one. On a touch device it is on the Start screen only.

## Capabilities and Constraints

- Runs only the Windows standalone build. A player who owns only the Mac copy can't play.
- Runs in any desktop browser on any operating system. On a keyboard, arrow keys move, Ctrl or Enter selects, Shift goes back, and Esc opens the menu. A keyboard works on every device, including a tablet with one attached. Those are the default keys. A player changes them in the game's own Custom Keys screen, and the page's key legend and touch pad follow their choice (see [custom keys](CONTEXT.md)).
- Phones and tablets (touch devices) play on a public server over HTTPS, or over the LAN from a PC that runs the server with `--lan`, and open the page in Android Chrome or in Safari on iOS and iPadOS. The game plays in portrait with a touch pad under the game screen: a D-pad, with **Select** and **Back** side by side to its right, level with Up; **Keyboard** for typing; **Soft screen** to switch the screen finish; **Full board** to switch the board view; and **Fullscreen** where the browser supports it. Online modes work as on desktop. As of October 2026, the touch layout has been tested only in emulation, not on a real device.
- A **gamepad** ([CONTEXT.md](CONTEXT.md)) works on desktops and touch devices, on any page address: the D-pad or the left stick moves, the bottom button selects, the right button goes back, and Start opens the menu. Buttons go by position, so on a Nintendo pad the button labeled B selects. It also presses **Start** and answers the CPU players box. The page uses pads with the standard layout, and on Android also the ones Chrome reports with no layout name; it ignores others. Only one pad is used at a time, it never vibrates, and it has no chat button and no remapping. As of October 2026, nobody has played the page with a real gamepad.
- Every story and hero is open from the start only on a server that isn't `--public` ([ADR 0007](docs/adr/0007-patch-the-engine-in-memory.md)); elsewhere they are earned. A member's saved game (story progress, settings, and achievements) is kept on the server, so it follows them across browsers; a guest's stays in one browser ([ADR 0014](docs/adr/0014-a-members-saved-game-is-kept-on-the-server.md)).
- The game screen is drawn by the engine: at 240 × 320 on the phone's screen, and in a battle on the **Full board** ([board view](CONTEXT.md), the default on a desktop) at 420 × 378, the size of the original website's replay player, so the whole battlefield is on screen ([ADR 0017](docs/adr/0017-a-battle-gets-the-full-board-through-engine-hooks.md)). There, screens laid out for the phone show at 240 × 320 inside the engine's own [curtain](CONTEXT.md). **Classic**, the default on a phone or tablet, where a 420-pixel-wide board would come out smaller than the engine drew it, keeps every battle on the phone's screen. A change applies at once, in a battle too. The page frames the engine's screen and never redraws it. By default, the soft [screen finish](CONTEXT.md) smooths how the screen is shown. The player can switch to sharp, and the engine's output is never altered.
- The page is built with Vite and Svelte ([ADR 0013](docs/adr/0013-the-page-is-built-with-vite-and-svelte.md)). The server, the emulator, and the other modules Node imports stay plain JavaScript with no build step and no dependencies.
- The project's author runs a public server. The page is the same on every server and names none of them.
- Undecided: whether most players arrive through a static host or a server that serves the files. The page must handle both equally.

## Brand Commitments

- Name: Restart Generation. The page is an unofficial fan revival of Reset Generation (RedLynx, 2008); the game keeps its own name.
- Required notices: the page shows each of the following, word for word where quoted:
  - **Footer line, always:** "Unofficial fan revival of Reset Generation © 2008 RedLynx; not affiliated with RedLynx, Ubisoft or Nokia." and a credit to vyonizr.
  - **Footer line, where the player brings the files:** "Bring your own copy of the game." It doesn't appear on a server that sends the game files itself (`RG_SEND_GAME=1`).
  - **Notices dialog:** the footer's **Notices** button opens a dialog over the page. The dialog never opens by itself.
  - **Notices dialog, always:** "Restart Generation is an unofficial fan revival of Reset Generation © 2008 RedLynx. It is not affiliated with or endorsed by RedLynx, Ubisoft or Nokia, and their names and trademarks belong to their owners."
  - **Notices dialog, where the player brings the files:** the note "Windows standalone build only. Your files stay in this browser."
  - **Notices dialog, where a server sends the game files itself:** a statement that it does, with the admin's `RG_CONTACT` for a rights holder who wants them removed ([ADR 0018](docs/adr/0018-publishing-with-legal-guardrails.md)).
  - **Footer line, on a public server:** links to its **Terms** and **Privacy policy**.
  - **Under Start, on a public server:** "By playing online you accept the Terms and the Privacy policy.", with both linked. The name dialog for a new member says the same of saving the name.
  - **Notices dialog, on a public server:** links to its Terms and Privacy policy, which say what it keeps ([ADR 0021](docs/adr/0021-public-servers-publish-terms-and-a-privacy-policy.md)).
  - **Notices dialog, always:** that the project is free software under the GNU General Public License, version 3, with no warranty, linking to `/licenses.txt` and to the [source repository](https://github.com/vyonizr/restart-generation). On a server, the same line ends with the version it runs, such as "Version 0.1.2".
- No RedLynx or Ubisoft logos, and nothing that reads as an official RedLynx or Ubisoft site.

## Evidence on Hand

- No screenshots, art, or other assets derived from the game ship with the page or the repository ([ADR 0001](docs/adr/0001-players-bring-their-own-game-files.md)). The only game imagery is the engine's own screen, after the player's files load.
- Repository: [vyonizr/restart-generation](https://github.com/vyonizr/restart-generation), linked from the notices dialog.
- No player counts beyond the live online count, no testimonials, and no press. Don't invent them.

## Product Principles

1. The game leads. Everything around it helps a player reach **Start** and then gets out of the way.
2. The player's files stay theirs. Say plainly that the files stay in the browser, and never ship or imply anything derived from the game.
3. Honest about status. Say what works; don't claim official backing, a server the page isn't on, or support for the Mac build.
4. One page for both hosting modes. Choosing files and going straight to **Start** are both first-class paths.

## Accessibility & Inclusion

The game plays with a keyboard, with the touch pad on phones and tablets, or with a gamepad on either, so a player without a keyboard can play too, on a public server or on a LAN that a PC hosts. The touch pad's controls are real buttons with names for screen readers, and the gamepad version of the key legend names each button by its position and by its label on Xbox, PlayStation, and Nintendo pads. The rest of the page still scrolls and zooms on touch devices. If a device runs the game too slowly or lacks the memory for it, the page says so plainly.
