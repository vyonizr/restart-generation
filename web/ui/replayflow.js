// How the replay page drives the engine's replay player, as the original Java player did (docs/re/re_replay.md "The original
// player's controls"): playback starts as soon as the replay has loaded, play at the end starts again from 0, holding the slider
// pauses until it is let go, and once the clock reaches the end with nothing left to animate the replay pauses on its end screen.
// `state` is what the page draws ({ loaded, playing, ended, time, length, skipEmpty, doubleSpeed }); `engine` is a GameHost
// started with a replay (web/emu/host.js). Times are whole seconds from BattleBegin.
const STEP_S = 5; // what the arrow keys and the D-pad seek by; the slider moves in the same steps

export function createReplayFlow(state, engine) {
  let holding = false, resumeAfterHold = false;
  const play = () => { engine.playReplay(); state.playing = true; };
  const pause = () => { engine.pauseReplay(); state.playing = false; };

  const flow = {
    // After each engine frame: notice the replay load, follow its clock, and stop at its end.
    frame() {
      if (!state.loaded) {
        if (!engine.replayLoaded) return;
        state.loaded = true;
        engine.setReplayMode(state);
        state.playing = true; // the player plays as soon as it has loaded
      }
      state.time = engine.replayTime;
      state.length = engine.replayLength;
      if (!state.ended && state.length > 0 && state.time >= state.length && !engine.replayAnimating) {
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
      state.time = to;
      state.ended = false;
    },
    step: direction => flow.seek(state.time + direction * STEP_S),
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
  };
  return flow;
}

export { STEP_S };
