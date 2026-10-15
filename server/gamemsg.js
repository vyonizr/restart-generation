// rg::GameMessage, the in-match message carried on MT type 0x16 as one zlib stream
// (PlayerConnection FUN_1005cfc0 / FUN_1005d100). Header: write FUN_1000d160, read FUN_1000c020.
const zlib = require('zlib');

const TYPE = {
  INIT: 0, BATTLE_BEGIN: 1, MOVE_UNIT: 3, FIRE_CANNON: 4, PLACE_TILE: 5, ATTACK: 6, END_TURN: 7,
  POINT: 8, END_TURN_REQUEST: 9, END_GAME: 10, PLAYER_JOINED: 12, IGNORED_ORDER: 13, ACCEPTED: 14,
  CHAT: 15, SPECIAL_SKILL: 16,
};

// Header fields are all 4-byte little-endian; recipients is a counted list.
function parse(buf) {
  let o = 0;
  const i32 = () => { const v = buf.readInt32LE(o); o += 4; return v; };
  const m = { seq: i32(), reliable: i32(), type: i32(), sender: i32() };
  const n = i32();
  m.recipients = Array.from({ length: n }, i32);
  m.a = i32(); m.turn = i32(); m.phase = i32(); m.hash = buf.readUInt32LE(o); o += 4; m.b = i32();
  m.body = buf.subarray(o);
  return m;
}

function write(m) {
  const fields = [m.seq, m.reliable ?? 1, m.type, m.sender ?? 0, (m.recipients ?? [0]).length, ...(m.recipients ?? [0]),
    m.a ?? -1, m.turn ?? 0, m.phase ?? 0];
  const head = Buffer.alloc(fields.length * 4 + 8);
  fields.forEach((v, i) => head.writeInt32LE(v, i * 4));
  head.writeUInt32LE((m.hash ?? 0) >>> 0, fields.length * 4);
  head.writeInt32LE(m.b ?? 0, fields.length * 4 + 4);
  return Buffer.concat([head, m.body ?? Buffer.alloc(0)]);
}

// The client inflates with standard zlib (inflateInit_, FUN_10091a90) and deflates at level 2.
const pack = m => zlib.deflateSync(write(m), { level: 2 });
const unpack = data => parse(zlib.inflateSync(data));

module.exports = { TYPE, parse, write, pack, unpack };
