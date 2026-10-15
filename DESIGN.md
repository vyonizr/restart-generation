---
name: Reset Generation
description: The original 2009 game, right in your browser (again).
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

# Design System: Reset Generation

## Overview

**Creative North Star: "The Stage"**

The game's own screen is the hero. The page is a dark stage that frames the engine's 240 × 320 output at the largest size that fits one viewport, and everything around it recedes: a slim header, one line of mono text, a key legend, and a footer strip. The palette is near-black blue ink, white text, and a single crimson used for fills and marks.

The system is dark only (`color-scheme: dark`). Depth comes from flat ink steps, not from layered cards. Type is loud only where it names things: Anton uppercase for the name, titles, and buttons. Raleway carries reading text, and Roboto Mono carries the quiet utility voice. Every corner is square.

The page draws no game art of its own. The only imagery is the engine's screen after the player's files load, plus a huge outlined ghost of the name behind it.

**Key Characteristics:**
- One centred game screen as the hero, sized by viewport height.
- Dark ink ground with one crimson accent.
- Anton uppercase display at line height `0.9`.
- Square corners everywhere.
- Buttons invert on hover over `0.2s`.

## Colors

A near-black blue ink ramp with white text and one saturated crimson.

### Primary
- **Crimson** (`crimson`): button fills, the 4 px bar under titles, and text selection. It never sets running text.

### Neutral
- **Deep Ink** (`ink-0`): the screen overlay, at `82%`, one step below the ground.
- **Stage Ink** (`ink-1`): the page ground, text input fills, and key-cap fills. Also the `theme-color`.
- **Strip Ink** (`ink-2`): the footer strip, the login dialog, and the touch pad's D-pad and **Back** fills.
- **Rule Ink** (`ink-3`): the scrollbar thumb and the touch pad's borders.
- **White** (`white`): primary text, headings, button labels, key-cap labels, the default focus ring, and the primary-button hover fill.
- **Pale Steel** (`light-2`): supporting text that still needs to read, such as the status line, the hero line, the key legend, secondary button labels, and bold footer text.
- **Muted Steel** (`light-3`): quiet text, such as the header tag, form labels, dialog notes, and footer body text. Also the secondary button, text input and key-cap borders.
- **Screen Black** (`screen-black`): the game screen's backing, under an 8 px dot grid of white at 16%.

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
- **Headline** (Anton 400, `30px`, line height `0.9`, uppercase): the login dialog title.
- **Wordmark** (Anton 400, `26px`, line height `1`, `0.02em`, uppercase): the name in the header.
- **Button** (Anton 400, `22px`, line height `1`, `0.01em`, uppercase): all buttons. **Start** steps up to `34px`; dialog buttons step down to `18px`.
- **Body** (Raleway 400, `16px`, line height `1.8`): the base. The status line uses `15px` at line height `1.7` with a `30ch` measure. The key legend uses `14px`.
- **Label** (Raleway 500, `13px`, line height `1`): form labels. Dialog notes use Raleway `13px` at line height `1.6`.
- **Mono** (Roboto Mono): the header tag (500, `13px`), the hero line under the screen (400, `15px`, line height `1.6`), the footer (400, `12px`, line height `1.7`, bold runs at 500), and key-cap labels (500, `13px`).

### Named Rules
**The Display Is Uppercase Rule.** Anton is always uppercase, weight 400, with line height `0.9` for headings and `1` for single-line labels. Headings use `text-wrap: balance`.

**The Mono Is An Aside Rule.** Roboto Mono is limited to the header tag, the hero line, the footer, and key caps. Don't use it for headings, buttons, or form text.

## Layout

The page is at least one viewport tall (`min-height: 100dvh`) and clips the ghost name to its box. At common desktop sizes, from about `1280 × 600` up, everything fits without scrolling; shorter or zoomed windows scroll rather than clip. It is a three-row grid: a `72px` header, a centred main area, and a footer strip. The header and footer use `48px` side gutters.

The game screen is centred in the main area. Its height is `clamp(300px, 100dvh - 330px, 640px)` at a `3 / 4` aspect ratio, and it is a size container so content inside it scales with `cqi` units. Overlays inside the screen pad by `6cqi`, stack centred with a `3cqh` gap, and scroll if their content is taller than the screen. The file picker carries a one-line hint under its buttons; error states carry **Reload** and, for a stored or chosen copy, **Use a different copy**. Below the screen sit the hero line and the key legend, `18px` apart.

The key legend is one wrapping row: `10px` between rows, `28px` between groups, `6px` between caps and their label.

The footer is a two-column grid (`1fr auto`, `48px` gap): the disclaimer on the left (max `110ch`) and notes right-aligned on the right.

Below `1000px` wide, the footer stacks into one left-aligned column. Below `760px` wide, the page scrolls. The header shrinks to `64px` with `16px` gutters and drops the tag. Main pads `24px 16px 48px`. The footer stacks into one left-aligned column with `32px 16px` padding.

On touch devices (`hover: none` and `pointer: coarse`), the hero line, the key legend, the ghost type, and the folder button hide, and the touch pad sits under the screen. Main pads `0 16px 16px` with a `12px` gap, and its content starts at the top. The screen and the pad share one width, `min(100%, (100dvh - chrome - pad) * 3 / 4)`, so both fill the visible height under the header. The pad is `clamp(120px, 38dvh, 330px)` tall, and `chrome` is the height reserved for the header and gaps: `120px` in portrait. The rest of the page scrolls, so the footer stays reachable below the pad.

In landscape on touch devices, the header hides and `chrome` drops to `16px`, so the same column shrinks to fit the height. A phone gets a small but playable game; there is no separate tablet landscape layout.

## Elevation & Depth

The page is flat. Depth comes from the ink ramp: `ink-1` ground, `ink-2` for the footer strip and dialog. Two soft, dark shadows lift the only objects that sit above the stage.

### Shadow Vocabulary
- **Screen lift** (`box-shadow: 0 2px 16px rgb(0 0 0 / 40%), 0 2px 4px rgb(0 0 0 / 30%)`): the game screen only.
- **Dialog lift** (`box-shadow: 0 2px 16px rgb(0 0 0 / 50%)`): the login dialog over the screen.

### Named Rules
**The Flat Frame Rule.** Header, footer, legend, and buttons carry no shadow. Only the game screen and dialogs above it are lifted.

## Shapes

Every corner is square (`border-radius: 0`), including buttons and inputs. Borders are `1px` solid. The one recurring mark is the title bar: a crimson rule `128px` wide (max `45%`), `4px` tall, `12px` below a title.

The ghost type is the page's signature silhouette: the name in Anton, uppercase, on two lines at `23vw` (`34vw` below `760px`), line height `0.82`, drawn as a `1px` outline in white at `12%`, centred behind the screen and inert.

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
- **Login dialog:** `ink-2` fill, square, `24px` padding, `14px` gap, width `min(320px, 86%)`, centred over the screen with the dialog lift. Its title carries the crimson bar. Actions sit right-aligned, `10px` apart, secondary before primary.
- **Screen overlay:** `ink-0` at `82%` (`rgb(17 20 27 / 82%)`) over the screen, holding the title, status line, and actions.
- **Slowness notice:** one line of Raleway `13px` in `light-2` under the touch pad, as wide as it, with a secondary **Dismiss** button at `16px` with `6px 12px` padding. It appears at most once per visit.

### Touch pad
On touch devices only, under the game screen and exactly as wide as it, `clamp(120px, 38dvh, 330px)` tall. A two-column grid: the D-pad at the left edge, the **Select** and **Back** cluster at the right edge, and a row of small buttons centred below them, `10px` apart.
- **D-pad:** a cross of four square buttons in a 3 × 3 grid. Each carries an SVG arrow at `40%` (max `30px`) with a `1.4` square-capped stroke in `light-2`, on an `ink-2` fill with a `1px` `ink-3` border.
- **Select:** a crimson square, `62%` of its cluster, at the cluster's top right. The label is Anton `24px` with "Hold to drop" under it in Raleway 500 `11px` at `75%` white.
- **Back:** an `ink-2` square, `42%` of its cluster, at the cluster's bottom left, labelled in Anton `20px`.
- **Sizes:** the D-pad and the cluster are each a square of `min(half the pad's width, 240px, pad height - 60px)`. In a small cluster, as in landscape on a phone, the labels scale with it and "Hold to drop" hides.
- **Small buttons:** **Menu**, **Keyboard**, and, where the browser supports fullscreen, **Fullscreen**. Each is `40px` tall with `0 14px` padding, a transparent fill, a `1px` `ink-3` border, and an Anton `16px` label in `light-2`.
- **Held:** a pressed control inverts to a white fill, a crimson label, and a white border at once, with no transition, for as long as it's held. **Keyboard** stays held while the device's keyboard is up. Pad buttons don't change on hover, because a touch screen keeps a tapped button hovered.

### Inputs / Fields
- **Style:** `ink-1` fill, `1px` `light-3` border, square, `10px 12px` padding, Raleway `15px`, white text and caret.
- **Label:** Raleway 500 `13px` in `light-3`, stacked `6px` above the field.
- **Focus:** the global ring, `2px` solid white, offset `2px`.

### Navigation
There is no navigation. The header holds only the wordmark on the left and the mono tag on the right.

### Key caps
Square `kbd` caps, at least `30px` wide and `30px` tall, `0 8px` padding, `1px` `light-3` border, `ink-1` fill, white Roboto Mono 500 `13px` label. Arrow keys use inline SVG arrows at `12px` with a `1.6` square-capped stroke in the current color; each carries a visually hidden text name.

### Game screen
The engine's canvas fills a `3 / 4` frame, scaled with `image-rendering: pixelated`. The frame's backing is black under an 8 px white dot grid at 16%, and it carries the screen lift.

## Do's and Don'ts

### Do:
- **Do** keep the game screen the largest object on the page and centred.
- **Do** set every display line in Anton 400 uppercase at line height `0.9`.
- **Do** mark titles with the crimson bar (`128px` by `4px`, `12px` below).
- **Do** keep every corner square (`0`).
- **Do** invert buttons on hover over `0.2s`: crimson to white for primary, muted outline to white outline for secondary.
- **Do** separate regions with ink steps (`ink-1`, `ink-2`).

### Don't:
- **Don't** use crimson for body or running text.
- **Don't** introduce a second accent color or a light theme.
- **Don't** round corners.
- **Don't** use Roboto Mono beyond the header tag, hero line, footer, and key caps.
- **Don't** add shadows to anything except the game screen and dialogs over it.
- **Don't** add game art, screenshots, or RedLynx or Ubisoft logos to the page.
