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

// The engine moves each time halfway back towards the previous smoothed one, so the first must not be 0.
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

// Each message's time on the engine's replay clock, in ms after BattleBegin (message `begin`), as the replay player smooths the
// stored times (docs/re/re_replay.md "What the engine does with it"): each moves halfway, rounded up, from the previous smoothed
// time towards its own, in unsigned 32-bit arithmetic, and the messages before BattleBegin carry their lag into every later one.
function clock(times, begin) {
  const a = [];
  let prev = 0;
  for (const t of times) {
    const r = (FIRST_MS + t) >>> 0;
    prev = prev ? (r - ((r - prev) >>> 0 >>> 1)) >>> 0 : r;
    a.push(prev);
  }
  return a.map(v => (v - a[begin]) >>> 0);
}

// The replay's marks (CONTEXT.md) from the witness's moments, each { index, opener, kind, seat, by? }: one per turn, at the start
// of the turn, as [{ at, moments: [{ kind, seat, by? }] }] sorted by `at`. `at` is a second for seekReplay: the first whole second
// after the turn's opener, or, when the turn's first message comes within that second, the last second before that message.
// A seek runs every message up to `at` without drawing it, so the turn's messages, and the moments' animations, all play after
// it (.scratch/replay-marks/research/mark-time.md).
function marks(times, begin, moments) {
  const d = clock(times, begin), byAt = new Map();
  for (const m of [...moments].sort((x, y) => x.index - y.index)) {
    const o = Math.max(m.opener, begin), j = Math.min(o + 1, m.index);
    const at = Math.max(0, Math.min(Math.ceil(d[o] / 1000), Math.ceil(d[j] / 1000) - 1));
    if (!byAt.has(at)) byAt.set(at, []);
    byAt.get(at).push({ kind: m.kind, seat: m.seat, ...(m.by && { by: m.by }) });
  }
  return [...byAt].sort(([x], [y]) => x - y).map(([at, list]) => ({ at, moments: list }));
}

module.exports = { encode, marks };
