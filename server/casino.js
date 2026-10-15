// RedLynx "CasinoSystem" game server. The native client talks to it through SNAP
// command 133 (in) and event 117 (out), inside the MT transport (mt.js).
// Message layouts: docs/protocol.md, "CasinoSystem".
const fs = require('fs');
const path = require('path');
const { T, createReader, encode, u32 } = require('./mt');

const CAPTURE = path.join(__dirname, '..', 'data', 'capture.log');
const RANKED_CASINO = 0x12; // MT type of ranked-casino messages (friendly casinos use 0x13)
const TABLE_SIZE = 2;        // ponytail: ranked tables seat 2; gather up to 4 if real players want bigger games

// Casino action ids (FUN_100994e0).
const A = {
  LOGIN: 0, LOGOUT: 1, F_CASINO: 3, RANKINGS: 4, STATISTICS: 5, ACHIEVEMENTS: 6, FRIENDLY_LIST: 7,
  ENTER: 8, MATCHMAKING: 9, CANCEL_MATCHMAKING: 0x0a, EXIT: 0x0b,
  SEAT_RESERVE: 0x0c, SEAT_TAKE: 0x0d, SEAT_LEAVE: 0x0e,
  REGISTER_FRIENDS: 0x21, FRIEND_REMOVE: 0x23, FRIEND_ADD: 0x24, MATCHED_UP: 0x1f,
};
const REQUEST = 0, RESPONSE = 1, EVENT = 2;

function hexdump(buf) {
  const rows = [];
  for (let i = 0; i < buf.length; i += 16) {
    const c = buf.subarray(i, i + 16);
    rows.push(i.toString(16).padStart(4, '0') + '  ' + [...c].map(b => b.toString(16).padStart(2, '0')).join(' ').padEnd(48)
      + ' ' + [...c].map(b => (b >= 32 && b < 127 ? String.fromCharCode(b) : '.')).join(''));
  }
  return rows.join('\n');
}
const record = line => fs.appendFileSync(CAPTURE, `${new Date().toISOString()} ${line}\n`);

// Encoders. Strings: u32 flags, u32 len, u32 len, bytes (mt::String).
const u8 = v => Buffer.from([v]);
const i32 = v => { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; };
const str = v => { const b = Buffer.from(String(v), 'latin1'); return Buffer.concat([u32(0), u32(b.length), u32(b.length), b]); };
const list = (items, enc) => Buffer.concat([u32(items.length), ...items.map(enc)]);
const profile = o => list(Object.entries(o), ([k, v]) => Buffer.concat([str(k), str(v)]));
const casinoInfo = c => Buffer.concat([u8(c.type), u32(c.id), u32(c.inLobby), u32(c.waiting), u32(c.playing), str(c.name)]);
const address = url => Buffer.concat([u8(0), u8(1), str(url), u8(1)]); // kind 0, Win32, url, isServer
const tableDescriptor = t => Buffer.concat([str(t.id), str(t.name), u8(0), u8(t.max), i32(0), address(t.url)]);
const header = (kind, action) => Buffer.from([kind, action]);
const response = (action, ...parts) => Buffer.concat([header(RESPONSE, action), u8(0), u32(0), ...parts]);
const event = (action, subject, ...parts) => Buffer.concat([header(EVENT, action), str(subject), ...parts]);

// Player stats live on the SNAP account record (data/accounts.json).
function stats(acc) {
  acc.stats ??= { fame: 0, matches: 0, wins: 0, rescues: 0, favouriteHero: -1 };
  return acc.stats;
}
function statsRecord(acc, rank) {
  const st = stats(acc);
  return Buffer.concat([str(acc.name), i32(fameLevel(acc)), i32(st.fame), i32(0), i32(rank),
    i32(st.matches), i32(st.wins), i32(st.rescues), i32(st.favouriteHero), i32(0), list([], i32), list([], i32)]);
}
function ranking(api) {
  return Object.values(api.accounts).sort((a, b) => stats(b).fame - stats(a).fame);
}

const ranked = new Set();    // sessions inside the ranked casino
const queue = [];            // sessions waiting for a ranked match
let nextTable = 1;

const fameLevel = acc => 1 + Math.floor(stats(acc).fame / 100);
// The matchmaking screen reads fameLevel, heroType and random from every listed profile (FUN_100eb6d0);
// a missing key crashes the client.
const myProfile = s => ({ id: s.userId, name: s.name, fame: stats(s.account).fame, fameLevel: fameLevel(s.account), ...s.match });

// mt::String reader: u32 flags, u32 len, u32 count, bytes (count * 2 if UTF-16).
function readStr(buf, off) {
  const wide = ((buf.readUInt32LE(off) >>> 28) & 7) === 2;
  const n = buf.readUInt32LE(off + 8) * (wide ? 2 : 1);
  const raw = buf.subarray(off + 12, off + 12 + n);
  return [wide ? raw.toString('utf16le') : raw.toString('latin1'), off + 12 + n];
}
const rankedInfo = () => ({ type: 1, id: 1, name: 'Global', inLobby: ranked.size, waiting: queue.length, playing: 0 });

function send(s, api, type, body) {
  api.send(s, encode(type, body));
}

function leaveCasino(s) {
  ranked.delete(s);
  const i = queue.indexOf(s);
  if (i >= 0) queue.splice(i, 1);
}

function matchmake(api) {
  while (queue.length >= TABLE_SIZE) {
    const players = queue.splice(0, TABLE_SIZE);
    const n = nextTable++;
    const table = { id: String(n), name: `table_${n}`, max: TABLE_SIZE, url: `naf://rg.com:80/table_${n}` };
    // The client leaves CasinoSystem and joins this SNAP room by name (FUN_100cdd00, FUN_1010fd80).
    api.createRoom(table.name, TABLE_SIZE).table = table;
    api.log(`matched ${players.map(p => p.name).join(', ')} into ${table.name}`);
    for (const p of players) {
      ranked.delete(p);
      send(p, api, RANKED_CASINO, event(A.MATCHED_UP, p.userId, tableDescriptor(table)));
    }
  }
}

function onCasino(s, type, kind, action, body, api) {
  if (kind !== REQUEST) return false;
  api.log(`casino 0x${type.toString(16)} ${Object.keys(A).find(k => A[k] === action) ?? action} from ${s.name}`);
  const reply = (...parts) => send(s, api, type, response(action, ...parts));
  switch (action) {
    case A.LOGIN: // body: u32 1, String version. hasCasino must be 1 with a PUBLIC casino.
      api.log(`casino login ${s.name} (${body.subarray(16).toString('latin1')})`);
      return reply(profile(myProfile(s)), u8(1), casinoInfo(rankedInfo()));
    case A.LOGOUT:
      leaveCasino(s);
      return reply();
    case A.STATISTICS: {
      const rank = ranking(api).indexOf(s.account) + 1;
      return reply(statsRecord(s.account, rank));
    }
    case A.RANKINGS: { // three lists: top 10, friends, near you
      const all = ranking(api);
      const me = all.indexOf(s.account);
      const rec = acc => statsRecord(acc, all.indexOf(acc) + 1);
      const near = all.slice(Math.max(0, me - 2), me + 3);
      return reply(list(all.slice(0, 10), rec), list([s.account], rec), list(near, rec));
    }
    case A.ACHIEVEMENTS: { // client uploads 12 u32 counters, gets all 50 back
      const blob = Buffer.alloc(200);
      if (s.account.achievements) Buffer.from(s.account.achievements, 'base64').copy(blob);
      body.subarray(0, 48).copy(blob);
      s.account.achievements = blob.toString('base64');
      api.saveAccounts();
      return reply(blob);
    }
    case A.FRIENDLY_LIST: // answered with F_CASINO (response 7 is ignored by the client)
      return send(s, api, type, response(A.F_CASINO, u8(0)));
    case A.REGISTER_FRIENDS:
      return reply();
    case A.ENTER:
      ranked.add(s);
      return reply(profile(myProfile(s)), casinoInfo(rankedInfo()));
    case A.MATCHMAKING: { // body: String heroType, String random
      const [heroType, next] = readStr(body, 0);
      const [random] = readStr(body, next);
      s.match = { heroType, random };
      const others = queue.filter(q => q !== s);
      reply(u8(others.length), ...others.map(o => profile(myProfile(o))));
      for (const o of others) send(o, api, type, event(A.MATCHMAKING, s.userId, profile(myProfile(s))));
      if (!queue.includes(s)) queue.push(s);
      return matchmake(api);
    }
    case A.CANCEL_MATCHMAKING: {
      const i = queue.indexOf(s);
      if (i >= 0) queue.splice(i, 1);
      return reply();
    }
    case A.EXIT:
      leaveCasino(s);
      return reply();
    case A.SEAT_RESERVE:
    case A.SEAT_TAKE:
    case A.SEAT_LEAVE:
      reply();
      for (const m of s.room?.members || []) if (m !== s) send(m, api, type, event(action, s.userId));
      return;
  }
  return false;
}

function onMessage(s, msg, api) {
  const type = msg[0], body = msg.subarray(1);
  switch (type) {
    case T.PING: // Handshake ping carries u32 timeout and wants PONG [0]; later pings carry u8 seq.
      return send(s, api, T.PONG, Buffer.from([body.length === 1 ? body[0] : 0]));
    case T.PONG:
    case T.GAMESERVER: // Hello key/value block; the client expects no reply.
      return;
    case T.CASINO: case RANKED_CASINO: case 0x13: case T.TABLE:
      if (onCasino(s, type, body[0], body[1], body.subarray(2), api) !== false) return;
  }
  api.log(`unhandled MT type 0x${type.toString(16)} from ${s.name}, ${body.length} bytes`);
  record(`${s.name} room=${s.room?.name} MT type=0x${type.toString(16)} len=${body.length}\n${hexdump(body)}\n`);
}

module.exports = {
  onPacket(s, data, api) {
    s.mtRead ??= createReader();
    for (const msg of s.mtRead(data)) onMessage(s, msg, api);
  },
  onJoin(s, room, api) {
    record(`${s.name} joined ${room.id} "${room.name}"`);
    s.mtRead = createReader();
    // The client's socket stays "connecting" and drops all sends until it receives a packet
    // in the room (LAB_1010ff60). Delay it: Java drops event 117 until joinGameRoom returns.
    setTimeout(() => s.room === room && send(s, api, T.PING, u32(20000)), 500);
  },
  onLeave(s, room, api) {
    record(`${s.name} left ${room.id} "${room.name}"`);
    if (room.name === 'CasinoSystem') leaveCasino(s);
  },
};
