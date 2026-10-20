// Replacement for resetgeneration-gw.arena.n-gage.com (SNAP Mobile gateway).
// Start: node server/gateway.js [--lan | --public]   Client: start.bat with -gw 127.0.0.1
// Without --lan or --public, both ports accept connections from this PC only.
const net = require('net');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { FRAME, readFrames, frame, parseRequest, ok, err, b64 } = require('./snap');
const gameServer = require('./casino');
const bots = require('./bots');
const store = require('./store');
const { modeFrom, createAuth } = require('./auth');

const PORT = Number(process.env.PORT || 8976);
let MODE;
try { MODE = modeFrom(process.argv, process.env); } catch (e) { console.error(e.message); process.exit(1); }
const HOST = MODE.listenAll ? undefined : '127.0.0.1';
const POLL_HOLD_MS = 15000; // client gives up on long requests after ~40 s
// A session with no request for this long is logged out (closed browser, killed client). Must exceed
// POLL_HOLD_MS and the Java client's 40 s resend timeout.
const IDLE_MS = 45000;
const DATA_DIR = path.join(__dirname, '..', 'data');


const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);

// Accounts (ADR 0010): accounts-names.db for name-only servers, accounts.db for Discord ones. RG_DB overrides the file; tests use ':memory:'.
fs.mkdirSync(DATA_DIR, { recursive: true });
const db = store.open(process.env.RG_DB || path.join(DATA_DIR, MODE.db));

const LOBBY = { id: '1', name: 'resgen' };
const sessions = new Map(); // sid -> session
const rooms = new Map();    // roomId -> { id, name, max, members: Set<session>, permanent }
let nextRoomId = 1;
// The native client joins this room after login and talks to the game server through it.
rooms.set('0', { id: '0', name: 'CasinoSystem', max: 100000, members: new Set(), permanent: true });
const replies = new Map();  // "<S|addr>:<R>" -> cached response, for client retransmits

const authConfig = MODE.config;
const auth = createAuth({
  store: db, config: authConfig, fameLevel: gameServer.fameLevel, log,
  busy: id => [...sessions.values()].some(s => s.userId === id),
  remove: acc => { for (const s of [...sessions.values()]) if (s.userId === acc.id) dropSession(s); },
});

// Without Discord a name is the whole identity: no password. Anyone can log in as any name, and that drops the name's other
// session (ADR 0009). With Discord, the password slot carries the guest's or member's token (ADR 0011).
// Returns null when the login is refused.
function login(name, password) {
  let acc = bots.account(name, password); // a bot's account is never saved
  if (!acc && auth.enabled) acc = auth.login(name, password);
  else if (!acc) { // First login registers the name, as the original web sign-up page did.
    acc = db.byName(name);
    if (!acc) { acc = db.create(name, 'named', Date.now()); log('registered', name); }
  }
  if (!acc) return null;
  db.touch(acc, Date.now());
  for (const s of sessions.values()) if (s.userId === acc.id) dropSession(s); // ANOTHER_LOGIN
  const s = { sid: crypto.randomBytes(12).toString('hex'), userId: acc.id, name: acc.name, account: acc, room: null, events: [], poll: null, lastSeen: Date.now() };
  sessions.set(s.sid, s);
  return s;
}

// Buddy list (SNAP IMPS). A link says what one account sees of another: 'to' (it asked), 'from' (it was asked)
// or 'both'. The client turns 302 rows and 307 presence events into its friend list (FriendListCache).
const accountOf = name => db.byName(String(name));
const online = acc => [...sessions.values()].find(o => o.account === acc);
function presenceTo(target, s, avail) {
  pushEvent(target, `307|${s.userId}|${s.name}|${avail}|42713|${s.userId}|${LOBBY.id}||0|0|0|0|${b64(s.presence || ' ')}`);
}
function announce(s, avail) {
  for (const { account, state } of db.friends(s.account)) {
    const o = state === 'both' && online(account);
    if (o) presenceTo(o, s, avail);
  }
}

function dropSession(s) {
  announce(s, 'unavailable');
  leaveRoom(s);
  flushPoll(s);
  sessions.delete(s.sid);
  db.touch(s.account, Date.now()); // a guest's day of idling starts when its session ends
  gameServer.onLogout?.(s, api);
}

const staleSessions = (sessions, now, ms) => [...sessions.values()].filter(s => now - s.lastSeen > ms);

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
  sessions, rooms, log, save: db.save, link: db.linkState, ranking: db.ranking, rank: db.rank,
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
      const password = String(p[2] || '');
      if (/^CPU_\d+$/i.test(user) && !bots.account(user, password)) return send(err(965, 'AuthenticationFailed')); // CPU_n is a bot's name
      const ns = login(user, password);
      if (!ns) return send(err(965, 'AuthenticationFailed'));
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
    case 900: // this server's own: P1 1 (CPU) or 2 (Expert) fills the empty seats of friendly room P2 with bots, when this player starts it
      s.fillBots = ['1', '2'].includes(String(p[1])) ? Number(p[2]) : 0;
      s.botLevel = String(p[1]) === '2' ? 'expert' : 'cpu';
      return send(ok());
    case 901: // this server's own: what Start in friendly room P1 does about bots: ask, level, go or gone (casino.botQuestion)
      return send(ok([[gameServer.botQuestion(Number(p[1]))]]));
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
      const found = db.findByPrefix(String(p[1] || ''), Number(p[2]) || 10);
      return send(ok(found.map(a => [a.id, a.name, LOBBY.id, '', ''])));
    }
    case 132: // sendGamePacket: relay to the room as event 116
      for (const m of s.room?.members || []) if (m !== s) pushEvent(m, `116|${s.userId}|${p[1].toString('base64')}`);
      return send(ok());
    case 133: // sendGamePacketToGameServer
      gameServer.onPacket(s, p[1] || Buffer.alloc(0), api);
      return send(ok());
    case 302: { // getBuddyList: rows id|name|status, then presence for friends online
      const friends = db.friends(s.account);
      send(ok(friends.map(({ account, state }) => [account.id, account.name, state])));
      // The native friend list handler (FUN_10096b70) recreates every friend as offline, so
      // presence sent together with the list is lost.
      setTimeout(() => {
        for (const { account, state } of friends) {
          const o = state === 'both' && online(account);
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
      const mine = db.linkState(s.account, acc);
      if (mine === 'from') return handle({ ...req, cmd: 307 }, s, send); // they already asked: accept
      if (!mine) db.setLinks(s.account, acc, 'to', 'from');
      const o = online(acc);
      if (o) pushEvent(o, `308|${s.userId}|${s.name}|${b64(String(p[2] || ' '))}`);
      return send(ok());
    }
    case 307: case 308: { // accept / decline a request: P1 name
      const acc = accountOf(p[1]);
      if (!acc || db.linkState(s.account, acc) !== 'from') return send(ok());
      const accept = req.cmd === 307;
      db.setLinks(s.account, acc, accept ? 'both' : null, accept ? 'both' : null);
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
        db.setLinks(s.account, acc, null, null);
        const o = online(acc);
        if (o) pushEvent(o, `311|${s.userId}|${s.name}`);
      }
      return send(ok());
    }
  }
  log(`unhandled C=${req.cmd}`, JSON.stringify(req.params));
  return send(ok());
}

// One SNAP request (TCP frame payload or HTTP body) -> reply(Buffer). Retransmits get the cached reply.
function processRequest(text, addr, reply) {
  const req = parseRequest(text);
  const s = sessions.get(req.session);
  if (s) s.lastSeen = Date.now();
  const cacheKey = `${req.session || addr}:${req.rid}`;
  if (replies.has(cacheKey)) return reply(replies.get(cacheKey));
  if (req.cmd !== 3) log(`<- ${s?.name || addr} C=${req.cmd}`, req.cmd === 1 ? `user=${req.params[1]}` : '');
  handle(req, s, body => {
    const payload = Buffer.from(body, 'utf8');
    replies.set(cacheKey, payload);
    if (replies.size > 5000) replies.delete(replies.keys().next().value);
    reply(payload);
  });
}

// [name, address] for each network address other devices can reach, from os.networkInterfaces().
const lanAddresses = interfaces => Object.entries(interfaces).flatMap(([name, list]) =>
  list.filter(a => a.family === 'IPv4' && !a.internal).map(a => [name, a.address]));

module.exports = { staleSessions, lanAddresses, handle, db };
if (require.main !== module) return; // tests import the module without starting the servers

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
      processRequest(f.payload.toString('utf8'), addr, payload => { if (!sock.destroyed) sock.write(frame(FRAME.RESPONSE, f.seq, payload)); });
    }
  });
  sock.on('error', e => log(addr, e.message));
  sock.on('close', () => log('disconnect', addr));
}).listen(PORT, HOST, () => log(`SNAP gateway on tcp/${PORT}`));
gameServer.start?.(api);
setInterval(() => {
  for (const s of staleSessions(sessions, Date.now(), IDLE_MS)) { log(`idle timeout ${s.name}`); dropSession(s); }
}, 5000);
if (auth.enabled) { auth.sweep(); setInterval(auth.sweep, 60000); }

// ---- browser client: serves web/ and the player's own copy of the game files ----
const http = require('http');
const HTTP_PORT = Number(process.env.HTTP_PORT || 8080);
const WEB_DIR = path.join(__dirname, '..', 'web');
// The built page (npm run build, ADR 0013): index.html, assets/ with hashed names, and the files Vite copies as they are.
const DIST_DIR = path.join(WEB_DIR, 'dist');
// RG_GAME: the ResetGeneration folder or the standalone .zip. Without it the page asks players for their own files.
let gameFiles = {};
if (process.env.RG_GAME) import('../web/tools/game.mjs').then(m => m.loadGame()).then(f => {
  require('./aiprofiles').apply(f); // a bot-ai.json key the game's XML doesn't have stops the server here
  gameFiles = f; log(`game files from ${process.env.RG_GAME}`);
}).catch(e => { log(`RG_GAME: ${e.message}`); if (/bot-ai\.json/.test(e.message)) process.exit(1); });
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  const parsed = new URL(req.url, 'http://x');
  const url = decodeURIComponent(parsed.pathname);
  if (url === '/snap' && req.method === 'POST') { // the browser's SNAP connection: one request per POST
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => processRequest(Buffer.concat(chunks).toString('utf8'), req.socket.remoteAddress, payload => {
      res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(payload);
    }));
    return;
  }
  if (url === '/bots') { // whether the page shows the bot switch
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    return res.end(JSON.stringify({ available: bots.available() }));
  }
  if (url === '/status') { // what the page shows before anyone logs in: the account mode and who is playing
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ accounts: auth.enabled, servesGame: Boolean(process.env.RG_GAME), invite: authConfig.invite, online: [...sessions.values()].filter(s => !s.account.bot).length, waiting: gameServer.waiting() }));
  }
  if (url.startsWith('/auth/')) {
    auth.http(req, res, parsed).catch(e => { log(`${url}: ${e.message}`); res.destroy(); });
    return;
  }
  if (url.startsWith('/game/')) {
    const data = Object.hasOwn(gameFiles, url.slice(6)) && gameFiles[url.slice(6)];
    if (!data) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-cache' });
    return res.end(data);
  }
  let file;
  if (url === '/') file = path.join(DIST_DIR, 'index.html');
  else if (/^\/(?:[\w-]+\/)*[\w.-]+\.(?:js|css|html|woff2|mp4|svg)$/.test(url)) file = path.join(DIST_DIR, url);
  if (url === '/' && !fs.existsSync(file)) { res.writeHead(503, { 'Content-Type': 'text/plain' }); return res.end('The page is not built yet. Run `npm run build` (after `npm install`), then reload.'); }
  if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  // Build output under assets/ has a hash in its name, so it never changes; everything else is checked on every load.
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': url.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
  fs.createReadStream(file).pipe(res);
}).listen(HTTP_PORT, HOST, () => {
  log(`browser client on http://localhost:${HTTP_PORT}/`);
  if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) log('The page is not built: run `npm run build` (after `npm install`)');
  log(MODE.discord ? 'Discord sign-in is on: players are guests or members (ADR 0011)' : 'Name-only login (ADR 0009)');
  if (MODE.ignoredDiscord) log('Discord sign-in is off in --lan mode: it can only work for a public server (--public)');
  // A public server never runs Bots, whether or not it serves a copy of the game. Without a SNAP address bots.available() is
  // false, so the page never asks and no engine is started.
  if (MODE.public) log('Bots are off on a --public server (ADR 0008)');
  else bots.configure(`http://127.0.0.1:${HTTP_PORT}/snap`);
  if (HOST) return;
  for (const [name, address] of lanAddresses(os.networkInterfaces())) log(`browser client on http://${address}:${HTTP_PORT}/ (${name})`);
  log(`Other devices can't connect? See "Play on other devices" in README.md.`);
});
