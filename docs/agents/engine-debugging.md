# Debug the engine

This page is for whoever debugs a feature that reads or writes the engine's memory: pointer play, the Full board, a rejoin's quiet replay, the guide. It says what the page tells you when such a feature switches itself off, how to look inside a running page, which emulator scripts help, and how to script the battles every such feature is tested in.

What these tools show you is the game: frames, traces, screenshots, the engine's code addresses at work. Keep all of it under `tmp/`, which git ignores, and put none of it in a commit, an issue or a pull request ([`docs/LEGAL.md`](../LEGAL.md) rules 2 and 3). Write what you learn about the engine into `docs/re/` in your own words.

## Read the console first

A feature that relies on engine code checks that code's bytes before it uses them. Where the bytes differ, the feature switches itself off with one `console.warn` that names the first check that failed, by its address and what is there. `GameHost` takes the warning function as `warn` (`console.warn` by default); the page uses the default, and `tools/emu/pointer-test.mjs`, `tools/emu/wide-test.mjs` and `shared/emu/effects.test.mjs` pass one that throws, so a changed site fails the run instead of skipping a feature.

| The warning starts with | What switched off | Where the checks are |
| --- | --- | --- |
| `Full board unavailable: unexpected bytes at 0x…` | The Full board: the engine boots stock, at the phone's size | `BOARD_SITES` in `shared/emu/host.js` |
| `rescue and fight backdrops left in the corner:` | The backdrop shift of a rescue or a fight ([ADR 0029](../adr/0029-the-curtain-shows-the-board-under-it-during-a-rescue.md)) | `BACKDROP_SITES` in `shared/emu/host.js` |
| `engine patch skipped (…)` | One in-memory patch ([ADR 0007](../adr/0007-patch-the-engine-in-memory.md)) | `UNLOCKS`, `EFFECT_ONCE` in `shared/emu/host.js` |
| `pointer play unavailable:` | Pointer play: a site, a battle UI state's vtable, or the manager's vtable differs | `SITES`, `STATES`, `MANAGER` in `shared/emu/pointer.js` |
| `pointer play found no battle UI state of the local player in …` | Nothing switched off, but a click does nothing in the battle it names (offline or online, the room, the board view) | `afterTick()` in `shared/emu/pointer.js` |
| `rejoin: the history replays with visuals on:` | A rejoin's quiet replay | `QUIET`, `REPLAYED` in `shared/emu/rejoin.js` |
| `guide unavailable: can't read …` | The Guide button, for a copy whose info menu can't be read | `readGuide` in `web/src/lib/guide/guide.js` |

The pointer's battle warning comes once per battle, on a desktop (a touch device has no pointer play), when the battle went about 5 s of engine time past its curtains and the pointer never found the local player's battle UI state. It means the route from the battle view to the local player's manager no longer holds (`docs/re/re_battle_input.md`, "The local player and its manager"): that is how pointer play once read nothing in online battles. `npm run test:pointer` gives an error for it in its offline battle.

## Look inside a running page: `window.rgDebug`

The page always keeps `window.rgStats` (frame rate, the engine's clock in `time`, the screen size, the board view of the battle on) and `window.rgPatches`. Everything else is exposed only on request: if `window.rgDebug` is an object when the game boots, the page fills it with the following:

- `game`: the `GameHost` (`shared/emu/host.js`). `game.m.cpu` is the emulator, with `rd32(a)` and `m8` over its memory, and `game.m.addr(va)` turns an engine address into an offset in it; `game.time` is the engine's clock; `game.watch(va, fn)` runs `fn` each time the engine reaches `va`.
- `battle`: the battle pointer (`shared/emu/pointer.js`) once Start is pressed, on a touch device too: `read()` is the local player's battle input now or null, `jump(x, y)` moves the engine's cursor. It is null where the copy lacks the bytes pointer play relies on.
- `page`: the page state (`web/src/lib/page.svelte.js`).

When `window.rgDebug` isn't set, nothing is exposed and nothing costs anything. It works on the built bundle (`npm run build`, or the build `e2e/global-setup.mjs` makes), so it needs no change to the page. Set it with an init script, which runs before the page's own:

```js
await page.addInitScript(() => { window.rgDebug = {}; });
await page.goto(baseURL + '/');
// … Start, then into a battle …
const input = await page.evaluate(() => window.rgDebug.battle?.read());
const app = await page.evaluate(() => { const { game } = window.rgDebug; return game.m.cpu.rd32(game.m.addr(0x101b828c)) >>> 0; });
```

## The emulator's scripts (`tools/emu/`)

Each one loads the game from `RG_GAME` (set it in `.env`) and runs the engine in Node, with no page. Run them as `node --env-file-if-exists=.env tools/emu/<script> …`; the arguments are optional.

| Script | What it does | Run |
| --- | --- | --- |
| `boot.mjs` | Loads the game DLL and runs its `DllMain`: whether a copy loads at all. | `npm run boot` or `node tools/emu/boot.mjs [folder or .zip]` |
| `run.mjs` | Boots, ticks, presses keys on a schedule and saves frames as PNG. The frames are the game: keep them in `tmp/`. | `run.mjs [ticks] [outdir] [keys]`, keys like `300:CONTROL,360:DOWN` (outdir defaults to `tmp/frames`) |
| `probe.mjs` | Runs N ticks and, each time an engine address runs, prints the registers and a few dwords at `[ecx]`. | `probe.mjs <hexva> [ticks]` |
| `trace.mjs` | Runs N ticks, then prints the address of every instruction of one more tick and the calls JavaScript handles. | `trace.mjs [ticks]` (60) |
| `calls.mjs` | Prints every function called during tick N, indented by stack depth. | `calls.mjs <tick> [maxLines]` |
| `ticks.mjs` | Prints the instruction count and the return value of each of the first N ticks. | `ticks.mjs [ticks]` (30) |
| `prof.cjs` | Prints the 30 functions with the most self time from a CPU profile of a run. | `node --cpu-prof --cpu-prof-dir=tmp/prof tools/emu/run.mjs 600`, then `node tools/emu/prof.cjs tmp/prof` |
| `fallbacks.mjs` | Counts the opcodes the block compiler leaves to the interpreter, weighted by how often they run. | `fallbacks.mjs [ticks]` (600) |
| `difftest.mjs` | Runs the interpreter and the block compiler in lockstep and reports the first tick where registers, flags, pixels or memory differ. | `difftest.mjs [ticks]` (300) |
| `fasttest.mjs` | Runs an Arcade battle with and without the fast paths of `shared/emu/fast.js` in lockstep and reports the first difference, optionally through a fight or a rescue on either board view. | `fasttest.mjs [ticks]` or `fasttest.mjs fight\|rescue full\|classic [ticks]` |

The opt-in suites run the engine the same way: `npm run test:pointer` (pointer play in an offline battle, both board views), `npm run test:wide` (the Full board), `npm run test:effects`, `npm run test:perf` ([ADR 0045](../adr/0045-checks-scale-with-the-change-and-everything-runs-before-publishing.md) says when each runs). `tools/emu/scenarios.mjs` holds the scripted Arcade battles `fasttest.mjs` and `perftest.mjs` play.

## Test offline and online, from the room host's page and another player's

A feature that reads engine memory is tested in an offline battle and in an online battle, and online from the room host's page and from another player's in the room. Offline and online battles keep the battle's objects in different places (`docs/re/re_battle_input.md`, "The local player and its manager"), and the local player sits at another index on each page of the same room. Checked in an offline battle alone, pointer play once read nothing online.

- **Offline**, in Node: play into wide-test's Arcade battle as `tools/emu/pointer-test.mjs` does, with a `GameHost` whose `warn` throws.
- **Online**, in the browser: two pages of one gateway in a friendly room, as below. Collect each page's warnings (`page.on('console', m => { if (m.type() === 'warning') warnings.push(m.text()); })`) and expect none from your feature.

### Script a two-engine online battle

`npm run e2e` starts its gateways in `e2e/global-setup.mjs`: with `RG_GAME` set, the engine tests' baseURL is a Discord-mode gateway (`E2E_ENGINE_URL`) loaded with the seed accounts of `server/seed.json`, sending its server copy. `e2e/engine/engine.mjs` has the steps into a battle:

- `PAIRS`: pairs of seed members who are friends both ways and keep the default keys. Take a pair no other test uses: a battle left running holds its players' seats.
- `online(browser, baseURL, name)`: a page of its own signed in as that member, on the Online menu after the Arena login, with its key presser.
- `CREATE_ROOM` and `FRIENDS_ROOM`: the room host's keys to create a friendly room, and the other player's keys to enter it.

```js
import { test } from '../fixtures.mjs';
import { walk, engineTime, PAIRS, online, CREATE_ROOM, FRIENDS_ROOM } from './engine.mjs';

test('…in an online battle', async ({ browser, baseURL }) => {
  test.setTimeout(600000);
  const [hostName, otherName] = PAIRS[2]; // a pair of its own: dialogs.spec.mjs and pointer.spec.mjs take PAIRS[0] and PAIRS[1]
  const [host, hostKeys] = await online(browser, baseURL, hostName, { debug: true }); // window.rgDebug on this page
  await walk(host, hostKeys, CREATE_ROOM);
  const [other, otherKeys] = await online(browser, baseURL, otherName, { debug: true });
  await walk(other, otherKeys, FRIENDS_ROOM);
  await engineTime(host, 3000, { after: true }); // the room lists the other player, and Start appears
  await hostKeys('select');
  await host.getByRole('dialog', { name: 'Fill the empty seats with CPU players?' }).getByRole('button', { name: 'Yes' }).click();
  await Promise.all([host, other].map(p => p.waitForFunction(() => window.rgStats?.battle, null, { timeout: 180000 })));
  // … the feature on both pages, e.g. host.evaluate(() => window.rgDebug.battle?.read()) …
});
```

`online()`'s `{ debug: true }` adds the init script that sets `window.rgDebug` to its context before Start. Run one spec with `npm run e2e -- --project=engine-desktop e2e/engine/<spec>.mjs`, and add `--output=tmp/e2e-<you>` while another Playwright run is going: runs that share an output folder wipe each other's artifacts. Outside Playwright's runner, a throwaway script under `tmp/` starts its own gateway as `e2e/global-setup.mjs`'s `gateway()` does: `server/seed.js --db … --replays-db …` into a fresh folder, then `server/gateway.js` with `RG_GAME`, free `PORT` and `HTTP_PORT`, `RG_DB` and `RG_REPLAYS_DB`, and the made-up Discord settings for friendly rooms; it is ready once its output says `browser client on` and `game bundle ready`.

### Read the battle messages a page sends

The engine never shows what it sent, so read it off the page's own requests to the gateway, as the server gets them; `sentMessages` in `e2e/engine/pointer.spec.mjs` does this. Each `POST` to `/snap` whose `C` parameter is `CMD.SEND_GAME_PACKET_TO_GAME_SERVER` (`shared/snap-ids.js`) carries MT frames, base64, in `P1`. A request resent for want of a reply keeps its request id `R`, so count each id once. Read the frames with `createReader()` from `server/mt.js`; a battle message is a frame of type `T.GAME`, and `server/gamemsg.js` unpacks it (`gm.unpack(frame.subarray(1))`) and names its type (`gm.TYPE`).
