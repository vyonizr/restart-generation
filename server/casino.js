// RedLynx "CasinoSystem" game server. The native client talks to it through SNAP
// command 133 (in) and event 117 (out), inside the MT transport (mt.js).
// Message layouts: docs/protocol.md, "CasinoSystem".
const fs = require('fs');
const path = require('path');
const { T, createReader, encode, u32 } = require('./mt');
const battle = require('./battle');
const bots = require('./bots');

const CAPTURE = path.join(__dirname, '..', 'data', 'capture.log');
const MAX_SEATS = 4;         // SM_GROOM_MAX_NUM_USERS
const GATHER_MS = Number(process.env.RG_GATHER_MS || 15000); // how long a smaller table waits for more players (tools/selfplay.mjs shortens it)
const RELAXED_FRIENDLY = process.env.RG_RELAXED_FRIENDLY === '1' || process.argv.includes('--relaxed'); // friendly tables without phase time limits
const WITNESS_WAIT_MS = 5000; // how long a battle's result waits for a witness that is still catching up

// Casino action ids (FUN_100994e0).
const A = {
  LOGIN: 0, LOGOUT: 1, F_CASINO: 3, RANKINGS: 4, STATISTICS: 5, ACHIEVEMENTS: 6, FRIENDLY_LIST: 7,
  ENTER: 8, MATCHMAKING: 9, CANCEL_MATCHMAKING: 0x0a, EXIT: 0x0b,
  SEAT_RESERVE: 0x0c, SEAT_TAKE: 0x0d, SEAT_LEAVE: 0x0e,
  REGISTER_FRIENDS: 0x21, FRIEND_REMOVE: 0x23, FRIEND_ADD: 0x24, MATCHED_UP: 0x1f, LOCK_PLAYER: 0x1d,
  CREATE: 0x14, FRIENDLY_ENTERED: 0x15, FRIENDLY_LEFT: 0x16, FRIENDLY_UPDATE: 0x19, FRIENDLY_START: 0x1c,
  UNLOCK_PLAYER: 0x1e, CASINO_NOT_FOUND: 0x25,
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
// Room joins, leaves and unknown packets. At 10 MB the file becomes capture.log.1, so a long-running server keeps at most 20 MB.
const CAPTURE_MAX = 10 * 1024 * 1024;
function record(line) {
  try { if (fs.statSync(CAPTURE).size > CAPTURE_MAX) fs.renameSync(CAPTURE, `${CAPTURE}.1`); } catch { /* not there yet */ }
  fs.appendFileSync(CAPTURE, `${new Date().toISOString()} ${line}\n`);
}

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

// Player stats live on the account (server/store.js).
function stats(acc) {
  acc.stats ??= { fame: 0, matches: 0, wins: 0, rescues: 0, favouriteHero: -1 };
  return acc.stats;
}
function statsRecord(acc, rank) {
  const st = stats(acc);
  return Buffer.concat([str(acc.name), i32(fameLevel(acc)), i32(st.fame), i32(0), i32(rank),
    i32(st.matches), i32(st.wins), i32(st.rescues), i32(st.favouriteHero), i32(st.highestFame ?? st.fame), list([], i32), list([], i32)]); // last i32 shows as Highest Fame (inferred)
}

const ranked = new Set();    // sessions inside the ranked casino
const queue = [];            // sessions waiting for a ranked match
let nextTable = 1;
const tables = new Set();    // SNAP rooms hosting a battle

// Clients compute the result locally and upload nothing, so the server scores the witness's result, or its own guess
// (battle.result): +10 fame for each winner, and a match for every player.
async function finishMatch(host, api) {
  if (host.finished) return;
  host.finished = true;
  const outcome = await battle.result(host, WITNESS_WAIT_MS);
  const { winners, players, guessed } = outcome;
  battle.forget(host);
  keepReplay(host, outcome, api);
  const names = winners.map(p => p.s.name);
  const won = names.length ? `${names.length > 1 ? `${names.slice(0, -1).join(', ')} and ` : ''}${names.at(-1)} won` : 'no winner';
  api.log(`battle over: ${guessed ? `result guessed (${guessed}): ` : ''}${won}`);
  // Friendly games are unranked: the client keeps CASINO_FRIENDLY_STATS apart from CASINO_MATCHMAKER_STATS.
  if (!host.ranked) return;
  for (const p of players) {
    const st = stats(p.s.account);
    st.matches++;
    if (winners.includes(p)) { st.wins++; st.fame += 10; }
    st.highestFame = Math.max(st.highestFame ?? 0, st.fame);
    api.save(p.s.account);
  }
}

// Everyone left the table room before the battle ended: its witness lets go, and a battle that began still gets its replay,
// without a result.
function abandonMatch(host, api) {
  if (host.finished) return;
  host.finished = true;
  battle.forget(host);
  keepReplay(host, null, api);
}

// A battle that began becomes a replay (CONTEXT.md), unless the admin turned replays off (api.replays is null). Each person who
// played it in the browser client is told its id; the Java client never reads that event. A replay that can't be kept costs
// nobody their match: the caller goes on to score it.
function keepReplay(host, outcome, api) {
  if (!host.started || !api.replays) return;
  let id;
  try { id = api.replays.save(battle.replay(host, outcome)); } catch (e) { api.log(`battle ${host.seed}: replay not kept: ${e.message}`); return; }
  api.log(`battle ${host.seed} kept as replay ${id}`);
  for (const p of host.players) if (!p.bot && p.s.web) api.replaySaved(p.s, id);
}

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

function leaveCasino(s, api) {
  if (api) leaveFriendly(s, api);
  ranked.delete(s);
  const i = queue.indexOf(s);
  if (i >= 0) queue.splice(i, 1);
}

// Seat up to 4 players at once; after GATHER_MS, seat as many as a level template exists for.
function tableSize() {
  const sizes = [...battle.seatCounts()].filter(n => n >= 2 && n <= Math.min(MAX_SEATS, queue.length));
  if (!sizes.length) return 0;
  const best = Math.max(...sizes);
  return best === MAX_SEATS || Date.now() - queue[0].queuedAt >= GATHER_MS ? best : 0;
}

function matchmake(api) {
  for (let size; (size = tableSize());) if (!startTable(queue.splice(0, size), T.RANKED_CASINO, api)) return;
}

// Creates the table room and battle, then sends every player to it. Returns false without a template.
function startTable(players, casinoType, api) {
  const size = players.length;
  const host = battle.createTable(size, api, casinoType === T.FRIENDLY_CASINO && RELAXED_FRIENDLY);
  if (!host) { if (casinoType === T.RANKED_CASINO) queue.unshift(...players); return false; }
  const n = nextTable++;
  const table = { id: String(n), name: `table_${n}`, max: size, url: `naf://rg.com:80/table_${n}` };
  // The client leaves CasinoSystem and joins this SNAP room by name (FUN_100cdd00, FUN_1010fd80).
  const room = api.createRoom(table.name, size);
  room.battle = host;
  host.ranked = casinoType === T.RANKED_CASINO;
  tables.add(room);
  api.log(`matched ${players.map(p => p.name).join(', ')} into ${table.name}`);
  for (const p of players) {
    ranked.delete(p);
    // Shows GAME_STARTING and stops the player backing out (FUN_100469c0). Must precede
    // MATCHED_UP, which closes the client's CasinoSystem connection.
    lockPlayer(p, true, api);
    // A bot waits in the ranked Quick Match, so it gets the ranked casino's MATCHED_UP.
    send(p, api, p.account.bot ? T.RANKED_CASINO : casinoType, event(A.MATCHED_UP, p.userId, tableDescriptor(table)));
  }
  return true;
}

// Unlocking shows MATCHMAKING_FAILED in the lobby (FUN_100469c0).
function lockPlayer(s, lock, api) {
  send(s, api, T.CASINO, Buffer.concat([header(REQUEST, lock ? A.LOCK_PLAYER : A.UNLOCK_PLAYER), u32(0)]));
}

// A friendly start with the bot switch on: bots fill every empty seat up to four. The players wait on
// GAME_STARTING while the bots start, about 15 s. The room closes only once the table starts; if it can't,
// the players are unlocked back into it.
function startWithBots(c, players, level, api) {
  c.starting = true;
  for (const p of players) lockPlayer(p, true, api);
  const fail = list => {
    api.log(`friendly arena ${c.id} couldn't start with bots`);
    c.starting = false;
    for (const b of list) bots.stop(b);
    for (const p of players) if (api.sessions.has(p.sid)) lockPlayer(p, false, api);
  };
  bots.spawn(MAX_SEATS - players.length, api.log, level).then(list => {
    const humans = players.filter(p => api.sessions.has(p.sid)), seated = [...humans, ...list];
    if (!humans.length || seated.length < 2 || !battle.seatCounts().has(seated.length)) return fail(list);
    closeFriendly(c, api);
    startTable(seated, T.FRIENDLY_CASINO, api);
  }, e => { api.log(e.stack); fail([]); });
}

// What the page does when a member presses Start in room c (shared/snap.js): 'gone' drops the Start because the
// room can't start, 'ask' puts the bot question (no, CPU or Expert) to the player when 2 or 3 people are listed, 'level'
// asks a player alone which level fills the seats, and 'go' sends the Start on.
function botChoice(c, canFill) {
  if (!c || c.starting) return 'gone';
  const n = c.lobby.length;
  if (!canFill || n >= MAX_SEATS) return 'go';
  return n > 1 ? 'ask' : 'level';
}

// A player alone always gets bots (CPU level unless the page asked for Expert); with others listed, only if the starter said yes.
const fillsWithBots = (n, answeredYes, canFill) => canFill && n >= 1 && n < MAX_SEATS && (n === 1 || answeredYes);
const canFillWithBots = () => bots.available() && battle.seatCounts().has(MAX_SEATS);

function closeFriendly(c, api) {
  friendly.delete(c.id);
  friendlyAnnounce(c, A.FRIENDLY_LEFT, api);
}

// Friendly arenas: a private casino per host, visible to the host's buddies (docs/protocol.md).
const friendly = new Map();  // id -> { id, name, host, members: Set, lobby: [] }
let nextFriendly = 2;        // id 1 is the ranked casino
const friendlyInfo = c => ({ type: 2, id: c.id, name: c.name, inLobby: c.members.size, waiting: c.lobby.length, playing: 0 });
const buddies = (a, b, api) => api.link(a.account, b.account) === 'both';
const visibleTo = (s, c, api) => c.host !== s && buddies(c.host, s, api);

function friendlyAnnounce(c, action, api) {
  for (const o of api.sessions.values()) {
    if (visibleTo(o, c, api) && !c.members.has(o)) {
      send(o, api, T.CASINO, event(action, c.host.userId, casinoInfo(friendlyInfo(c)), str(c.name)));
    }
  }
}

function leaveFriendly(s, api) {
  for (const c of friendly.values()) {
    const i = c.lobby.indexOf(s);
    if (i >= 0) {
      c.lobby.splice(i, 1);
      for (const m of c.members) if (m !== s) send(m, api, T.FRIENDLY_CASINO, event(A.CANCEL_MATCHMAKING, s.userId));
    }
    c.members.delete(s);
    if (c.members.size === 0) closeFriendly(c, api);
  }
}

function onCasino(s, type, kind, action, body, api) {
  if (kind === RESPONSE && action === A.LOCK_PLAYER) return; // client's lock ack
  if (kind !== REQUEST) return false;
  api.log(`casino 0x${type.toString(16)} ${Object.keys(A).find(k => A[k] === action) ?? action} from ${s.name}`);
  const reply = (...parts) => send(s, api, type, response(action, ...parts));
  switch (action) {
    case A.LOGIN: // body: u32 1, String version. hasCasino must be 1 with a PUBLIC casino.
      api.log(`casino login ${s.name} (${body.subarray(16).toString('latin1')})`);
      return reply(profile(myProfile(s)), u8(1), casinoInfo(rankedInfo()));
    case A.LOGOUT:
      leaveCasino(s, api);
      return reply();
    case A.STATISTICS:
      return reply(statsRecord(s.account, api.rank(s.account)));
    case A.RANKINGS: { // three lists: top 10, friends, near you. Guests are not ranked, so a guest sees the place it would hold.
      const rec = acc => statsRecord(acc, api.rank(acc));
      const near = api.ranking(Math.max(0, api.rank(s.account) - 3), 5);
      return reply(list(api.ranking(0, 10), rec), list([s.account], rec), list(near, rec));
    }
    case A.ACHIEVEMENTS: { // client uploads 12 u32 counters, gets all 50 back
      const blob = Buffer.alloc(200);
      if (s.account.achievements) Buffer.from(s.account.achievements, 'base64').copy(blob);
      body.subarray(0, 48).copy(blob);
      s.account.achievements = blob.toString('base64');
      api.save(s.account);
      return reply(blob);
    }
    case A.FRIENDLY_LIST: { // answered with F_CASINO, which replaces the client's whole list
      const list = [...friendly.values()].filter(c => visibleTo(s, c, api));
      return send(s, api, type, response(A.F_CASINO, u8(list.length), ...list.map(c => casinoInfo(friendlyInfo(c)))));
    }
    case A.REGISTER_FRIENDS: case A.FRIEND_ADD: case A.FRIEND_REMOVE:
      return; // the buddy list lives in the SNAP gateway; no reply needed
    case A.CREATE: { // client then enters it on 0x13 by itself
      leaveFriendly(s, api);
      const c = { id: nextFriendly++, name: s.name, host: s, members: new Set(), lobby: [] };
      friendly.set(c.id, c);
      api.log(`${s.name} created friendly arena ${c.id}`);
      reply(casinoInfo(friendlyInfo(c)));
      return friendlyAnnounce(c, A.FRIENDLY_ENTERED, api);
    }
    case A.FRIENDLY_UPDATE: { // polled every 6 s per known casino
      const id = body.readUInt32LE(0), c = friendly.get(id);
      if (!c) return send(s, api, type, Buffer.concat([header(RESPONSE, A.CASINO_NOT_FOUND), u8(0), u32(id)]));
      const i = friendlyInfo(c);
      return reply(u32(id), u32(i.inLobby), u32(i.waiting), u32(i.playing));
    }
    case A.FRIENDLY_START: { // any listed member may start (no host check in the client)
      const c = friendly.get(body.readUInt32LE(0));
      const players = c && !c.starting ? c.lobby.slice(0, MAX_SEATS) : [];
      const answered = Boolean(c) && s.fillBots === c.id, level = answered ? s.botLevel : 'cpu';
      const withBots = fillsWithBots(players.length, answered, canFillWithBots());
      s.fillBots = 0; // the answer is for this start only
      if (!players.length || (!withBots && (players.length < 2 || !battle.seatCounts().has(players.length)))) {
        return send(s, api, type, Buffer.concat([header(RESPONSE, action), u8(1), u32(0)])); // MATCHMAKING_FAILED
      }
      reply();
      api.log(`friendly arena ${c.id} starts with ${players.map(p => p.name).join(', ')}${withBots ? ` and ${level} bots` : ''}`);
      if (withBots) return startWithBots(c, players, level, api);
      closeFriendly(c, api);
      return startTable(players, T.FRIENDLY_CASINO, api);
    }
    case A.ENTER: {
      if (type === T.RANKED_CASINO) { if (!s.account.bot) ranked.add(s); return reply(profile(myProfile(s)), casinoInfo(rankedInfo())); }
      const c = friendly.get(body.readUInt32LE(0));
      if (!c) return send(s, api, T.CASINO, Buffer.concat([header(RESPONSE, A.CASINO_NOT_FOUND), u8(0), body.subarray(0, 4)]));
      for (const m of c.members) send(m, api, type, event(A.ENTER, s.userId, profile(myProfile(s))));
      c.members.add(s);
      return reply(profile(myProfile(s)), casinoInfo(friendlyInfo(c)));
    }
    case A.MATCHMAKING: { // body: String heroType, String random
      const [heroType, next] = readStr(body, 0);
      const [random] = readStr(body, next);
      s.match = { heroType, random };
      if (type === T.FRIENDLY_CASINO) { // friendly lobby: list players, the start is up to them
        const c = [...friendly.values()].find(o => o.members.has(s));
        if (!c) return reply(u8(0));
        const others = c.lobby.filter(q => q !== s);
        reply(u8(others.length), ...others.map(o => profile(myProfile(o))));
        for (const m of c.members) if (m !== s) send(m, api, type, event(A.MATCHMAKING, s.userId, profile(myProfile(s))));
        if (!c.lobby.includes(s)) c.lobby.push(s);
        return;
      }
      if (s.account.bot) { reply(u8(0)); return bots.ready(s); } // waits here, out of the queue, until seated
      const others = queue.filter(q => q !== s);
      reply(u8(others.length), ...others.map(o => profile(myProfile(o))));
      for (const o of others) send(o, api, type, event(A.MATCHMAKING, s.userId, profile(myProfile(s))));
      if (!queue.includes(s)) { s.queuedAt = Date.now(); queue.push(s); }
      return matchmake(api);
    }
    case A.CANCEL_MATCHMAKING: {
      const i = queue.indexOf(s);
      if (i >= 0) queue.splice(i, 1);
      for (const c of friendly.values()) {
        const j = c.lobby.indexOf(s);
        if (j < 0) continue;
        c.lobby.splice(j, 1);
        for (const m of c.members) if (m !== s) send(m, api, T.FRIENDLY_CASINO, event(A.CANCEL_MATCHMAKING, s.userId));
      }
      return reply();
    }
    case A.EXIT:
      leaveCasino(s, api);
      return reply();
    case A.SEAT_RESERVE:
    case A.SEAT_TAKE:
      reply();
      for (const m of s.room?.members || []) if (m !== s) send(m, api, type, event(action, s.userId));
      // The SEAT_TAKE response starts the client's battle handshake (FUN_100ead20).
      if (action === A.SEAT_TAKE && s.room?.battle) battle.seat(s.room.battle, s, api);
      return;
    case A.SEAT_LEAVE: // every client sends it when its battle ends normally (FUN_100ec8b0)
      reply();
      if (s.room?.battle) finishMatch(s.room.battle, api).catch(e => api.log(e.stack));
      if (s.account.bot) bots.stop(s);
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
    case T.GAME: {
      const host = s.room?.battle, p = host?.players.find(o => o.s === s);
      if (p) return battle.onGame(host, p, body, api);
      break;
    }
    case T.CASINO: case T.RANKED_CASINO: case T.FRIENDLY_CASINO: case T.TABLE:
      if (onCasino(s, type, body[0], body[1], body.subarray(2), api) !== false) return;
  }
  api.log(`unhandled MT type 0x${type.toString(16)} from ${s.name}, ${body.length} bytes`);
  record(`${s.name} room=${s.room?.name} MT type=0x${type.toString(16)} len=${body.length}\n${hexdump(body)}\n`);
}

module.exports = {
  botChoice, fillsWithBots, finishMatch, abandonMatch,
  waiting: () => queue.length, // players waiting in the ranked Quick Match
  botQuestion: id => botChoice(friendly.get(id), canFillWithBots()),
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
    if (room.name === 'CasinoSystem') leaveCasino(s, api);
    const p = room.battle?.players.find(o => o.s === s);
    if (p) battle.leave(room.battle, p, api);
    // Bots left alone at a table have no one to play for.
    if (room.battle && ![...room.members].some(m => !m.account.bot)) for (const m of room.members) bots.stop(m);
    // A finished battle's witness lets go once the result is in (finishMatch); an abandoned one's, when everyone has left.
    if (room.members.size === 0) { tables.delete(room); if (room.battle) abandonMatch(room.battle, api); }
  },
  start(api) {
    setInterval(() => { matchmake(api); for (const room of tables) battle.tick(room.battle, api); }, 1000);
  },
};
