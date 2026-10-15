// Online battle host: the server's half of a match, replacing the original ServerBattleLogic
// (handshake FUN_1000d8c0, per-message v16, EndTurnRequest v29, timers v6). It does not simulate the
// battle: it hands out the Game and snapshot, relays orders, acks them, and drives turns by copying
// (turn, phase) from the clients, as described in docs/protocol.md "Battle".
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { T, frames } = require('./mt');
const gm = require('./gamemsg');
const g = require('./gameblob');

const TEMPLATES = path.join(__dirname, '..', 'data', 'templates');
const START_DEADLINE_MS = 40000;  // Mac FUN_000cd7ee
const OVERTIME_MS = 30000;        // forced EndTurn this long after the phase limit (FUN_1000ddf0)
const ORDERS = new Set([gm.TYPE.MOVE_UNIT, gm.TYPE.FIRE_CANNON, gm.TYPE.PLACE_TILE, gm.TYPE.ATTACK,
  gm.TYPE.POINT, gm.TYPE.SPECIAL_SKILL]);

const i32 = v => { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; };
const u8 = v => Buffer.from([v]);
const initBody = payload => Buffer.concat([i32(payload.length), payload]); // InitGameData FUN_100585f0
const rule = (game, map, name) => game[map].find(e => e.name === name)?.value;
// Shots per living player in phase 5 (FUN_10042240), or -1 when only a simulation could tell.
const cannonCount = game => rule(game, 'bools', 'IsNumCannonsEqualToNumPrincesses')
  ? -1 : rule(game, 'ints', 'NumberOfCannonsInCastle') ?? -1;

// Templates are rgtrace captures (tools/rgtrace): <name>.game + <name>.snap with one castle per player.
function loadTemplates() {
  if (!fs.existsSync(TEMPLATES)) return [];
  return fs.readdirSync(TEMPLATES).filter(f => f.endsWith('.game')).map(f => {
    const name = f.slice(0, -5);
    const game = g.parseGame(fs.readFileSync(path.join(TEMPLATES, f)));
    return { name, game, snap: fs.readFileSync(path.join(TEMPLATES, `${name}.snap`)), seats: game.castles.length };
  });
}

// Game for a fresh online table: no join infos yet (players arrive through the handshake), new seed.
function tableGame(t) {
  const seed = crypto.randomBytes(4).readInt32LE();
  const rng = g.seedRng(seed);
  g.rngNext(rng); // captures hold the seeded state plus one draw
  return g.writeGame({ ...t.game, randomSeed: seed, rng, playerSlots: t.seats + 1, players: [], slotHeroes: [] });
}

// ponytail: templates load once; restart the server after importing new ones.
let templates;
const seatCounts = () => new Set((templates ??= loadTemplates()).map(t => t.seats));

function createTable(seats, api) {
  const fit = (templates ??= loadTemplates()).filter(t => t.seats === seats);
  if (!fit.length) { api.log(`no battle template for ${seats} players in data/templates`); return null; }
  const t = fit[crypto.randomInt(fit.length)];
  api.log(`table uses template ${t.name}`);
  return {
    seats, template: t.name, game: tableGame(t), snap: t.snap,
    players: [],        // { s, index, team, state, lastSeq }
    history: [],        // raw reliable GameMessages, replayed to late joiners (handshake step 4)
    seq: 3, started: false, // server seq continues after the handshake messages (1-3) deadline: Date.now() + START_DEADLINE_MS,
    turn: 0, phase: 0, phaseStart: 0, done: new Set(), ended4: new Set(),
    cannons: cannonCount(t.game), fired: new Map(), // team -> FireCannon count this phase
    limits: t.game.timeLimit, losers: [], lastOrderTeam: 0, finished: false,
  };
}

function sendMsg(table, p, m, api) {
  for (const f of frames(T.GAME, gm.pack(m))) api.send(p.s, f);
}
function broadcast(table, m, api, except) {
  const raw = gm.write(m);
  if (m.reliable !== 0) table.history.push(raw);
  for (const p of table.players) if (p !== except && p.state === 'playing') sendMsg(table, p, m, api);
}
const serverMsg = (table, type, body) => ({ seq: ++table.seq, type, sender: 0, recipients: [0],
  turn: table.turn, phase: table.phase, body });
const alive = table => table.players.filter(p => p.state === 'playing' && !table.losers.includes(p));

// Handshake step 1, after the SEAT_TAKE response (lobby FUN_100ebed0 waits for this).
function seat(table, s, api) {
  if (table.players.some(p => p.s === s) || table.players.length >= table.seats) return;
  const p = { s, state: 'joining', index: 0, team: 0, lastSeq: 0 };
  table.players.push(p);
  sendMsg(table, p, { seq: 1, type: gm.TYPE.INIT, body: initBody(Buffer.concat([table.game, i32(1)])) }, api);
}

function onJoinInfo(table, p, body, api) {
  const info = g.parseJoinInfo(body.subarray(4));
  // Step 3: index and team are the lowest free values from 1 (FUN_10023f40, FUN_10024c60).
  const used = new Set(table.players.map(o => o.team));
  for (let t = 1; t <= 4; t++) if (!used.has(t)) { p.index = p.team = t; break; }
  sendMsg(table, p, { seq: 2, type: gm.TYPE.INIT, body: initBody(Buffer.concat([i32(p.index), i32(p.team)])) }, api);
  // Step 4: snapshot taken before anyone joined, then every reliable message since.
  sendMsg(table, p, { seq: 3, type: gm.TYPE.INIT,
    body: initBody(Buffer.concat([table.snap, i32(table.history.length), ...table.history])) }, api);
  p.state = 'playing';
  api.log(`${p.s.name} joined the battle as player ${p.index} (${info.hero.type})`);
  // Step 5: PlayerJoined to everyone (FUN_1000f290). Type 3 = remote player; each client turns its own
  // entry into its local player.
  const heroId = g.HERO_IDS[info.hero.type] ?? -1;
  broadcast(table, serverMsg(table, gm.TYPE.PLAYER_JOINED, Buffer.concat([
    i32(p.index), i32(p.team), u8(1),
    g.writeString(info.name), i32(heroId), i32(-1), u8(info.random), g.writeHero(info.hero), i32(3)])), api);
  maybeBegin(table, api);
}

function maybeBegin(table, api) {
  if (table.started) return;
  const joined = table.players.filter(p => p.state === 'playing');
  const waiting = table.players.length < table.seats || table.players.some(p => p.state === 'joining');
  if (waiting && Date.now() < table.deadline) return;
  if (joined.length < 2) return; // a lone player would win at once; the timer cancels the table instead
  table.started = true;
  broadcast(table, serverMsg(table, gm.TYPE.BATTLE_BEGIN), api);
  enterPhase(table, 1, 2);
}

function enterPhase(table, turn, phase) {
  table.turn = turn; table.phase = phase; table.phaseStart = Date.now();
  table.done.clear(); table.fired.clear();
  if (phase === 2) table.ended4.clear();
}

// Game::endTurn FUN_10020b50 as seen from outside: 2 -> 4 (one turn per player, ascending team)
// -> 5 -> next turn's 2. Phases 1, 3, 6 and 7 advance on their own in every client.
function endTurn(table, api) {
  broadcast(table, serverMsg(table, gm.TYPE.END_TURN), api);
  const { turn, phase } = table;
  if (phase === 2) return enterPhase(table, turn, 4);
  if (phase === 4) {
    const left = alive(table).filter(p => !table.ended4.has(p.team));
    if (left.length) { table.phaseStart = Date.now(); return; }
    return enterPhase(table, turn, 5);
  }
  return enterPhase(table, turn + 1, 2);
}

const allDone = table => alive(table).every(p => table.done.has(p.team));

function onEndTurnRequest(table, p, m, api) {
  if (m.turn !== table.turn || m.phase !== table.phase) return;
  if (table.phase === 4) {
    if (table.ended4.has(p.team)) return;
    for (const o of alive(table)) if (o.team < p.team) table.ended4.add(o.team); // skipped players
    table.ended4.add(p.team);
    return endTurn(table, api);
  }
  table.done.add(p.team);
  if (allDone(table)) endTurn(table, api);
}

function onGame(table, p, data, api) {
  const m = gm.unpack(data);
  if (p.state === 'joining') { if (m.type === gm.TYPE.INIT) onJoinInfo(table, p, m.body, api); return; }
  if (m.type === gm.TYPE.END_TURN_REQUEST) return onEndTurnRequest(table, p, m, api); // never acked or forwarded
  // Clients are authoritative about the game state: follow them if they are ahead.
  if (m.turn > table.turn || (m.turn === table.turn && m.phase > table.phase)) enterPhase(table, m.turn, m.phase);
  p.lastSeq = Math.max(p.lastSeq, m.seq);
  if (m.reliable && m.type !== gm.TYPE.ACCEPTED) {
    sendMsg(table, p, serverMsg(table, gm.TYPE.ACCEPTED, Buffer.concat([i32(m.seq), i32(m.sender)])), api);
  }
  if (m.type === gm.TYPE.END_GAME) {
    if (m.body.readInt32LE(0) === 3) m.body = i32(2); // sync errors are reported as disconnects
    lose(table, p, api);
  }
  if (ORDERS.has(m.type)) table.lastOrderTeam = p.team;
  // Forward unchanged to the other players (v16), keeping the client's own seq and sender.
  if (m.reliable) table.history.push(gm.write(m));
  for (const o of table.players) if (o !== p && o.state === 'playing') sendMsg(table, o, m, api);
  if (table.phase === 2 && m.type === gm.TYPE.PLACE_TILE) { table.done.add(p.team); if (allDone(table)) endTurn(table, api); }
  // Clients never request the end of phase 5 after their last shot: the original host ended it once no
  // shots were left (FUN_1000e430), one FireCannon per shot.
  if (table.phase === 5 && m.type === gm.TYPE.FIRE_CANNON && table.cannons > 0) {
    const n = (table.fired.get(p.team) ?? 0) + 1;
    table.fired.set(p.team, n);
    if (n >= table.cannons) { table.done.add(p.team); if (allDone(table)) endTurn(table, api); }
  }
}

function lose(table, p, api) {
  if (!table.losers.includes(p)) table.losers.push(p);
  table.ended4.delete(p.team);
  if (table.started && (table.phase === 2 || table.phase === 5) && allDone(table)) endTurn(table, api);
}

// A player left the table room: tell the others he disconnected (sender = leaver, as the original did).
function leave(table, p, api) {
  if (p.state === 'playing' && table.started && !table.finished && !table.losers.includes(p)) {
    const m = { seq: p.lastSeq + 1, type: gm.TYPE.END_GAME, sender: p.index, recipients: [0],
      turn: table.turn, phase: table.phase, body: i32(2) };
    lose(table, p, api);
    p.state = 'left';
    broadcast(table, m, api);
  }
  p.state = 'left';
}

// Winner: the last player standing, else the one who made the final move before the game ended
// (clients compute the result locally and never upload it).
function result(table) {
  const standing = table.players.filter(p => !table.losers.includes(p));
  const winner = standing.length === 1 ? standing[0] : standing.find(p => p.team === table.lastOrderTeam);
  return { winner, players: table.players };
}

function tick(table, api) {
  if (!table.started) return maybeBegin(table, api);
  const limit = table.limits[table.phase] ?? -1;
  if (limit === -1 || table.finished) return;
  if (Date.now() - table.phaseStart > limit + OVERTIME_MS) {
    if (table.phase === 4) {
      const cur = alive(table).find(p => !table.ended4.has(p.team));
      if (cur) table.ended4.add(cur.team);
    }
    endTurn(table, api);
  }
}

module.exports = { seatCounts, createTable, seat, onGame, leave, result, tick };
