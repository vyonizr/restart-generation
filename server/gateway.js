// Replacement for resetgeneration-gw.arena.n-gage.com (SNAP Mobile gateway).
// Start: node server/gateway.js [--lan | --public]   Client: start.bat with -gw 127.0.0.1
// Without --lan or --public, both ports accept connections from this PC only.
const net = require('net');
const os = require('os');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { FRAME, readFrames, frame, parseRequest, ok, err, b64 } = require('./snap');
const { CMD, EVENT, REPLY, GAME_CLASS, PRESENCE_PREFIX, VALID_NAME, ROOM_MAX_USERS } = require('../web/snap-ids.js');
const { PORT, HTTP_PORT } = require('./ports');
const gameServer = require('./casino');
const bots = require('./bots');
const store = require('./store');
const { modeFrom, dataFiles, createAuth } = require('./auth');
const { createAdmin } = require('./admin');
const replays = require('./replays');
const { replayPage } = require('./replaypage');
const { versionOf } = require('./version');

// The version this server runs (CONTEXT.md "Version", ADR 0019, ADR 0027), as SemVer: RG_VERSION, which the Docker build sets, else
// what git says of this clone (a release tag, or the commits past one: a clone of development has the tags that tools/publish.mjs
// copies), else dev. Without a release to count from, it stays what git said, and the Notices dialog shows none.
const VERSION = versionOf(process.env.RG_VERSION || (() => {
  try {
    return require('child_process').execFileSync('git', ['describe', '--tags', '--always'], { cwd: path.join(__dirname, '..'), encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch { return ''; }
})() || 'dev');

let MODE;
try { MODE = modeFrom(process.argv, process.env); } catch (e) { console.error(e.message); process.exit(1); }
const HOST = MODE.listenAll ? undefined : '127.0.0.1';
const POLL_HOLD_MS = 15000; // client gives up on long requests after ~40 s
// A session with no request for this long is logged out (closed browser, killed client). Must exceed
// POLL_HOLD_MS and the Java client's 40 s resend timeout.
const IDLE_MS = 45000;
const DATA_DIR = path.join(__dirname, '..', 'data');


const log = (...a) => console.log(new Date().toISOString().slice(11, 23), ...a);

// Accounts (ADR 0010): accounts-names.db for name-only servers, accounts.db for Discord ones, in data/dev/ with --dev (docs/adr/0023).
// RG_DB overrides the file; tests use ':memory:'.
const FILES = dataFiles(MODE, DATA_DIR);
fs.mkdirSync(FILES.dir, { recursive: true });
const db = store.open(process.env.RG_DB || FILES.accounts);
// Replays (CONTEXT.md), kept for 30 days in a file beside the accounts they name (dataFiles). RG_REPLAYS=0 keeps no new ones and
// serves none; the file stays open so an account deleted meanwhile still takes its replays with it. RG_REPLAYS_DB overrides the
// file, as RG_DB does for tests.
const REPLAYS = process.env.RG_REPLAYS !== '0';
const replayStore = replays.open(process.env.RG_REPLAYS_DB || (process.env.RG_DB === ':memory:' ? ':memory:' : FILES.replays));

const LOBBY = { id: '1', name: 'resgen' };
const sessions = new Map(); // sid -> session
const rooms = new Map();    // roomId -> { id, name, max, members: Set<session>, permanent }
let nextRoomId = 1;
// The native client joins this room after login and talks to the game server through it.
rooms.set('0', { id: '0', name: 'CasinoSystem', max: 100000, members: new Set(), permanent: true });
const replies = new Map();  // "<S>:<R>", or "<addr>:<request>" without a session -> cached response, for client retransmits

const authConfig = MODE.config;
const busy = id => [...sessions.values()].some(s => s.userId === id);
const remove = acc => { for (const s of [...sessions.values()]) if (s.userId === acc.id) dropSession(s); };
const dropReplays = acc => replayStore.removeAccount(acc.id);
const auth = createAuth({ store: db, config: authConfig, log, busy, remove, dropReplays, replaysOf: acc => (REPLAYS ? replayStore.ofAccount(acc.id, Date.now()) : []), moveReplays: (from, to) => replayStore.moveAccount(from.id, to.id) });
const admin = createAdmin({ store: db, token: process.env.RG_ADMIN_TOKEN || '', discord: auth.enabled, busy, remove, dropReplays, log });

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
  pushEvent(target, `${EVENT.FRIEND_PRESENCE}|${s.userId}|${s.name}|${avail}|${GAME_CLASS}|${s.userId}|${LOBBY.id}||0|0|0|0|${b64(s.presence || ' ')}`);
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
  replays: REPLAYS ? replayStore : null,
  createRoom(name, max) {
    const room = { id: String(nextRoomId++), name, max, members: new Set() };
    rooms.set(room.id, room);
    return room;
  },
  // The only game-data event the client reads.
  send(s, data, from = '0') { pushEvent(s, `${EVENT.GAME_PACKET_TARGET}|${from}|${data.toString('base64')}`); },
  // Tells a browser that its battle's replay is kept, under this id (web/snap.js).
  replaySaved(s, id) { if (sessions.get(s.sid) === s) pushEvent(s, `${EVENT.REPLAY_SAVED}|${id}`); },
};

function handle(req, s, send) {
  const p = req.params;
  switch (req.cmd) {
    case CMD.INIT: return send(ok());
    case CMD.EXTENDED_LOGIN: { // P1 user, P2 password (scrambled), P5 game class
      const user = String(p[1] || '');
      if (!VALID_NAME.test(user)) return send(err(REPLY.AUTHENTICATION_FAILED, 'AuthenticationFailed'));
      const password = String(p[2] || '');
      if (/^CPU_\d+$/i.test(user) && !bots.account(user, password)) return send(err(REPLY.AUTHENTICATION_FAILED, 'AuthenticationFailed')); // CPU_n is a bot's name
      const ns = login(user, password);
      if (!ns) return send(err(REPLY.AUTHENTICATION_FAILED, 'AuthenticationFailed'));
      log(`login ${user} (gameclass ${p[5]})`);
      announce(ns, 'available'); // the native client never calls setPresence itself
      return send(ok([[ns.sid, ns.sid, ns.sid, ns.userId]]));
    }
    case 98: return send(ok([[Math.floor(Date.now() / 1000)]]));
    case 99: return send(ok([[p[2] || '']]));
  }
  if (!s) return send(err(REPLY.INVALID_SESSION, 'InvalidSession'));
  switch (req.cmd) {
    case CMD.UNIFIED_LOGOUT: case 104: dropSession(s); return send(ok());
    case CMD.FILL_BOTS: // this server's own: P1 1 (CPU) or 2 (Expert) fills the empty seats of friendly room P2 with bots, when this player starts it
      s.fillBots = ['1', '2'].includes(String(p[1])) ? Number(p[2]) : 0;
      s.botLevel = String(p[1]) === '2' ? 'expert' : 'cpu';
      return send(ok());
    case CMD.BOT_CHOICE: // this server's own: what Start in friendly room P1 does about bots: ask, level, go or gone (casino.botQuestion)
      return send(ok([[gameServer.botQuestion(Number(p[1]))]]));
    case CMD.RETRIEVE_ALL_EVENTS: case 311: case 130: { // long poll
      // A resent copy of the held poll (same R) takes it over, so its events go to the newest copy; nothing is answered or
      // cached for the old one, whose connection is probably gone.
      if (s.poll?.rid === req.rid) { s.poll.send = send; return; }
      if (s.poll) flushPoll(s);
      s.poll = { send, rid: req.rid, timer: setTimeout(() => flushPoll(s), s.events.length ? 0 : POLL_HOLD_MS) };
      if (s.events.length) flushPoll(s);
      return;
    }
    case CMD.GET_LOBBIES: return send(ok([[LOBBY.id, LOBBY.name, sessions.size, rooms.size]]));
    case CMD.JOIN_LOBBY: case 110: case 123: return send(ok());
    case CMD.GET_GAME_ROOMS:
      return send(ok([...rooms.values()].map(r => [r.id, r.name, r.members.size, r.members.size, r.max, 0])));
    case CMD.CREATE_GAME_ROOM: { // P1 name, P3 max users
      const room = api.createRoom(String(p[1]), Number(p[3]) || ROOM_MAX_USERS);
      joinRoom(s, room);
      log(`${s.name} created room ${room.id} "${room.name}"`);
      gameServer.onJoin?.(s, room, api);
      return send(ok([[room.id]]));
    }
    case CMD.JOIN_GAME_ROOM: { // P1 room id
      const room = rooms.get(String(p[1]));
      if (!room) return send(err(REPLY.GAME_ROOM_NOT_FOUND, 'GameRoomNotFound'));
      if (room.members.size >= room.max && !room.members.has(s)) return send(err(REPLY.GAME_ROOM_FULL, 'GameRoomFull'));
      joinRoom(s, room);
      log(`${s.name} joined room ${room.id} "${room.name}"`);
      gameServer.onJoin?.(s, room, api);
      return send(ok());
    }
    case CMD.LEAVE_GAME_ROOM: leaveRoom(s); return send(ok());
    case CMD.USERS_IN_GAME_ROOM: case CMD.USERS_IN_LOBBY: {
      const list = req.cmd === CMD.USERS_IN_GAME_ROOM ? [...(rooms.get(String(p[1]))?.members || [])] : [...sessions.values()];
      return send(ok(list.map(m => [m.userId, m.name, ''])));
    }
    case CMD.FIND_USERS: {
      const found = db.findByPrefix(String(p[1] || ''), Number(p[2]) || 10);
      return send(ok(found.map(a => [a.id, a.name, LOBBY.id, '', ''])));
    }
    case CMD.SEND_GAME_PACKET: // relay to the room as event 116
      for (const m of s.room?.members || []) if (m !== s) pushEvent(m, `116|${s.userId}|${p[1].toString('base64')}`);
      return send(ok());
    case CMD.SEND_GAME_PACKET_TO_GAME_SERVER:
      gameServer.onPacket(s, p[1] || Buffer.alloc(0), api);
      return send(ok());
    case CMD.GET_BUDDY_LIST: { // rows id|name|status, then presence for friends online
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
    case CMD.SET_PRESENCE: { // P1 availability, P2 "SM2.0.1,<presence>"
      const presence = String(p[2] || '');
      s.presence = presence.startsWith(PRESENCE_PREFIX) ? presence.slice(PRESENCE_PREFIX.length) : presence;
      announce(s, 'available');
      return send(ok());
    }
    case CMD.REQUEST_BUDDY: { // P1 name, P2 message
      const acc = accountOf(p[1]);
      if (!acc || acc === s.account) return send(ok()); // an error code would log the client out (processServerError)
      const mine = db.linkState(s.account, acc);
      if (mine === 'from') return handle({ ...req, cmd: CMD.ACCEPT_BUDDY }, s, send); // they already asked: accept
      if (!mine) db.setLinks(s.account, acc, 'to', 'from');
      const o = online(acc);
      if (o) pushEvent(o, `${EVENT.FRIEND_REQUEST_RECEIVED}|${s.userId}|${s.name}|${b64(String(p[2] || ' '))}`);
      return send(ok());
    }
    case CMD.ACCEPT_BUDDY: case CMD.DECLINE_BUDDY: { // P1 name
      const acc = accountOf(p[1]);
      if (!acc || db.linkState(s.account, acc) !== 'from') return send(ok());
      const accept = req.cmd === CMD.ACCEPT_BUDDY;
      db.setLinks(s.account, acc, accept ? 'both' : null, accept ? 'both' : null);
      const o = online(acc);
      if (o) {
        pushEvent(o, `${EVENT.FRIEND_REQUEST_ANSWERED}|${s.userId}|${s.name}|${accept ? 1 : 0}|${b64(' ')}`);
        if (accept) { presenceTo(o, s, 'available'); presenceTo(s, o, 'available'); }
      }
      return send(ok());
    }
    case CMD.REMOVE_BUDDY: { // P1 name
      const acc = accountOf(p[1]);
      if (acc) {
        db.setLinks(s.account, acc, null, null);
        const o = online(acc);
        if (o) pushEvent(o, `${EVENT.FRIEND_REMOVED}|${s.userId}|${s.name}`);
      }
      return send(ok());
    }
  }
  log(`unhandled C=${req.cmd}`, JSON.stringify(req.params));
  return send(ok());
}

// One SNAP request (TCP frame payload or HTTP body) -> reply(Buffer). Retransmits get the cached reply.
// A request without a session (INIT, login) is keyed by its whole text, not by R: behind a proxy every browser has the proxy's
// address, and two players whose R matched would otherwise get one login reply, session included.
// `web` marks a request that came over HTTP: its session is a browser's, which reads events the Java client doesn't know.
function processRequest(text, addr, reply, web = false) {
  const req = parseRequest(text);
  const s = sessions.get(req.session);
  if (s) { s.lastSeen = Date.now(); if (web) s.web = true; }
  const cacheKey = req.session ? `${req.session}:${req.rid}` : `${addr}:${text}`;
  if (replies.has(cacheKey)) return reply(replies.get(cacheKey));
  if (req.cmd !== CMD.RETRIEVE_ALL_EVENTS) log(`<- ${s?.name || '(no session)'} C=${req.cmd}`, req.cmd === CMD.EXTENDED_LOGIN ? `user=${req.params[1]}` : '');
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

module.exports = { staleSessions, lanAddresses, handle, processRequest, db };
if (require.main !== module) return; // tests import the module without starting the servers

// A public server publishes Terms and a Privacy policy that name who runs it, who stores its data for them, and where players and
// rights holders write (docs/adr/0021, docs/LEGAL.md), so it won't start without all three. Any other server doesn't need them.
const SEND_GAME = process.env.RG_SEND_GAME === '1';
const missing = MODE.public ? [['RG_ADMIN_NAME', authConfig.adminName], ['RG_HOSTING', authConfig.hosting], ['RG_CONTACT', authConfig.contact]].filter(([, v]) => !v).map(([k]) => k) : [];
if (missing.length) {
  console.error(`Refusing to start a --public server without ${missing.join(', ')}: its Terms and Privacy policy name the admin (RG_ADMIN_NAME), the hosting provider that stores its data (RG_HOSTING), and an email address or an https address where players and rights holders can write (RG_CONTACT). See docs/HOSTING.md`);
  process.exitCode = 1; return;
}

// Online battles are hosted from captured templates (ADR 0006). A public server without one would let players queue for matches
// that never start, so it refuses to start. Any other server only warns: the page and single-player play don't need templates.
const seatCounts = require('./battle').seatCounts();
if (!seatCounts.size) {
  const why = 'no usable battle template in data/templates or data/battle-templates.zip, so no online battle can start (docs/HOSTING.md: "Battle templates")';
  if (MODE.public) { console.error(`Refusing to start a --public server: ${why}`); process.exitCode = 1; return; }
  log(`Warning: ${why}`);
} else {
  for (const n of [2, 3, 4]) if (!seatCounts.has(n)) log(`No battle template for ${n} players: ${n}-player matches won't start${n === 4 ? ", and CPU players can't fill empty seats" : ''}`);
}

// The server copy runs the witness, which decides every battle's result (docs/adr/0020), on a public server too.
if (process.env.RG_GAME) require('./witness').start(log);
else log('Warning: no server copy (RG_GAME), so battle results will be guessed: the last player standing, or else the one who made the last move');
if (SEND_GAME && !process.env.RG_GAME) log('Warning: RG_SEND_GAME=1 without RG_GAME: there is no server copy, so visitors choose their own files');

// The Java client's TCP connections. The log names each by a number, never by its address: the Privacy policy says the server
// writes no IP address to its logs (docs/adr/0021). The address only keys the reply cache, in memory.
let connections = 0;
net.createServer(sock => {
  const addr = `${sock.remoteAddress}:${sock.remotePort}`, id = `tcp#${++connections}`;
  log('connect', id);
  let buf = Buffer.alloc(0);
  sock.on('data', chunk => {
    let frames;
    try { [frames, buf] = readFrames(Buffer.concat([buf, chunk])); } catch (e) { log(id, e.message); return sock.destroy(); }
    for (const f of frames) {
      if (f.type === FRAME.HELLO) { sock.write(frame(FRAME.HELLO_ACK, f.seq)); continue; }
      if (f.type === FRAME.STAT) { sock.write(frame(FRAME.STAT_ACK, f.seq)); continue; }
      if (f.type !== FRAME.REQUEST) { log(id, 'frame type', f.type); continue; }
      processRequest(f.payload.toString('utf8'), addr, payload => { if (!sock.destroyed) sock.write(frame(FRAME.RESPONSE, f.seq, payload)); });
    }
  });
  sock.on('error', e => log(id, e.message));
  sock.on('close', () => log('disconnect', id));
}).listen(PORT, HOST, () => log(`SNAP gateway on tcp/${PORT}`));
gameServer.start?.(api);
setInterval(() => {
  for (const s of staleSessions(sessions, Date.now(), IDLE_MS)) { log(`idle timeout ${s.name}`); dropSession(s); }
}, 5000);
if (auth.enabled) { auth.sweep(); setInterval(auth.sweep, 60000); }
// Replays older than 30 days are never served (server/replays.js); this deletes them from the file too.
const sweepReplays = () => { const n = replayStore.sweep(Date.now()); if (n) log(`deleted ${n} replay${n > 1 ? 's' : ''} older than 30 days`); };
sweepReplays(); setInterval(sweepReplays, 3600000);

// ---- browser client: serves the built page (web/dist) and, if the admin chose to, the server copy of the game ----
const http = require('http');
const WEB_DIR = path.join(__dirname, '..', 'web');
// The built page (npm run build, ADR 0013): index.html, assets/ with hashed names, and the files Vite copies as they are.
const DIST_DIR = path.join(WEB_DIR, 'dist');
// RG_GAME, the server copy: the ResetGeneration folder or the standalone .zip. It's sent to visitors only with RG_SEND_GAME=1
// (servesGame); otherwise the page asks players for their own files.
let gameFiles = null;
if (process.env.RG_GAME) import('../web/tools/game.mjs').then(m => m.loadGame()).then(f => {
  require('./aiprofiles').apply(f); // a bot-ai.json key the game's XML doesn't have stops the server here
  if (SEND_GAME) gameFiles = f;
  log(`server copy from ${process.env.RG_GAME}${SEND_GAME ? ', sent to visitors (RG_SEND_GAME=1)' : ''}`);
}).catch(e => { log(`RG_GAME: ${e.message}`); if (/bot-ai\.json/.test(e.message)) process.exit(1); });
const servesGame = () => gameFiles !== null;
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.mp4': 'video/mp4', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.txt': 'text/plain; charset=utf-8' };

const httpServer = http.createServer((req, res) => {
  const parsed = new URL(req.url, 'http://x');
  const url = decodeURIComponent(parsed.pathname);
  if (url === '/snap' && req.method === 'POST') { // the browser's SNAP connection: one request per POST
    const chunks = [];
    req.on('data', c => chunks.push(c));
    req.on('end', () => processRequest(Buffer.concat(chunks).toString('utf8'), req.socket.remoteAddress, payload => {
      res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end(payload);
    }, true));
    return;
  }
  if (url === '/bots') { // whether the page shows the bot switch
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
    return res.end(JSON.stringify({ available: bots.available() }));
  }
  if (url === '/status') { // what the page shows before anyone logs in: the account mode and who is playing
    // The admin's name and hosting provider fill in the Terms and the Privacy policy, which only a public server publishes: the page
    // links them when `adminName` is set (docs/adr/0021).
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ version: VERSION, accounts: auth.enabled, servesGame: servesGame(), unlockAll: !MODE.public, invite: authConfig.invite, contact: authConfig.contact, adminName: MODE.public ? authConfig.adminName : '', hosting: MODE.public ? authConfig.hosting : '', online: [...sessions.values()].filter(s => !s.account.bot).length, waiting: gameServer.waiting(), replays: REPLAYS }));
  }
  if (parsed.pathname.startsWith('/admin/')) {
    admin.http(req, res, parsed);
    return;
  }
  if (url.startsWith('/auth/')) {
    auth.http(req, res, parsed).catch(e => { log(`${url}: ${e.message}`); res.destroy(); });
    return;
  }
  if (url.startsWith('/game/')) {
    const data = servesGame() && Object.hasOwn(gameFiles, url.slice(6)) && gameFiles[url.slice(6)];
    if (!data) { res.writeHead(404); return res.end('not found'); }
    // The size lets the page show its download as a percentage (web/ui/gamefiles.js).
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Length': data.length, 'Cache-Control': 'no-cache' });
    return res.end(data);
  }
  // The replays listed under a player's name, for anyone (docs/adr/0024): the name's account now, newest first. A name nobody holds
  // has none; a server that turned replays off answers 404.
  if (url === '/replays') {
    const acc = REPLAYS && db.byName(parsed.searchParams.get('name') ?? '');
    res.writeHead(REPLAYS ? 200 : 404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(REPLAYS ? { replays: acc ? replayStore.listOf(acc.id, Date.now()) : [] } : { error: 'off' }));
  }
  // A replay (CONTEXT.md): its page, with the link preview in its head, and the data the page plays. One that doesn't exist, is
  // 30 days old, or is on a server that turned replays off is gone: the page says so.
  const replay = /^\/replay\/([\w-]{1,64})(\/data)?$/.exec(url);
  if (replay) {
    const found = REPLAYS ? replayStore.get(replay[1], Date.now()) : null;
    if (replay[2]) {
      res.writeHead(found ? 200 : 404, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      return res.end(JSON.stringify(found ?? { error: 'gone' }));
    }
    const page = path.join(DIST_DIR, 'replay', 'index.html');
    if (!fs.existsSync(page)) { res.writeHead(503, { 'Content-Type': 'text/plain' }); return res.end('The page is not built yet. Run `npm run build` (after `npm install`), then reload.'); }
    res.writeHead(found ? 200 : 404, { 'Content-Type': 'text/html', 'Cache-Control': 'no-cache' });
    return res.end(replayPage(fs.readFileSync(page, 'utf8'), found?.meta ?? null));
  }
  let file;
  if (url === '/') file = path.join(DIST_DIR, 'index.html');
  else if (/^\/(?:terms|privacy)\/?$/.test(url)) file = path.join(DIST_DIR, url, 'index.html'); // the Terms and the Privacy policy (docs/adr/0021)
  else if (/^\/(?:[\w-]+\/)*[\w.-]+\.(?:js|css|html|woff2|mp4|svg|png|ico|txt)$/.test(url)) file = path.join(DIST_DIR, url);
  if (url === '/' && !fs.existsSync(file)) { res.writeHead(503, { 'Content-Type': 'text/plain' }); return res.end('The page is not built yet. Run `npm run build` (after `npm install`), then reload.'); }
  if (!file || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  // Build output under assets/ has a hash in its name, so it never changes; everything else is checked on every load.
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(file)] || 'application/octet-stream', 'Cache-Control': url.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
  fs.createReadStream(file).pipe(res);
});
// Longer than Caddy's 2-minute upstream keepalive, so Caddy never reuses a connection this server is closing and answers a 502.
httpServer.keepAliveTimeout = 130000;
httpServer.headersTimeout = 131000;
httpServer.listen(HTTP_PORT, HOST, () => {
  log(`browser client on http://localhost:${HTTP_PORT}/`);
  if (!fs.existsSync(path.join(DIST_DIR, 'index.html'))) log('The page is not built: run `npm run build` (after `npm install`)');
  log(MODE.discord ? 'Discord sign-in is on: players are guests or members (ADR 0011)' : 'Name-only login (ADR 0009)');
  if (MODE.ignoredDiscord) log('Discord sign-in is off in --lan mode: it can only work for a public server (--public)');
  if (MODE.dev) log(`Development server: accounts and replays in data/dev/, with the seed accounts of \`npm run seed\` (docs/adr/0023)`);
  // A public server never runs Bots, whether or not it serves a copy of the game. Without a SNAP address bots.available() is
  // false, so the page never asks and no engine is started.
  if (MODE.public) log('Bots are off on a --public server (ADR 0008)');
  else bots.configure(`http://127.0.0.1:${HTTP_PORT}/snap`);
  if (HOST) return;
  // Players reach a public server at its public address; the LAN addresses and the LAN firewall hint are for --lan.
  if (MODE.public) { if (authConfig.publicUrl) log(`browser client on ${authConfig.publicUrl}/`); return; }
  for (const [name, address] of lanAddresses(os.networkInterfaces())) log(`browser client on http://${address}:${HTTP_PORT}/ (${name})`);
  log(`Other devices can't connect? See "Play on other devices" in README.md.`);
});
