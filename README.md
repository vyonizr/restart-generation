# Restart Generation

<p align="center">
  <img src="web/public/favicon.svg" alt="Restart Generation Logo" width="128" height="128">
</p>

**Restart Generation** is an unofficial, community-driven fan project that faithfully revives the classic **Reset Generation** experience. Originally developed by RedLynx in 2008, Reset Generation was a foundational title for N-Gage 2.0 and Windows (PC). This project brings the game into the modern era via modern web standards.

---

## Features & Comparison

The following matrix highlights how Restart Generation modernizes and expands upon the original release:

| Feature | Original Game (2008) | Restart Generation |
| :--- | :--- | :--- |
| **Supported Platforms** | ✅ N-Gage 2.0 & Windows PC | ✅ Modern desktop browsers (Windows, macOS, Linux) & mobile browsers (Chrome on Android, Safari on iOS/iPadOS) |
| **Single Player** | ✅ Included | ✅ Included |
| **Online Multiplayer** | ⚠️ Offline (N-Gage Arena discontinued) | ✅ Supported via a custom Arena server (Discord sign-in or [guest accounts](docs/HOSTING.md#guests-and-members)) |
| **LAN Multiplayer** | 🚫 Not supported | ✅ Supported |
| **CPU Opponents (Friendly Matches)** | 🚫 Not supported | ✅ Supported |
| **Flexible Friendly Matches**| 🚫 Fixed phase time limits | ✅ Optional configuration to remove time limits |
| **Board Perspective** | 🚫 Partial view | ✅ Full board view during matches |
| **Match Replays** | ✅ Included | ✅ Enhanced with download options and highlight timestamps |

---

## Prerequisites

Before setting up the project, ensure you have the following components:

*   **Game Assets:** A valid copy of the original Windows version of the game (either as a `.zip` archive or an extracted folder).
*   **Runtime Environment:** [Node.js](https://nodejs.org) version **22.13 or later** to run the backend server.
*   **Web Browser:** Any modern desktop or mobile browser. For mobile setups, see the [Mobile & Remote Devices](#mobile--remote-devices) section.

---

## Getting Started

Follow these steps to set up your local development or play environment:

1. **Download and Extract:** Download this repository (**Code > Download ZIP**) and extract the contents to your preferred directory.
2. **Navigate to the Project:** Open your terminal or command prompt and change directories into the root folder of the project.
3. **Install Dependencies:** Run the following command once to install required packages:
   ```bash
   npm install
   ```
4. **Launch the Server:** Start the local server application:
   ```bash
   npm start
   ```
5. **Access the Game:** Open your web browser and navigate to `http://localhost:8080/`, then select **Start**.
6. **Provide Game Files:** When prompted by the browser, select your original game `.zip` file or extracted folder.
7. **Shutdown:** To stop the local server at any time, press `Ctrl + C` in your terminal.

*Note: By default on local servers, all stories and heroes—including the Aggressor—are unlocked immediately.*

### Optional: Automate Asset Loading & Enable AI Players

Configuring the game path variables automates asset delivery to connected clients and enables CPU players in custom online rooms:

1. Duplicate the template environment file:
   ```bash
   cp .env.example .env
   ```
2. Open the newly created `.env` file and define the absolute path to your game assets on the `RG_GAME` line:
   ```env
   RG_GAME=D:/Downloads/ResetGeneration-Standalone.zip
   ```
3. Restart the server (`Ctrl + C` followed by `npm start`) to apply changes.

Once configured, the server automatically serves game files to connecting devices. Public internet servers (`--public`) restrict this distribution via a secure download code system (see [Run a server](docs/HOSTING.md#send-the-game-with-a-download-code)).

---

## Controls

The game supports multiple input methods. Keybindings can be reconfigured ingame via **Settings > Custom Keys**.

| Action | Keyboard (Default) | Touch Interface (Mobile) | Gamepad |
| :--- | :--- | :--- | :--- |
| **Move** | Arrow Keys | D-pad | D-pad / Left Stick |
| **Select** | `Ctrl` / `Enter` | **Select** Button | Bottom Action Button |
| **Go Back** | `Shift` | **Back** Button | Right Action Button |
| **Open Menu** | `Esc` | **Back** Button (In-battle) | Start Button |
| **Chat** | `E` | **Keyboard** Icon -> Chat Key | *Not Supported* |
| **Text Entry**| Alpha-numeric Keys | **Keyboard** Overlay | *Not Supported* |

---

## Online Play Mechanics

### Identity Management
*   **Standard Servers:** Players are assigned a randomized moniker (e.g., `Guest123456`) on the Start screen. You can modify this using **Set name** or **Change name**.
*   **Discord-Enabled Servers:** Features secure authorization allowing you to log in with your Discord account to save progress permanently. 
*   *For implementation specifics, review the [Guests and members](docs/HOSTING.md#guests-and-members) documentation.*

### CPU Players
If a friendly room contains 2 or 3 human players, the empty slots can be filled by AI bots. This feature requires a pre-configured server game path (see [Optional Configuration](#optional-automate-asset-loading--enable-ai-players)).
*   To activate, click **Start** in your room and select **Yes** when prompted to fill empty seats. 
*   Matchmaking rooms require a minimum of two human players to display the **Start** option. For solo play against bots, utilize the **Arcade Mode** in Single-Player. CPU players are excluded from Ranked matches.

### Battle Templates
Online matches rely strictly on predefined match structures. Generating these templates requires a Windows environment, Visual Studio, and the legacy Java client. See [Battle templates](docs/HOSTING.md#battle-templates) for creation details.

---

## Mobile & Remote Devices

You can join public instances or host games across your Local Area Network (LAN) for cross-device play.

### Local Network (LAN) Setup
Ensure your host PC and remote devices (phones, tablets, other computers) are connected to the same subnet (e.g., the same home Wi-Fi network).

1. Execute the dedicated LAN initialization command on your host PC:
   ```bash
   npm run start:lan
   ```
2. The terminal output will list unique network addresses for available interfaces.
3. Open the corresponding address on your remote device browser (e.g., `http://192.168.1.20:8080/`).

### Public Web Server Setup
1. Navigate directly to the public server domain (e.g., `https://play.example.com/`) on your mobile browser.
2. If the host server does not distribute the assets automatically, upload your local copy of the game `.zip` file when prompted.
3. Tap **Start** to interact using the built-in virtual touchpad overlay.

---

## Troubleshooting

*   **Remote devices cannot connect to the LAN server:** This is usually caused by the host machine's firewall rules. Open PowerShell as an Administrator on your Windows host and run:
    ```powershell
    New-NetFirewallRule -DisplayName "Restart Generation" -Direction Inbound -Protocol TCP -LocalPort 8080,8976 -Action Allow -Profile Private
    ```
    *Note: Ensure your current network profile is set to **Private** in Windows Network Settings for this rule to apply.*
*   **Error: "Vite is not installed" during startup:** The project dependencies are missing. Run `npm install` in the project root to resolve this.
*   **Online matches fail to initialize:** The server lacks a valid battle template matching the specific player count in the room. See [Online battles need battle templates](#battle-templates).
*   **iOS/iPadOS assets keep requesting re-upload:** Apple Safari purges local browser cache data for unvisited sites after roughly 7 days of inactivity. Re-select the game files to resume play.

---

## Technical & Contribution Reference

*   **Architecture & Protocol:** Detailed specifications are available covering the core engine [protocol](docs/protocol.md), [architecture decision records (ADRs)](docs/adr/), [reverse engineering notes](docs/re/), the [emulator implementation](shared/emu), and the web client [source logic](web/src).
*   **Asset & Media Generation:** Visual assets can be compiled locally via the automated framework. Execute `npm run showcase` to record interface captures to `tmp/showcase/` or output frame comparisons via `npm run showcase -- --stills`. These generated assets are excluded from version control metrics ([ADR 0036](docs/adr/0036-showcase-assets-are-generated-locally-and-never-committed.md)).
*   **Contributions:** Guidelines and compliance requirements regarding code formatting and asset exclusions can be reviewed in [CONTRIBUTING.md](CONTRIBUTING.md).

---

## Legal & Compliance

Restart Generation is an independent, non-commercial fan revival project. It maintains no affiliation with, sponsorship from, or endorsement by RedLynx, Ubisoft, Nokia, or the N-Gage brand ecosystem. All product names, logos, and brands remain the property of their respective owners. Reset Generation (2008) was made by RedLynx, now part of Ubisoft, and published by Nokia, which is reported to hold its rights. Its soundtrack, by 8 Bit Weapon, is Nokia's too, so downloaded replays and showcase clips leave it out ([ADR 0041](docs/adr/0041-footage-and-showcase-clips-leave-out-the-soundtrack.md)).

This source repository distributes **no proprietary game assets**, copyrighted binaries, decompiled logic, audio assets, textures, or level data. Players provide their own assets via the Windows standalone build layout. If a remote administrator elects to host and serve assets directly ([ADR 0001](docs/adr/0001-players-bring-their-own-game-files.md)), they assume full legal liability and must declare an active point of contact (`RG_CONTACT`) for rights inquiries. 

The analytical data in `docs/re/` represents clean-room observations of engine and Arcade behaviors written entirely in the contributors' own words. The platform communication stack is built natively based on clean-room specifications documented in `docs/protocol.md` to establish interoperability between legacy clients and modern environments.

The underlying codebase is distributed as open-source software under the terms of the **GNU General Public License, version 3 or later** ([`LICENSE`](LICENSE)). Included fonts and framework libraries are governed by their respective original licensing terms ([Third-party notices](THIRD_PARTY_NOTICES.md), also accessible runtime via `/licenses.txt`). Code-level compliance formatting rules are actively validated via `npm run legal-check` as detailed in [Keep the legal risk of this project low](docs/LEGAL.md).

For copyright claims, digital removals, or related inquiries regarding this open repository or the primary demonstration platform, please [open an issue](https://github.com/vyonizr/restart-generation/issues) or submit a formal request via GitHub's standard DMCA channels for prompt resolution.

---

## Privacy Policy

Public production nodes automatically host formal Terms of Service at `/terms` and Privacy Policy data at `/privacy` linked within the deployment footer layout ([ADR 0021](docs/adr/0021-public-servers-publish-terms-and-a-privacy-policy.md)). 

*   **Data Minimization:** System instances utilizing Discord authentication retain the unique Snowflake ID, public handle, match metrics, friends lists, and state files. 
*   **Guest Lifecycle:** Unauthenticated guest profiles automatically expire and are purged from database records exactly 24 hours following their last recorded network activity.
*   **Tracking:** The engine logs zero IP addresses and explicitly declines tracking user email records or external avatars. Users can access data management utilities directly via the account interface to trigger self-service archival exports (**Download my data**) or prompt account removal (**Delete my account**). Server operators can manually terminate individual entries via terminal commands using `npm run delete-user`.
*   **Visitor statistics:** Off by default. An admin of a public server can turn them on with `RG_STATS=1` ([ADR 0043](docs/adr/0043-visitor-statistics-are-counted-by-the-gateway-itself.md)): the server keeps daily counts of page opens, unique visitors, referring sites, countries and kinds of device, each on its own, for 25 months, and only its admin sees them with `npm run stats`. No cookies, and no IP address is written down. A browser sending Global Privacy Control is never counted, and the Privacy policy's **Don't count my visits** button opts a browser out.