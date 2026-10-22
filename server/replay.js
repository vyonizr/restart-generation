// The text the engine's replay player reads (setReplayData; docs/re/re_replay.md "The replay text"): a battle's Game blob and its
// timed messages, compressed and in the engine's own base64.
const zlib = require('zlib');

const A = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
// Standard base64, except that a 1- or 2-byte tail goes in the low bits of the last group, as the engine packs it.
function engineBase64(buf) {
  const full = buf.length - buf.length % 3;
  let s = buf.subarray(0, full).toString('base64');
  if (buf.length - full === 1) { const b = buf[full]; s += A[b >> 6] + A[b & 63] + '=='; }
  if (buf.length - full === 2) { const v = buf[full] << 8 | buf[full + 1]; s += A[v >> 12] + A[v >> 6 & 63] + A[v & 63] + '='; }
  return s;
}

// The engine moves each time halfway back towards the previous nonzero one, so the first must not be 0.
const FIRST_MS = 1000;

// `history` is the relay's messages in order, each { t: ms since the table began, raw: the whole GameMessage }.
function encode(game, history) {
  const parts = [game];
  for (const { t, raw } of history) {
    const time = Buffer.alloc(4);
    time.writeUInt32LE(FIRST_MS + t);
    parts.push(time, raw);
  }
  const bytes = Buffer.concat(parts);
  // Levels 2 to 5 write the only zlib header the engine accepts, 78 5e.
  const length = Buffer.alloc(4);
  length.writeUInt32LE(bytes.length);
  return engineBase64(Buffer.concat([length, zlib.deflateSync(bytes, { level: 2 })]));
}

module.exports = { encode };
