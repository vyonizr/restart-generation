# A member's saved game is kept on the server

Every story and hero is open from the start only on a server that isn't `--public` (ADR 0007); on a public server they are earned. That makes progress worth keeping, and until now the engine's files (`single_player_game.save`, `quickmatch.save`, `settings.cfg`, `achievements.dat`) lived only in the browser's `localStorage`, where the browser can evict them (Safari after about a week) and where another device can't see them. A member's saved game now also lives on the server, with the account. The page restores it at the start and uploads changes while the player plays. The server stores the bytes as the browser sent them and never reads them. Guests, name-only servers and a static host keep the saved game in the browser only, as before.

## Rules

- **Members only.** A guest's account is wiped 24 hours after its last activity (ADR 0011), so a server copy would vanish while the browser copy stayed. `GET /auth/saves` and the writes answer 403 to a guest.
- **The server wins at the start.** When the account holds any saved files, they replace the browser's files; files the account doesn't hold are removed from the browser, so two playthroughs never mix inside one save. When the account holds none, the browser's files are uploaded (a guest's first sign-in, or an old member's first visit after this change). When an existing member signs in from a guest session, the guest's saved game is dropped with the rest of its progress; the sign-in confirmation says so.
- **Uploads are batched.** The page already writes changed files to `localStorage` every 5 s. Changed files go to the server every 30 s while playing, and once more when the page is hidden or closed (a request that may outlive the page can carry about 64 KB, so a larger file waits for the next visit).
- **If the start-up sync fails** (offline, an error), the page plays from the browser's copy and uploads nothing that session, so an older copy can't overwrite the server's.
- **Limits.** 256 KB a file, 1 MB and 16 files per account. A write over a limit answers 413 and leaves what the account held; replacing a file counts only its new size. The page then keeps that file in the browser only.
- **Signing out clears the browser's copy**, after sending what is pending, so the next guest on that browser doesn't inherit it (and can't later upload it as their own). Deleting the account removes the server's files with it (`ON DELETE CASCADE`) and clears the browser's.

## Considered options

- **Keep it in the browser only.** Rejected: on a public server the player has to earn their progress, and `localStorage` eviction or a second device would throw it away.
- **Save for guests too.** Rejected for the wipe reason above, and because a guest's browser copy would disagree with a server copy that disappears.
- **Newest file wins, or ask the player, when both copies exist.** Rejected: mixing files from two playthroughs can corrupt a save, and a dialog for a rare case isn't worth it. "The server wins" is the rule fame already follows.
- **Sync only the two save files.** Rejected: where the engine keeps the hero unlocks isn't known, and `achievements.dat` may hold them. The page already treats every `rg:<name>` file as progress, so there is no list to keep in step. Settings such as volume follow the player too.
- **Interpret the files on the server (for example to rank or check them).** Rejected: the layout isn't understood and the server only relays the engine's data.

## Consequences

- The accounts database now also holds each member's saved game, at most 1 MB per member. The README's backup advice covers it.
- A member can play on any browser and find their stories and heroes. Two tabs or devices playing at once overwrite each other's files, last write wins; the page doesn't merge.
- A page open during a sign-out or deletion in another tab can still upload an old file until it reloads.
- A save the server refuses for size stays in the browser only. The limits are chosen without seeing real save sizes, so they should be revisited after a few members have played.
- Unlocks and saves are separate: a LAN server (open progression) still saves nothing on the server, because it has no accounts.
