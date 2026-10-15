---
version: 1
slug: "web-index-html"
primary_target: "web/index.html"
related_targets: []
---

# Surface brief: web/index.html

Mode: **Experience**. The game leads; the frame (header, hero, footer) recedes.

Audience and job: players who own the Windows standalone build reach **Start** in a few steps, by choosing their files (static host) or straight away (server with `RG_GAME`), then play with the keyboard. Product truth lives in `PRODUCT.md`.

Decided in "Choose the visual direction": direction B, Stage, dark only.

## Direction contract

THESIS: The engine's own 240 × 320 screen is the hero, centred at the largest size that fits one viewport. It refuses the category default: a landing page with a banner, feature cards, and a play button below the fold.

OWN-WORLD: A dark stage, dark only. Ground `#181c26`, footer strip `#282b35`, white text, `#c6cad7` secondary. One crimson, `#a50034`, for fills, buttons, and the 4 px bar under the title, never as body text. Anton uppercase display at line height 0.9, Raleway body, Roboto Mono for the header tag, hero line, and footer. Square corners. Buttons invert to white on hover over 0.2 s. A huge 1 px outlined "RESET GENERATION" ghost sits behind the screen at about 12% opacity.

STORY: A player sees the name, brings their own copy or presses **Start**, and plays without scrolling. The key legend stays in view while they play. The footer says plainly that this is an unofficial fan revival, that the files stay in the browser, and that online play needs a replacement Arena server.

FIRST VIEWPORT: 72 px header with the name in Anton on the left and "Unofficial fan revival" in mono on the right. The screen is centred at clamp(380px, 100vh − 330px, 640px) tall. Before **Start**, the screen holds the title with its red bar, the status line, and the actions (**Choose .zip file** and **Choose folder**, or **Start**). Below the screen: the mono hero line "The original 2009 game, right in your browser (again)", then a one-row key legend. Footer strip: disclaimer and credit on the left, files and online notes on the right. The whole page fits one desktop viewport (1280 × 720 and up). On phones the keyboard message replaces the screen, the legend hides, and the page scrolls.

FORM: Stage, position 1 of the ordered list (Stage, Split hero, Step strip, Rail, Handheld HUD, Poster, Bands); seed key `6b6713f3`. The user changed it to fit one viewport, put Rail's key legend under the screen, and dropped the How to play and Your copy bands.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
