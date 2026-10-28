---
status: accepted
---

# The sign-in button carries Discord's own logo

Every button that starts Discord sign-in (ADR 0011) said "Sign in with Discord" in words only. They now take the Discord logo, as Discord's [branding guidelines for sign-in buttons](https://docs.discord.com/developers/discord-social-sdk/design-guidelines/branding-guidelines) show it. Discord offers no ready-made web button for OAuth2 sign-in, so the page draws the button itself, around the logo.

This logo breaks rule 5 of `docs/LEGAL.md`. It is Discord's trademark and comes under no license we can ship: Discord's [brand page](https://discord.com/branding) asks for permission "except as permitted here", and the Developer Terms license its marks to whoever registers the application, which is each server's admin, not this repository. Simple Icons doesn't solve this either: it says the icons it collects aren't all CC0. This ADR is the exception the rule asks for, and it covers this one use only. Discord's marks may appear where they name the service a player signs in with, and nowhere else: the footer's **Join the Discord** link, the admin's community link, stays text.

- **The files.** Discord's symbol, the "Clyde" mark without the word "Discord", in its White and Black files from the brand kit on [discord.com/branding](https://discord.com/branding). Both are committed unchanged under `web/src/assets/`, with entries in `tools/legal-allow.json` and in `THIRD_PARTY_NOTICES.md` saying they aren't covered by the GNU General Public License. Discord asks that the logo not be edited, recolored or redrawn, so it stays in its own files and isn't traced into a component's markup.
- **The style.** Discord's **Flexible** button: the page's own buttons, in their own font and colors. The symbol comes before the words "Sign in with Discord", as the replay page's **Share** and **Download replay** put their icons before their labels. That reverses Discord's example, which puts its words first and then the full logo, so that the button keeps one typeface. The word "Discord" beside the symbol keeps the brand clearly visible, the condition Discord sets for using the symbol alone. The symbol is white, and black where a button turns white (a primary's hover, a pressed menu item), because Flexible allows only those two colors; a crimson symbol would be a recolor. The symbol is decorative to screen readers, so the button's name stays "Sign in with Discord". Discord's **Blurple**, **Light**, and **Dark** buttons are rejected: Blurple adds a second accent color, and Dark and Light round their corners, against `DESIGN.md`.
- **Where.** On the four buttons that start sign-in: the desktop header, the touch who chip's menu, the notice for a player the server made no guest for, and the notice after a guest earns fame. The header's button stays secondary, so it doesn't compete with **Start**. Below `760px` the header has no room for the whole label, and its button shortens to the symbol and "Sign in", as it shortened to "Sign in" before. There the symbol stands without the word, relying on Discord's other condition, that the brand is "well established elsewhere": the guest notices and the **Replays** note say "Sign in with Discord". That is our reading of Discord's guidelines, not Discord's.
- **Size.** The symbol is as tall as the label's capitals and sits on its baseline, `0.5em` before the words, so that the label's baseline and cap height line up with it as Discord asks.
- **Nothing implies backing.** The page already says it's an unofficial fan revival. The logo names the sign-in provider and claims no partnership with Discord, as Discord's Developer Terms require.

## Considered options

- **Load the logo from Discord's servers when the page runs.** Rejected. Nothing would be committed, but every visitor's browser would contact Discord before signing in, and the Privacy policy would have to say so.
- **Keep the text-only button.** Rejected. Players recognize the logo faster than the words, and Discord's guidelines expect sign-in buttons to carry it.

## Consequences

- If Discord or a rights holder objects, delete the file and its entries; the buttons fall back to their words.
- The logo is the only third-party mark on the page. A second sign-in provider would need its own decision.
- This is not legal advice.
