// How the replay page drives the engine's replay player, as the original Java player did (docs/re/re_replay.md "The original
// player's controls"): playback starts as soon as the replay has loaded, play at the end starts again from 0, holding the slider
// pauses until it is let go, and once the clock reaches the end with nothing left to animate the replay pauses on its end screen.
// `state` is what the page draws ({ loaded, unplayable, playing, ended, time, position, length, skipEmpty, doubleSpeed }, and
// `meta`, whose `marks` Previous and Next go to); `engine` is a GameHost started with a replay (web/emu/host.js). Times are whole
// seconds from BattleBegin; `position` is the same clock in fractional seconds, for the slider's thumb.
const STEP_S = 5; // what the arrow keys, the D-pad, and a drag of the time slider seek by
// A replay builds its battle within a few frames (about 165 ms of engine time); one that hasn't after this much never will, such as
// damaged data or a seed replay's placeholder (docs/adr/0023). Engine time, so a slow device isn't given up on sooner.
export const LOAD_LIMIT_MS = 10000;
// Over, as the original player decided it: the clock at the end and nothing left to animate (also footage.js).
export const replayEnded = (time, length, engine) => length > 0 && time >= length && !engine.replayAnimating;
// How far behind the playhead a mark must be for Previous to go to it rather than the one before, as media players treat
// chapters: pressed just after a mark, Previous goes on back.
const BACK_GRACE_S = 2;

// The second of the mark (CONTEXT.md) that Previous (direction -1) or Next (1) goes to from `time`, or null if there is none.
// `marks` are meta.marks, sorted by `at`.
export function markTarget(marks, time, direction) {
  const ats = (marks ?? []).map(m => m.at);
  return (direction < 0 ? ats.findLast(at => at < time - BACK_GRACE_S) : ats.find(at => at > time)) ?? null;
}

export function createReplayFlow(state, engine) {
  let holding = false, resumeAfterHold = false;
  const play = () => { engine.playReplay(); state.playing = true; };
  const pause = () => { engine.pauseReplay(); state.playing = false; };

  const flow = {
    // After each engine frame: notice the replay load, follow its clock, and stop at its end.
    frame() {
      if (!state.loaded) {
        if (state.unplayable) return;
        if (!engine.replayLoaded) { if (engine.time >= LOAD_LIMIT_MS) state.unplayable = true; return; }
        state.loaded = true;
        engine.setReplayMode(state);
        state.playing = true; // the player plays as soon as it has loaded
      }
      state.time = engine.replayTime;
      state.length = engine.replayLength;
      state.position = Math.min(state.length, engine.replayClock / 1000);
      if (!state.ended && replayEnded(state.time, state.length, engine)) {
        pause();
        state.ended = true;
      }
    },
    togglePlay() {
      if (!state.loaded) return;
      if (state.playing) pause();
      else if (state.ended || state.time >= state.length) flow.watchAgain();
      else play();
    },
    watchAgain() {
      if (!state.loaded) return;
      flow.seek(0);
      play();
    },
    seek(seconds) {
      if (!state.loaded) return;
      const to = Math.max(0, Math.min(state.length, Math.round(seconds)));
      engine.seekReplay(to);
      state.time = state.position = to;
      state.ended = false;
    },
    step: direction => flow.seek(state.time + direction * STEP_S),
    // To a mark: a seek, which at the end also plays, since the end screen would otherwise cover the turn it goes to.
    toMark(at) {
      if (!state.loaded || at === null) return;
      const replay = state.ended;
      flow.seek(at);
      if (replay) play();
    },
    jump: direction => flow.toMark(markTarget(state.meta?.marks, state.time, direction)),
    hold() {
      if (!state.loaded || holding) return;
      holding = true;
      resumeAfterHold = state.playing;
      if (state.playing) pause();
    },
    release() {
      if (!holding) return;
      holding = false;
      if (resumeAfterHold) play();
    },
    setSkipEmpty(on) { state.skipEmpty = on; if (state.loaded) engine.setReplayMode(state); },
    setDoubleSpeed(on) { state.doubleSpeed = on; if (state.loaded) engine.setReplayMode(state); },
    // The engine started the replay over on its own (footage.js): give it the page's settings, and wait at 0 for Play.
    restart() {
      engine.setReplayMode(state);
      flow.seek(0);
      pause();
    },
  };
  return flow;
}

export { STEP_S };
