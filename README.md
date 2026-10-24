<p align="center"><img src="web/public/favicon.svg" alt="Restart Generation" width="128" height="128"></p>

# Restart Generation

Restart Generation is an unofficial fan project that revives the Reset Generation experience as faithfully as possible. Reset Generation is a 2008 video game that RedLynx developed for N-Gage 2.0 and Windows (PC).

## Compared with the original game

| Feature | Original game | Restart Generation |
| --- | --- | --- |
| Platforms | ✅ N-Gage 2.0 phones and Windows | ✅ A modern browser on Windows, macOS, or Linux, and Chrome on Android or Safari on iOS and iPadOS |
| Single player | ✅ | ✅ |
| Online multiplayer | ⚠️ The N-Gage Arena service shut down | ✅ A replacement Arena server, with Discord sign-in or a [guest account](docs/HOSTING.md#guests-and-members) |
| LAN multiplayer | 🚫 | ✅ |
| CPU players in friendly matches | 🚫 | ✅ |
| Friendly matches without phase time limits | 🚫 | ✅ Optional config |
| Full board view in matches | 🚫 | ✅ |
| Replays | ✅ | ✅ Downloadable and with highlight timestamps |

## Prerequisites

- **Your Windows copy of the game**, as its `.zip` file or the extracted folder.
- **[Node.js](https://nodejs.org) 22.13 or later** to run the server.
- **A browser** on Windows, macOS, or Linux. A phone or tablet can play too: see [Play on other devices](#play-on-other-devices).

## Start playing

1. Download this project (**Code > Download ZIP**), and then extract it.
2. Open a terminal in the project folder.
3. Run `npm install`. Do this one time only.
4. Run `npm start`.
5. Open <http://localhost:8080/> and select **Start**.
6. When the page asks for your game files, choose the `.zip` or the game folder.
7. To stop the server, press <kbd>Ctrl</kbd>+<kbd>C</kbd> in the terminal.

On your own server, every story and every hero, including the Aggressor, is unlocked from the start.

### Optional: set the game location

Do this to get CPU players in the rooms that you make with **Online > Create Room**, and so that players' devices don't ask for the game files:

1. Copy `.env.example` to `.env`.
2. Put the path to your game on the `RG_GAME` line:

   ```sh
   RG_GAME=D:/Downloads/ResetGeneration-Standalone.zip
   ```

   Replace the path with the location of your `.zip` file or game folder.
3. Stop the server (press <kbd>Ctrl</kbd>+<kbd>C</kbd>) and run `npm start` again.

Your server then sends the game to every device that opens its page. A server on the internet (`--public`) sends it only to the people you give its download code (see [Run a server](docs/HOSTING.md#send-the-game-with-a-download-code)).

## Controls

The following table lists the default controls:

| Action | Keyboard (default keys) | Touch pad (phone or tablet) | Gamepad |
| --- | --- | --- | --- |
| Move | Arrow keys | D-pad | D-pad or left stick |
| Select | <kbd>Ctrl</kbd> or <kbd>Enter</kbd> | **Select** | Bottom button |
| Go back | <kbd>Shift</kbd> | **Back** | Right button |
| Open the menu | <kbd>Esc</kbd> | **Back** (in a battle) | Start |
| Chat | <kbd>E</kbd> | **Keyboard**, and then the chat key | None |
| Type text | Your keyboard | **Keyboard** | None |

To change the keys, open **Settings > Custom Keys** in the game.

## Play online

### Your name

The first time you go online, the game asks for a name and suggests a random one, such as `Guest123456`. You can sign in with Discord to keep your account. For more information, see [Guests and members](docs/HOSTING.md#guests-and-members).

### CPU players

In a friendly match, CPU players can fill the empty seats. They need the game location on your server: see [Optional: set the game location](#optional-set-the-game-location).

1. Select **Start** in your room.
2. Choose the CPU level:
   - If you're alone in the room, choose **CPU** or **Expert**.
   - If 2 or 3 people are in the room, the page asks "Fill the empty seats with CPU players?" Choose **CPU** or **Expert**. To play with people only, choose **No**.

   To move between the choices, use Left and Right (or the D-pad), and press Select. Back chooses **No**, or, when you're alone, cancels the start. You can also click a choice.
3. Wait about 15 seconds. The CPU players start with the battle.

**CPU** is the AI of the game, with a random hero. **Expert** chooses its hero from a list of strong heroes and otherwise plays like **CPU**.

Ranked matches don't have CPU players.

### Online battles need battle templates

Your server starts an online battle only from a battle template. To make templates, you need Windows, Visual Studio, and the original Java client. For more information, see [Battle templates](docs/HOSTING.md#battle-templates).

## Play on other devices

A phone, tablet, or other computer can play on a public server, or on LAN from a PC that runs the server.

### On your own network

Both devices must be on the same private network, such as your home Wi-Fi.

1. Run the server with `npm run start:lan` (not `npm start`).

   The server shows one `http://ADDRESS:8080/` line for each network, with the name of the network. `ADDRESS` is your PC's address on that network.
2. On the other device, open the address of the network that both devices use, such as `http://192.168.1.20:8080/`.

### On a public server

1. On the phone or tablet, open the server's address, such as `https://play.example.com/`, as you would on a desktop.
2. Unless the server sends the game, the page asks for your game files: choose the `.zip` on the device.
3. Select **Start**, and play with the touch pad.

To play with friends over the internet, see [Run the server with Node.js](docs/HOSTING.md#run-the-server-with-nodejs).

## Problems

**The other device can't connect.** Windows Firewall probably blocks it. Open PowerShell as an administrator and run the following command:

```powershell
New-NetFirewallRule -DisplayName "Restart Generation" -Direction Inbound -Protocol TCP -LocalPort 8080,8976 -Action Allow -Profile Private
```

This rule works only on a private network. If Windows shows your network as public, change it to private in Windows Settings.

**`npm start` says that Vite is not installed.** Run `npm install`.

**An online match never starts.** Your server has no battle template for that number of players. See [Online battles need battle templates](#online-battles-need-battle-templates).

**An iPhone or iPad asks for the game files again.** Safari can delete them when you don't visit for about 7 days. Choose them again.

## More

- [Run a server](docs/HOSTING.md): Docker, Discord sign-in, battle templates, account deletion, and the original Java client.
- [Deploy to a virtual private server (VPS)](docs/DEPLOY.md): the whole procedure for a public server.
- How it works: [the protocol](docs/protocol.md), the [architecture decision records (ADRs)](docs/adr/), [notes on the original game](docs/re/), [the emulator](web/emu), and [the page](web/ui).
- [Contributing](CONTRIBUTING.md): how to help, and what you can't commit.

## Legal

Restart Generation is an unofficial fan revival of Reset Generation (RedLynx, 2008). It isn't affiliated with or endorsed by RedLynx, Ubisoft, or Nokia, and their names, and N-Gage, belong to their owners.

This repository holds no game files and none of the game's code, art, sound, or text: no decompiled code, and no level or battle data. Each player brings their own copy of the Windows standalone build, unless the admin of a server chooses to send one from it ([ADR 0001](docs/adr/0001-players-bring-their-own-game-files.md)). That admin answers for it, and must publish where a rights holder can ask for its removal (`RG_CONTACT`). The notes in `docs/re/` describe how the engine and Arcade behave, in our own words, and the protocol code is written from `docs/protocol.md` so that the original clients and this server can talk to each other.

The code here is free software under the GNU General Public License, version 3 or later ([`LICENSE`](LICENSE)). The fonts and the Svelte runtime keep their own licenses ([Third-party notices](THIRD_PARTY_NOTICES.md), also served as `/licenses.txt`). What you can and can't commit is in [Keep the legal risk of this project low](docs/LEGAL.md); `npm run legal-check` enforces the file-level rules.

If you hold rights to something here and want it removed from this repository, or from the server its author runs, [open an issue](https://github.com/vyonizr/restart-generation/issues), or use GitHub's own takedown process. We respond promptly. Every public server names its admin and a contact on its Terms and Privacy policy pages.

## Privacy

Every public server publishes a Privacy policy at `/privacy` and Terms at `/terms`, linked from the page's footer, filled in with its admin, its hosting provider, and its contact ([ADR 0021](docs/adr/0021-public-servers-publish-terms-and-a-privacy-policy.md)). In short: a server with Discord sign-in keeps a member's Discord ID, name, stats, friends, and saved game, and a guest's name, stats, and friends until the account is wiped 24 hours after its last activity. It keeps no email address and no avatar, and writes no IP address to its logs. **Download my data** and **Delete my account** in the Account menu let a member get or remove their record, and an admin can delete any account with `npm run delete-user`.
