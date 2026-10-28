---
version: 1
slug: "web-index-html"
primary_target: "web/src/App.svelte"
related_targets: ["web/src/styles/app.css", "web/src/lib/game/Overlay.svelte", "web/src/lib/input/Pad.svelte", "web/src/lib/legal/Footer.svelte", "web/index.html"]
---

# Surface brief: the page

The page is built from `web/index.html` (the shell), `web/src/styles/app.css` (the CSS and the `DESIGN.md` tokens), and the Svelte components in `web/src` ([architecture decision record (ADR) 0013](../../docs/adr/0013-the-page-is-built-with-vite-and-svelte.md)). `App.svelte` lays it out. This brief kept its `web-index-html` name from before the move.

Mode: **Experience**. The game leads; the frame (header, hero, footer) recedes.

Audience and job: players who own the Windows standalone build reach **Start** in a few steps, by choosing their files (static host) or straight away (a server that sends the game, ADR 0031), then play with the keyboard or the touch pad. Product truth lives in the [product brief](../../PRODUCT.md), and the detailed design in the [design system](../../DESIGN.md).

Decided in "Choose the visual direction": direction B, Stage, dark only.

## Direction contract

THESIS: The engine's own 240 × 320 screen is the hero, centered at the largest size that fits one viewport. It refuses the category default: a landing page with a banner, feature cards, and a play button below the fold.

OWN-WORLD: A dark stage, dark only. Ground `#181c26`, footer strip `#282b35`, white text, `#c6cad7` secondary. One crimson, `#a50034`, for fills, buttons, and the `4px` bar under the title, never as body text. Anton uppercase display at line height 0.9, Manrope body, Roboto Mono for the header's name, the online count, the footer, and key caps. Square corners. Buttons invert to white on hover over `0.2s`. A huge `1px` outlined "RESTART GENERATION" ghost sits behind the screen at about 12% opacity.

STORY: A player sees the name, brings their own copy or presses **Start**, and plays without scrolling. The key legend stays in view while they play. The footer says plainly that this is an unofficial fan revival; the file picker and the notices dialog say that the files stay in the browser.

FIRST VIEWPORT: A `72px` header with the name in Anton on the left and, on the right the online count (when a server answers) and, on a server with Discord sign-in, the who chip (the player's name and **Sign in with Discord**, or **Account**). The screen is centered at `clamp(300px, 100dvh - 330px, 640px)` tall. Before the game starts, the screen holds the title with its crimson bar, the status line, and the actions (**Choose .zip file** and **Choose folder**, or **Start**). Below the screen: a row with **Guide** at its left end (once the copy is loaded and its info menu can be read) and the **Full board** and **Soft screen** toggles at its right end, then a one-row key legend. Footer strip: the disclaimer and the credit (and the admin's "Join the Discord" link, when set) on the left, and the **Notices** button on the right. The whole page fits one desktop viewport from about 1280 × 600 up. On touch devices the header, the online row, and the key legend hide, the touch pad sits under the screen, and the page scrolls.

FORM: Stage, position 1 of the ordered list (Stage, Split hero, Step strip, Rail, Handheld HUD, Poster, Bands); seed key `6b6713f3`. The user changed it to fit one viewport, put Rail's key legend under the screen, and dropped the How to play and Your copy bands.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
