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

const KEYS = ['318838622AB4EAF53C47A99A7E1D6D6F992212B1F0D55E11C9D1E23865586B78',
  'E39022408F7555A6D72E1FA3919543A0A5F372D252DDA646EAEB7826A3A4851F',
  '31EC97F2DD25C3AE7DC2DF3A4BC21431D32DB86F300B4B6BC96480293CF117E4',
  'B7F786FBC218C0DC92FD7E0733FB6F41E332A5ABFF7605666F5A1D1BD2A9A10D',
  '0DD66C03F9A5325AB071CEEFCBD5F4EE1466AFF0E823957AB046621C7C8A0DDB',
  '6D494C184A8AA72ED229AC9242D492520AF6565DC4A56272C3517DADAF39D11F',
  '806E636FB75FF33D48BCE63846236B6549187C0ABFB1FE1C7E43823C1021C4D2',
  'BC417E32F252AC2663017C742C50FCBC8782C80280FB6F833D804C2358CBD728',
  '8C0E725237762AA4A7A92A8189E17409F36F0F5AD6CB6E124B45A906660D8519',
  '35B142EC49F6DE40014A7EC63A646F38CADE2DF855F79C2DDCB9794F887E2B56',
  '978944C361FD4A4380B87270409CC6151E1C64179E213F4B19B8B28FBB1623FE',
  'AA6F3A32395F0ACBAD29A63C3E590D37CF5D93DAA9B448A7103CD2BE633D8280',
  'A0A17CE2F7CC7F02C609AA8BF082C834F652E972CB7F2E3DAA8C5214B4DF6D45',
  'B3C7AC7CC17B5AFA74A04D68C992FCACA212E1623DDE5E58F94F9D57D90702D1',
  'F1464288478FE026EF73918ED97BBED0E6549058FC92522DEBFFFF9C996256E8',
  '2893C6EA7C44F0570BE04288044A767D02B36CA4855E4C0C48A5473D223BD305'].map(h => Buffer.from(h, 'hex'));

const flagsFor = cmd => CMD_FLAGS.find(f => (f & 0x3ffn) === BigInt(cmd)) ?? -1n;
const bit = (flags, n) => flags !== -1n && ((flags >> BigInt(n)) & 1n) === 1n;

const rotl = (b, n) => ((b << n) | (b >> (8 - n))) & 0xff;
const rotr = (b, n) => ((b >> n) | (b << (8 - n))) & 0xff;

// Client: out = rotr(in, k & 7) ^ k. Both directions kept for the self-check.
function scramble(buf, keyIdx) {
  const key = KEYS[keyIdx];
  return Buffer.from(buf.map((b, i) => rotr(b, key[i % key.length] & 7) ^ key[i % key.length]));
}
function unscramble(buf, keyIdx) {
  const key = KEYS[keyIdx];
  return Buffer.from(buf.map((b, i) => rotl(b ^ key[i % key.length], key[i % key.length] & 7)));
}

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
// Params come back decoded: base64 params as Buffers, scrambled params as strings.
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
      params[n] = unscramble(Buffer.from(v, 'base64'), Number(kv.K)).toString('utf8');
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

module.exports = { FRAME, readFrames, frame, parseRequest, ok, err, b64, scramble, unscramble };
