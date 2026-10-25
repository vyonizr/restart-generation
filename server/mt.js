// RedLynx MT transport carried inside SNAP game packets (DataFragmenter, FUN_1011b260 / FUN_1011acb0).
// Stream of frames: u16 LE (index << 10 | len), then len bytes. A message is one frame with
// index 0, or frames numbered 1, 2, ... where the last one is renumbered 0.
// A reassembled message is u8 type + body. Everything is little-endian.

const { MTU } = require('../shared/snap-ids.js');

const MAX_FRAME = MTU - 2; // what the MTU leaves after the u16 frame header
const T = { PING: 1, PONG: 2, GAMESERVER: 3, PING_CONFIG: 0x0c, CASINO: 0x11, RANKED_CASINO: 0x12, FRIENDLY_CASINO: 0x13, TABLE: 0x15, GAME: 0x16 };

// Feeds bytes from one connection; returns complete messages as Buffers (type byte first).
function createReader() {
  let buf = Buffer.alloc(0);
  let parts = [];
  return chunk => {
    buf = Buffer.concat([buf, chunk]);
    const out = [];
    while (buf.length >= 2) {
      const hdr = buf.readUInt16LE(0);
      const len = hdr & 0x3ff;
      if (buf.length < 2 + len) break;
      parts.push(buf.subarray(2, 2 + len));
      buf = buf.subarray(2 + len);
      if (hdr >> 10 === 0) { out.push(Buffer.concat(parts)); parts = []; }
    }
    return out;
  };
}

// Encodes one message (type + body) as a list of frames. Send big messages one frame per
// SNAP packet: the client's receive buffer is 2048 bytes.
function frames(type, body = Buffer.alloc(0)) {
  const msg = Buffer.concat([Buffer.from([type]), body]);
  const out = [];
  for (let off = 0, i = 1; off < msg.length; off += MAX_FRAME, i++) {
    const part = msg.subarray(off, off + MAX_FRAME);
    const index = off + MAX_FRAME >= msg.length ? 0 : i;
    const hdr = Buffer.alloc(2);
    hdr.writeUInt16LE((index << 10) | part.length);
    out.push(Buffer.concat([hdr, part]));
  }
  return out;
}

const encode = (type, body) => Buffer.concat(frames(type, body));

const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n >>> 0); return b; };

module.exports = { T, createReader, frames, encode, u32 };
