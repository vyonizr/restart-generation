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
const RELAXED_MS = 180000;        // forced EndTurn this long after a phase starts on a relaxed table
const RELAXED_CANNON_MS = 60000;  // same for phase 5, where a shot count the server can't know stalls the table
const BOT_IDLE_MS = 15000;        // a live bot acts about 4 s into a phase; a bot silent this long is defeated
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
// The snapshot is opaque except for its copy of the Game's RNG, which every table must reseed too. It is found
// by its bytes; a template without exactly one such copy isn't understood and is skipped.
function snapshotRngAt(game, snapshot) {
  const rng = g.rngBytes(game.rng);
  const at = snapshot.battlefield.indexOf(rng);
  if (at < 0 || snapshot.battlefield.indexOf(rng, at + 1) >= 0) throw new Error('the snapshot does not hold the Game RNG exactly once');
  return at;
}

function loadTemplates() {
  if (!fs.existsSync(TEMPLATES)) return [];
  return fs.readdirSync(TEMPLATES).filter(f => f.endsWith('.game')).flatMap(f => {
    const name = f.slice(0, -5);
    try {
      const game = g.parseGame(fs.readFileSync(path.join(TEMPLATES, f)));
      const snapshot = g.parseSnapshot(fs.readFileSync(path.join(TEMPLATES, `${name}.snap`)));
      return [{ name, game, snapshot, rngAt: snapshotRngAt(game, snapshot), seats: game.castles.length }];
    } catch (e) {
      console.warn(`battle template ${name} skipped: ${e.message}`);
      return [];
    }
  });
}

// The Game and snapshot for a fresh online table: no join infos yet (players arrive through the handshake)
// and a new battle seed, written into both copies of the RNG.
function tableState(t, timeLimit) {
  const seed = crypto.randomBytes(4).readInt32LE();
  const rng = g.seedRng(seed);
  g.rngNext(rng); // captures hold the seeded state plus one draw
  const battlefield = Buffer.from(t.snapshot.battlefield);
  g.rngBytes(rng).copy(battlefield, t.rngAt);
  return {
    seed,
    // The engine picks the environment (0 space, 1 clouds and grass, 2 speedball, 3 soccer, 4 racetrack) at random
    // when a map names none, and the maps don't, so captures hold whichever one came up.
    game: g.writeGame({ ...t.game, timeLimit, randomSeed: seed, rng, environment: crypto.randomInt(5),
      playerSlots: t.seats + 1, players: [], slotHeroes: [] }),
    snap: g.writeSnapshot({ ...t.snapshot, battlefield }),
  };
}

// The seat numbers 1..n in random order. A seat number fixes the castle, the colour (the client uses
// (team - 1) % 6) and the place in the turn order.
function shuffledSeats(n) {
  const seats = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = n - 1; i > 0; i--) { const j = crypto.randomInt(i + 1); [seats[i], seats[j]] = [seats[j], seats[i]]; }
  return seats;
}

// ponytail: templates load once; restart the server after importing new ones.
let templates;
const seatCounts = () => new Set((templates ??= loadTemplates()).map(t => t.seats));

// A relaxed table sends -1 phase time limits, so clients show no countdown and only the server ends a
// stalled phase.
function createTable(seats, api, relaxed = false) {
  const fit = (templates ??= loadTemplates()).filter(t => t.seats === seats);
  if (!fit.length) { api.log(`no battle template for ${seats} players in data/templates`); return null; }
  const t = fit[crypto.randomInt(fit.length)];
  const limits = t.game.timeLimit;
  const { seed, game, snap } = tableState(t, relaxed ? limits.map(() => -1) : limits);
  api.log(`table uses template ${t.name}, seed ${seed}${relaxed ? ' without phase time limits' : ''}`);
  return {
    seats, template: t.name, game, snap,
    freeSeats: shuffledSeats(seats), // handed out in this order as players send their join info
    players: [],        // { s, index, team, state, lastSeq, seen }
    history: [],        // raw reliable GameMessages, replayed to late joiners (handshake step 4)
    seq: 3, started: false, // server seq continues after the handshake messages (1-3)
    deadline: Date.now() + START_DEADLINE_MS,
    turn: 0, phase: 0, phaseStart: 0, done: new Set(), ended4: new Set(),
    cannons: cannonCount(t.game), fired: new Map(), // team -> FireCannon count this phase
    forceAfter: limits.map((l, phase) => l === -1 ? -1 : relaxed ? (phase === 5 ? RELAXED_CANNON_MS : RELAXED_MS) : l + OVERTIME_MS), // ms, per phase
    losers: [], lastOrderTeam: 0, finished: false,
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
  const p = { s, state: 'joining', index: 0, team: 0, lastSeq: 0, seen: step(1, 2), bot: Boolean(s.account?.bot) };
  table.players.push(p);
  sendMsg(table, p, { seq: 1, type: gm.TYPE.INIT, body: initBody(Buffer.concat([table.game, i32(1)])) }, api);
}

function onJoinInfo(table, p, body, api) {
  const info = g.parseJoinInfo(body.subarray(4));
  // Step 3: index and team are the next free seat number (FUN_10023f40, FUN_10024c60 hand out the lowest).
  p.index = p.team = table.freeSeats.shift();
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

// (turn, phase) as one ascending number; p.seen is the step of the team's last order or EndTurnRequest.
const step = (turn, phase) => turn * 10 + phase;
// Clients stop sending after their castle or princess is captured, which the server can't see
// (docs/re/re_rules.md section 5). A team silent for a whole turn counts as done in phases 2 and 5. In
// phase 4 every client still decides whose turn it is, so the server keeps waiting there.
// ponytail: guesses defeats; an idle living player is skipped too. A headless witness engine would be exact.
const silent = (table, p) => step(table.turn, table.phase) - p.seen >= 10;
// A bot never thinks for long, so one that hasn't acted by now is defeated: don't wait for it, and don't wait
// for the whole-turn silence above.
const idleBot = (table, p) => p.bot && Date.now() - table.phaseStart > BOT_IDLE_MS;
const allDone = table => alive(table).every(p => table.done.has(p.team) || silent(table, p) || idleBot(table, p));

function onEndTurnRequest(table, p, m, api) {
  p.seen = step(table.turn, table.phase);
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
  if (ORDERS.has(m.type)) { table.lastOrderTeam = p.team; p.seen = step(table.turn, table.phase); }
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
  if ((table.phase === 2 || table.phase === 5) && !table.finished && alive(table).length && allDone(table)) return endTurn(table, api);
  const limit = table.forceAfter[table.phase] ?? -1;
  if (limit === -1 || table.finished) return;
  if (Date.now() - table.phaseStart > limit) {
    if (table.phase === 4) {
      // Turns run in ascending seat number, and players don't join in seat order.
      const cur = alive(table).filter(p => !table.ended4.has(p.team)).sort((x, y) => x.team - y.team)[0];
      if (cur) table.ended4.add(cur.team);
    }
    endTurn(table, api);
  }
}

module.exports = { seatCounts, createTable, seat, onGame, leave, result, tick };
