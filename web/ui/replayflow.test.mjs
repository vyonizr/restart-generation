// Self-check for how the replay page drives the engine's replay player (web/ui/replayflow.js): node web/ui/replayflow.test.mjs
// The flow follows the original Java player (docs/re/re_replay.md "The original player's controls"). A fake engine stands in for
// GameHost's replay controls: its clock moves only when a test moves it.
import assert from 'node:assert';
import { createReplayFlow } from './replayflow.js';

// `clock` is the engine's clock in ms when a test sets it; otherwise it is the whole seconds of replayTime.
function fakeEngine({ length = 60 } = {}) {
  const e = {
    replayLoaded: false, replayTime: 0, replayLength: length, replayAnimating: false, playing: true, mode: null, calls: [], time: 0,
    clock: null,
    get replayClock() { return e.clock ?? e.replayTime * 1000; },
    playReplay() { e.playing = true; e.calls.push('play'); },
    pauseReplay() { e.playing = false; e.calls.push('pause'); },
    seekReplay(s) { e.replayTime = s; e.clock = null; e.calls.push(`seek ${s}`); },
    setReplayMode(m) { e.mode = { skipEmpty: m.skipEmpty, doubleSpeed: m.doubleSpeed }; },
  };
  return e;
}
const state = () => ({ loaded: false, unplayable: false, playing: false, ended: false, time: 0, position: 0, length: 0, skipEmpty: true, doubleSpeed: false });

// The thumb follows the engine's clock between whole seconds, and stops at the slider's end, though the clock runs on past it.
{
  const s = state(), e = fakeEngine({ length: 30 }), flow = createReplayFlow(s, e);
  e.replayLoaded = true;
  e.replayTime = 12; e.clock = 12480; flow.frame();
  assert.deepStrictEqual([s.time, s.position], [12, 12.48]);
  e.replayTime = 30; e.clock = 31250; e.replayAnimating = true; flow.frame();
  assert.strictEqual(s.position, 30);
  flow.seek(7);
  assert.deepStrictEqual([s.time, s.position], [7, 7]);
}

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

// A replay the engine never builds, such as damaged data or a seed replay's placeholder, is given up after 10 s of the engine's own
// time, so the page can say so instead of staying black. A slow device takes longer in real time but gets the same 10 s.
{
  const s = state(), e = fakeEngine(), flow = createReplayFlow(s, e);
  e.time = 9999; flow.frame();
  assert.strictEqual(s.unplayable, false, 'still waiting');
  e.time = 10000; flow.frame();
  assert.deepStrictEqual([s.unplayable, s.loaded, s.playing], [true, false, false]);
  e.replayLoaded = true; flow.frame();
  assert.deepStrictEqual([s.unplayable, s.loaded], [true, false], 'given up for good');
}
{
  const s = state(), e = fakeEngine(), flow = createReplayFlow(s, e);
  e.time = 9900; e.replayLoaded = true; flow.frame();
  e.time = 20000; flow.frame();
  assert.deepStrictEqual([s.unplayable, s.loaded, s.playing], [false, true, true], 'a replay that loaded in time plays');
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

// Previous and Next go to the marks (.scratch/replay-marks/spec.md 18): Next to the first one after the playhead, Previous to the
// last one more than 2 s behind it, so pressed again right after a jump it goes on back. Past either end they do nothing.
{
  const s = { ...state(), meta: { marks: [{ at: 10 }, { at: 30 }, { at: 50 }] } }, e = fakeEngine(), flow = createReplayFlow(s, e);
  e.replayLoaded = true; flow.frame();
  e.replayTime = 10; flow.frame();
  flow.jump(1);
  assert.strictEqual(e.replayTime, 30, 'not the mark under the playhead');
  e.replayTime = 31; flow.frame();
  flow.jump(-1);
  assert.strictEqual(e.replayTime, 10, 'a mark only just passed is skipped');
  e.replayTime = 33; flow.frame();
  flow.jump(-1);
  assert.strictEqual(e.replayTime, 30);
  e.calls.length = 0;
  e.replayTime = 8; flow.frame(); flow.jump(-1);
  e.replayTime = 50; flow.frame(); flow.jump(1);
  assert.deepStrictEqual(e.calls, [], 'nothing before the first mark or after the last');
}

// A jump from the end screen plays from the mark, which the end screen would otherwise cover; elsewhere a paused replay stays paused.
{
  const s = { ...state(), meta: { marks: [{ at: 12 }] } }, e = fakeEngine({ length: 30 }), flow = createReplayFlow(s, e);
  e.replayLoaded = true; flow.frame();
  e.replayTime = 30; flow.frame();
  assert.strictEqual(s.ended, true);
  flow.jump(-1);
  assert.deepStrictEqual([s.ended, s.playing, e.replayTime], [false, true, 12]);
  flow.togglePlay();
  flow.toMark(12);
  assert.deepStrictEqual([s.playing, e.replayTime], [false, 12]);
}
console.log('replay flow ok');
