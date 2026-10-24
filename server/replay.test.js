// Self-check for the replay text (server/replay.js): node server/replay.test.js
// The decoder below follows docs/re/re_replay.md "The replay text", not the encoder: a 1- or 2-byte tail sits in the low bits
// of the last base64 group, the bytes are a u32 length and a zlib stream with header 78 5e, and the stream holds the Game blob,
// then (u32 time, GameMessage) pairs.
const assert = require('assert');
const zlib = require('zlib');
const replay = require('./replay');

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
function engineDecode(text) {
  assert.strictEqual(text.length % 4, 0, 'the length is a multiple of 4');
  const pad = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0;
  const full = text.slice(0, pad ? -4 : undefined);
  const tail = pad ? text.slice(-4).replace(/=+$/, '') : '';
  const v = [...tail].reduce((n, c) => n * 64 + A.indexOf(c), 0);
  const end = pad === 2 ? [v] : pad === 1 ? [v >> 8, v & 255] : [];
  assert(end.every(b => b < 256), `tail ${tail} isn't packed into the low bits`);
  return Buffer.concat([Buffer.from(full, 'base64'), Buffer.from(end)]);
}

// The Game blob and messages are opaque to the encoder; distinct made-up bytes show where each lands.
const game = Buffer.from('made-up game blob');
const msg = n => Buffer.from(Array.from({ length: 3 + n % 7 }, (_, i) => (n * 31 + i) & 255));

const tails = new Set();
for (let n = 1; n <= 40; n++) {
  const history = Array.from({ length: n }, (_, i) => ({ t: i * 250, raw: msg(i) }));
  const text = replay.encode(game, history);
  assert.match(text, /^[A-Za-z0-9+/]+={0,2}$/, 'plain base64 text with no NUL');
  const bytes = engineDecode(text);
  tails.add(text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0);
  assert.deepStrictEqual([bytes[4], bytes[5]], [0x78, 0x5e], 'zlib header 78 5e');
  const inflated = zlib.inflateSync(bytes.subarray(4));
  assert.strictEqual(bytes.readUInt32LE(0), inflated.length, 'the length prefix is the inflated size');
  assert(inflated.subarray(0, game.length).equals(game), 'the Game blob comes first');
  let at = game.length;
  const times = [];
  for (let i = 0; i < n; i++) {
    times.push(inflated.readUInt32LE(at));
    const raw = msg(i);
    assert(inflated.subarray(at + 4, at + 4 + raw.length).equals(raw), `message ${i} follows its time`);
    at += 4 + raw.length;
  }
  assert.strictEqual(at, inflated.length, 'nothing after the last message');
  // The engine smooths times against the previous nonzero one, so the first is never 0, and the spacing is kept.
  assert(times[0] > 0, 'the first time is not 0');
  assert.deepStrictEqual(times.map(t => t - times[0]), history.map(e => e.t));
}
assert.deepStrictEqual([...tails].sort(), [0, 1, 2], 'every tail length was exercised');
console.log('replay text ok');

// Marks (server/replay.js `marks`, .scratch/replay-marks/spec.md 8-9). A worked example of the engine's smoothing: stored times
// 1000, 3000, 5000 (BattleBegin), 25000, 25500, 26000 smooth to 1000, 2000, 3500, 14250, 19875, 22938, so message 3, an EndTurn
// that opens a turn, sits at 10750 ms on the replay clock and the turn's first message at 16375 ms. Read from the stored times,
// the opener would sit at 20 s instead.
{
  const times = [0, 2000, 4000, 24000, 24500, 25000];
  assert.deepStrictEqual(replay.marks(times, 2, [{ index: 5, opener: 3, kind: 'rescue', seat: 2, by: 1 }]),
    [{ at: 11, moments: [{ kind: 'rescue', seat: 2, by: 1 }] }], 'the first whole second after the opener');
  // Moments of one turn share its mark, in the order of their messages; a knock-out names no one who did it.
  assert.deepStrictEqual(replay.marks(times, 2, [
    { index: 5, opener: 3, kind: 'rescue', seat: 2, by: 1 },
    { index: 4, opener: 3, kind: 'knockout', seat: 2 },
    { index: 3, opener: 2, kind: 'knockout', seat: 1 },
  ]), [
    { at: 0, moments: [{ kind: 'knockout', seat: 1 }] },
    { at: 11, moments: [{ kind: 'knockout', seat: 2 }, { kind: 'rescue', seat: 2, by: 1 }] },
  ]);
}

// Over made-up battles, a seek to a mark leaves the turn's first message and the moment's own message to play, and has run the
// opener whenever a whole second lies between it and the turn's first message. The clock here uses the note's other form of the
// smoothing, the lag g_k = floor((r_k - r_(k-1) + g_(k-1)) / 2), so the two forms check each other.
{
  let fallbacks = 0;
  for (let n = 0; n < 200; n++) {
    let t = 0, a = n + 1;
    const rand = k => { // mulberry32
      a = a + 0x6d2b79f5 | 0;
      let x = Math.imul(a ^ a >>> 15, 1 | a);
      x = x + Math.imul(x ^ x >>> 7, 61 | x) ^ x;
      return Math.floor(((x ^ x >>> 14) >>> 0) / 2 ** 32 * k);
    };
    const times = Array.from({ length: 40 }, () => (t += rand(4) ? rand(1500) : rand(60000)));
    const begin = 2, lag = [0];
    for (let k = 1; k < times.length; k++) lag.push(Math.floor((times[k] - times[k - 1] + lag[k - 1]) / 2));
    const d = times.map((r, k) => r - lag[k] - (times[begin] - lag[begin]));
    for (let o = begin; o < times.length - 1; o++) {
      const i = o + 1 + rand(times.length - o - 1);
      const [{ at }] = replay.marks(times, begin, [{ index: i, opener: o, kind: 'knockout', seat: 1 }]);
      assert(at * 1000 < d[o + 1] && at * 1000 < d[i], `battle ${n}: the turn is still to play after a seek to ${at}`);
      if (at * 1000 < d[o]) { fallbacks++; assert(Math.ceil(d[o] / 1000) * 1000 >= d[o + 1], `battle ${n}: ${at} needlessly before the opener`); }
    }
  }
  assert(fallbacks > 0, 'some turns began within the second of their opener');
}
console.log('replay marks ok');
