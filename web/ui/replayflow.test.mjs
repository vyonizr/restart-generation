// Self-check for how the replay page drives the engine's replay player (web/ui/replayflow.js): node web/ui/replayflow.test.mjs
// The flow follows the original Java player (docs/re/re_replay.md "The original player's controls"). A fake engine stands in for
// GameHost's replay controls: its clock moves only when a test moves it.
import assert from 'node:assert';
import { createReplayFlow } from './replayflow.js';

// `clock` is the engine's clock in ms when a test sets it; otherwise it is the whole seconds of replayTime. `replaySeats` and
// `rescuePlaying` are the battle's seats and its rescue animation, and `replayFinished` its logic's end, as tests set them.
function fakeEngine({ length = 60 } = {}) {
  const e = {
    replayLoaded: false, replayTime: 0, replayLength: length, replayAnimating: false, playing: true, mode: null, calls: [], time: 0,
    clock: null, replaySeats: [], rescuePlaying: false, replayFinished: true,
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

// A click or a drag on the time slider lands on the exact second under the pointer. Each seek runs the battle again, so a drag
// seeks only where the pointer rests for 150 ms, and letting go seeks to where it stopped before the replay resumes.
{
  let ms = 0;
  const s = state(), e = fakeEngine(), flow = createReplayFlow(s, e, () => ms);
  e.replayLoaded = true; flow.frame();
  e.calls.length = 0;
  flow.hold();
  flow.scrub(21.4); ms += 16; flow.frame();
  flow.scrub(22.6); ms += 16; flow.frame();
  flow.scrub(23.2); ms += 100; flow.frame();
  assert.deepStrictEqual(e.calls, ['pause'], 'nothing sought while the pointer moves');
  ms += 60; flow.frame();
  assert.deepStrictEqual([e.calls, s.time], [['pause', 'seek 23'], 23], 'rested 160 ms: sought');
  ms += 500; flow.frame();
  assert.strictEqual(e.calls.length, 2, 'not sought again');
  flow.scrub(37.8); ms += 16;
  flow.release();
  assert.deepStrictEqual(e.calls.slice(2), ['seek 38', 'play'], 'let go: the last second first, then playing on');
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

// The end: once the clock reaches the length, nothing is animating and the battle is finished, the replay pauses on its end
// screen. Play then starts it again from 0.
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

// With the clock at the end, a battle still to show (its logic not finished) isn't over between two animations, and play there
// plays on rather than starting again; it is over once the logic finishes, or after 3 s with nothing animating if it never does.
{
  const s = state(), e = fakeEngine({ length: 30 }), flow = createReplayFlow(s, e);
  e.replayLoaded = true; flow.frame();
  e.replayTime = 30; e.replayFinished = false; e.time = 1000; flow.frame();
  assert.strictEqual(s.ended, false, 'nothing animating for a moment');
  flow.togglePlay(); flow.togglePlay();
  assert.deepStrictEqual([s.playing, e.calls.includes('seek 0')], [true, false], 'plays on');
  e.replayFinished = true; e.time += 33; flow.frame();
  assert.strictEqual(s.ended, true);

  const s2 = state(), e2 = fakeEngine({ length: 30 }), flow2 = createReplayFlow(s2, e2);
  e2.replayLoaded = true; flow2.frame();
  e2.replayTime = 30; e2.replayFinished = false; e2.time = 1000; flow2.frame();
  e2.time = 3900; flow2.frame();
  assert.strictEqual(s2.ended, false);
  e2.time = 4000; flow2.frame();
  assert.strictEqual(s2.ended, true, 'a battle that never finishes');
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

// Defeated seats (CONTEXT.md "Defeated player"). `seats` sets the battle's Commanders: [seat, defeated, princesses] each.
const seats = (e, ...list) => { e.replaySeats = list.map(([seat, defeated, princesses]) => ({ seat, defeated, princesses })); };
const players = n => ({ players: Array.from({ length: n }, (_, i) => ({ seat: i + 1 })) });

// A seat that left changes at once; one whose princess was rescued only once the rescue's animation has played; and the seats
// nobody took (the engine's empty slots) never show.
{
  const s = { ...state(), defeated: [], meta: players(3) }, e = fakeEngine(), flow = createReplayFlow(s, e);
  e.replayLoaded = true;
  seats(e, [1, false, 1], [2, false, 1], [3, false, 1], [4, true, 0]); flow.frame();
  assert.deepStrictEqual(s.defeated, [], 'an empty seat is no defeat');
  seats(e, [1, false, 1], [2, true, 1], [3, false, 1], [4, true, 0]); e.time += 33; flow.frame();
  assert.deepStrictEqual(s.defeated, [2], 'left: no one holds another princess');
  seats(e, [1, false, 2], [2, true, 1], [3, true, 0], [4, true, 0]); e.time += 33; flow.frame();
  assert.deepStrictEqual(s.defeated, [2], 'rescued: waits for the animation');
  e.rescuePlaying = true; e.time += 33; flow.frame();
  assert.deepStrictEqual(s.defeated, [2], 'while it plays');
  e.rescuePlaying = false; e.time += 33; flow.frame();
  assert.deepStrictEqual(s.defeated, [2, 3], 'once it has played');
}

// A rescue animation already playing when the seat falls is another one: the seat waits for one that starts after it.
{
  const s = { ...state(), defeated: [], meta: players(3) }, e = fakeEngine(), flow = createReplayFlow(s, e);
  e.replayLoaded = true;
  seats(e, [1, false, 1], [2, false, 1], [3, false, 1]); e.rescuePlaying = true; flow.frame();
  seats(e, [1, false, 2], [2, false, 1], [3, true, 0]); e.time += 33; flow.frame();
  e.rescuePlaying = false; e.time += 33; flow.frame();
  assert.deepStrictEqual(s.defeated, [], 'not at the end of the earlier animation');
  e.rescuePlaying = true; e.time += 33; flow.frame();
  e.rescuePlaying = false; e.time += 33; flow.frame();
  assert.deepStrictEqual(s.defeated, [3]);
}

// With no animation, the seat changes after 30 s of play; paused time doesn't count, and the end shows every defeat at once.
{
  const s = { ...state(), defeated: [], meta: players(3) }, e = fakeEngine({ length: 30 }), flow = createReplayFlow(s, e);
  e.replayLoaded = true;
  seats(e, [1, false, 1], [2, false, 1], [3, false, 1]); flow.frame();
  seats(e, [1, false, 2], [2, false, 1], [3, true, 0]); e.time += 33; flow.frame();
  flow.togglePlay(); // paused
  e.time += 60000; flow.frame();
  assert.deepStrictEqual(s.defeated, [], 'paused');
  flow.togglePlay();
  e.time += 29000; flow.frame();
  assert.deepStrictEqual(s.defeated, []);
  e.time += 2000; flow.frame();
  assert.deepStrictEqual(s.defeated, [3], 'given up on the animation');

  const s2 = { ...state(), defeated: [], meta: players(3) }, e2 = fakeEngine({ length: 30 }), flow2 = createReplayFlow(s2, e2);
  e2.replayLoaded = true;
  seats(e2, [1, false, 1], [2, false, 1], [3, false, 1]); flow2.frame();
  seats(e2, [1, false, 2], [2, false, 1], [3, true, 0]); e2.time += 33; flow2.frame();
  e2.replayTime = 30; e2.time += 33; flow2.frame();
  assert.deepStrictEqual([s2.ended, s2.defeated], [true, [3]], 'the end shows it');
}

// A seek shows the defeats before its second at once, and undoes the ones after it.
{
  const s = { ...state(), defeated: [], meta: players(3) }, e = fakeEngine(), flow = createReplayFlow(s, e);
  e.replayLoaded = true;
  seats(e, [1, false, 1], [2, false, 1], [3, false, 1]); flow.frame();
  flow.seek(40);
  seats(e, [1, false, 2], [2, true, 1], [3, true, 0]); e.time += 33; flow.frame();
  assert.deepStrictEqual(s.defeated, [2, 3], 'rescued before the second: no animation to wait for');
  flow.seek(5);
  seats(e, [1, false, 1], [2, false, 1], [3, false, 1]); e.time += 33; flow.frame();
  assert.deepStrictEqual(s.defeated, []);
}
console.log('replay flow ok');
