# Keeping the legal risk of this project low

Restart Generation revives a game that is out of print and an online service that is shut down. That is a good reason to do it and no legal defence: the game, its code and its art are RedLynx's work (now Ubisoft's), and N-Gage Arena was Nokia's. This page is for every commit and every contributor. It is not legal advice; if a notice arrives, read [A notice arrives](#a-notice-arrives) and get a lawyer before replying.

The model is EKA2L1, the Symbian and N-Gage emulator: it ships no firmware, no ROMs and no games, says it isn't affiliated with Nokia, and is free software that reimplements what it needs. What we do beyond that is run a server and, if an admin chooses, send the game to visitors. Those are the parts that need most care.

## The rules for every commit

Before you commit, ask each of these. If one is "yes", don't commit it, and ask.

1. **Is it a file from the game or its platform?** The game's `.dll`, `.dylib`, `.jar`, `.pak`, `.gfx`, `.spc`, `.pal`, `.ass`, `.lng`, the standalone `.zip`, anything unpacked from them, N-Gage packages. No.
2. **Is it the game's content?** Its art, sound, music, video, text or strings, level and battle data, stat tables, AI weights, XML. No. That includes **screenshots and recordings of the game**, even to illustrate a bug or a doc. Describe it in words.
3. **Is it decompiled or disassembled output?** Ghidra pseudocode, cfr Java, listings, function bodies. No. A note may say that `FUN_100f94a0` reads the display description at `+0x18`, in our own words; it may not paste what the decompiler printed.
4. **Is code translated from the original?** Don't turn decompiled code into JavaScript. First write what the original does into `docs/re/` or `docs/protocol.md`, in your words, and then implement from that note. Names the engine's own interface fixes (its JNI function names, message type numbers, wire formats) are interoperability facts and may be used.
5. **Is it someone else's work?** Fonts, images, code and text need a licence we can ship under (MIT, BSD, Apache-2.0, OFL for fonts, or GPL-3.0-compatible) and an entry in `THIRD_PARTY_NOTICES.md`. Don't paste from another project without checking its licence.
6. **Does it look like the rights holders' own?** No RedLynx, Ubisoft or Nokia logos, no imitation of their sites, nothing that reads as official. Keep the footer's non-affiliation line and the Notices dialog's full text. Examples use `example.com`, not the game's name.
7. **Is it personal or secret?** No account data, tokens, `.env` values, emails, or paths from your own machine. `data/` stays ignored. Tests use made-up data.

New images, video, audio or fonts must be listed in `tools/legal-allow.json` with where they come from. An exception to any other rule needs an ADR.

## What enforces it

- `npm run legal-check` refuses the file types, folders, unlisted media, decompiler output, disassembly, long hex strings, secrets and local paths above. `npm test` runs it.
- `npm run hooks` makes git run it before every commit in your clone. Run it once.
- `.github/workflows/legal.yml` runs it on every push and pull request, over the whole history as well.
- It can't recognise a screenshot or a recording. Rule 2 is on you.

## Where this repository is weakest

We say so plainly so that nobody has to find it out:

- **The emulator runs RedLynx's engine.** The page and the server execute the original code from a copy the player or the admin supplies (ADR 0003). The repository contains none of it.
- **`docs/re/` and `tools/re/`** are our notes and scripts about the engine, made by decompiling it. They hold no decompiled code, but they are derived from it (ADR 0001). They are the first thing to remove if asked.
- **`server/snap.js` keeps the original protocol's per-command flags** (which parameters are base64 or scrambled), as wire facts a server has to match. It holds no password keys: an unmodified Java client's scrambled password is read as empty, and any password is accepted with a name only (ADR 0018). Older commits of the source checkout still hold the key table; `tools/scrub-tree.mjs` replaces each key in the published history by a digest of it, and rewrites the wording that named the original classes.
- **A server that sends the game** (`RG_GAME`) distributes it. See below.

## Serving the game

ADR 0001 lets an admin set `RG_GAME` and send their copy to every visitor, at their own risk. On a server that does:

- `RG_CONTACT`, an email address or an https address where a rights holder can ask for the game's removal, is required. A `--public` server won't start without it, and the page shows it in its Notices dialog.
- No advertising, no donation links, no payments on that server or its page.
- The templates in `data/templates/` are only used by the server and are never sent to a browser. Never commit them, and never publish a backup of `data/`.
- Keep the way to switch it off at once: unset `RG_GAME_PATH` and restart.
- Say nothing that claims the copy is licensed or official.

## A notice arrives

1. Don't reply in public, and don't argue on social media.
2. Do what it asks for the named material at once: unset `RG_GAME_PATH`, remove the file or the path. A removal is not an admission.
3. Keep the notice and what you did. Tell your host before they tell you. Notices about this repository reach the maintainer at the address in the README's Legal section.
4. A counter-notice, a repository takedown dispute or any admission is for a lawyer.

## Publishing

1. Merge what you want to publish into `development`, and make sure `npm test` passes.
2. `node tools/publish.mjs` works in this checkout and only on what isn't published yet. It fetches the public `main` (into `refs/public/main`), matches each published commit to its source commit, and rewrites only the newer ones on top: every author becomes the GitHub no-reply address, the files are scrubbed (`tools/scrub-tree.mjs`: wording that named the original client's classes, an example domain that held the game's name, the authors' real names in files), and the design critique in `.impeccable/critique`, which says the page's look is borrowed from the rights holder's site, is left out. Then it runs the legal check and looks for real names, addresses and keys in the new commits, and shows them. It pushes nothing.
3. Read the list, then run `node tools/publish.mjs --push`. It pushes only when the checks pass, and never with force: if the public `main` has a commit it can't match, it stops. The first time, against an empty repository, it rewrites the whole branch.
4. Other local branches are not published. Some of them hold reference screenshots of third-party websites and must never be.
5. The Notices dialog links to the source at https://github.com/vyonizr/restart-generation, as the GPL asks. If the repository ever moves, change `SOURCE` in `web/ui/NoticesDialog.svelte`.

## Keeping this current

A change to these rules is an ADR. When a rule turns out to be wrong or too weak, change the check first, then this page. `docs/adr/0018-publishing-with-legal-guardrails.md` records why they are what they are.
