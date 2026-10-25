# Keep the legal risk of this project low

Restart Generation revives a game that is out of print and an online service that is shut down. That is a good reason to do it and no legal defense: the game, its code, and its art are RedLynx's work, which belongs to Ubisoft, and N-Gage Arena was Nokia's. This page is for every commit and every contributor. It isn't legal advice; if a notice arrives, read [A notice arrives](#a-notice-arrives) and get a lawyer before you reply.

The model is EKA2L1, the Symbian and N-Gage emulator: it ships no firmware, no ROMs, and no games, says it isn't affiliated with Nokia, and is free software that reimplements what it needs. What we do beyond that is run a server and, if an admin chooses, send the game to visitors. Those are the parts that need the most care.

## The rules for every commit

Before you commit, ask each of the following questions. If the answer to one is "yes," don't commit it, and ask.

1. **Is it a file from the game or its platform?** The game's `.dll`, `.dylib`, `.jar`, `.pak`, `.gfx`, `.spc`, `.pal`, `.ass`, `.lng`, the standalone `.zip`, anything unpacked from them, and N-Gage packages. No.
2. **Is it the game's content?** Its art, sound, music, video, text or strings, level and battle data, stat tables, AI weights, and XML. No. That includes **screenshots and recordings of the game**, even to illustrate a bug or a doc, and the traces, screenshots, and videos an end-to-end test takes while the engine runs ([ADR 0025](adr/0025-end-to-end-tests-run-in-playwright-with-the-engine-only-where-the-game-is.md)): they go into no commit, issue, pull request, or CI artifact. Describe it in words.
3. **Is it decompiled or disassembled output?** Ghidra pseudocode, cfr Java, listings, and function bodies. No. A note may say that `FUN_100f94a0` reads the display description at `+0x18`, in our own words; it may not paste what the decompiler printed.
4. **Is code translated from the original?** Don't turn decompiled code into JavaScript. First write what the original does into `docs/re/` or [`docs/protocol.md`](protocol.md), in your words, and then implement from that note. Names that the engine's own interface fixes (its Java Native Interface (JNI) function names, message type numbers, and wire formats) are interoperability facts, and you can use them.
5. **Is it someone else's work?** Fonts, images, code, and text need a license we can ship under (MIT, BSD, Apache-2.0, OFL for fonts, or GPL-3.0-compatible) and an entry in [Third-party notices](../THIRD_PARTY_NOTICES.md). Don't paste from another project without checking its license.
6. **Does it look like the rights holders' own?** No RedLynx, Ubisoft, or Nokia logos, no imitation of their sites, and nothing that reads as official. Keep the footer's non-affiliation line and the Notices dialog's full text. Examples use `example.com`, not the game's name.
7. **Is it personal or secret?** No account data, tokens, `.env` values, emails, or paths from your own machine. `data/` stays ignored. Tests use made-up data.

New images, video, audio, or fonts must be listed in `tools/legal-allow.json` with where they come from. An exception to any other rule needs an [architecture decision record (ADR)](adr/).

## What enforces it

- `npm run legal-check` refuses the file types, folders, unlisted media, decompiler output, disassembly, long hex strings, secrets, and local paths that the preceding rules name. `npm test` runs it.
- `npm run hooks` makes git run it before every commit in your clone, together with the commit message check ([CONTRIBUTING.md](../CONTRIBUTING.md#write-commit-messages)). Run it once.
- The same hooks check every push (`tools/publish-check.mjs`). A push to the public repository passes only if every commit it sends passes the checks of `tools/publish.mjs`, so a plain `git push` of `development` or any other source branch is refused: publish with `tools/publish.mjs` (see [Publishing](#publishing)). A push to any other repository gets the legal check on the commits it sends.
- `.github/workflows/legal.yml` runs it on every push and pull request, over the whole history as well.
- It can't recognize a screenshot or a recording. Rule 2 is on you.
- `npm run e2e` keeps its traces and screenshots in `tmp/e2e/`, which git ignores, and `.github/workflows/e2e.yml` uploads only `tmp/e2e/page/`, from the tests that run without the engine ([ADR 0025](adr/0025-end-to-end-tests-run-in-playwright-with-the-engine-only-where-the-game-is.md)).

## Where this repository is weakest

We say so plainly so that nobody has to find it out:

- **The emulator runs RedLynx's engine.** The page and the server execute the original code from a copy the player or the admin supplies ([ADR 0003](adr/0003-run-the-original-engine-in-an-x86-emulator.md)). The repository contains none of it.
- **`docs/re/` and `tools/re/`** are our notes and scripts about the engine, made by decompiling it. They hold no decompiled code, but they are derived from it ([ADR 0001](adr/0001-players-bring-their-own-game-files.md)). They are the first thing to remove if asked.
- **`server/snap.js` keeps the original protocol's per-command flags** (which parameters are base64 or scrambled), as wire facts a server has to match. It holds no password keys: an unmodified Java client's scrambled password is read as empty, and any password is accepted with a name only ([ADR 0018](adr/0018-publishing-with-legal-guardrails.md)). Older commits of the source checkout still hold the key table; `tools/scrub-tree.mjs` replaces each key in the published history by a digest of it, and rewrites the wording that named the original classes.
- **A server that sends the game** distributes it: a server that isn't `--public` to every visitor who reaches it, and a `--public` one to everyone who has its download code. See [Rules for a server that sends the game](#rules-for-a-server-that-sends-the-game).

## Rules for every public server

A `--public` server keeps players' personal data and lets strangers talk to each other, so it publishes its **Terms** (`/terms`) and its **Privacy policy** (`/privacy`), which name its admin ([ADR 0021](adr/0021-public-servers-publish-terms-and-a-privacy-policy.md)):

- `RG_ADMIN_NAME` (your legal name), `RG_HOSTING` (who stores the data for you), and `RG_CONTACT` (an email address or an https address where players and rights holders write) are required. A `--public` server won't start without all three.
- The Privacy policy describes what the code keeps, logs, and backs up. A commit that changes any of that changes `web/src/lib/legal/Privacy.svelte` too, and its date.
- Run the server as the policy says: `compose.yaml`'s log limits, nightly backups, and one backup copy off the server ([Terms and Privacy policy](HOSTING.md#terms-and-privacy-policy)).
- In the Discord application, link the two pages as its Privacy Policy and Terms of Service addresses.
- No advertising, no donation links, and no payments on the server or its page: its Terms say so.

## Rules for a server that sends the game

ADR 0001 lets an admin send their copy, the server copy in `RG_GAME`, at their own risk; [ADR 0031](adr/0031-the-server-sends-its-copy-only-to-a-download-code.md) decides to whom. A server that isn't `--public` sends it to every visitor, which suits a private network and nothing else. A `--public` server sends it only for its download code (`npm run download-code`), and without a code it sends it to nobody. A server that sends the game must follow these rules, and a public one the rules for every public server as well:

- Keep a server that isn't `--public` off the internet: everyone who reaches it gets the game. Use `--public` for a server the internet reaches.
- Give the download code only to people you know, in private. A code posted in public sends the game to everyone until it ends.
- Its `RG_CONTACT` is where a rights holder can ask for the game's removal. The Terms and the Privacy policy show it to everyone, and the Notices dialog shows it with the sending: to every visitor of a server that isn't public, and on a public one to every browser that received the game for the code. Answer it: a rights holder who gets no answer writes to your hosting provider or to GitHub instead.
- Nothing else on a public server's page says that it sends the game: that is the owner's decision in ADR 0031, which records its risk. It hides only whether your server sends it; this repository shows that the feature exists.
- The templates in `data/templates/` and `data/battle-templates.zip` are only used by the server and are never sent to a browser as they are. A battle's Game blob, made from a template, goes to its players when the battle starts and, in its replay, to anyone with the replay's link ([ADR 0022](adr/0022-replays-send-a-battles-game-blob-to-anyone-with-the-link.md)); `RG_REPLAYS=0` stops the replays. Never commit the templates, and never publish a backup of `data/`, which also keeps the compressed game (`game-bundle-*.br`) and the download code.
- Keep a way to stop at once: `npm run download-code -- --end` (in Docker, `docker compose exec rg npm run download-code -- --end`) ends the code without a restart; unsetting `RG_GAME` (`RG_GAME_PATH` with Docker) and restarting stops every kind of sending.
- Say nothing that claims the copy is licensed or official, and don't call the download code a key, a licence or an activation.

## A notice arrives

1. Don't reply in public, and don't argue on social media.
2. For the named material, do what the notice asks at once: end the download code (`npm run download-code -- --end`), unset `RG_GAME` and restart the server, or remove the file or the path. A removal is not an admission.
3. Keep the notice and a record of what you did. Tell your host before they tell you. Notices about this repository reach the maintainer at the address in the [README's Legal section](../README.md#legal).
4. Leave a counter-notice, a repository takedown dispute, or any admission to a lawyer.

## Publishing

To publish, do the following:

1. Merge what you want to publish into `development`, and check that `npm test` passes.
2. Run `node tools/publish.mjs`. It works only in this checkout and changes nothing remote: it rewrites only the commits that aren't published, runs the legal check, and lists what it found.

   In detail, it fetches the public `main` (into `refs/public/main`), matches each published commit to its source commit, and rewrites only the newer ones on top. Every author becomes the GitHub no-reply address. The files are scrubbed by `tools/scrub-tree.mjs`, which rewrites wording that named the original client's classes, an example domain that held the game's name, and the authors' real names in files. The design critique in `.impeccable/critique`, which says the page's look is borrowed from the rights holder's site, is left out. Then it runs the legal check, looks for real names, addresses, and keys in the new commits, checks their message format, and shows them. It pushes nothing.
3. Read the list, and then run `node tools/publish.mjs --push`. It pushes only when the checks pass, and never with force: if the public `main` has a commit it can't match, it stops. The first time you publish to an empty repository, it rewrites the whole branch.

   Each push to the public `main` is a release: once the checks pass there too, `.github/workflows/release.yml` tags it and writes its notes ([ADR 0019](adr/0019-releases-are-tagged-in-ci-on-the-public-main.md)).

Other local branches aren't published. Some of them hold reference screenshots of third-party websites and must never be published.

The Notices dialog links to the [source repository](https://github.com/vyonizr/restart-generation), as the GNU General Public License asks. If the repository moves, change `SOURCE` in `web/src/lib/legal/NoticesDialog.svelte`.

## Keep this page current

A change to these rules needs an ADR. When a rule turns out to be wrong or too weak, change the check first, and then this page. [ADR 0018](adr/0018-publishing-with-legal-guardrails.md) records why the rules are what they are.
