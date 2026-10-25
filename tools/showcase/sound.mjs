// A replay clip's sound (docs/adr/0036). The page is filmed a frame at a time and makes no sound the film can keep, so the sound is
// played here on the same engine by the same rules as the replay page (replay-flow.js, audio.js): the replay player at 1× with idle
// time skipped, sought to the clip's start as the page is, and a 64 ms block of sound drained for every 64 ms of the engine's clock,
// which the battle waits on. The engine runs the same way in both, so the sound from the seek on is the sound the page played under
// the clip, within a block.
import { GameHost } from '../../shared/emu/host.js';
import { loadGame } from '../../shared/game.mjs';

const BLOCK_MS = 64; // web/src/lib/game/audio.js SOUND_BLOCK_MS: 512 samples at 8 kHz
export const SOUND_RATE = 8000;
const LOAD_LIMIT_MS = 10000;
const SEEK_AFTER_MS = 6000;

let files = null;
const made = new Map(); // `${text}@${from}` -> the sound, for the other shapes' clips

// `seconds` of 8 kHz mono 16-bit sound of the replay `text`, from a seek to `from` (whole seconds from BattleBegin, as the page's).
export function replaySound(text, from, seconds) {
  const key = `${text}@${from}@${seconds}`;
  if (!made.has(key)) made.set(key, play(text, from, seconds));
  return made.get(key);
}

async function play(text, from, seconds) {
  files ??= await loadGame();
  const game = new GameHost(files, { replay: text, warn: () => {}, log: () => {} });
  game.boot();
  const want = Math.ceil(seconds * SOUND_RATE);
  const out = new Int16Array(want);
  let pulled = 0, have = 0;
  const drain = keep => {
    for (; pulled * BLOCK_MS < game.time; pulled++) {
      const pcm = game.pullSound();
      if (!keep) continue;
      const n = Math.min(pcm.length, want - have);
      out.set(pcm.subarray(0, n), have);
      have += n;
    }
  };
  while (!game.replayLoaded) {
    game.tick();
    drain(false);
    if (game.time >= LOAD_LIMIT_MS) throw new Error("the engine couldn't load the replay");
  }
  game.setReplayMode({ skipEmpty: true, doubleSpeed: false });
  // Seek as the page does, a few seconds after Watch: sought within its first frames, the replay player skips idle time unlike the
  // page's (measured: its clock jumped 1.6 s in a second the page showed as one).
  while (game.time < SEEK_AFTER_MS) { game.tick(); drain(false); }
  game.seekReplay(from);
  while (have < want) {
    game.tick();
    drain(true);
  }
  return out;
}
