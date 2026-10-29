# Checks scale with the change, and everything runs before publishing

CI can't hold the game (ADR 0001), so GitHub runs only `npm test` and the end-to-end tests' page tier (ADR 0025). Everything that runs the engine runs on a developer's machine or not at all: `npm run test:pointer`, `test:wide`, `test:perf`, `test:effects`, and the engine tier of `npm run e2e`. Which of them ran before a merge was up to whoever merged, and the developers are the owner and AI agents, who both skip a slow suite that doesn't look related. Pointer play (ADR 0039) was tested in **offline battles** only (CONTEXT.md), and it reached `development` reading the battle's state through a chain of engine memory that held offline by luck of the heap: in every **online battle** each click was dropped. On this machine `npm test` takes 34 s, `test:effects` under 1 s, `test:pointer` 38 s, `test:perf` 5.1 min, `test:wide` 5.6 min, and the whole `npm run e2e` 10.6 min: the page tier a few seconds a test, the engine tier minutes a spec (`pointer.spec` 2.3 min, `board.spec` 2.2, `dialogs.spec` 2.1, `footage.spec` 1.3, a replay at double speed 1.0). Running all of them before every merge would cost 22 minutes, so they would be skipped again.

We check in tiers, and git asks for the proof:

- **Every commit**: the legal check and the commit message's format, as before (the `pre-commit` and `commit-msg` hooks).
- **Before a merge to `development`**: `npm run check` (`tools/check.mjs`). It runs `npm test`, the page tier and, when `RG_GAME` is set, `test:effects`, and then the slow suites that cover a file the branch changed since its merge-base with `development`. Each slow suite (`tools/emu/pointer-test.mjs`, `wide-test.mjs`, `perftest.mjs`, `shared/emu/effects.test.mjs`, each `e2e/engine/*.spec.mjs`) names the files it covers in `// check-paths: <glob> ...` lines at its top, next to the code it tests, so a new suite brings its own rule. The check says what it chose and why, stops at the first failure, and fails, rather than skips, when a chosen suite needs `RG_GAME` and it isn't set. When everything passed on a clean work tree, it writes a stamp, `tmp/check/<commit>.json`. The `pre-merge-commit` hook refuses a merge into `development` of a commit without one; it reads the stamp and runs nothing. `git merge --no-verify` is the escape.
- **Before publishing**: `npm run check -- --all`, every suite and the whole end-to-end run, about 22 minutes. `tools/publish.mjs --push` refuses a branch head without an `--all` stamp.
- **Engine tests are never retried**, in CI or here. A test that fails once is a failure to fix, flaky or not; a retry only hides it.
- **A feature that reads engine memory is tested in an offline battle and in an online battle**, from the **room host**'s page and from another player's page in the room: what the engine keeps in memory differs between them.

## Considered options

- **Every suite before every merge.** Rejected: 22 minutes a merge, for changes that mostly touch one corner, gets skipped, as it did.
- **A map of paths to suites in `tools/check.mjs`.** Rejected: it drifts from the suites, and nobody adding a test reads it. The header sits in the file that owns the knowledge, and the check warns about a glob that matches no tracked file.
- **Select by what the changed files import.** Rejected for now: the engine tests reach the code through the page, the gateway and the engine's memory, not through imports, so an import graph would miss what matters most.
- **Check in CI on a runner that holds the game.** Rejected: the game can't leave a player's machine (ADR 0001, docs/LEGAL.md).
- **Run the check in the hook.** Rejected: a merge would take minutes, and a hook that slow gets turned off. The hook only looks for the stamp.
- **Keep one retry in CI, failing on a flaky pass.** Rejected: with no retry, a flaky test fails the same, and the run stays as short as a failure allows.

## Consequences

- A merge into `development` takes from about 35 seconds (a change no slow suite covers, such as one to the accounts store) to about 11 minutes (one to the emulator's core), and a publish about 22 minutes on top.
- A fast-forward merge makes no merge commit, so git runs no `pre-merge-commit` hook. Branches are merged into `development` with `--no-ff`, as they already are. A merge with conflicts is finished by `git commit`, so the `pre-commit` hook runs the same gate. A merge that `git pull` makes isn't gated: git names what it merges only for `git merge`.
- A stamp belongs to one commit: amending, rebasing or committing again needs a new check. Stamps stay in `tmp/check/`, which git ignores, so they prove a check ran on this machine only.
- Selection by path can miss a change that breaks a suite whose files it doesn't touch, such as a page change that breaks a replay. `--all` before publishing catches it, so it never reaches players, but it can reach `development`.
- With `RG_GAME` unset, `npm run check` still stamps a branch whose changes select no engine suite; one whose changes do fails until `RG_GAME` is set.
- `tools/ensure-web.mjs` rebuilds `web/dist` when the page's source is newer than the build, for `npm start`, `npm run dev` and the end-to-end tests alike, so a check never tests a page from before the change.
- GitHub also runs `npm test` before the page tier on every push and pull request.
