# Players bring their own game files

The game's files are RedLynx's copyrighted work, so neither this repository nor any site that serves the browser client carries them or anything derived from them. Each player chooses their own copy of the Windows standalone build, as the `.zip` or the extracted folder, and the page keeps it in the browser's IndexedDB. A server operator points `RG_GAME` at their own copy. For the same reason, the decompiled code, the disassembly, the extracted Mac binary and the Ghidra projects stay out of the repository; anyone who owns the game rebuilds them from the `.zip` with the steps in `docs/re/README.md`.

## Considered options

- **Host the game files on a password-protected site.** Rejected because it limits who can play, which works against reviving a public online game.
- **Publish the decompiled analysis with the notes.** Rejected because it's derived directly from RedLynx's code, which makes it the likeliest part of the project to draw a takedown. Protections for reverse engineering for interoperability cover doing the analysis, not publishing its output.

## Consequences

- The browser client runs only the Windows build (see ADR 0003), so a player who owns only the Mac copy can't play.
- A browser can evict IndexedDB data when storage runs low. The player then chooses the files again.
- An operator who sets `RG_GAME` on a public server (`--public`) sends their copy to every visitor, against the first paragraph. The project's owner has decided to allow it and accepts the risk of a takedown, because the standalone build is hard to find anywhere else (2026-10-20). Nothing changes by default: with `RG_GAME` unset, each player brings their own copy, and the repository never carries the files. ADR 0018 sets the safeguards for such a server: a required `RG_CONTACT` shown in the footer, no ads or donations, and a way to switch serving off.
- `data/`, which holds accounts and captured battle templates, is ignored by git. Each server operator captures their own templates (see ADR 0006).
