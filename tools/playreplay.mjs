// Plays a replay (CONTEXT.md) to its end in the engine's own replay player, headless, and reports the final turn and the ranks the
// replayed battle ended with: the check that a server-made replay plays back the battle the players saw (tools/selfplay.mjs).
// Worker data: { text } (server/replay.js); posts { turn, ranks } or { failed }. Needs RG_GAME.
// Offsets: the replay logic and battlefield (docs/re/re_replay.md), the stats list and rank (docs/re/re_witness.md).
import { workerData, parentPort } from 'worker_threads';
import { loadGame } from '../shared/game.mjs';
import { GameHost } from '../shared/emu/host.js';

const MAX_TICKS = 60000;
const game = new GameHost(await loadGame(), { replay: workerData.text, warn: () => {} });
game.boot();
const cpu = game.m.cpu, i32 = a => cpu.rd32(a >>> 0) | 0, u32 = a => cpu.rd32(a >>> 0) >>> 0;
let pulled = 0, logic = 0;
for (let tick = 0; tick < MAX_TICKS; tick++) {
  game.tick();
  // The battle moves on only while its sound is drained: 1024 bytes for each 64 ms of engine time.
  while (pulled * 64 < game.time) { game.pullSound(); pulled++; }
  if (!logic && game.replayLoaded) { logic = game.replayLogic; game.setReplayMode({ skipEmpty: true, doubleSpeed: true }); }
  if (!logic) continue;
  // Over, as the original player decided it: the clock at the end and nothing left to animate; the logic is finished then.
  if (game.replayTime >= game.replayLength && !game.replayAnimating && cpu.m8[logic + 0x28]) {
    const stats = u32(logic + 0x1c), list = u32(stats + 0x10), ranks = {};
    for (let i = 0; i < i32(stats + 0xc); i++) { const e = u32(list + 4 * i); if (e) ranks[i] = i32(e + 0x134); }
    parentPort.postMessage({ turn: i32(u32(logic + 0x14) + 0x9c), ranks });
    process.exit(0);
  }
}
parentPort.postMessage({ failed: `not over after ${MAX_TICKS} engine frames` });
