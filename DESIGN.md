---
name: Restart Generation
description: The original 2008 game, right in your browser (again).
colors:
  crimson: "#a50034"
  ink-0: "#11141b"
  ink-1: "#181c26"
  ink-2: "#282b35"
  ink-3: "#373b49"
  white: "#ffffff"
  light-2: "#e2e4ec"
  light-3: "#c6cad7"
  screen-black: "#000000"
typography:
  display:
    fontFamily: "Anton, 'Arial Narrow', sans-serif"
    fontSize: "15cqi"
    fontWeight: 400
    lineHeight: 0.9
  headline:
    fontFamily: "Anton, 'Arial Narrow', sans-serif"
    fontSize: "30px"
    fontWeight: 400
    lineHeight: 0.9
  wordmark:
    fontFamily: "Anton, 'Arial Narrow', sans-serif"
    fontSize: "26px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.02em"
  button:
    fontFamily: "Anton, 'Arial Narrow', sans-serif"
    fontSize: "22px"
    fontWeight: 400
    lineHeight: 1
    letterSpacing: "0.01em"
  body:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.8
  body-small:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "Manrope, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1
  mono-line:
    fontFamily: "'Roboto Mono', ui-monospace, monospace"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.6
  mono-label:
    fontFamily: "'Roboto Mono', ui-monospace, monospace"
    fontSize: "13px"
    fontWeight: 500
    lineHeight: 1
  mono-small:
    fontFamily: "'Roboto Mono', ui-monospace, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.7
rounded:
  none: "0"
spacing:
  xs: "6px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "48px"
components:
  button-primary:
    backgroundColor: "{colors.crimson}"
    textColor: "{colors.white}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "16px 28px"
  button-primary-hover:
    backgroundColor: "{colors.white}"
    textColor: "{colors.crimson}"
  button-secondary:
    backgroundColor: "transparent"
    textColor: "{colors.light-2}"
    typography: "{typography.button}"
    rounded: "{rounded.none}"
    padding: "16px 28px"
  button-secondary-hover:
    backgroundColor: "transparent"
    textColor: "{colors.white}"
  button-start:
    backgroundColor: "{colors.crimson}"
    textColor: "{colors.white}"
    rounded: "{rounded.none}"
    padding: "18px 56px"
  input:
    backgroundColor: "{colors.ink-1}"
    textColor: "{colors.white}"
    rounded: "{rounded.none}"
    padding: "10px 12px"
  dialog:
    backgroundColor: "{colors.ink-2}"
    rounded: "{rounded.none}"
    padding: "24px"
  key-cap:
    backgroundColor: "{colors.ink-1}"
    textColor: "{colors.white}"
    typography: "{typography.mono-label}"
    rounded: "{rounded.none}"
    height: "30px"
  footer:
    backgroundColor: "{colors.ink-2}"
    textColor: "{colors.light-3}"
    typography: "{typography.mono-small}"
    padding: "16px 48px"
---

# Design System: Restart Generation

## Overview

**Creative North Star: "The Stage"**

The game's own screen is the hero. The page is a dark stage that frames the engine's screen, 240 × 320, or 420 × 378 on the Full board, at the largest size that fits one viewport, and everything around it recedes: a slim header, one line of mono text, a key legend, and a footer strip. The palette is near-black blue ink, white text, and a single crimson used for fills and marks.

The system is dark only (`color-scheme: dark`). Depth comes from flat ink steps, not from layered cards. Type is loud only where it names things: Anton uppercase for the name, titles, and buttons. Manrope carries reading text, and Roboto Mono carries the quiet utility voice. Every corner is square, except the touch pad's thumb controls (the Thumb Exception, under Shapes).

The page draws no game art of its own. The only imagery is the engine's screen after the player's files load, the guide's pictures, which the page reads from the same files, plus a huge outlined ghost of the name behind it.

**Key Characteristics:**
- One centered game screen as the hero, sized by viewport height.
- Dark ink ground with one crimson accent.
- Anton uppercase display at line height `0.9`.
- Square corners everywhere, but for the touch pad's round thumb controls.
- Buttons invert on hover over `0.2s`.
- A tap never shows the browser's tap tint: each control shows its own pressed state.

## Colors

A near-black blue ink ramp with white text and one saturated crimson.

### Primary
- **Crimson** (`crimson`): button fills, the `4px` bar under titles, text selection, and on the replay page the REPLAY tag, the play button, and the played part of a slider. It never sets running text.

### Neutral
- **Deep Ink** (`ink-0`): the screen overlay, at `82%`, one step below the ground, and the replay's control strip.
- **Stage Ink** (`ink-1`): the page ground, text input fills, and key-cap fills. Also the `theme-color`.
- **Strip Ink** (`ink-2`): the footer strip, the name dialog, the replay's lower third, and the touch pad's D-pad and **Back** fills.
- **Rule Ink** (`ink-3`): the scrollbar thumb, the touch pad's borders, and on the replay page the seat squares, the lower third's dividers, the slider tracks, and the quiet controls' borders.
- **White** (`white`): primary text, headings, button labels, key-cap labels, the default focus ring, the primary-button hover fill, the slider thumbs, and a replay winner's crown.
- **Pale Steel** (`light-2`): supporting text that still needs to read, such as the status line, the key legend, secondary button labels, and bold footer text.
- **Muted Steel** (`light-3`): quiet text, such as form labels, dialog notes, footer body text, and the online count's icon and word. Also the secondary button, text input, and key-cap borders.
- **Screen Black** (`screen-black`): the game screen's backing, under an `8px` dot grid of white at 16%.

### Named Rules
**The One Crimson Rule.** Crimson is the only chromatic color. Use it for fills, the title bar, and selection, never for body text.

**The Ink Step Rule.** Separate regions by stepping the ink ramp (`ink-1` ground, `ink-2` strips and dialogs), not by borders or tinted panels.

## Typography

**Display Font:** Anton (with `'Arial Narrow', sans-serif`)
**Body Font:** Manrope variable (with `system-ui, sans-serif`)
**Label/Mono Font:** Roboto Mono variable (with `ui-monospace, monospace`)

All three faces are self-hosted as `woff2` and load with `font-display: swap`. Anton is preloaded.

**Character:** a condensed poster face for names and actions, a geometric sans for reading, and a mono for the technical aside. Manrope replaced Raleway because Raleway's figures are old-style by default and sat at uneven heights beside its letters; Manrope's figures are lining by default and stand as tall as its capitals, and it has tabular figures for dates and counts that line up in a column.

### Hierarchy
- **Display** (Anton 400, `15cqi` of the screen, line height `0.9`, uppercase): the title inside the game screen before **Start**. It scales with the screen container.
- **Headline** (Anton 400, `30px`, line height `0.9`, uppercase): the name dialog title.
- **Wordmark** (Anton 400, `26px`, line height `1`, `0.02em`, uppercase): the name in the header.
- **Button** (Anton 400, `22px`, line height `1`, `0.01em`, uppercase): all buttons. **Start** steps up to `34px`; the small buttons in the header step down to `13px`; dialog buttons step down to `18px`.
- **Body** (Manrope 400, `16px`, line height `1.8`): the base. The status line uses `15px` at line height `1.7` with a `30ch` measure. The key legend uses `14px`.
- **Label** (Manrope 500, `13px`, line height `1`): form labels. Dialog notes use Manrope `13px` at line height `1.6`.
- **Mono** (Roboto Mono): the player's name in the header (500, `13px`), the online count beside its icon (500, `13px`), the footer (400, `12px`, line height `1.7`, bold runs at 500), key-cap labels (500, `13px`), and the replay's clock, a measurement (500, `13px`, tabular figures).

### Named Rules
**The Display Is Uppercase Rule.** Anton is always uppercase, weight 400, with line height `0.9` for headings and `1` for single-line labels. Headings use `text-wrap: balance`.

**The Mono Is An Aside Rule.** Roboto Mono is limited to the header's name, the online count, the footer, key caps, and the replay's clock. Don't use it for headings, buttons, or form text.

## Layout

The page is at least one viewport tall (`min-height: 100dvh`) and clips the ghost name to its box. At common desktop sizes, from about `1280 × 600` up, everything fits without scrolling; shorter or zoomed windows scroll rather than clip. It is a three-row grid: a `72px` header, a centered main area, and a footer strip. The header and footer use `48px` side gutters.

The game page and the replay page share this stage, `web/src/styles/stage.css` on `base.css`: the page grid, the ghost, the screen with its finish, the overlay, the dialogs, the Soft screen toggle, and the key legend. Each page sets only its screen's size and frame.

The game screen is centered in the main area. Its height is `clamp(300px, 100dvh - 330px, 640px)` at a `3 / 4` aspect ratio, or at `420 / 378` on the Full board ([board view](CONTEXT.md)), where it is also at most `100vw - 96px` wide (`100vw - 32px` below `760px`); it is a size container so content inside it scales with `cqi` units. Overlays inside the screen pad by `6cqi`, stack centered with a `3cqh` gap, and scroll if their content is taller than the screen. The file picker carries a one-line hint under its buttons; error states carry **Reload** and, for a stored or chosen copy, **Use a different copy**. After a [quit](CONTEXT.md), the overlay says the game is being saved, and the page then reloads to **Start**; if a member's saved game can't reach the server, the overlay carries **Try again** and a secondary **Quit anyway**. Below the screen sit the toggle row and the key legend, `18px` apart. The toggle row holds **Guide** at its left end and the **Full board** and **Soft screen** toggles at its right end.

The key legend is one wrapping row: `10px` between rows, `28px` between groups, `6px` between caps and their label. It shows the player's [custom keys](CONTEXT.md) in five groups: Move, Select, Back, Menu, and Chat. Select and Back are the page's names for the engine's Primary and Secondary actions. Select adds "or Enter" unless Enter is the chosen key, and Menu is always Esc. The legend changes as soon as the engine saves new keys. Where [pointer play](CONTEXT.md) is on, a desktop with a copy that has the engine bytes it needs ([ADR 0039](docs/adr/0039-pointer-play-turns-clicks-into-the-engines-own-cursor-moves.md)), a sixth group follows Chat: the pointer's cap and **Battlefield**.

The legend has two versions with the same groups, so switching doesn't move the page: the keys, and the gamepad's buttons (see [Key caps](#key-caps)). It follows the input last used. A press on the gamepad in use switches it to the buttons at once, the first press included, with no animation, and the next key press switches it back; clicks and touches don't switch it. In the gamepad version Select has no "or Enter", and Chat and the pointer keep their caps, because the gamepad has no chat button and the pointer works beside it.

The footer is a two-column grid (`1fr auto`, `48px` gap): the disclaimer and the credit on the left (max `110ch`, two lines), and on the right one small secondary **Notices** button. On a public server the credit line ends with links to the **Terms** and the **Privacy policy**. The button opens the notices dialog (see [Shadow Vocabulary](#shadow-vocabulary)), which holds everything else legal.

Below `1000px` wide, the footer stacks into one left-aligned column. Below `760px` wide, the page scrolls. The header shrinks to `64px` with `16px` gutters and hides the words after **Sign in**. Main pads `24px 16px 48px`. The footer stacks into one left-aligned column with `32px 16px` padding.

On touch devices (`hover: none` and `pointer: coarse`), the header, the toggle row, the key legend, the ghost type, and the folder button hide, and the touch pad sits under the screen. The line at the top of the page replaces the header: the who chip at its left and the online count at its right. Main is at least the viewport's height (`min-height: 100dvh`), pads `16px 12px 12px` with a `12px` gap, and stacks its content at its foot: the pad a fixed `12px` above the viewport's bottom edge, a notice line (when one shows) above it, and the screen above that; spare height goes above the screen, and the footer is one swipe below. The screen's width is `min(100%, (100dvh - chrome - pad - note) * 3 / 4)`, or `* 420 / 378` on the Full board: `pad` is the D-pad, a `24px` gap and the `68px` tool bar, `chrome` is `40px` (main's padding and the gap above the pad) plus `32px` while the top line shows the count alone, or `48px` with the who chip, and `note` is `64px` while a notice shows, so a notice takes its room from the screen and the pad never moves. Switching between Classic and the Full board, or a notice coming and going, leaves the pad where the thumbs left it.

In landscape on touch devices, the D-pad stands left of the screen and **Select**, **Back** and the tool bar right of it, each column `min(26vw, 56dvh, 220px)` wide; the pad fills main, which is the viewport's height, so the footer below can never cover it. The screen is centered between the columns, at `min(100vw - 2 × column - 48px, (100dvh - 16px - note) × the frame's ratio)`. A phone gets a small but playable game; there is no separate tablet landscape layout.

In fullscreen (the pad's **Fullscreen** button) the browser pins the page to the viewport. The page's first row is then the viewport's height and its second the footer's, so the screen and the pad keep exactly the size and place they have outside fullscreen and the footer sits below them, one swipe away.

## Elevation & Depth

The page is flat. Depth comes from the ink ramp: `ink-1` ground, `ink-2` for the footer strip and dialog. Two soft, dark shadows lift the only objects that sit above the stage.

### Shadow Vocabulary
- **Screen lift** (`box-shadow: 0 2px 16px rgb(0 0 0 / 40%), 0 2px 4px rgb(0 0 0 / 30%)`): the game screen and the replay's battle view only.
- **Dialog lift** (`box-shadow: 0 2px 16px rgb(0 0 0 / 50%)`): the name dialog over the screen. The notices dialog is the exception: it covers the page (fixed, centered, up to `520px` wide, scrolling inside if the viewport is short) and dims everything else with a `65%` black shade instead of a lift.

### Named Rules
**The Flat Frame Rule.** Header, footer, legend, and buttons carry no shadow. Only the game screen and dialogs above it are lifted.

## Shapes

Every corner is square (`border-radius: 0`), including buttons and inputs. **The Thumb Exception:** the touch pad's D-pad, **Select**, and **Back** are circles, because a thumb's reach is radial and a thumb rolls across a round pad without catching a corner; the touch pad's tool bar, and everything else on the page, stays square. Borders are `1px` solid. The one recurring mark is the title bar: a crimson rule `128px` wide (max `45%`), `4px` tall, `12px` below a title.

The ghost type is the page's signature silhouette: the name in Anton, uppercase, on two lines at `23vw` (`34vw` below `760px`), line height `0.82`, drawn as a `1px` outline in white at `12%`, centered behind the screen and inert.

## Components

### Buttons
Poster-loud and square.
- **Shape:** square corners (`0`), `1px` border matching the fill.
- **Primary:** crimson fill, white Anton label, `16px 28px` padding.
- **Hover:** primary inverts to a white fill with a crimson label and white border. Secondary keeps its transparent fill and turns its label and border white. Background, color, and border color transition over `0.2s`.
- **Focus:** the global ring, `2px` solid white, offset `3px`.
- **Secondary:** transparent fill, `light-2` label, `light-3` border.
- **Start:** primary at `34px` with `18px 56px` padding, the single largest action.
- **Dialog size:** `18px` label with `12px 20px` padding.
- **Link button:** a link that does a button's job (`a.button`) looks like one, primary or secondary, with the same hover and no underline, such as the replay notice's **Watch replay** and the gone replay's **Play the game**.

### Cards / Containers
- **Name dialog:** `ink-2` fill, square, `24px` padding, `14px` gap, width `min(320px, 86%)`, centered over the screen with the dialog lift. Its title, "Set your name", carries the crimson bar. It holds one field, **Player name**, and its actions, **Cancel** and **Play online** (at an online login) or **Save** (from the online-as line or the who chip's menu), sit right-aligned, `10px` apart, secondary before primary.
- **Screen overlay:** `ink-0` at `82%` (`rgb(17 20 27 / 82%)`) over the screen, holding the title, status line, and actions.
- **Rejoin card:** when the server holds the player's seat in a running battle ([ADR 0038](docs/adr/0038-a-battle-seat-outlives-its-session.md)), the card takes **Start**'s place: `ink-0`, opaque, over the whole screen, everything centered with the overlay's `3cqh` gap and `6cqi` padding. In order: the kind of match, "Ranked match" or "Friendly match", in Anton `15px` uppercase at `0.06em` in `light-3`; "Rejoin?" in Anton at `13cqi` (at most `60px`) with the crimson bar centered under it; the seats; the time left; then **Rejoin**, and **Leave** under it, `12px` apart. The words are labels: the full sentence ("Your ranked match with Ada and Cy is still running. Your seat is held for 1:42. Leaving counts as a defeat.") is visually hidden for screen readers. **Rejoin** has focus, as **Start** does; a gamepad's Up and Down move between the two buttons, and its bottom button presses the one with focus. The card fits a 320 × 568 phone's screen.
  - **Seats:** each a `28px` square in its seat color in the battle (the replay's yellow, red, green, and blue) with its number in Anton `17px` in the color's dark shade, then, `8px` on, the name in Anton `18px` uppercase in `light-2`. Two seats share one row; three or four take two columns as the castles stand, `1 2` over `4 3`, or `1 2` over seat 3 centered, `10px` by `24px` apart and at most `380px` wide. A name is cut with an ellipsis and is whole in its tooltip. The player's own seat is white, its square ringed by a `2px` white outline `3px` out.
  - **Time left:** a `6px` `ink-3` meter up to `260px` wide, filling in crimson for the share of the 2-minute window that is left and shrinking every second, and beside it the clock, `m:ss` in Roboto Mono 500 `16px` white with tabular figures.
  - **Buttons:** **Rejoin** is primary at **Start**'s size (`34px`, `18px 56px`) where the screen has the room, down to `24px` on a phone's; **Leave** is secondary at dialog size.
- **Rejoining:** after **Rejoin**, the same card, titled "Rejoining", lists the steps the page presses through, in Anton `20px` uppercase, `10px` apart, each after a `12px` square: Starting the game, Arena, Quick Match, Hero, and Your battle. A passed step's square fills in crimson, the current step is white with its square blinking white, and the steps to come are at `45%`. The meter and the clock stay under them. Meanwhile the player's keys, the touch pad, and the gamepad reach nothing.
- **Rejoin strip:** when the page can't get back to the battle by itself, `45s` after **Rejoin** or when the login fails, the card gives way to a strip at the screen's foot: `ink-0` with a `4px` crimson top border and `12px 14px` padding, holding `Arena` → `Quick Match` → `Hero` as key caps (`26px` tall, `12px` labels), the clock, and a secondary **Leave** at `13px` with `6px 12px` padding, with a `4px` meter along its foot. On a screen at most `360px` wide, a phone's, the key caps (`24px` tall, `11px` labels) take a row of their own over the clock and **Leave**, with `8px 10px` padding, so the strip covers about a quarter of the screen. The player plays above it with their own input; screen readers hear where to go and that any hero will do.
- **Back in:** once the engine is in the battle again, "Back in" in Anton `9cqi` on a crimson block with `14px 28px` padding, in the middle of the screen, holds and fades out over `2.4s`.
- **Dropped out:** when the window ran out, while the page was closed or before the player got back, the card says "Dropped out" under the kind of match, over the seats, the player's own square hollow as a defeated seat's in the replay (its color kept as a `2px` inner outline, its name in `light-3`), and a primary **OK** at dialog size, which has focus. **OK** goes on to **Start**, or back to the game.
- **Leave**, on the card or the strip, gives the seat up at once, as leaving the battle through the game's menus does, then goes on to **Start** or closes the strip.
- **Online-as line:** on a server without accounts, one `hint` line under **Start** from the first visit: "Online as" and the player's online name, the random `GuestNNNNNN` one until they set their own, then a secondary **Set name**, which reads **Change name** once a name is set, and, when the server keeps replays and a name is set, a secondary **Replays**, both at `13px` with `4px 8px` padding. **Set name** and **Change name** open the name dialog, filled in with the current name; **Save** keeps the name for the next online login, and focus goes back to the button.
- **Acceptance line:** on a public server, one `hint` line right under **Start**: "By playing online you accept the Terms and the Privacy policy.", the two names underlined links in `light-2`, opening in a new tab. The name dialog for a new member ends its note with the same sentence about saving the name.
- **Who chip:** in the header's right, the player's name in mono, then, for a guest, a secondary **Replays** (when the server keeps replays) and a secondary **Sign in with Discord**; a member sees an **Account** summary that opens a panel on `ink-2` with **Replays** (when the server keeps replays), **Download my data**, **Sign out**, and **Delete my account**. Buttons are `13px` with `6px 12px` padding. On a touch device, which has no header, the who chip is a button at the left of the line at the top of the page, across the pad's width from the online count: an `18px` person (`1.4` square-capped stroke in `light-3`), the name in the header's mono, and a `12px` caret, on `ink-2` with a `1px` `ink-3` border, `36px` tall with a `44px` tap target, its border white while pressed or open. In landscape it stands at the top of the D-pad's column instead, and the count keeps its line over the screen. It stays while the game runs, so the account and **Replays** are a tap away during play, and it replaces the lines under **Start** (the online-as line hides on touch devices). It opens a menu under it, over the screen, `8px` below: an `ink-2` panel at least `248px` wide with a `1px` `ink-3` border and the dialog lift, dropping in over `0.2s`. A line in Manrope `13px` `light-3`, `12px 14px 10px` padding, says what kind of player this is ("Guest. Your progress stays in this browser.", "Signed in with Discord.", or "Your name online, with no password.", which adds "A new name takes effect the next time you go online." during play); then the actions as `48px` rows in Anton `17px` uppercase, ruled off by `1px` `ink-3` as the Download replay menu's options are: a guest's **Replays** and **Sign in with Discord** (a crimson row); a member's **Replays**, **Download my data**, **Sign out**, and **Delete my account** (in `light-3`); on a server without accounts, **Set name** or **Change name** (disabled while the name dialog is up) and, once a name is set, **Replays**. **Replays** shows when the server keeps replays. A press lightens a row to `ink-3`; a row hands focus to the chip before it opens its dialog, so focus comes back there. A tap elsewhere or Escape closes the menu.
- **Online count:** a `16px` two-person line icon (`1.4` square-capped stroke in `light-3`), the number in white, and "online" in `light-3`, `6px` apart, in Roboto Mono `13px` at 500; screen readers hear "3 players online". On a desktop it stands in the header's right end, before the who chip, ruled off from it by a `24px`-tall `1px` `ink-3` line `24px` to its right, which shows only with the who chip. Below `760px` wide the word "online" hides, and the icon and the number carry it. On a touch device, which has no header, the count stands on a line of its own at the top of the page, `20px` tall, at the right end of the line at the top of the page, across from the who chip (in landscape, on a line of its own over the screen's right end), with the screen's spare height under it; the screen gives up the line's height and its gap. It stays while the game runs. It hides when there is no server to ask, and "0 online" is shown, not hidden. A notice leaves it in place.
- **Toggle row:** under the game screen, on desktop only: **Guide** at its left end and the **Full board** and **Soft screen** toggles at its right end, `8px` apart. The row is as wide as the screen and at least `560px` (or the main area, if narrower).
- **Discord link:** the admin's "Join the Discord" link, when set, sits in the footer after the credit line, underlined in `light-2`.
- **Soft screen toggle:** a pressed-state button for the [screen finish](CONTEXT.md). On desktop it is the right end of the toggle row, a secondary button at `13px` with `4px 8px` padding labeled **Soft screen**, with an `8px` square before the label, filled while the finish is soft and hollow while it is sharp; pressed, it takes white text and border. Pressing it hands focus back to the game screen, and its keys never reach the game. On a touch device it is in the touch pad's tool bar, labeled **Soft screen** under its icon (a square cut by a 3 × 3 pixel grid), white while pressed. Its choice is kept in this browser (`rg:finish`), never on the account. It hides under `prefers-contrast: more`.
- **Full board toggle:** a pressed-state button for the [board view](CONTEXT.md), left of **Soft screen** and styled as it is, labeled **Full board**, with a `10 × 9` frame before the label (the Full board's own shape), filled while it is on and hollow on Classic. On a touch device it is in the touch pad's tool bar, labeled **Full board** under its icon: the board's frame with a small square in each corner, like a battle's corner panels. It shows only when the engine copy can show the Full board. It starts pressed on a desktop and unpressed on a touch device; its choice is kept in this browser (`rg:board`). Changed during a battle, it applies at once; a princess's rescue or a fight that is playing finishes first. It stays under `prefers-contrast: more`.
- **Guide button:** opens the [guide](CONTEXT.md). On desktop it is the left end of the toggle row, a secondary button at `13px` with `4px 8px` padding labeled **Guide**, as wide as **Soft screen** and with its label centered. On a touch device it is the last of the touch pad's tool bar, labeled **Guide** under an open book. It shows only when the copy's info menu can be read ([ADR 0033](docs/adr/0033-the-guide-reads-the-info-menu-from-the-players-copy.md)), and works before **Start** and during play, in a battle too; the game keeps running behind the dialog, and closing it during play hands focus back to the game screen.
- **Guide dialog:** over the page, as the notices are, but as large as the page allows (`800 × 720px` at most, `16px` from the viewport's edges, `8px` below `600px` wide with `20px 16px 16px` padding), on a shade of black at `65%` that is an element, so a tap on it closes the dialog instead of reaching the touch pad. Titled **Guide** with the crimson bar. Under the title, three tabs in Anton `17px` uppercase, `28px` apart (`20px` on a phone), in `light-3` and white when chosen or hovered, on a `1px` `ink-3` rule; the chosen tab sits on a `4px` crimson bar, as a title does. The tabs take the info menu's own labels in the game's language, and the panel carries that language's `lang`. ← and →, Home and End move between them; the chosen tab has focus when the dialog opens. The panel scrolls inside the dialog and goes back to its top on a tab change:
  - **Instructions:** one reading column of at most `64ch`: headings in Anton `22px` with `32px` above and `12px` below, paragraphs in Manrope `15px` at `1.7` in `light-2`, keeping the game's line breaks, and each picture on an `ink-1` plate with `12px` padding.
  - **Heroes and Items:** a list in two columns where each is at least `330px` (one below that), `24px` by `32px` apart: a picture on an `ink-1` plate beside its title in Anton `20px` and its sentence. Pictures are the game's own pixels at twice their size, cut to their visible pixels, since the items' frames draw their icons against the bottom edge; among the items, a picture whose frame is larger than an icon's keeps its own size, so the column stays an icon's width. Every plate in a tab is one size, the tab's largest picture plus `8px` padding and at least `92px` wide, with its picture centred both ways; the plate stays level with the top of its title.
  - **Finish:** every picture in the guide follows the [screen finish](CONTEXT.md). Soft smooths it, and where a game pixel is at least `2.4` device pixels wide, lays the screen's pixel grid over its visible pixels only, so the plate stays clean; sharp draws its pixels square (`image-rendering: pixelated`), as does `prefers-contrast: more`.
  - **Close** is the primary, right-aligned. Escape and a click or tap on the shade close it too.
- **Notice line:** one line of Manrope `15px` in `light-2` under the screen, with small buttons at `16px` with `8px 14px` padding. It holds sign-in results and the once-a-day offer to sign in after a guest earns fame. It also says "Gamepad connected." for about 3 s when a gamepad becomes the one in use, and "Gamepad disconnected." when that gamepad disconnects during play, until the next key, touch pad, or gamepad press. A gamepad notice never replaces a notice with actions, a pad the page ignores gets neither, and the page has no other gamepad wording.
- **Replay notice:** after an online battle, the notice line says "Replay saved. Find it later in Replays." with a primary link-button **Watch replay**, which opens the replay page in a new tab, a secondary **Copy link**, and a secondary **Dismiss**. **Copy link** keeps the notice and says "Link copied" or "Couldn't copy" for `2.5s`. The notice stays until it is dismissed or the next battle starts.
- **Replays dialog:** **Replays** opens a dialog over the page, as the notices do (fixed, centered, up to `560px` wide, with the `65%` shade), titled **Replays** with the crimson bar. One note line: "The last 25 battles."; a guest's adds "Guests lose them a day after their last game. Sign in with Discord to keep them." The list scrolls inside the dialog, newest first, one line per replay, `7px 2px` padding, ruled off by `1px` `ink-3`, in a grid of `104px 20px 1fr 78px auto` with a `12px` gap:
  - **When:** the date and time in Manrope `13px` `light-2`, tabular figures.
  - **Kind:** a `20px` line icon in `light-2` (`1.6` stroke, square caps): **Ranked** is a bar between two wings of two feathers each, the wings level with the top of the bar, after the game's fame badges (docs/re/re_looks.md), so it reads as standing, not as a win; **Friendly** is two players side by side.
  - **Played:** the environment as a `24px` square sketch framed in `1px` `ink-3` (`EnvironmentSketch.svelte`, drawn from docs/re/re_looks.md: navy tiles on a starry black; checkered grass with a hazard edge in a blue sky; a violet arena with orange lines; a striped pitch ringed by its crowd; grey asphalt with tyres and kerbs), then the hero the listed player played, in Anton `14px` uppercase white. With no known seat, the sketch stands alone.
  - **Result:** **Won** as the end screen's chip (white, crimson Anton `13px`, `4px 8px`), **Lost** the same in `ink-3` with `light-2` text, or "No result" in Manrope `12px` `light-3`; nothing when the seat isn't known. A guessed result shows as plainly as a witnessed one.
  - **Actions:** a secondary link-button **Watch ▸**, which opens the replay page in a new tab, `13px` with `5px 10px` padding, then **Copy link** as a secondary icon button (two overlapping sheets, `14px`) framed in `ink-3`, which says "Link copied" or "Couldn't copy" in place of its icon for `2.5s`; both `13px 16px` on touch devices. Nothing in a row is primary, so **Close** is the only primary in the dialog.
  - **Tooltips:** every icon names itself on hover, and the same words go to a screen reader: "Ranked match" or "Friendly match", "Environment: Soccer", "Watch this replay in a new tab", "Copy this replay's link".
  - **Under `420px`:** when, the kind and the played cell on the first line; the result at the left and the actions at the right on the second.
  - **States:** "Loading replays…"; "No replays yet."; and "Couldn't load replays." with a secondary **Try again**. **Close** is the primary, right-aligned, and has focus when the dialog opens. The copy follows match histories elsewhere (Overwatch's **Replays** tab, Dota 2's "Replay unavailable"): a label per state, the retention said once.
- **Slowness notice:** one line of Manrope `13px` in `light-2` between the screen and the touch pad, as wide as the screen, with a secondary **Dismiss** button at `16px` with `6px 12px` padding. When it comes up during a Full board battle, a secondary **Use Classic** comes before **Dismiss**; it switches the board view at once. It appears at most once per visit.

### Terms and Privacy policy
Two reading pages, `/terms` and `/privacy`, on the same stage (`web/src/styles/doc.css` on the shared `base.css`). The header keeps the wordmark, as a link home, and a quiet **Back to the game** outline link at Anton `13px` on the right; the footer keeps the disclaimer and links both pages. The page's own name, as the ghost, sits at the top right at `19vw` (`30vw` on a phone), outlined in white at `12%`.
- **Column:** one reading column of at most `68ch`, centered, with a `200px` list of the sections to its left, sticky `32px` from the top, in Manrope 500 `13px` `light-3`, white on hover. Below `1000px` the list hides and the column takes the width.
- **Title:** Anton uppercase at `clamp(48px, 6.4vw, 88px)` with the crimson bar, then "Last changed" in Manrope `13px` `light-3`.
- **Facts band:** one `ink-2` band, `24px` padding, with three pairs: **Run by**, **Data stored by**, and **Write to**. Labels are the form label (Manrope 500 `13px` `light-3`), values Anton uppercase `20px` in white. Below `1000px` the pairs stack.
- **Text:** a lede in Manrope `19px` white, then sections whose headings are Anton `30px` with `64px` above and `18px` below. Body is Manrope `16px` at `1.8` in `light-2`; lists use square markers in crimson; links are white with a `light-3` underline that turns white on hover; bold runs are white at 600.

### Replay page
`/replay/<id>` plays one online battle again, framed as a television replay, on the shared stage (`web/src/styles/replay.css` on `stage.css`). The engine's `420 × 378` battle view is the screen; the title band over it, and the lower third and the control strip under it, are exactly as wide as it and sit flush with it as one block. Main's gap tightens to `14px`.
- **Header:** the wordmark alone, as a white link home. The replay's own actions sit in the title band.
- **View:** height `min(clamp(260px, 100dvh - 400px, 640px), (100vw - 96px) × 378 / 420)`, which leaves room for the title band, the strip, **Soft screen**, and the legend; below `760px`, `clamp(220px, 100dvh - 320px, 640px)` and `100vw - 32px`. It keeps the screen's dot grid, finish, and lift. Once the battle is built, a click or tap on it plays or pauses, as play does.
- **Title band:** an `ink-2` band at least `40px` tall over the frame, with a `12px` gap and `6px` padding at its right: the REPLAY tag, a crimson block as tall as the band in Anton `15px` uppercase at `0.04em` with `12px` side padding; the day and the kind of match, as "30 Oct 2026 - Ranked match" or "30 Oct 2026 - Friendly match", in Manrope `13px` `light-2`, cut with an ellipsis; then at its right end, `6px` apart, a secondary **Share** and a secondary **Download replay**, both at `13px` with `5px 10px` padding, each with a `14px` drawn icon (`1.6` square-capped stroke) before its label: a square open at the top with an arrow rising out of it, and a download arrow. On a view at most `427px` wide (a `459px` window's, or any shorter window's) both are their icon alone, at `18px` in a square button, their labels kept for screen readers, so the day and the kind of match still fit. **Download replay** ends with a `12px` drawn chevron, which stays when it is its icon alone.
- **Share:** on a touch device it opens the device's share sheet with the page's address; elsewhere it copies the address and says "Link copied" or "Couldn't copy" for `2.5s`.
- **Download replay:** opens a menu under it, aligned to its right end, `6px` below: an `ink-2` panel `240px` wide with a `1px` `ink-3` border and a soft shadow, **With Details** over **Battle Only**, each as tall as a seat of the lower third with `8px 10px` padding and divided by `1px` `ink-3` as the seats are, its label in Anton `17px` white uppercase after a `32px`-wide sketch of the file's shape: the battle in `ink-0` with an `ink-3` band over it (crimson at its left) and one under it (the four seat colors), or the battle alone. No check mark and no descriptions. **With Details** takes focus each time the menu opens; ↑, ↓, Home, and End move, Enter picks, and Escape, Tab, or a click outside closes it; hovered or focused, an option takes `ink-3`. Picking saves the replay as that kind of footage (below). It works as soon as **Watch** does, and pressed first it starts the replay as **Watch** would. It is disabled at `45%` only while something on the page says why: the overlay (loading or choosing the game files, **Can't play**), the footage panel while it renders, or the line under the strip where it never can. It says "Downloaded" for `2.5s` after a save.
- **Lower third:** an `ink-2` band, one equal cell per seat with `8px 10px` padding and a `10px` gap, cells divided by `1px` `ink-3`. Each cell holds the seat number in a square as tall as the name and the hero together (`36.45px`) in the seat's color in the battle (seats 1 to 4: yellow, red, green, blue, in our own shades), the number in Anton `18px` in a dark shade of the same color; then the name in Anton `17px` white uppercase over the hero in Manrope `13px` `light-3`, both cut with an ellipsis. When the view is at most `640px` wide (a container query) and has three or four seats, the band becomes two rows with each seat where its castle stands on the board ([docs/re/re_rules.md](docs/re/re_rules.md)): four as `1 2` over `4 3`, three as `1 2` over seat 3 in a cell of the same width centred under them. The list stays in seat order for screen readers. A battle that started with three of four seats is drawn as three.
- **Defeated seat:** a [defeated player](CONTEXT.md)'s seat in the lower third goes one ink step down to `ink-1`, its square loses its fill and keeps its seat color as a `2px` inner outline with the number in that color, and its name turns `light-3`, over `0.4s`. A seat whose princess was rescued changes once the rescue animation has played; one that left, at once; after a seek, every seat defeated by then at once. Screen readers hear ", defeated" after its hero.
- **Crown:** when the replay ends, each winner's square (two after a tie, none if nobody won, a guessed winner too) wears a white crown, our own drawing: three points, `22 × 14px`, with a `1.5px` `ink-2` edge under its fill, centred on the square's top edge and `6px` into it, so it reaches the seat's top. It drops in from `6px` higher over `0.4s`. There are no place chips: the places are on the end screen. Screen readers hear ", won".
- **Control strip:** an `ink-0` band at least `48px` tall, `6px 10px` padding, `10px` gap: play, the time slider, the clock, **Skip idle**, **2×**, mute, and volume. Play is a `36px` crimson square with a drawn triangle or pause bars, the strip's only crimson. The rest are quiet: Anton `13px`, `7px 10px` padding, transparent, `light-2` label, `ink-3` border, white on hover and while pressed (**Skip idle** and **2×** are toggles); mute is a borderless `36px` square with a `20px` drawn speaker (`1.4` square-capped stroke). Until the battle is built, all but mute and volume are disabled at `45%`. Paused, at the end, or while the slider is held, the music and the battle's sounds are silent until it plays again. Below `760px`, and on a view at most `640px` wide, the strip wraps, the time slider takes the last row alone, and volume moves to the end of the row before it, so every control stays inside the strip on a short window too.
- **Previous and Next moment:** for a replay with [marks](CONTEXT.md), borderless `36px` squares on each side of play, each a `20px` drawn bar and triangle (`1.4` square-capped stroke) pointing back or on, named "Previous moment" and "Next moment". Next goes to the first mark after the playhead, Previous to the last one more than `2s` behind it, and each is disabled at `45%` where there is none. A jump from the end screen also plays. A replay without marks has neither, not even disabled.
- **Sliders:** `24px` tall, a `4px` `ink-3` track, a `14px` square white thumb, and crimson for the played part where the browser draws it. The time thumb follows the engine's clock in milliseconds, so it glides with each engine frame, stops while paused, jumps where Skip idle does, and lands on a mark's tick. A click on the track goes to the exact second under the pointer. While a drag moves, only the thumb follows; the replay goes to the second where the pointer rests for `150ms`, and where it is let go, because each seek runs the battle again and holds the page for up to half a second. The arrow keys seek in `5s` steps. With a mouse, the second under the pointer shows above the track, centred on it but kept inside the track, on `ink-2`, `6px 8px` padding, in Roboto Mono 500 `13px` white with tabular figures, and goes as the pointer leaves the track; over a tick, the tick's own name shows instead. Volume is `72px` wide.
- **Marks:** each mark is a `2px` `light-2` tick across the time slider's track where the thumb's centre would be at its second: `16px` tall for a turn with a rescue, `8px` for one with only knock-outs. Each is a button, `12px` by `24px` (`24px` by `44px` on touch), that seeks to its mark and is named by its moments, as "0:31 · Ada rescues Bo's princess" or "0:23 · Bo is knocked out". Hovered or focused, the tick turns white and that name shows above the strip on `ink-2`, `6px 10px` padding, in Manrope `13px` white, fading in over `0.15s`; near either end of the track it lines up with that end instead of centring. They are disabled with the slider.
- **Clock:** `m:ss / m:ss` in Roboto Mono 500 `13px`, tabular figures, `light-2`.
- **Overlay:** the game page's, titled **Replay** with the crimson bar, with the same file picker; the title is Anton `9cqi`, as the end screen's, since the game page's `15cqi` is for its tall phone screen. **Watch** takes the size of **Start**.
- **End screen:** when the battle ends, `ink-0` at `82%` covers the view and fades in over `0.4s` (`cubic-bezier(.16, 1, .3, 1)`): the result in Anton `9cqi` at line height `0.9`, the places (ordinal in Anton `18px` white, name in Manrope `15px` `light-2`), a hint when the server guessed the result, and a primary **Watch again**, which takes focus. With the same fade, each winner's seat in the lower third gets its crown (below). Nothing covers the view while it plays.
- **Footage:** while footage renders, a panel like the end screen, one layer above it, covers the view: "Preparing download" in Anton `7cqi`, a `6px` `ink-3` meter up to `320px` wide filling in crimson, and under it, as wide as it, the percentage at its left end and, once there is a rate to tell from, "2m 3s remaining" (or "45s remaining") at its right, in Manrope `15px` `light-2` with tabular figures; then a secondary **Cancel**, which takes focus. The battle the engine is rendering races by under the shade. If it fails, the panel says "Couldn't download the replay", the reason as a hint, and a primary **Back to the replay**, which takes focus; focus then goes back to **Download replay**. Panel buttons are `18px` with `12px 20px` padding.
- **Footage with details:** the file draws the title band (the REPLAY tag and the day and the kind of match, without **Share** and **Download replay**) over the battle and the lower third under it, always one row, in the page's fonts and colors, as big beside the battle as on a desktop, where the battle is at most `640px` tall. Footage's battle is at most `1080px` tall (1200 × 1080 for **Battle Only**), so they are `1080 / 640` times their size: 1200 × 1238. Its defeated seats change at the same moments as the page's, each winner's crown appears when the replay ends, and the end holds for `3s`.
- **Gone:** a replay that doesn't exist or that no player keeps any more keeps the overlay, titled **Replay not found**, with one line under the title and then a primary link-button **Play the game** at `18px` with `12px 18px` padding. The line says "Each player keeps their last 25 battles.", or "This server keeps no replays." on a server with replays off. The title band keeps only the REPLAY tag; the strip, **Soft screen**, and the legend hide.
- **Can't play:** a replay the engine hasn't built after 10 s of its own time never will, such as damaged data or a seed replay's placeholder. The overlay comes back, titled **Can't play**, saying "The game couldn't load this replay.", with the same **Play the game**, and the engine and its sound stop. The title band (**Download replay** disabled), the lower third, and the strip (still disabled) stay.
- **Under the strip:** **Soft screen** on the right of a `1fr auto` grid with a `16px` gap, as wide as the view. Where footage can't be made, a second row in Manrope `13px` at `1.6` in `light-3` says why and describes the disabled **Download replay**: on a page that isn't secure (a LAN address over plain HTTP), "Download replay needs a secure page: open this replay over HTTPS, or at localhost on the PC that runs the server."; in a browser that can't encode it, "Your browser can't download replays. Try Chrome or Edge."
- **Key legend:** the game page's legend with the replay's keys: Space plays or pauses, ← and → go back or on 5 s, Shift with ← or → goes to the previous or next moment (only for a replay with marks), F doubles the speed, M mutes, wherever focus is unless the focused control uses that key. After a gamepad press it shows the bottom button (play or pause), the D-pad (back or on), and, with marks, the shoulder buttons (previous or next moment), drawn as two bumpers over the pad's top edge, hidden name "Shoulder buttons (LB and RB on Xbox, L1 and R1 on PlayStation, L and R on Nintendo)".
- **Touch:** the legend and the ghost hide and the header stays. Every control is at least `44px` square, the volume slider hides (the device's buttons set the volume), and the screen stays awake after **Watch**.

### App icon
The favicon and the Discord app icon are one mark: white **RG** in Anton on `ink-0` (`#11141b`), as a full-bleed square with no crimson and no rounded corners, because browsers, iOS, and Discord apply their own masks. The letters are outlines (Anton is under the SIL Open Font License, see `web/src/assets/fonts/OFL-anton.txt`), `64%` of the tile wide and centered, so their corners stay inside the circle Discord crops icons to. They are drawn once as `web/public/favicon.svg`; `favicon.ico` (16, 32, and 48), `apple-touch-icon.png` (180), and `icon-512.png` (the file to upload as the Discord application's icon) are renders of it. Both names, Reset Generation and Restart Generation, abbreviate to RG, and the mark uses no RedLynx lettering or logo.

### Touch pad
On touch devices only ([spec](.scratch/touch-controls/spec.md), chosen from a prototype of four layouts). In portrait the pad sits a fixed `12px` above the viewport's bottom edge, whatever the screen's frame and whether or not a notice shows; the screen sits `12px` above it (or above the notice), spare height goes above the screen, and the footer is one swipe below. The pad is as wide as the page up to `560px`: the D-pad at its left, **Select** and **Back** at its right, each set in from the pad's side by `clamp(10px, 5vw - 2px, 28px)` (about `18px` on a phone) so they sit under resting thumbs rather than at the phone's edges, and the tool bar under both, `24px` below. In landscape the D-pad stands left of the screen and **Select**, **Back** and the tool bar right of it, and the screen takes the viewport's whole height.
- **D-pad:** a disc cut into four wedges, Up, Right, Down, and Left, on an `ink-2` fill, with thin `ink-3` gaps between them where the disc shows through. The whole disc presses an arrow except a dead centre, a circle `28%` of the disc wide in `ink-1` with a `1px` `ink-3` edge: a thumb a little off its arrow still presses it, and one back in the middle between taps presses no key. (The earlier pad was four squares on a 3 × 3 grid, whose corners pressed nothing.) Each wedge carries an SVG arrow near its rim, `13%` of the disc wide (at least `20px`), with a `1.4` square-capped stroke in `light-2`.
- **Select:** a crimson circle `60%` of the D-pad's width, at the bottom right of a square as wide as the D-pad, under the right thumb, labeled in Anton uppercase at `10%` of the D-pad (at least `16px`).
- **Back:** an `ink-2` circle `40%` of the D-pad's width, at the top left of that square, labeled in Anton uppercase at `6.5%` of the D-pad (at least `13px`). It sits away from **Select** and outside the D-pad on purpose: it cancels, and in a battle it opens the game's menu, so a press meant for **Select** or an arrow must never reach it.
- **Sliding:** a finger sliding between the arrows moves the press with it, and one that slides over the D-pad's dead centre, or the thin gaps between wedges, lets go of its arrow and presses the next arrow it reaches. A touch that starts on empty space presses nothing. **Select** and **Back** are never taken or given up by sliding: each starts only from a touch that begins on it and lasts until the finger lifts, so a drift while holding **Select** can't press an arrow, and a slide from an arrow, or across the middle, never presses **Select** or **Back**.
- **Sizes:** the D-pad is `clamp(116px, 26dvh, 230px)` wide in portrait, at most half the width less `24px` and the inset so it and the buttons' square fit side by side, and `min(26vw, 56dvh, 220px)` in landscape, where the same inset keeps each column off the phone's edge. Measured in emulation (D-pad, **Select**, **Back**, and the D-pad's and Select's distance from the edge): 154, 92, 61 and 30&nbsp;px on an iPhone 13 (390 × 844); 140, 84, 56 and 28&nbsp;px at 360 × 640; 122, 73, 49 and 26&nbsp;px at 320 × 568; 230, 138 and 92&nbsp;px on an iPad. In phone landscape at 844 × 390 the D-pad is 218&nbsp;px, 36&nbsp;px from the edge, and the screen 281 × 374 (Classic). Android asks for 48&nbsp;dp and iOS for 44&nbsp;pt; every control meets both.
- **Soft screen, Keyboard, Full board, Fullscreen, and Guide:** the tool bar, `68px` tall and ruled off above by `1px` `ink-3`, its buttons spread evenly in that order: each a drawn SVG icon (`22px`, `1.4` stroke) over its name in the form label's type (Manrope 500 `13px`, at line height `1.2`, wrapping to two balanced lines where it must), in `light-3`, with no fill or border. A tool that is on (a pressed toggle, or **Keyboard** while the device's keyboard is up) has a white name and the crimson bar, `4px` tall, across the middle `60%` of its top, on the rule, as the Guide's chosen tab carries it. The tools are rarely pressed, so they sit below the thumbs' controls, named rather than guessed at; **Soft screen** comes first, under the D-pad, because a thumb that overshoots Down there only changes the finish, and **Keyboard** sits under the gap between the D-pad and the buttons. **Keyboard** shows once the game runs, and hides during a battle: there a thumb that slips onto it would raise the device's keyboard over the game, so a touch player types chat only outside battles, and a keyboard still up when a battle starts goes down. It raises the keyboard through a hidden field at the viewport's top, focused without scrolling, so the page doesn't jump when the keyboard opens. In landscape the tools sit under **Select** and **Back** and wrap. There is no **Menu** button: in a battle **Back** opens the game's menu, as Esc does, and on the main menu both open the Quit dialog. **Keyboard** stays because typing a friend's name is the only way to add a friend.
- **Keys:** **Select** presses Enter and **Back** presses Esc, the keys the engine keeps on those actions whatever the player chooses, so a rebind can't take them away. The D-pad presses the keys the player chose for each direction.
- **Held:** a pressed control inverts to a white fill, a crimson label, and a white border at once, with no transition, for as long as it's held. **Keyboard** stays held while the device's keyboard is up. Pad buttons don't change on hover, because a touch screen keeps a tapped button hovered.
- **Before the game runs:** the pad answers what a gamepad answers then: on the rejoin card Up and Down move between its buttons and **Select** presses the one with focus, and on the Start screen **Select** presses **Start**. It acts on the tap's click, the user action Start needs for sound and the wake lock. A control that does nothing yet waits at `45%` and shows no press; when the game starts, the pad lights up to full over `0.4s` (`cubic-bezier(.16, 1, .3, 1)`).
- **Focus:** **Select**, **Back** and the tools take the global ring. A wedge's clip would cut the ring off, so a focused wedge turns `ink-3` with a white arrow instead.

### Inputs / Fields
- **Style:** `ink-1` fill, `1px` `light-3` border, square, `10px 12px` padding, Manrope `15px`, white text and caret.
- **Label:** Manrope 500 `13px` in `light-3`, stacked `6px` above the field.
- **Focus:** the global ring, `2px` solid white, offset `2px`.

### Navigation
There is no navigation. The header holds only the wordmark on the left and, at the right, the online count (when a server answers) and, on a server with accounts, the who chip. Touch devices don't show the header.

### Key caps
Square `kbd` caps, at least `30px` wide and `30px` tall, `0 8px` padding, `1px` `light-3` border, `ink-1` fill, white Roboto Mono 500 `13px` label. Arrow keys use inline SVG arrows at `12px` with a `1.6` square-capped stroke in the current color; each carries a visually hidden text name. In Move, a key that isn't its direction's own arrow also carries a hidden "for Up" (Down, Left, Right), and an action with no key shows a dash.

The pointer's cap draws a mouse the same way: a `12px` upright capsule split across its top into two buttons, standing for every kind of pointer, with the hidden name "Pointer".

After a press on the gamepad, the caps show its buttons instead: our own inline SVG glyphs at `16px` in white, with the arrows' `1.6` square-capped stroke, in caps with no padding, so they stay `30px` square. Move is a D-pad cross; Select and Back are a diamond of four dots, with the bottom dot filled for Select and the right one for Back; Menu is ≡. They draw each button by its position, because a browser can't reliably tell which brand of pad is in use. Their hidden names are "D-pad or left stick", "Bottom button (A on Xbox, Cross on PlayStation, B on Nintendo)", "Right button (B on Xbox, Circle on PlayStation, A on Nintendo)", and "Menu button (Menu on Xbox, Options on PlayStation, + on Nintendo)".

### Game screen
The engine's canvas fills the frame of the [board view](CONTEXT.md): `3 / 4` (240 × 320) on Classic, and `420 / 378` on the Full board. A battle changes frame at once when the board view changes; a princess's rescue or a fight that is playing finishes first. On the Full board, a screen the engine lays out for the phone (the menus, the results, the lobby, and in a battle its menu and story dialogs) sits at 240 × 320 in the middle, at (90, 29), inside the engine's own [curtain](CONTEXT.md), which the page reads from the player's `gameplay.pak` each visit; in a battle the engine draws the curtain itself around its phase banners and animations. Without a curtain image the surround is black. The curtain fades in and out over 8 frames, about a quarter of a second, twice as fast as the engine's own fades: in over the last Full board frame when a phone-only screen comes up, out over the battle when it goes. A curtain already up stays up, so a battle that starts from the menus begins inside it. Where the page paints with its 2D fallback, the curtain comes and goes at once. By default it is shown soft (the [screen finish](CONTEXT.md)): scaled smoothly (`image-rendering: auto`), and, where each game pixel is at least `2.4` device pixels wide, under a faint pixel grid, one cell per game pixel, a `22%` black fade across the cell's right and bottom `45%`. Below that width the grid is left off, because at a fractional pitch it shimmers; the smoothing stays. The grid sits under the overlay and the dialogs, which are page UI and stay sharp. Sharp (the player's choice, or `prefers-contrast: more`) scales with `image-rendering: pixelated` and has no grid. The frame's backing is black under an `8px` white dot grid at 16%, and it carries the screen lift.

Over a battle on a desktop, the screen takes the [pointer](CONTEXT.md) ([ADR 0039](docs/adr/0039-pointer-play-turns-clicks-into-the-engines-own-cursor-moves.md)): the engine's own cursor follows a mouse or a pen on the Full board, and a click moves it on Classic and for a finger. In other players' turns and after a defeat, hovering or clicking a hero only moves the cursor onto it, and the engine shows that hero's [reach area](CONTEXT.md); nothing is committed. The page draws nothing over the battlefield: the engine draws the cursor, the route, the reach area, and the attack cursor, and the system pointer keeps its arrow. The browser's context menu is off over the screen, since the right button turns a piece or takes a hero's cursor back. Clicks on the corner panels or the curtain, and over the engine's menus, do nothing.

## Do's and Don'ts

### Do:
- **Do** keep the game screen the largest object on the page and centered.
- **Do** set every display line in Anton 400 uppercase at line height `0.9`.
- **Do** mark titles with the crimson bar (`128px` by `4px`, `12px` below).
- **Do** keep every corner square (`0`), but for the touch pad's thumb controls (the Thumb Exception).
- **Do** invert buttons on hover over `0.2s`: crimson to white for primary, muted outline to white outline for secondary.
- **Do** separate regions with ink steps (`ink-1`, `ink-2`).

### Don't:
- **Don't** use crimson for body or running text.
- **Don't** introduce a second accent color or a light theme.
- **Don't** round corners anywhere but the touch pad's D-pad, **Select**, and **Back**.
- **Don't** use Roboto Mono beyond the header's name and the who chip's, the online count, the footer, key caps, the rejoin clock, and the replay's clock and its time slider's readout.
- **Don't** add shadows to anything except the game screen and dialogs over it.
- **Don't** add game art, screenshots, or RedLynx or Ubisoft logos to the page. The only game pictures are the ones the page reads from the player's own copy while it runs: the curtain and the guide's.
