# Capture battle templates from a live client

To start a battle, the server sends each client a Game blob and a state snapshot. Only the engine produces this data, and its layout isn't fully understood. Rather than reverse the layout and generate the data from `levels.pak`, the server uses battle templates captured from the running Java client with `tools/rgtrace`, and edits only the fields it understands: the AI slots, the environment and the battle seed. The seed fixes the RNG state, which sits in two places, the Game blob and a copy inside the snapshot, and a table rewrites both. Rewriting only the Game's copy left the snapshot's copy fixed per template, and players saw the same spawns and bot moves again and again. The environment is a plain Game field that nothing else in a capture depends on, and the original engine picks it at random when a map names none, so a table draws its own instead of repeating the captured one. Capturing gave working matches with far less reverse engineering.

## Considered options

- **Generate the data from `levels.pak`.** Deferred, not rejected. It needs the full layout of the Game blob.
- **Read the data from the engine's replay files.** Tried first. Arcade mode writes no replay, and the modes that do are unreachable.

## Consequences

- Online play covers only the captured levels, and matchmaking seats only player counts that have a template. Six of the 18 levels are captured.
- The snapshot's RNG copy is found by its bytes, not by layout, so a re-captured template whose snapshot doesn't hold the Game's RNG exactly once is skipped at load.
- The engine picks the map of a capture at random, so two templates for one player count can be different maps with the same castle positions. Variety needs more captures.
- Capturing needs Windows, Visual Studio and the Java client, so the gateway keeps serving the Java client over TCP alongside the browser client.
- Templates are derived from the game, so they stay out of the repository (see ADR 0001). Each server operator captures their own.
- A `--public` server refuses to start with no usable template, because players would otherwise queue for matches that never start; a Docker container then exits and compose keeps retrying it. Other servers start and warn, since the page and single-player play don't need templates. Every server warns for each player count (2, 3, 4) with no template.
- The emulator in `web/emu` runs the same engine, so templates could be captured without the Java client. That isn't built.
