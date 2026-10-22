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
    fontFamily: "Raleway, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: 1.8
  body-small:
    fontFamily: "Raleway, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.7
  label:
    fontFamily: "Raleway, system-ui, sans-serif"
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

The game's own screen is the hero. The page is a dark stage that frames the engine's 240 × 320 output at the largest size that fits one viewport, and everything around it recedes: a slim header, one line of mono text, a key legend, and a footer strip. The palette is near-black blue ink, white text, and a single crimson used for fills and marks.

The system is dark only (`color-scheme: dark`). Depth comes from flat ink steps, not from layered cards. Type is loud only where it names things: Anton uppercase for the name, titles, and buttons. Raleway carries reading text, and Roboto Mono carries the quiet utility voice. Every corner is square.

The page draws no game art of its own. The only imagery is the engine's screen after the player's files load, plus a huge outlined ghost of the name behind it.

**Key Characteristics:**
- One centered game screen as the hero, sized by viewport height.
- Dark ink ground with one crimson accent.
- Anton uppercase display at line height `0.9`.
- Square corners everywhere.
- Buttons invert on hover over `0.2s`.

## Colors

A near-black blue ink ramp with white text and one saturated crimson.

### Primary
- **Crimson** (`crimson`): button fills, the `4px` bar under titles, and text selection. It never sets running text.

### Neutral
- **Deep Ink** (`ink-0`): the screen overlay, at `82%`, one step below the ground.
- **Stage Ink** (`ink-1`): the page ground, text input fills, and key-cap fills. Also the `theme-color`.
- **Strip Ink** (`ink-2`): the footer strip, the name dialog, and the touch pad's D-pad and **Back** fills.
- **Rule Ink** (`ink-3`): the scrollbar thumb and the touch pad's borders.
- **White** (`white`): primary text, headings, button labels, key-cap labels, the default focus ring, and the primary-button hover fill.
- **Pale Steel** (`light-2`): supporting text that still needs to read, such as the status line, the online row, the key legend, secondary button labels, and bold footer text.
- **Muted Steel** (`light-3`): quiet text, such as form labels, dialog notes, and footer body text. Also the secondary button, text input, and key-cap borders.
- **Screen Black** (`screen-black`): the game screen's backing, under an `8px` dot grid of white at 16%.

### Named Rules
**The One Crimson Rule.** Crimson is the only chromatic color. Use it for fills, the title bar, and selection, never for body text.

**The Ink Step Rule.** Separate regions by stepping the ink ramp (`ink-1` ground, `ink-2` strips and dialogs), not by borders or tinted panels.

## Typography

**Display Font:** Anton (with `'Arial Narrow', sans-serif`)
**Body Font:** Raleway variable (with `system-ui, sans-serif`)
**Label/Mono Font:** Roboto Mono variable (with `ui-monospace, monospace`)

All three faces are self-hosted as `woff2` and load with `font-display: swap`. Anton is preloaded.

**Character:** a condensed poster face for names and actions, a light geometric sans for reading, and a mono for the technical aside.

### Hierarchy
- **Display** (Anton 400, `15cqi` of the screen, line height `0.9`, uppercase): the title inside the game screen before **Start**. It scales with the screen container.
- **Headline** (Anton 400, `30px`, line height `0.9`, uppercase): the name dialog title.
- **Wordmark** (Anton 400, `26px`, line height `1`, `0.02em`, uppercase): the name in the header.
- **Button** (Anton 400, `22px`, line height `1`, `0.01em`, uppercase): all buttons. **Start** steps up to `34px`; the small buttons in the header step down to `13px`; dialog buttons step down to `18px`.
- **Body** (Raleway 400, `16px`, line height `1.8`): the base. The status line uses `15px` at line height `1.7` with a `30ch` measure. The key legend uses `14px`.
- **Label** (Raleway 500, `13px`, line height `1`): form labels. Dialog notes use Raleway `13px` at line height `1.6`.
- **Mono** (Roboto Mono): the player's name in the header (500, `13px`), the online count in the online row (400, `15px`, line height `1.6`), and on touch devices the count beside its icon (500, `13px`), the footer (400, `12px`, line height `1.7`, bold runs at 500), and key-cap labels (500, `13px`).

### Named Rules
**The Display Is Uppercase Rule.** Anton is always uppercase, weight 400, with line height `0.9` for headings and `1` for single-line labels. Headings use `text-wrap: balance`.

**The Mono Is An Aside Rule.** Roboto Mono is limited to the header's name, the online count, the footer, and key caps. Don't use it for headings, buttons, or form text.

## Layout

The page is at least one viewport tall (`min-height: 100dvh`) and clips the ghost name to its box. At common desktop sizes, from about `1280 × 600` up, everything fits without scrolling; shorter or zoomed windows scroll rather than clip. It is a three-row grid: a `72px` header, a centered main area, and a footer strip. The header and footer use `48px` side gutters.

The game screen is centered in the main area. Its height is `clamp(300px, 100dvh - 330px, 640px)` at a `3 / 4` aspect ratio, and it is a size container so content inside it scales with `cqi` units. Overlays inside the screen pad by `6cqi`, stack centered with a `3cqh` gap, and scroll if their content is taller than the screen. The file picker carries a one-line hint under its buttons; error states carry **Reload** and, for a stored or chosen copy, **Use a different copy**. After a [quit](CONTEXT.md), the overlay says the game is being saved, and the page then reloads to **Start**; if a member's saved game can't reach the server, the overlay carries **Try again** and a secondary **Quit anyway**. Below the screen sit the online row and the key legend, `18px` apart. The online row shows the online count in its center and the **Soft screen** toggle at its right end. A notice or the offer to sign in replaces the count while it is shown.

The key legend is one wrapping row: `10px` between rows, `28px` between groups, `6px` between caps and their label. It shows the player's [custom keys](CONTEXT.md) in five groups: Move, Select, Back, Menu, and Chat. Select and Back are the page's names for the engine's Primary and Secondary actions. Select adds "or Enter" unless Enter is the chosen key, and Menu is always Esc. The legend changes as soon as the engine saves new keys.

The legend has two versions with the same five groups, so switching doesn't move the page: the keys, and the gamepad's buttons (see [Key caps](#key-caps)). It follows the input last used. A press on the gamepad in use switches it to the buttons at once, the first press included, with no animation, and the next key press switches it back; clicks and touches don't switch it. In the gamepad version Select has no "or Enter", and Chat keeps its key, because the gamepad has no chat button.

The footer is a two-column grid (`1fr auto`, `48px` gap): the disclaimer and the credit on the left (max `110ch`, two lines), and on the right one small secondary **Notices** button. On a public server the credit line ends with links to the **Terms** and the **Privacy policy**. The button opens the notices dialog (see [Shadow Vocabulary](#shadow-vocabulary)), which holds everything else legal.

Below `1000px` wide, the footer stacks into one left-aligned column. Below `760px` wide, the page scrolls. The header shrinks to `64px` with `16px` gutters and hides the words after **Sign in**. Main pads `24px 16px 48px`. The footer stacks into one left-aligned column with `32px 16px` padding.

On touch devices (`hover: none` and `pointer: coarse`), the header, the online row, the key legend, the ghost type, and the folder button hide, and the touch pad sits under the screen. The who line replaces the header, the online count moves into the Start screen, and notices sit under the touch pad, as the slowness notice does. Main pads `0 16px 16px` with a `12px` gap, and its content starts at the top. The screen's width is `min(100%, (100dvh - chrome - pad) * 3 / 4)`, so it fills the visible height, and the pad is a cluster centered under it. In portrait, the pad is the D-pad's size, `clamp(116px, 24.5dvh, 240px)`, and `chrome` is the height reserved for the gaps: `30px`. A `390 × 664` phone viewport (an iPhone 13 in Safari) gets a screen about `353 × 471`, so each game pixel is about 4.4 device pixels. The rest of the page scrolls, so the footer stays reachable below the pad.

In landscape on touch devices, the D-pad is `clamp(116px, 32dvh, 240px)` and `chrome` drops to `16px`, so the same column shrinks to fit the height. The pad can be wider than the screen there, because the cluster is as wide as the D-pad plus its two buttons. A phone gets a small but playable game; there is no separate tablet landscape layout.

In fullscreen (the pad's **Fullscreen** button) the browser pins the page to the viewport. The page then sizes its rows to their content and scrolls, so the screen and the pad keep exactly the size and place they have outside fullscreen and the footer sits below them, one swipe away. Letting the footer share the pinned height squeezed the page's content area and pushed the pad up under the screen, which then covered its buttons.

## Elevation & Depth

The page is flat. Depth comes from the ink ramp: `ink-1` ground, `ink-2` for the footer strip and dialog. Two soft, dark shadows lift the only objects that sit above the stage.

### Shadow Vocabulary
- **Screen lift** (`box-shadow: 0 2px 16px rgb(0 0 0 / 40%), 0 2px 4px rgb(0 0 0 / 30%)`): the game screen only.
- **Dialog lift** (`box-shadow: 0 2px 16px rgb(0 0 0 / 50%)`): the name dialog over the screen. The notices dialog is the exception: it covers the page (fixed, centered, up to `520px` wide, scrolling inside if the viewport is short) and dims everything else with a `65%` black shade instead of a lift.

### Named Rules
**The Flat Frame Rule.** Header, footer, legend, and buttons carry no shadow. Only the game screen and dialogs above it are lifted.

## Shapes

Every corner is square (`border-radius: 0`), including buttons and inputs. Borders are `1px` solid. The one recurring mark is the title bar: a crimson rule `128px` wide (max `45%`), `4px` tall, `12px` below a title.

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

### Cards / Containers
- **Name dialog:** `ink-2` fill, square, `24px` padding, `14px` gap, width `min(320px, 86%)`, centered over the screen with the dialog lift. Its title carries the crimson bar. It holds one field, **Player name**, and its actions, **Cancel** and **Play online**, sit right-aligned, `10px` apart, secondary before primary.
- **Screen overlay:** `ink-0` at `82%` (`rgb(17 20 27 / 82%)`) over the screen, holding the title, status line, and actions.
- **Online-as line:** one `hint` line under **Start** that names the player's online name, with a secondary **Change name** button at `13px` with `4px 8px` padding. It appears only after the player has set a name.
- **Acceptance line:** on a public server, one `hint` line right under **Start**: "By playing online you accept the Terms and the Privacy policy.", the two names underlined links in `light-2`, opening in a new tab. The name dialog for a new member ends its note with the same sentence about saving the name.
- **Who chip:** in the header's right, the player's name in mono, then, for a guest, a secondary **Sign in with Discord**; a member sees an **Account** summary that opens a panel on `ink-2` with **Download my data**, **Sign out**, and **Delete my account**. Buttons are `13px` with `6px 12px` padding. On a touch device the same content sits as one line under **Start**, the who line, and the panel opens inline.
- **Online count:** `3 online` in Roboto Mono `15px` in `light-2`, centered in the online row under the game screen, on desktop only; the online row also holds the **Soft screen** toggle at its right end. On a touch device the count moves to the last row of the Start screen's overlay, as a `16px` two-person line icon (`1.4` square-capped stroke in `light-3`) and the number in Roboto Mono `13px` at 500, with "players online" visually hidden for screen readers. Both hide when there is no server to ask, and "0 online" is shown, not hidden. A notice replaces the count while it is up; the toggle stays. The admin's "Join the Discord" link, when set, sits in the footer after the credit line, underlined in `light-2`.
- **Soft screen toggle:** a pressed-state button for the [screen finish](CONTEXT.md). On desktop it is the right end of the online row, a secondary button at `13px` with `4px 8px` padding labeled **Soft screen**, with an `8px` square before the label, filled while the finish is soft and hollow while it is sharp; pressed, it takes white text and border. Pressing it hands focus back to the game screen, and its keys never reach the game. On a touch device it is a quiet icon in the touch pad (a square cut by a 3 × 3 pixel grid), pressed in white. Its choice is kept in this browser (`rg:finish`), never on the account. It hides under `prefers-contrast: more`.
- **Notice line:** one line of Raleway `15px` in `light-2` under the screen, with small buttons at `16px` with `8px 14px` padding. It holds sign-in results and the once-a-day offer to sign in after a guest earns fame. It also says "Gamepad connected." for about 3 s when a gamepad becomes the one in use, and "Gamepad disconnected." when that gamepad disconnects during play, until the next key, touch pad, or gamepad press. A gamepad notice never replaces a notice with actions, a pad the page ignores gets neither, and the page has no other gamepad wording.
- **Slowness notice:** one line of Raleway `13px` in `light-2` under the touch pad, as wide as it, with a secondary **Dismiss** button at `16px` with `6px 12px` padding. It appears at most once per visit.

### Terms and Privacy policy
Two reading pages, `/terms` and `/privacy`, on the same stage (`web/ui/doc.css` on the shared `base.css`). The header keeps the wordmark, as a link home, and a quiet **Back to the game** outline link at Anton `13px` on the right; the footer keeps the disclaimer and links both pages. The page's own name, as the ghost, sits at the top right at `19vw` (`30vw` on a phone), outlined in white at `12%`.
- **Column:** one reading column of at most `68ch`, centered, with a `200px` list of the sections to its left, sticky `32px` from the top, in Raleway 500 `13px` `light-3`, white on hover. Below `1000px` the list hides and the column takes the width.
- **Title:** Anton uppercase at `clamp(48px, 6.4vw, 88px)` with the crimson bar, then "Last changed" in Raleway `13px` `light-3`.
- **Facts band:** one `ink-2` band, `24px` padding, with three pairs: **Run by**, **Data stored by**, and **Write to**. Labels are the form label (Raleway 500 `13px` `light-3`), values Anton uppercase `20px` in white. Below `1000px` the pairs stack.
- **Text:** a lede in Raleway `19px` white, then sections whose headings are Anton `30px` with `64px` above and `18px` below. Body is Raleway `16px` at `1.8` in `light-2`; lists use square markers in crimson; links are white with a `light-3` underline that turns white on hover; bold runs are white at 600.

### App icon
The favicon and the Discord app icon are one mark: white **RG** in Anton on `ink-0` (`#11141b`), as a full-bleed square with no crimson and no rounded corners, because browsers, iOS, and Discord apply their own masks. The letters are outlines (Anton is under the SIL Open Font License, see `web/fonts/OFL-anton.txt`), `64%` of the tile wide and centered, so their corners stay inside the circle Discord crops icons to. They are drawn once as `web/public/favicon.svg`; `favicon.ico` (16, 32, and 48), `apple-touch-icon.png` (180), and `icon-512.png` (the file to upload as the Discord application's icon) are renders of it. Both names, Reset Generation and Restart Generation, abbreviate to RG, and the mark uses no RedLynx lettering or logo.

### Touch pad
On touch devices only, under the game screen. The game is played with one thumb whenever possible, so everything it needs while playing is a short swing from the D-pad. A two-column grid with a `24px` gap, centered under the screen: the D-pad on the left; **Select**, **Back**, **Keyboard**, **Soft screen**, and, where the browser supports fullscreen, **Fullscreen** on the right, which suits a right thumb and is not mirrored. The cluster is as wide as it needs: the D-pad, `24px`, and two cells `16px` apart.
- **D-pad:** four square buttons on a 3 × 3 grid with a `4px` gap: Up, Left, Right, and Down. The middle and the four corners are empty and press nothing, so a thumb that returns to the middle between taps presses no key. (**Select** was the middle cell until portrait testing showed that those returning touches often started on it. With **Select** inside the D-pad, a cell measured about 66&nbsp;px on an 844&nbsp;px-tall iPhone 13.) Each arrow carries an SVG arrow at `40%` (max `30px`) with a `1.4` square-capped stroke in `light-2`, on an `ink-2` fill with a `1px` `ink-3` border.
- **Select:** a crimson square the size of a D-pad cell, in the right side's top row, level with Up and `24px` from the D-pad's right edge (so a corner cell and `24px` from Up). Its label is Anton at `min(0.34 × the cell, 24px)`, so it scales with the cell. **Back** is beside it, `16px` away.
- **Back:** an `ink-2` square the size of a D-pad cell, in the top row to the right of **Select**, `16px` from it and level with Up, labeled in Anton `16px`. It sits outside the D-pad on purpose: it cancels, and in a battle it opens the game's menu, so a press meant for Up or Right must never reach it. It is about `102px` from the D-pad on a 390&nbsp;px-wide phone (`24px`, a cell, and `16px`), so a press meant for an arrow can't reach it.
- **Sliding:** a finger sliding between the arrows moves the press with it, and one that slides over the D-pad's empty middle or corners lets go of its arrow and presses the next arrow it reaches. A touch that starts on empty space presses nothing. **Select** and **Back** are never taken or given up by sliding: each starts only from a touch that begins on it and lasts until the finger lifts, so a drift while holding **Select** can't press an arrow, and a slide from an arrow, or across the middle, never presses **Select** or **Back**.
- **Sizes:** the D-pad is a square of `clamp(116px, 24.5dvh, 240px)` in portrait and `clamp(116px, 32dvh, 240px)` in landscape, and at most `60vw - 40px`, which keeps the D-pad, the gap, and the two buttons inside the width. **Select** and **Back** take the width of a cell. Cells measured in emulation: about 62&nbsp;px on an iPhone 13 at 844&nbsp;px tall and about 51&nbsp;px at 664&nbsp;px tall; 50&nbsp;px on a 360 × 640 phone; 77&nbsp;px on an iPad; 43&nbsp;px on a 320 × 568 phone; and 39&nbsp;px in phone landscape. Android asks for 48&nbsp;dp and iOS for 44&nbsp;pt, so the smallest phones and landscape fall short.
- **Keyboard, Soft screen, and Fullscreen:** quiet icon buttons, each a `44px` square with a `1px` `ink-3` border, a transparent fill, and a drawn SVG icon (`24px`, `1.4` stroke) in `light-3`, in the right side's second and third rows at its right edge. They are rarely pressed. There is no **Menu** button: in a battle **Back** opens the game's menu, as Esc does, and on the main menu both open the Quit dialog. **Keyboard** stays because typing a friend's name is the only way to add a friend.
- **Keys:** **Select** presses Enter and **Back** presses Esc, the keys the engine keeps on those actions whatever the player chooses, so a rebind can't take them away. The D-pad presses the keys the player chose for each direction.
- **Held:** a pressed control inverts to a white fill, a crimson label, and a white border at once, with no transition, for as long as it's held. **Keyboard** stays held while the device's keyboard is up. Pad buttons don't change on hover, because a touch screen keeps a tapped button hovered.

### Inputs / Fields
- **Style:** `ink-1` fill, `1px` `light-3` border, square, `10px 12px` padding, Raleway `15px`, white text and caret.
- **Label:** Raleway 500 `13px` in `light-3`, stacked `6px` above the field.
- **Focus:** the global ring, `2px` solid white, offset `2px`.

### Navigation
There is no navigation. The header holds only the wordmark on the left and, on a server with accounts, the who chip on the right. Touch devices don't show the header.

### Key caps
Square `kbd` caps, at least `30px` wide and `30px` tall, `0 8px` padding, `1px` `light-3` border, `ink-1` fill, white Roboto Mono 500 `13px` label. Arrow keys use inline SVG arrows at `12px` with a `1.6` square-capped stroke in the current color; each carries a visually hidden text name. In Move, a key that isn't its direction's own arrow also carries a hidden "for Up" (Down, Left, Right), and an action with no key shows a dash.

After a press on the gamepad, the caps show its buttons instead: our own inline SVG glyphs at `16px` in white, with the arrows' `1.6` square-capped stroke, in caps with no padding, so they stay `30px` square. Move is a D-pad cross; Select and Back are a diamond of four dots, with the bottom dot filled for Select and the right one for Back; Menu is ≡. They draw each button by its position, because a browser can't reliably tell which brand of pad is in use. Their hidden names are "D-pad or left stick", "Bottom button (A on Xbox, Cross on PlayStation, B on Nintendo)", "Right button (B on Xbox, Circle on PlayStation, A on Nintendo)", and "Menu button (Menu on Xbox, Options on PlayStation, + on Nintendo)".

### Game screen
The engine's canvas fills a `3 / 4` frame. By default it is shown soft (the [screen finish](CONTEXT.md)): scaled smoothly (`image-rendering: auto`), and, where each game pixel is at least `2.4` device pixels wide, under a faint pixel grid, one cell per game pixel, a `22%` black fade across the cell's right and bottom `45%`. Below that width the grid is left off, because at a fractional pitch it shimmers; the smoothing stays. The grid sits under the overlay and the dialogs, which are page UI and stay sharp. Sharp (the player's choice, or `prefers-contrast: more`) scales with `image-rendering: pixelated` and has no grid. The frame's backing is black under an `8px` white dot grid at 16%, and it carries the screen lift.

## Do's and Don'ts

### Do:
- **Do** keep the game screen the largest object on the page and centered.
- **Do** set every display line in Anton 400 uppercase at line height `0.9`.
- **Do** mark titles with the crimson bar (`128px` by `4px`, `12px` below).
- **Do** keep every corner square (`0`).
- **Do** invert buttons on hover over `0.2s`: crimson to white for primary, muted outline to white outline for secondary.
- **Do** separate regions with ink steps (`ink-1`, `ink-2`).

### Don't:
- **Don't** use crimson for body or running text.
- **Don't** introduce a second accent color or a light theme.
- **Don't** round corners.
- **Don't** use Roboto Mono beyond the header's name, the online count, the footer, and key caps.
- **Don't** add shadows to anything except the game screen and dialogs over it.
- **Don't** add game art, screenshots, or RedLynx or Ubisoft logos to the page.
