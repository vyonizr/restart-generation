# Patch the engine in memory for revival-only changes

ADRs 0002 and 0003 keep the original engine unchanged. To unlock every story and hero from the start, the browser client now overwrites a few bytes of engine code after the DLL loads and before it runs. The patches make every mission in a story playable, show a story with no playable mission as open at 0% instead of locked, and stop `FUN_100dc850` from greying out any hero, which includes the Aggressor (`UNLOCKS` in `web/emu/host.js`). The alternatives wrote false records into the player's files: a save with every mission marked finished, and the "finished Story Mode" achievement counter for a player who never finished it. A patch changes behavior for the session only and leaves every file as the engine wrote it.

## Rules

- A patch changes only what the revival decides to change; online protocols stay as ADR 0002 describes.
- A patch is applied only if the original bytes at its address match the expected ones. Otherwise it's skipped with a console warning, and the game runs unpatched.
- A patch never changes a file on disk, in the browser's storage, or in the player's game copy.

## Considered options

- **Merge missions 1–18 into `single_player_game.save`.** Rejected because every story then shows a finished mark, and the player can no longer tell which stories they actually finished.
- **Set achievement counter #10 in `achievements.dat`.** Rejected because it records that the player finished Story Mode, and the server keeps the counter.
- **Empty the mission requirements in `campaigns.xml` inside `gameplay.pak` while loading it.** Same effect as the mission patches, but it rewrites a packed file and leaves the Aggressor locked.
- **Make `FUN_100d7db0`, the requirement check, always pass.** It also feeds the story badge, which counts playable missions, so every story showed 50% as if its first mission were finished.

## Consequences

- Only the browser client gets the unlocks. The Java client keeps the original locks.
- A player's engine copy that doesn't match the expected bytes keeps the original locks.
