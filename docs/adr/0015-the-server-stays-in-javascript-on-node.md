# The server stays in JavaScript on Node

We asked whether the gateway in `server/` (SNAP, CasinoSystem, the battle relay, accounts and sign-in, about 2,200 lines without tests) should move to another language. It stays JavaScript on Node, because the server runs the browser client's own code: bots run the engine in `web/emu` in worker threads (ADR 0008) and log in with `web/snap.js`, and the way to replace the relay's winner heuristic is to run the same engine on the server (ADR 0005). Neither performance, memory, nor scale gave a reason to change. The expected load is tens to low hundreds of players on one public server, and the limits that apply first are the one-process design (ADR 0010) and a bot's memory, not the language.

## Considered options

- **A compiled language for the gateway, such as Go or Rust.** Rejected. The emulator's compiler, `web/emu/jit.js`, turns x86 code into JavaScript, so bots and an engine-backed battle result would need the emulator and its compiler rewritten, or a Node process kept next to the server.
- **A gateway in another language with a Node sidecar for bots.** Rejected. It means two runtimes and an internal protocol between them in one deployment, and the SNAP code would exist twice, once per language, where today the browser and the server share one copy.
- **TypeScript.** Not part of this decision. ADR 0013 covers it: the shared `web/` modules that Node imports would need a build for Node.

## Consequences

- The browser client and the server share `web/emu`, `web/snap.js` and `web/zip.js` as plain modules that Node imports with no bundler, so the client and server can't drift apart on the SNAP protocol. Changed by [ADR 0035](0035-the-page-lives-in-web-src-and-code-node-shares-lives-in-shared.md): they live in `shared/`.
- The server still runs with no installed packages; `node:sqlite` is the only database (ADR 0010).
- A bot's 350 to 410 MB is the emulated engine's cost and would remain in any language that runs the same emulator.
- Revisit if measurements show the gateway's own CPU limiting a public server at the expected load, or if the server has to run as several instances, which ADR 0010 already treats as a separate decision.
