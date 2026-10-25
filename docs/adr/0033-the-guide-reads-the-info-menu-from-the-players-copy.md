# The guide reads the info menu from the player's copy

Newcomers don't find the engine's info menu, where the game explains how to play and describes its heroes and items. The page's **guide** (CONTEXT.md) shows that content in a dialog with three tabs, opened from the row under the game screen or from the touch pad. The game's text, item icons and hero portraits belong to RedLynx (`docs/LEGAL.md`, rule 2), so the guide reads them while the page runs, in the browser, from the copy that browser already holds, and keeps them only in memory. This is how the page already uses the curtain (ADR 0017). The server never reads, caches, renders in advance or serves guide content, to anyone, so the guide sends nothing that the game itself didn't already send.

## Considered options

- **Write our own guide.** Rejected: it would describe the heroes and items in our words, which is allowed, but only in English, apart from what the game says in its eight languages, and kept in step with the game by hand. It would also invite copying its text.
- **Have the server read the copy and serve the guide, so that visitors without a copy see it too.** Rejected: that hands the game's text and art to anyone who asks. It would be a second way of distributing game content, beside the download code of ADR 0031, and without its limits.
- **Open the engine's own info menu from a page button.** Rejected: it would need hooks into the engine's menus, it would leave the game wherever the player was, and it would still show 240 × 320 pages, which the guide is meant to improve on.

## Consequences

- No copy, no guide. A visitor who hasn't loaded a copy, their own or one the server sent, sees no button. Nor does a player whose copy's info menu files are missing or don't decode, as with the Full board (ADR 0017).
- The guide shows what the info menu shows, in the language the engine uses. It shows no numbers from the gameplay data, and it leaves out the info menu's About page.
- The sheet layout, the `.lng` text format, the `.gfx` image kind of the icons and the portraits, and the palettes go into `docs/re/` in our own words before any code reads them. Tests use a made-up pak.
- Screenshots and recordings of the guide with real content stay out of commits, issues, pull requests and CI artifacts, like any picture of the game (`docs/LEGAL.md`, ADR 0025).
