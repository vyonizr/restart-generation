// SNAP Mobile 1.4.4 wire codec: what a client and a gateway send each other, as observed on the wire and written down in
// docs/protocol.md.

const MAGIC = 0x534d4f42; // "SMOB"
const FRAME = { HELLO: 0, HELLO_ACK: 1, REQUEST: 4, RESPONSE: 5, STAT: 7, STAT_ACK: 8 };

// Per-command flags: low 10 bits = command, 0x800 = long timeout,
// bits 12..35 = base64 params (P1 = bit 12), bits 36..59 = scrambled params (P1 = bit 36).
const CMD_FLAGS = [2051, 4228, 2048, 137441053697, 1026, 2336478988293, 137440004102, 0x200008,
  137440002058, 137438956647, 1128, 137438953578, 137438953581, 4209, 4210, 137438953588,
  137438953589, 4217, 4218, 2178, 4227, 4229, 8326, 8327, 412316863689, 35046933921994,
  0x20000020cc, 114941, 412316863789, 8495, 8497, 8498, 1334, 2359].map(BigInt);

// The login password is the one scrambled param. An unmodified Java client sends it scrambled with a key that K selects; this server
// doesn't decode it and holds no key table (ADR 0018). It never needs to: with a name only, any password is accepted (ADR 0009), and with
// Discord sign-in the password slot carries the page's token, which the browser sends in plain base64 and without K.

const flagsFor = cmd => CMD_FLAGS.find(f => (f & 0x3ffn) === BigInt(cmd)) ?? -1n;
const bit = (flags, n) => flags !== -1n && ((flags >> BigInt(n)) & 1n) === 1n;

// Splits a TCP byte stream into frames. Returns [frames, rest].
// Frame header: "SMOB", 0, type, u16 seq, u32 0, u32 0, u32 length.
function readFrames(buf) {
  const frames = [];
  while (buf.length >= 20) {
    if (buf.readUInt32BE(0) !== MAGIC) throw new Error('bad frame magic');
    const len = buf.readUInt32BE(16);
    if (buf.length < 20 + len) break;
    frames.push({ type: buf[5], seq: buf.readUInt16BE(6), payload: buf.subarray(20, 20 + len) });
    buf = buf.subarray(20 + len);
  }
  return [frames, buf];
}

function frame(type, seq, payload = Buffer.alloc(0)) {
  const h = Buffer.alloc(20);
  h.writeUInt32BE(MAGIC, 0);
  h[5] = type;
  h.writeUInt16BE(seq, 6);
  h.writeUInt32BE(payload.length, 16);
  return Buffer.concat([h, payload]);
}

// Parses "R=1&A=..&V=..&S=..&K=..&C=126&P1=..". Values are not URL-encoded.
// Params come back decoded: base64 params as Buffers, scrambled params as strings. A scrambled param sent with K isn't decoded: it
// comes back empty. Without K it is plain base64.
function parseRequest(text) {
  const kv = {};
  for (const part of text.split('&')) {
    const eq = part.indexOf('=');
    if (eq > 0) kv[part.slice(0, eq)] = part.slice(eq + 1);
  }
  const cmd = Number(kv.C);
  const flags = flagsFor(cmd);
  const params = {};
  for (const [k, v] of Object.entries(kv)) {
    if (!/^P\d+$/.test(k)) continue;
    const n = Number(k.slice(1));
    if (kv.K !== undefined && bit(flags, n - 1 + 36)) {
      params[n] = '';
    } else if (bit(flags, n - 1 + 36)) {
      params[n] = Buffer.from(v, 'base64').toString('utf8');
    } else if (bit(flags, n - 1 + 12)) {
      params[n] = Buffer.from(v, 'base64');
    } else {
      params[n] = v;
    }
  }
  return { rid: kv.R, acks: kv.A, version: kv.V, session: kv.S, cmd, params };
}

// Response body: "<code> <message>\n" then '|' separated fields, list rows one per line.
const ok = (lines = []) => '200 OK\n' + lines.map(l => (Array.isArray(l) ? l.join('|') : l) + '\n').join('');
const err = (code, msg) => `${code} ${msg}\n`;
const b64 = s => Buffer.from(s).toString('base64');

module.exports = { FRAME, readFrames, frame, parseRequest, ok, err, b64 };
