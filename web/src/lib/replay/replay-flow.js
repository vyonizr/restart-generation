// How the replay page drives the engine's replay player, as the original Java player did (docs/re/re_replay.md "The original
// player's controls"): playback starts as soon as the replay has loaded, play at the end starts again from 0, holding the slider
// pauses until it is let go, and once the battle is over (see createEndWatch) the replay pauses on its end screen.
// `state` is what the page draws ({ loaded, unplayable, playing, ended, time, position, length, skipEmpty, doubleSpeed, defeated },
// and `meta`, whose `marks` Previous and Next go to and whose players' seats are the ones `defeated` lists); `engine` is a GameHost
// started with a replay (shared/emu/host.js). Times are whole seconds from BattleBegin; `position` is the same clock in fractional
// seconds, for the slider's thumb.
const STEP_S = 5; // what the arrow keys and the D-pad seek by
// A replay builds its battle within a few frames (230 to 300 ms of engine time, to BattleBegin, GameHost.replayLoaded); one that
// hasn't after this much never will, such as damaged data or a seed replay's placeholder (docs/adr/0023). Engine time, so a slow
// device isn't given up on sooner.
export const LOAD_LIMIT_MS = 10000;
// Over: the clock at the end, nothing left to animate, and the battle finished. The original player stopped as soon as nothing was
// animating, but a battle whose moves came faster than their animations, as with bots, still has moves to show once the clock is at
// the end, with up to 9 frames of nothing animating between two of them (docs/re/re_replay.md "Defeats"). A battle that never
// finishes, which no message ended, is over once nothing has animated for END_IDLE_MS. `engine` is a GameHost (or footage.js's);
// each call is one frame.
const END_IDLE_MS = 3000;
export function createEndWatch() {
  let idleSince = null;
  return engine => {
    if (engine.replayLength <= 0 || engine.replayTime < engine.replayLength || engine.replayAnimating) { idleSince = null; return false; }
    idleSince ??= engine.time;
    return engine.replayFinished || engine.time - idleSince >= END_IDLE_MS;
  };
}
// How far behind the playhead a mark must be for Previous to go to it rather than the one before, as media players treat
// chapters: pressed just after a mark, Previous goes on back.
const BACK_GRACE_S = 2;

// The second of the mark (CONTEXT.md) that Previous (direction -1) or Next (1) goes to from `time`, or null if there is none.
// `marks` are meta.marks, sorted by `at`.
export function markTarget(marks, time, direction) {
  const ats = (marks ?? []).map(m => m.at);
  return (direction < 0 ? ats.findLast(at => at < time - BACK_GRACE_S) : ats.find(at => at > time)) ?? null;
}

// How long a seat whose princess was rescued waits for the rescue's animation to start, in engine time while the replay plays: it
// was seen to start 0.6 s after the seat fell, and 14.7 s after it behind other animations in a 4-player battle (docs/re/re_replay.md
// "Defeats"). Past this, as with a rule that shows no rescue, the seat changes without it.
const RESCUE_WAIT_MS = 30000;

// The seats the lower third shows as defeated (CONTEXT.md "Defeated player"), from the engine after each frame (`engine` has
// replaySeats, rescuePlaying and time). A seat that left changes at once. A seat whose princess was rescued, which shows as another
// seat holding one more princess in the same frame, changes once a rescue animation that started after it has played. After
// `reset()` (a seek, or the replay started over), every seat the engine has defeated by then changes at once; `finish()`, at the
// end, changes the seats still waiting. `seats()` are the replay's own seats; `shown` is a Set.
export function createDefeats(seats) {
  let shown = new Set(), held = null, rescuing = false, last = 0;
  const waiting = new Map(); // seat -> { waited (ms), started (a rescue animation began since) }
  return {
    get shown() { return shown; },
    reset() { held = null; },
    finish() {
      if (!waiting.size) return false;
      shown = new Set([...shown, ...waiting.keys()]);
      waiting.clear();
      return true;
    },
    // Returns whether `shown` changed.
    frame(engine, playing) {
      const ours = seats(), now = engine.replaySeats.filter(s => ours.includes(s.seat));
      if (!now.length) return false; // before BattleBegin
      const time = engine.time, rescue = engine.rescuePlaying, before = shown.size;
      if (!held) {
        const was = shown;
        shown = new Set(now.filter(s => s.defeated).map(s => s.seat));
        waiting.clear();
        held = new Map(now.map(s => [s.seat, s.princesses]));
        rescuing = rescue; last = time;
        return was.size !== shown.size || [...shown].some(seat => !was.has(seat));
      }
      const rescued = now.some(s => !s.defeated && s.princesses > held.get(s.seat));
      for (const s of now) {
        if (!s.defeated || shown.has(s.seat) || waiting.has(s.seat)) continue;
        if (rescued) waiting.set(s.seat, { waited: 0, started: false });
        else shown.add(s.seat);
      }
      for (const [seat, w] of waiting) {
        if (rescue && !rescuing) w.started = true;
        if (playing) w.waited += time - last;
        if ((w.started && !rescue) || w.waited > RESCUE_WAIT_MS) { waiting.delete(seat); shown.add(seat); }
      }
      held = new Map(now.map(s => [s.seat, s.princesses]));
      rescuing = rescue; last = time;
      if (shown.size === before) return false;
      shown = new Set(shown); // a new Set, so whoever kept the old one sees the change
      return true;
    },
  };
}

// How long a drag must rest on a second before it is sought, as a seek blocks the page.
const SETTLE_MS = 150;

// `now` is the page's clock in ms; tests pass their own.
export function createReplayFlow(state, engine, now = () => performance.now()) {
  // The second the time slider was last moved to, not sought yet. A seek runs the battle again up to it, which blocks the page for
  // 0.2 to 0.5 s, so a drag doesn't seek on every move, nor once a frame (Apple's QA1820 on chasing AVPlayer seeks): while the
  // pointer moves, only the thumb follows it; the second is sought once the pointer rests on it for SETTLE_MS, and when the slider
  // is let go. A click is a press and a release, so it seeks at once.
  let scrubTo = null, scrubbedAt = 0;
  const flush = force => {
    if (scrubTo === null || (!force && holding && now() - scrubbedAt < SETTLE_MS)) return;
    const to = scrubTo;
    scrubTo = null;
    if (to !== state.time) flow.seek(to);
  };
  let holding = false, resumeAfterHold = false;
  const play = () => { engine.playReplay(); state.playing = true; };
  const pause = () => { engine.pauseReplay(); state.playing = false; };
  const defeats = createDefeats(() => (state.meta?.players ?? []).map(p => p.seat)), over = createEndWatch();

  const flow = {
    // After each engine frame: notice the replay load, follow its clock, and stop at its end.
    frame() {
      flush(false);
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
      let changed = defeats.frame(engine, state.playing);
      if (!state.ended && over(engine)) {
        pause();
        state.ended = true;
        changed = defeats.finish() || changed;
      }
      if (changed) state.defeated = [...defeats.shown];
    },
    togglePlay() {
      if (!state.loaded) return;
      if (state.playing) pause();
      // Play at the end starts again; at the clock's end with the battle still to show, it plays on.
      else if (state.ended) flow.watchAgain();
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
      defeats.reset();
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
    // The time slider moved to `seconds`, by a click, a drag going on, or Home, End, Page Up or Page Down: see `scrubTo`.
    scrub(seconds) {
      if (!state.loaded) return;
      scrubTo = Math.max(0, Math.min(state.length, Math.round(seconds)));
      scrubbedAt = now();
    },
    release() {
      flush(true);
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
