# Restart Generation

<p align="center">
  <img src="web/public/favicon.svg" alt="Restart Generation logo" width="128" height="128">
</p>

Restart Generation is an unofficial fan project that revives *Reset Generation*
in a web browser. RedLynx developed Reset Generation in 2008 for N-Gage 2.0 and
Windows (PC).

## Features and comparison

The following table compares the original game with Restart Generation:

| Feature | Original game (2008) | Restart Generation |
| :--- | :--- | :--- |
| Supported platforms | N-Gage 2.0 and Windows PC | Desktop browsers (Windows, macOS, Linux) and mobile browsers (Chrome on Android, Safari on iOS and iPadOS) |
| Single player | Yes | Yes |
| Online multiplayer | No. N-Gage Arena was discontinued. | Yes, through a custom Arena server. Players sign in with Discord or use [guest accounts](docs/HOSTING.md#guests-and-members). |
| LAN multiplayer | No | Yes |
| CPU opponents in friendly matches | No | Yes |
| Phase time limits in friendly matches | Fixed | Optional |
| Board view during matches | Partial | Full |
| Match replays | Yes | Yes, with download options and highlight timestamps |

## Prerequisites

Before you start, make sure that you have the following:

*   **Game files:** A copy of the original Windows version of the game, either
    as a zip file or as an extracted folder.
*   **Node.js:** [Node.js](https://nodejs.org) version 22.13 or later, which
    runs the server.
*   **Web browser:** A desktop or mobile browser. For mobile devices, see
    [Play on other devices](#play-on-other-devices).

## Start playing

To run the game on your own computer, do the following:

1.  Select **Code > Download ZIP** on the repository page, and then extract the
    archive to a directory of your choice.
1.  In a terminal, go to the root directory of the project.
1.  Install the dependencies. You need to do this only once.

    ```bash
    npm install
    ```

1.  Start the server:

    ```bash
    npm start
    ```

1.  In your browser, go to `http://localhost:8080/`, and then select **Start**.
1.  When the browser prompts you, select your game zip file or the extracted
    game folder.

To stop the server, press <kbd>Ctrl</kbd>+<kbd>C</kbd> in the terminal.

On a local server, all stories and heroes, including the Aggressor, are
unlocked.

### Optional: Load the game files automatically and enable CPU players

If you set the path to the game files, the server sends them to connecting
devices and can add CPU players to custom online rooms. To set the path, do the
following:

1.  Copy the template environment file:

    ```bash
    cp .env.example .env
    ```

1.  In the `.env` file, set `RG_GAME` to the absolute path of your game files:

    ```env
    RG_GAME=D:/Downloads/ResetGeneration-Standalone.zip
    ```

1.  Press <kbd>Ctrl</kbd>+<kbd>C</kbd> to stop the server, and then run
    `npm start` to restart it.

A server that you start with the `--public` flag limits this distribution with
a download code. For more information, see
[Send the game with a download code](docs/HOSTING.md#send-the-game-with-a-download-code).

## Controls

The following table lists the default controls for each input method. To change
the keyboard controls, go to **Settings > Custom Keys** in the game.

| Action | Keyboard | Touch | Gamepad |
| :--- | :--- | :--- | :--- |
| Move | Arrow keys | D-pad | D-pad or left stick |
| Select | <kbd>Ctrl</kbd> or <kbd>Enter</kbd> | **Select** button | Bottom action button |
| Go back | <kbd>Shift</kbd> | **Back** button | Right action button |
| Open the menu | <kbd>Esc</kbd> | **Back** button, during a battle | Start button |
| Chat | <kbd>E</kbd> | **Keyboard** icon, and then **Chat Key** | Not supported |
| Enter text | Letter and number keys | **Keyboard** overlay | Not supported |

## Online play

### Player names

*   **Servers without Discord sign-in:** The **Start** screen assigns you a
    random name, such as `Guest123456`. To change it, select **Set name** or
    **Change name**.
*   **Servers with Discord sign-in:** You sign in with your Discord account, and
    the server saves your progress.

For more information, see
[Guests and members](docs/HOSTING.md#guests-and-members).

### CPU players

If a friendly room has 2 or 3 human players, CPU players can fill the empty
seats. This feature requires the `RG_GAME` setting. For more information, see
[Optional: Load the game files automatically and enable CPU players](#optional-load-the-game-files-automatically-and-enable-cpu-players).

To add CPU players, select **Start** in your room, and then select **Yes** when
the game asks whether to fill the empty seats.

Keep the following in mind:

*   A matchmaking room shows the **Start** option only when it has at least two
    human players. To play alone against CPU players, use **Arcade Mode** in
    single player.
*   Ranked matches don't include CPU players.

### Battle templates

Online matches use predefined battle templates. To create templates, you need
Windows, Visual Studio, and the legacy Java client. For more information, see
[Battle templates](docs/HOSTING.md#battle-templates).

## Play on other devices

You can play on a public server, or host a game on your local area network
(LAN) for other devices.

### Host a game on your LAN

Your host computer and the other devices, such as phones, tablets, and
computers, must be on the same subnet, for example the same Wi-Fi network.

1.  On the host computer, start the server in LAN mode:

    ```bash
    npm run start:lan
    ```

    The terminal lists the network address of each interface.

1.  On the other device, open one of the addresses in a browser, for example
    `http://192.168.1.20:8080/`.

### Join a public server

1.  In your mobile browser, go to the address of the server, for example
    `https://play.example.com/`.
1.  If the server doesn't send the game files, select your game zip file when
    the browser prompts you.
1.  Tap **Start**.

## Troubleshooting

The following list describes common problems and their solutions:

*   **Remote devices can't connect to the LAN server.** The firewall on the
    host computer is the usual cause. On a Windows host, open PowerShell as an
    administrator, and then run the following command:

    ```powershell
    New-NetFirewallRule -DisplayName "Restart Generation" -Direction Inbound -Protocol TCP -LocalPort 8080,8976 -Action Allow -Profile Private
    ```

    The rule applies only to networks that Windows marks as **Private**. To
    check the profile of your network, open the Windows network settings.
*   **Startup fails with the error "Vite is not installed".** The project
    dependencies are missing. In the project root, run `npm install`.
*   **Online matches don't start.** The server has no battle template for the
    number of players in the room. For more information, see
    [Battle templates](#battle-templates).
*   **iOS or iPadOS keeps asking for the game files again.** Safari removes the
    stored data of a site that you haven't visited for about 7 days. Select the
    game files again.

## Developer reference

*   **Architecture and protocol:** See the [protocol](docs/protocol.md), the
    [architecture decision records (ADRs)](docs/adr/), the
    [reverse engineering notes](docs/re/), the [emulator](shared/emu), and the
    [web client source](web/src).
*   **Showcase assets:** To record interface captures to `tmp/showcase/`, run
    `npm run showcase`. To output frame comparisons, run
    `npm run showcase -- --stills`. These generated assets aren't committed to
    the repository. For more information, see
    [ADR 0036](docs/adr/0036-showcase-assets-are-generated-locally-and-never-committed.md).
*   **Contributions:** For the code formatting rules and the rules about game
    material, see [CONTRIBUTING.md](CONTRIBUTING.md).

## Legal

Restart Generation is an independent, noncommercial fan project. RedLynx,
Ubisoft, Nokia, and the N-Gage brand don't sponsor, endorse, or have any
affiliation with it. All product names, logos, and brands belong to their
respective owners.

RedLynx, which is now part of Ubisoft, made Reset Generation (2008), and Nokia
published it. Nokia is reported to hold its rights, including the rights to the
soundtrack by 8 Bit Weapon. For this reason, downloaded replays and showcase
clips leave out the soundtrack. For more information, see
[ADR 0041](docs/adr/0041-footage-and-showcase-clips-leave-out-the-soundtrack.md).

This repository doesn't distribute game assets, copyrighted binaries,
decompiled code, audio, textures, or level data. Players provide their own game
files in the layout of the Windows standalone build. A server administrator can
choose to host and send the game files (see
[ADR 0001](docs/adr/0001-players-bring-their-own-game-files.md)). An
administrator who does so takes full legal responsibility and must set
`RG_CONTACT` to a contact for rights inquiries.

The notes in `docs/re/` are clean-room observations of engine and Arcade
behavior, written in the contributors' own words. The communication layer is
built from the clean-room specification in `docs/protocol.md`, so that the
legacy clients can work with current environments.

The code is open source software under the GNU General Public License, version
3 or later (see [`LICENSE`](LICENSE)). Included fonts and libraries have their
own licenses. For more information, see
[Third-party notices](THIRD_PARTY_NOTICES.md), which the server also provides at
`/licenses.txt`. The command `npm run legal-check` checks the repository against
the rules in
[Keep the legal risk of this project low](docs/LEGAL.md).

To report a copyright claim, request a removal, or ask about this repository or
the demonstration server, [open an issue](https://github.com/vyonizr/restart-generation/issues)
or use GitHub's DMCA process.

## Privacy policy

A public server publishes its Terms of Service at `/terms` and its Privacy
policy at `/privacy`, and links to both in the page footer. For more
information, see
[ADR 0021](docs/adr/0021-public-servers-publish-terms-and-a-privacy-policy.md).

*   **Data minimization:** A server with Discord sign-in keeps your Discord
    Snowflake ID, public handle, match statistics, friends list, and saved
    games.
*   **Guest lifecycle:** A guest account expires, and the server deletes it, 24
    hours after the last recorded network activity of the guest.
*   **Tracking:** The server doesn't log IP addresses, and it doesn't store
    email addresses or external avatars. In the account interface, you can
    select **Download my data** to export your data or **Delete my account** to
    remove your account. An administrator can delete an account by running
    `npm run delete-user`.
*   **Visitor statistics:** Visitor statistics are off by default. An
    administrator of a public server can turn them on by setting `RG_STATS=1`.
    The server then keeps the following daily counts, each on its own, for 25
    months: page opens, unique visitors, referring sites, countries, and kinds
    of device. Only the administrator can view the counts, by running
    `npm run stats`. The server sets no cookies and doesn't write down IP
    addresses. It doesn't count a browser that sends Global Privacy Control. To
    opt a browser out, select **Don't count my visits** in the Privacy policy.
    For more information, see
    [ADR 0043](docs/adr/0043-visitor-statistics-are-counted-by-the-gateway-itself.md).
