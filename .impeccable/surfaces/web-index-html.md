---
version: 1
slug: "web-index-html"
primary_target: "web/ui/App.svelte"
related_targets: ["web/ui/styles.css", "web/ui/Overlay.svelte", "web/ui/Pad.svelte", "web/ui/Footer.svelte", "web/index.html"]
---

# Surface brief: the page

The page is built from `web/index.html` (the shell), `web/ui/styles.css` (the CSS and the `DESIGN.md` tokens) and the Svelte components in `web/ui` (ADR 0013). `App.svelte` lays it out. This brief kept its `web-index-html` name from before the move.

Mode: **Experience**. The game leads; the frame (header, hero, footer) recedes.

Audience and job: players who own the Windows standalone build reach **Start** in a few steps, by choosing their files (static host) or straight away (server with `RG_GAME`), then play with the keyboard. Product truth lives in `PRODUCT.md`.

Decided in "Choose the visual direction": direction B, Stage, dark only.

## Direction contract

THESIS: The engine's own 240 × 320 screen is the hero, centred at the largest size that fits one viewport. It refuses the category default: a landing page with a banner, feature cards, and a play button below the fold.

OWN-WORLD: A dark stage, dark only. Ground `#181c26`, footer strip `#282b35`, white text, `#c6cad7` secondary. One crimson, `#a50034`, for fills, buttons, and the 4 px bar under the title, never as body text. Anton uppercase display at line height 0.9, Raleway body, Roboto Mono for the header tag, hero line, and footer. Square corners. Buttons invert to white on hover over 0.2 s. A huge 1 px outlined "RESTART GENERATION" ghost sits behind the screen at about 12% opacity.

STORY: A player sees the name, brings their own copy or presses **Start**, and plays without scrolling. The key legend stays in view while they play. The footer says plainly that this is an unofficial fan revival, and that the files stay in the browser.

FIRST VIEWPORT: 72 px header with the name in Anton on the left and, on a server with Discord sign-in, the player's name and **Sign in with Discord** (or level and **Account**) on the right. The screen is centred at clamp(380px, 100vh − 330px, 640px) tall. Before the game starts, the screen holds the title with its red bar, the status line, and the actions (**Choose .zip file** and **Choose folder**, or **Start**). Below the screen: the mono hero line "The original 2008 game, right in your browser (again)", followed by who is online and a link to the operator's Discord, then a one-row key legend. Footer strip: disclaimer and credit on the left, files note on the right. The whole page fits one desktop viewport (1280 × 720 and up). On phones the keyboard message replaces the screen, the legend hides, and the page scrolls.

FORM: Stage, position 1 of the ordered list (Stage, Split hero, Step strip, Rail, Handheld HUD, Poster, Bands); seed key `6b6713f3`. The user changed it to fit one viewport, put Rail's key legend under the screen, and dropped the How to play and Your copy bands.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
