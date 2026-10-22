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
