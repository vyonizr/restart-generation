// Self-check for how the replay page drives the engine's replay player (web/ui/replayflow.js): node web/ui/replayflow.test.mjs
// The flow follows the original Java player (docs/re/re_replay.md "The original player's controls"). A fake engine stands in for
// GameHost's replay controls: its clock moves only when a test moves it.
import assert from 'node:assert';
import { createReplayFlow } from './replayflow.js';

function fakeEngine({ length = 60 } = {}) {
  const e = {
    replayLoaded: false, replayTime: 0, replayLength: length, replayAnimating: false, playing: true, mode: null, calls: [],
    playReplay() { e.playing = true; e.calls.push('play'); },
    pauseReplay() { e.playing = false; e.calls.push('pause'); },
    seekReplay(s) { e.replayTime = s; e.calls.push(`seek ${s}`); },
    setReplayMode(m) { e.mode = { skipEmpty: m.skipEmpty, doubleSpeed: m.doubleSpeed }; },
  };
  return e;
}
const state = () => ({ loaded: false, playing: false, ended: false, time: 0, length: 0, skipEmpty: true, doubleSpeed: false });

// Nothing works until the engine has built the replay's battle; then it plays at once, with skip-empty on, as the original did.
{
  const s = state(), e = fakeEngine(), flow = createReplayFlow(s, e);
  flow.togglePlay();
  flow.frame();
  assert.deepStrictEqual([s.loaded, s.playing, e.calls], [false, false, []]);
  e.replayLoaded = true;
  flow.frame();
  assert.deepStrictEqual([s.loaded, s.playing, s.length, e.mode], [true, true, 60, { skipEmpty: true, doubleSpeed: false }]);
}

// The end: once the clock reaches the length and nothing is animating, the replay pauses on its end screen. Play then starts it
// again from 0.
{
  const s = state(), e = fakeEngine({ length: 30 }), flow = createReplayFlow(s, e);
  e.replayLoaded = true; flow.frame();
  e.replayTime = 30; e.replayAnimating = true;
  flow.frame();
  assert.strictEqual(s.ended, false, 'still animating the last move');
  e.replayAnimating = false;
  flow.frame();
  assert.deepStrictEqual([s.ended, s.playing, e.playing], [true, false, false]);
  e.calls.length = 0;
  flow.togglePlay();
  assert.deepStrictEqual([e.calls, s.ended, s.playing, s.time], [['seek 0', 'play'], false, true, 0]);
}

// Holding the slider pauses until it is let go, and resumes only if the replay was playing; a second hold (a held arrow key
// repeating) changes nothing.
{
  const s = state(), e = fakeEngine(), flow = createReplayFlow(s, e);
  e.replayLoaded = true; flow.frame();
  flow.hold(); flow.hold();
  assert.deepStrictEqual([s.playing, e.playing], [false, false]);
  flow.release();
  assert.deepStrictEqual([s.playing, e.playing], [true, true]);
  flow.togglePlay(); // paused by the visitor
  flow.hold(); flow.release();
  assert.deepStrictEqual([s.playing, e.playing], [false, false], 'a paused replay stays paused after a seek');
  flow.release();
  assert.strictEqual(e.playing, false, 'letting go twice resumes nothing');
}

// The arrow keys and the D-pad seek 5 s either way from where the clock is, within the replay.
{
  const s = state(), e = fakeEngine({ length: 47 }), flow = createReplayFlow(s, e);
  e.replayLoaded = true; flow.frame();
  e.replayTime = 14; flow.frame();
  flow.step(1);
  assert.strictEqual(e.replayTime, 19);
  flow.step(-1); flow.step(-1);
  assert.strictEqual(e.replayTime, 9);
  flow.step(-1); flow.step(-1);
  assert.strictEqual(e.replayTime, 0);
  flow.seek(45); flow.step(1);
  assert.strictEqual(e.replayTime, 47);
}

// Skip-empty and double speed reach the engine together, as its one setting takes both.
{
  const s = state(), e = fakeEngine(), flow = createReplayFlow(s, e);
  e.replayLoaded = true; flow.frame();
  flow.setDoubleSpeed(true);
  flow.setSkipEmpty(false);
  assert.deepStrictEqual(e.mode, { skipEmpty: false, doubleSpeed: true });
}
console.log('replay flow ok');
