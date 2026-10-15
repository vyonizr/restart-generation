# Capture battle templates from a live client

To start a battle, the server sends each client a Game blob and a state snapshot. Only the engine produces this data, and its layout isn't fully understood. Rather than reverse the layout and generate the data from `levels.pak`, the server uses battle templates captured from the running Java client with `tools/rgtrace`, and edits only the fields it understands: the AI slots and the random seed. Capturing gave working matches with far less reverse engineering.

## Considered options

- **Generate the data from `levels.pak`.** Deferred, not rejected. It needs the full layout of the Game blob.
- **Read the data from the engine's replay files.** Tried first. Arcade mode writes no replay, and the modes that do are unreachable.

## Consequences

- Online play covers only the captured levels, and matchmaking seats only player counts that have a template. Six of the 18 levels are captured.
- Capturing needs Windows, Visual Studio and the Java client, so the gateway keeps serving the Java client over TCP alongside the browser client.
- Templates are derived from the game, so they stay out of the repository (see ADR 0001). Each server operator captures their own.
- The emulator in `web/emu` runs the same engine, so templates could be captured without the Java client. That isn't built.
