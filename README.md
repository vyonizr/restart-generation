<p align="center"><img src="web/public/favicon.svg" alt="Restart Generation" width="128" height="128"></p>

# Restart Generation

Play Reset Generation (RedLynx, 2008) again, in your browser, alone or online.

Nokia shut down N-Gage Arena, the online service of the game. Restart Generation replaces it. The original game runs unchanged in your browser, and a small server on your PC gives back online play: Quick Match, rankings, friends, rooms, and achievements.

This project does not include the game. You must use your own copy.

## What you need

- **Your copy of the game**: the Windows standalone build, as `ResetGeneration-Standalone.zip` or as the extracted `ResetGeneration` folder.
- **[Node.js](https://nodejs.org) 22.13 or later**: it runs the server.
- **A desktop browser**: on Windows, macOS, or Linux. A phone or tablet can play too: see [Play on other devices](#play-on-other-devices).

## Start playing

1. Download this project (**Code > Download ZIP**, and then extract it) and open a terminal in its folder.
2. Run `npm install`. Do this one time only.
3. Run `npm start`. The first start takes longer, because it builds the page.
4. Open <http://localhost:8080/> and select **Start**.
5. The page asks for your game files. Choose the `.zip` or the game folder. The browser keeps them, so it asks one time only.

To start again later, do steps 3 and 4.

Every story and hero is open from the start on your own server.

### Optional: tell the server where the game is

Do this to get CPU players in online rooms, and battle results that the game's engine decides. Without it, the server guesses who won.

1. Copy `.env.example` to `.env`.
2. Put the path to your game on the `RG_GAME` line:

   ```sh
   RG_GAME=D:/Downloads/ResetGeneration-Standalone.zip
   ```

   Replace the path with the location of your `.zip` file or game folder.
3. Optional: to stop other devices from asking for the game files, add this line too. The server then sends your copy to every device that opens the page.

   ```sh
   RG_SEND_GAME=1
   ```

4. Stop the server (press <kbd>Ctrl</kbd>+<kbd>C</kbd>) and run `npm start` again.

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

The first gamepad you press works on any device, and only one gamepad is used at a time.

To use other keys, open **Settings > Custom Keys** in the game. You can change the keys for moving, Select, Back, and Chat; <kbd>Enter</kbd> always selects and <kbd>Esc</kbd> always goes back. The list under the game screen shows the keys you chose, and the touch pad's D-pad follows them. Your keys are part of your saved game.

The game screen is soft by default, like the display of a 2008 phone. For sharp pixels, select **Soft screen** under the game screen (on the touch pad, the grid icon beside **Keyboard**). The browser remembers your choice.

## Play online

In the main menu, choose one of the following:

- **Quick Match** for a ranked match with 2 to 4 players. The result changes your fame and stats.
- **Online** for friendly matches in a room with your friends. The result changes no stats. The game lets you make a room only when you have at least one friend.

### Your name

The first time you go online, the page asks for a name. It suggests a random one, such as `Guest123456`.

- There are no passwords. Your name is your account.
- To keep your stats in a different browser, type the same name there.
- Anyone can type any name. If a second person logs in with your name, your session stops.
- To change your name, choose **Change name** under **Start**. A new name starts with new stats.
- Names such as `CPU_1` are for CPU players. You can't use them.

The browser keeps your name, settings, and achievements.

Some public servers use Discord sign-in instead. There, you play at once as a guest, and you can sign in with Discord to keep your account. For more information, see [Guests and members](docs/HOSTING.md#guests-and-members).

### CPU players

In a friendly match, CPU players can fill the empty seats. The server must know where the game is (see [Optional: tell the server where the game is](#optional-tell-the-server-where-the-game-is)).

1. Select **Start** in your room.
2. Choose the CPU level:
   - If you're alone in the room, choose **CPU** or **Expert**.
   - If 2 or 3 people are in the room, the page asks "Fill the empty seats with CPU players?" Choose **CPU** or **Expert**. To play with people only, choose **No**.

   To move between the choices, use Left and Right (or the D-pad), and press Select. Back chooses **No**, or, when you're alone, cancels the start. You can also click a choice.
3. Wait about 15 seconds. The CPU players start with the battle.

**CPU** is the AI of the game, with a random hero. **Expert** chooses its hero from a list of strong heroes and otherwise plays like **CPU**.

Ranked matches never get CPU players.

### Online battles need battle templates

Your server starts an online battle only from a battle template. A fresh copy of this project has none, because the templates come from the game. If a match never starts, the server log shows `no battle template for N players`. To make templates, you need Windows, Visual Studio, and the original Java client. For more information, see [Battle templates](docs/HOSTING.md#battle-templates).

## Play on other devices

A phone, tablet, or other computer can play on a public server, or on your own network from a PC that runs the server. Phones and tablets play in portrait, with a touch pad under the game screen. A keyboard or a gamepad also works.

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

If you hold rights to something here and want it removed from this repository, or from the server its author runs, [open an issue](https://github.com/vyonizr/restart-generation/issues), or use GitHub's own takedown process. We respond promptly. Another admin's server shows its own contact in its Notices dialog.

## Privacy

A server with Discord sign-in keeps a member's Discord ID, in-game name, stats, friend links, and saved game. It keeps a guest's name, stats, and friend links until the account is wiped 24 hours after its last activity. It keeps no email address and no avatar. **Delete my account** removes a player's record, and an admin can delete any account with `npm run delete-user`. The page says this in its footer.
