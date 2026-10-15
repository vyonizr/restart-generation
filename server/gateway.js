// Replacement for resetgeneration-gw.arena.n-gage.com (SNAP Mobile gateway).
// Start: node server/gateway.js   Client: start.bat with -gw 127.0.0.1
const net = require('net');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { FRAME, readFrames, frame, parseRequest, ok, err, b64 } = require('./snap');
const gameServer = require('./casino');

const PORT = Number(process.env.PORT || 8976);
const POLL_HOLD_MS = 15000; // client gives up on long requests after ~40 s
const DATA_DIR = path.join(__dirname, '..', 'data');
const ACCOUNTS = path.join(DATA_DIR, 'accounts.json');

const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);

// ponytail: accounts in one JSON file, move to SQLite if the player count grows.
fs.mkdirSync(DATA_DIR, { recursive: true });
const accounts = fs.existsSync(ACCOUNTS) ? JSON.parse(fs.readFileSync(ACCOUNTS, 'utf8')) : {};
const saveAccounts = () => fs.writeFileSync(ACCOUNTS, JSON.stringify(accounts, null, 1));
const hash = (pw, salt) => crypto.scryptSync(pw, salt, 32).toString('hex');

const LOBBY = { id: '1', name: 'resgen' };
const sessions = new Map(); // sid -> session
const rooms = new Map();    // roomId -> { id, name, max, members: Set<session>, permanent }
let nextRoomId = 1;
// The native client joins this room after login and talks to the game server through it.
rooms.set('0', { id: '0', name: 'CasinoSystem', max: 100000, members: new Set(), permanent: true });
const replies = new Map();  // "<S|addr>:<R>" -> cached response, for client retransmits

function login(name, password) {
  const key = name.toLowerCase();
  let acc = accounts[key];
  if (!acc) { // First login registers the name, as the original web sign-up page did.
    const salt = crypto.randomBytes(8).toString('hex');
    acc = accounts[key] = { id: String(Object.keys(accounts).length + 1), name, salt, hash: hash(password, salt) };
    saveAccounts();
    log('registered', name);
  } else if (hash(password, acc.salt) !== acc.hash) {
    return null;
  }
  for (const s of sessions.values()) if (s.userId === acc.id) dropSession(s); // ANOTHER_LOGIN
  const s = { sid: crypto.randomBytes(12).toString('hex'), userId: acc.id, name: acc.name, account: acc, room: null, events: [], poll: null };
  sessions.set(s.sid, s);
  return s;
}

// Buddy list (SNAP IMPS). acc.friends maps a lowercased name to 'to' (we asked), 'from' (they asked)
// or 'both'. The client turns 302 rows and 307 presence events into its friend list (FriendListCache).
const accountOf = name => accounts[String(name).toLowerCase()];
const online = acc => [...sessions.values()].find(o => o.account === acc);
function setLink(a, b, v) { (a.friends ??= {})[b.name.toLowerCase()] = v; if (v === undefined) delete a.friends[b.name.toLowerCase()]; }
function presenceTo(target, s, avail) {
  pushEvent(target, `307|${s.userId}|${s.name}|${avail}|42713|${s.userId}|${LOBBY.id}||0|0|0|0|${b64(s.presence || ' ')}`);
}
function announce(s, avail) {
  for (const [name, v] of Object.entries(s.account.friends || {})) {
    const o = v === 'both' && online(accountOf(name));
    if (o) presenceTo(o, s, avail);
  }
}

function dropSession(s) {
  announce(s, 'unavailable');
  leaveRoom(s);
  flushPoll(s);
  sessions.delete(s.sid);
  gameServer.onLogout?.(s, api);
}

function pushEvent(s, line) {
  s.events.push(line);
  if (s.poll) flushPoll(s);
}

function flushPoll(s) {
  if (!s.poll) return;
  clearTimeout(s.poll.timer);
  s.poll.send(ok(s.events.splice(0)));
  s.poll = null;
}

function leaveRoom(s) {
  const room = s.room;
  if (!room) return;
  room.members.delete(s);
  s.room = null;
  if (!room.permanent) for (const m of room.members) pushEvent(m, `107|${s.userId}|${s.userId}`);
  if (room.members.size === 0 && !room.permanent) rooms.delete(room.id);
  gameServer.onLeave?.(s, room, api);
}

function joinRoom(s, room) {
  if (s.room === room) return;
  leaveRoom(s);
  if (!room.permanent) for (const m of room.members) pushEvent(m, `103|${s.userId}|${s.userId}|${s.name}`);
  room.members.add(s);
  s.room = room;
}

// What casino.js uses to talk back to clients.
const api = {
  sessions, rooms, log, accounts, saveAccounts,
  createRoom(name, max) {
    const room = { id: String(nextRoomId++), name, max, members: new Set() };
    rooms.set(room.id, room);
    return room;
  },
  // Event 117 GAME_PACKET_TARGET is the only game-data event the client reads.
  send(s, data, from = '0') { pushEvent(s, `117|${from}|${data.toString('base64')}`); },
};

function handle(req, s, send) {
  const p = req.params;
  switch (req.cmd) {
    case 0: return send(ok());
    case 1: { // extendedLogin: P1 user, P2 password (scrambled), P5 game class
      const user = String(p[1] || '');
      if (!/^[A-Za-z0-9_]{1,15}$/.test(user)) return send(err(965, 'AuthenticationFailed'));
      const ns = login(user, String(p[2] || ''));
      if (!ns) return send(err(966, 'InvalidPassword'));
      log(`login ${user} (gameclass ${p[5]})`);
      announce(ns, 'available'); // the native client never calls setPresence itself
      return send(ok([[ns.sid, ns.sid, ns.sid, ns.userId]]));
    }
    case 98: return send(ok([[Math.floor(Date.now() / 1000)]]));
    case 99: return send(ok([[p[2] || '']]));
  }
  if (!s) return send(err(702, 'InvalidSession'));
  switch (req.cmd) {
    case 2: case 104: dropSession(s); return send(ok());
    case 3: case 311: case 130: { // retrieveAllEvents: long poll
      if (s.poll) flushPoll(s);
      s.poll = { send, timer: setTimeout(() => flushPoll(s), s.events.length ? 0 : POLL_HOLD_MS) };
      if (s.events.length) flushPoll(s);
      return;
    }
    case 126: return send(ok([[LOBBY.id, LOBBY.name, sessions.size, rooms.size]]));
    case 109: case 110: case 123: return send(ok());
    case 125: // getGameRooms
      return send(ok([...rooms.values()].map(r => [r.id, r.name, r.members.size, r.members.size, r.max, 0])));
    case 116: { // createGameRoom: P1 name, P3 max users
      const room = api.createRoom(String(p[1]), Number(p[3]) || 4);
      joinRoom(s, room);
      log(`${s.name} created room ${room.id} "${room.name}"`);
      gameServer.onJoin?.(s, room, api);
      return send(ok([[room.id]]));
    }
    case 117: { // joinGameRoom: P1 room id
      const room = rooms.get(String(p[1]));
      if (!room) return send(err(706, 'GameRoomNotFound'));
      if (room.members.size >= room.max && !room.members.has(s)) return send(err(707, 'GameRoomFull'));
      joinRoom(s, room);
      log(`${s.name} joined room ${room.id} "${room.name}"`);
      gameServer.onJoin?.(s, room, api);
      return send(ok());
    }
    case 118: leaveRoom(s); return send(ok());
    case 127: case 128: { // users in game room / lobby
      const list = req.cmd === 127 ? [...(rooms.get(String(p[1]))?.members || [])] : [...sessions.values()];
      return send(ok(list.map(m => [m.userId, m.name, ''])));
    }
    case 129: { // findUsers
      const q = String(p[1] || '').toLowerCase();
      const found = Object.values(accounts).filter(a => a.name.toLowerCase().startsWith(q)).slice(0, Number(p[2]) || 10);
      return send(ok(found.map(a => [a.id, a.name, LOBBY.id, '', ''])));
    }
    case 132: // sendGamePacket: relay to the room as event 116
      for (const m of s.room?.members || []) if (m !== s) pushEvent(m, `116|${s.userId}|${p[1].toString('base64')}`);
      return send(ok());
    case 133: // sendGamePacketToGameServer
      gameServer.onPacket(s, p[1] || Buffer.alloc(0), api);
      return send(ok());
    case 302: { // getBuddyList: rows id|name|status, then presence for friends online
      const rows = Object.entries(s.account.friends || {}).map(([name, v]) => {
        const acc = accountOf(name);
        return [acc.id, acc.name, v];
      });
      send(ok(rows));
      // The native friend list handler (FUN_10096b70) recreates every friend as offline, so
      // presence sent together with the list is lost.
      setTimeout(() => {
        for (const [name, v] of Object.entries(s.account.friends || {})) {
          const o = v === 'both' && online(accountOf(name));
          if (o && sessions.has(s.sid)) presenceTo(s, o, 'available');
        }
      }, 1000);
      return;
    }
    case 305: // setPresence: P1 availability, P2 "SM2.0.1,<presence>"
      s.presence = String(p[2] || '').replace(/^SM2.0.1,/, '');
      announce(s, 'available');
      return send(ok());
    case 306: { // requestBuddy: P1 name, P2 message
      const acc = accountOf(p[1]);
      if (!acc || acc === s.account) return send(ok()); // an error code would log the client out (processServerError)
      const mine = s.account.friends?.[acc.name.toLowerCase()];
      if (mine === 'from') return handle({ ...req, cmd: 307 }, s, send); // they already asked: accept
      if (!mine) { setLink(s.account, acc, 'to'); setLink(acc, s.account, 'from'); saveAccounts(); }
      const o = online(acc);
      if (o) pushEvent(o, `308|${s.userId}|${s.name}|${b64(String(p[2] || ' '))}`);
      return send(ok());
    }
    case 307: case 308: { // accept / decline a request: P1 name
      const acc = accountOf(p[1]);
      if (!acc || s.account.friends?.[acc.name.toLowerCase()] !== 'from') return send(ok());
      const accept = req.cmd === 307;
      setLink(s.account, acc, accept ? 'both' : undefined); setLink(acc, s.account, accept ? 'both' : undefined);
      saveAccounts();
      const o = online(acc);
      if (o) {
        pushEvent(o, `309|${s.userId}|${s.name}|${accept ? 1 : 0}|${b64(' ')}`);
        if (accept) { presenceTo(o, s, 'available'); presenceTo(s, o, 'available'); }
      }
      return send(ok());
    }
    case 309: { // removeBuddy: P1 name
      const acc = accountOf(p[1]);
      if (acc) {
        setLink(s.account, acc, undefined); setLink(acc, s.account, undefined); saveAccounts();
        const o = online(acc);
        if (o) pushEvent(o, `311|${s.userId}|${s.name}`);
      }
      return send(ok());
    }
  }
  log(`unhandled C=${req.cmd}`, JSON.stringify(req.params));
  return send(ok());
}

net.createServer(sock => {
  const addr = `${sock.remoteAddress}:${sock.remotePort}`;
  log('connect', addr);
  let buf = Buffer.alloc(0);
  sock.on('data', chunk => {
    let frames;
    try { [frames, buf] = readFrames(Buffer.concat([buf, chunk])); } catch (e) { log(addr, e.message); return sock.destroy(); }
    for (const f of frames) {
      if (f.type === FRAME.HELLO) { sock.write(frame(FRAME.HELLO_ACK, f.seq)); continue; }
      if (f.type === FRAME.STAT) { sock.write(frame(FRAME.STAT_ACK, f.seq)); continue; }
      if (f.type !== FRAME.REQUEST) { log(addr, 'frame type', f.type); continue; }
      const req = parseRequest(f.payload.toString('utf8'));
      const s = sessions.get(req.session);
      const cacheKey = `${req.session || addr}:${req.rid}`;
      if (replies.has(cacheKey)) { sock.write(frame(FRAME.RESPONSE, f.seq, replies.get(cacheKey))); continue; }
      if (req.cmd !== 3) log(`<- ${s?.name || addr} C=${req.cmd}`, req.cmd === 1 ? `user=${req.params[1]}` : '');
      handle(req, s, body => {
        const payload = Buffer.from(body, 'utf8');
        replies.set(cacheKey, payload);
        if (replies.size > 5000) replies.delete(replies.keys().next().value);
        if (!sock.destroyed) sock.write(frame(FRAME.RESPONSE, f.seq, payload));
      });
    }
  });
  sock.on('error', e => log(addr, e.message));
  sock.on('close', () => log('disconnect', addr));
}).listen(PORT, () => log(`SNAP gateway on tcp/${PORT}`));
gameServer.start?.(api);

// ---- browser client: serves web/ and the player's own copy of the game files ----
const http = require('http');
const HTTP_PORT = Number(process.env.HTTP_PORT || 8080);
const WEB_DIR = path.join(__dirname, '..', 'web');
const GAME_DIR = process.env.RG_GAME_DIR || path.join(__dirname, '..', 'tmp', 'ResetGeneration-Standalone', 'ResetGeneration');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json' };

http.createServer((req, res) => {
  const url = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let file;
  if (url === '/') file = path.join(WEB_DIR, 'index.html');
  else if (/^\/game\/[\w.-]+$/.test(url)) file = path.join(GAME_DIR, url.slice(6));
  else if (/^\/(emu\/)?[\w-]+\.(js|html)$/.test(url)) file = path.join(WEB_DIR, url);
  if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
  fs.createReadStream(file).pipe(res);
}).listen(HTTP_PORT, () => log(`browser client on http://localhost:${HTTP_PORT}/`));
