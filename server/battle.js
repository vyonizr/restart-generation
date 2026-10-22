// Online battle host: the server's half of a match, replacing the original ServerBattleLogic
// (handshake FUN_1000d8c0, per-message v16, EndTurnRequest v29, timers v6). It does not simulate the
// battle: it hands out the Game and snapshot, relays orders, acks them, and drives turns by copying
// (turn, phase) from the clients, as described in docs/protocol.md "Battle".
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { T, frames } = require('./mt');
const gm = require('./gamemsg');
const g = require('./gameblob');

const DATA = path.join(__dirname, '..', 'data');
const ZIP = 'battle-templates.zip';
const START_DEADLINE_MS = 40000;  // Mac FUN_000cd7ee
const OVERTIME_MS = 30000;        // forced end this long after the phase time limit (FUN_1000ddf0)
// Phases the server drives (CONTEXT.md); the rest advance on their own in every client.
const PHASE = { TILE_PLACEMENT: 2, PLAYER_TURNS: 4, CANNONS: 5 };
const RELAXED_MS = 180000;        // forced end this long after a phase starts in a relaxed match
const RELAXED_CANNON_MS = 60000;  // same for phase 5, where a shot count the server can't know stalls the table
const BOT_IDLE_MS = 15000;        // a live bot acts about 4 s into a phase; a bot silent this long is defeated
const SUSPECT_MS = 30000;         // a person who sat out the previous phase, or was skipped in phase 4, is presumed defeated this far into a phase
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

// The .game and .snap files in a zip, by file name, whatever folder holds them: a zip of the templates folder and a zip
// of its files both work, and so do the backslash paths Windows PowerShell's Compress-Archive writes. Stored and deflated
// entries (what Windows and zip tools write); ZIP64 isn't supported.
// Synchronous, unlike web/zip.js, because the server checks its templates before it starts listening.
function templateFilesInZip(bytes) {
  let eocd = bytes.length - 22;
  while (eocd >= 0 && bytes.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error('not a .zip file');
  const files = new Map();
  for (let i = 0, n = bytes.readUInt16LE(eocd + 10), p = bytes.readUInt32LE(eocd + 16); i < n; i++) {
    if (bytes.readUInt32LE(p) !== 0x02014b50) throw new Error('its file list is damaged');
    const method = bytes.readUInt16LE(p + 10), size = bytes.readUInt32LE(p + 20), nameLen = bytes.readUInt16LE(p + 28);
    const local = bytes.readUInt32LE(p + 42), file = bytes.toString('utf8', p + 46, p + 46 + nameLen).split(/[/\\]/).pop();
    p += 46 + nameLen + bytes.readUInt16LE(p + 30) + bytes.readUInt16LE(p + 32);
    if (!/\.(game|snap)$/.test(file)) continue;
    const start = local + 30 + bytes.readUInt16LE(local + 26) + bytes.readUInt16LE(local + 28), data = bytes.subarray(start, start + size);
    if (method === 0) files.set(file, Buffer.from(data));
    else if (method === 8) files.set(file, zlib.inflateRawSync(data));
    else throw new Error(`${file} uses compression method ${method}; only stored and deflated entries are read`);
  }
  return files;
}

// Every template in data/templates/ and data/battle-templates.zip (docs/HOSTING.md "Battle templates"). A name in both
// is taken from the folder, where new captures land, with a warning if the two copies differ (a zip made from the folder
// says nothing). An unreadable zip is skipped with a warning, like an unusable template.
function loadTemplates(dir = DATA) {
  const sources = []; // [label, Map of file name -> bytes], the folder last so that it wins
  const zip = path.join(dir, ZIP);
  if (fs.existsSync(zip)) {
    try { sources.push([ZIP, templateFilesInZip(fs.readFileSync(zip))]); } catch (e) { console.warn(`${ZIP} skipped: ${e.message}`); }
  }
  const folder = path.join(dir, 'templates');
  if (fs.existsSync(folder)) {
    sources.push(['templates', new Map(fs.readdirSync(folder).filter(f => /\.(game|snap)$/.test(f)).map(f => [f, fs.readFileSync(path.join(folder, f))]))]);
  }
  const chosen = new Map(); // template name -> its source's files
  const same = (a, b, f) => a.has(f) === b.has(f) && (!a.has(f) || a.get(f).equals(b.get(f)));
  for (const [label, files] of sources) for (const f of files.keys()) if (f.endsWith('.game')) {
    const name = f.slice(0, -5), was = chosen.get(name)?.files;
    if (was && !(same(was, files, f) && same(was, files, `${name}.snap`))) console.warn(`battle template ${name} differs in data/templates and ${ZIP}: using data/templates`);
    chosen.set(name, { label, files });
  }
  return [...chosen].flatMap(([name, { label, files }]) => {
    try {
      if (!files.has(`${name}.snap`)) throw new Error(`no ${name}.snap`);
      const game = g.parseGame(files.get(`${name}.game`));
      const snapshot = g.parseSnapshot(files.get(`${name}.snap`));
      return [{ name, game, snapshot, rngAt: snapshotRngAt(game, snapshot), seats: game.castles.length }];
    } catch (e) {
      console.warn(`battle template ${name} (${label === ZIP ? ZIP : 'data/templates'}) skipped: ${e.message}`);
      return [];
    }
  });
}

// A whole number from 0 to n - 1: from api.random when a test injects one (a function like Math.random), so a seeded
// test gets the same template, battle seed, environment and seats every run; from crypto otherwise.
const randomInt = (api, n) => (api.random ? Math.floor(api.random() * n) : crypto.randomInt(n));

// The Game and snapshot for a fresh online table: no join infos yet (players arrive through the handshake)
// and a new battle seed, written into both copies of the RNG.
function tableState(t, timeLimit, api) {
  const seed = randomInt(api, 2 ** 32) | 0;
  const rng = g.seedRng(seed);
  g.rngNext(rng); // captures hold the seeded state plus one draw
  const battlefield = Buffer.from(t.snapshot.battlefield);
  g.rngBytes(rng).copy(battlefield, t.rngAt);
  return {
    seed,
    // The engine picks the environment (0 space, 1 clouds and grass, 2 speedball, 3 soccer, 4 racetrack) at random
    // when a map names none, and the maps don't, so captures hold whichever one came up.
    game: g.writeGame({ ...t.game, timeLimit, randomSeed: seed, rng, environment: randomInt(api, 5),
      playerSlots: t.seats + 1, players: [], slotHeroes: [] }),
    snap: g.writeSnapshot({ ...t.snapshot, battlefield }),
  };
}

// The seat numbers 1..n in random order. A seat number fixes the castle, the color (the client uses
// (team - 1) % 6) and the place in the turn order.
function shuffledSeats(n, api) {
  const seats = Array.from({ length: n }, (_, i) => i + 1);
  for (let i = n - 1; i > 0; i--) { const j = randomInt(api, i + 1); [seats[i], seats[j]] = [seats[j], seats[i]]; }
  return seats;
}

// ponytail: templates load once; restart the server after importing new ones.
let templates;
const seatCounts = () => new Set((templates ??= loadTemplates()).map(t => t.seats));

// A relaxed match sends -1 phase time limits, so clients show no countdown and only the server ends a
// stalled phase. api.templates replaces data/templates (tests use made-up ones, battle.fixture.js).
function createTable(seats, api, relaxed = false) {
  const fit = (api.templates ?? (templates ??= loadTemplates())).filter(t => t.seats === seats);
  if (!fit.length) { api.log(`no battle template for ${seats} players in data/templates or data/${ZIP}`); return null; }
  const t = fit[randomInt(api, fit.length)];
  const limits = t.game.timeLimit;
  const { seed, game, snap } = tableState(t, relaxed ? limits.map(() => -1) : limits, api);
  api.log(`table uses template ${t.name}, seed ${seed}${relaxed ? ' without phase time limits' : ''}`);
  return {
    seats, template: t.name, seed, game, snap,
    freeSeats: shuffledSeats(seats, api), // handed out in this order as players send their join info
    players: [],        // { s, index, team, state, lastSeq, seen }
    history: [],        // raw reliable GameMessages, replayed to late joiners (handshake step 4)
    seq: 3, started: false, // server seq continues after the handshake messages (1-3)
    now: api.now ?? Date.now, // the clock, injectable so tests can run a battle in simulated time
    deadline: (api.now ?? Date.now)() + START_DEADLINE_MS,
    turn: 0, phase: 0, phaseStart: 0, done: new Set(), ended4: new Set(),
    cannons: cannonCount(t.game), fired: new Map(), // team -> FireCannon count this phase
    forceAfter: limits.map((l, phase) => l === -1 ? -1 : relaxed ? (phase === PHASE.CANNONS ? RELAXED_CANNON_MS : RELAXED_MS) : l + OVERTIME_MS), // ms, per phase
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
  const p = { s, state: 'joining', index: 0, team: 0, lastSeq: 0, seen: step(1, PHASE.TILE_PLACEMENT), skipped: 0, fired5: 0, bot: Boolean(s.account?.bot) };
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
  if (waiting && table.now() < table.deadline) return;
  if (joined.length < 2) return; // a lone player would win at once; the timer cancels the table instead
  table.started = true;
  broadcast(table, serverMsg(table, gm.TYPE.BATTLE_BEGIN), api);
  enterPhase(table, 1, PHASE.TILE_PLACEMENT);
}

function enterPhase(table, turn, phase) {
  table.turn = turn; table.phase = phase; table.phaseStart = table.now();
  table.done.clear(); table.fired.clear();
  if (phase === PHASE.TILE_PLACEMENT) table.ended4.clear();
}

// Why the server moved a table on, and every end-turn request it dropped: one log line each, so a stalled table
// shows whether players acted, silence stood in for them, or the forced end did.
const report = (table, api, text) => api.log(`battle ${table.seed} in (${table.turn}, ${table.phase}): ${text}`);

// Game::endTurn FUN_10020b50 as seen from outside: 2 -> 4 (one turn per player, ascending team)
// -> 5 -> next turn's 2. Phases 1, 3, 6 and 7 advance on their own in every client.
function endTurn(table, api, why) {
  report(table, api, `ended: ${why}`);
  broadcast(table, serverMsg(table, gm.TYPE.END_TURN), api);
  const { turn, phase } = table;
  if (phase === PHASE.TILE_PLACEMENT) return enterPhase(table, turn, PHASE.PLAYER_TURNS);
  if (phase === PHASE.PLAYER_TURNS) {
    const left = alive(table).filter(p => !table.ended4.has(p.team));
    if (left.length) { table.phaseStart = table.now(); return; }
    return enterPhase(table, turn, PHASE.CANNONS);
  }
  return enterPhase(table, turn + 1, PHASE.TILE_PLACEMENT);
}

// (turn, phase) as one ascending number; p.seen is the step of the team's last order or EndTurnRequest.
const step = (turn, phase) => turn * 10 + phase;
// Clients stop sending after their castle or princess is captured, which the server can't see
// (docs/re/re_rules.md section 5), so silence is the only sign of a defeat. From weakest to strongest:
// ponytail: all guesses; a live idle player is treated the same. A headless witness engine would be exact.
// - lapsed: nothing for a whole turn. Counts as done in phases 2 and 5 at once.
const lapsed = (table, p) => step(table.turn, table.phase) - p.seen >= 10;
// - A bot never thinks for long, so one that hasn't acted `ms` into the phase is defeated.
const waited = (table, ms) => table.now() - table.phaseStart > ms;
// - A person who left the previous tile or cannon phase unfinished (no order, or shots still owed), or whom
//   the clients skipped in this turn's phase 4 (the way they skip a defeated player), is presumed defeated
//   after a longer wait. A defeat costs at most one forced end: in the first phase where nothing yet shows it.
const suspect = (table, p) => {
  if (table.phase === PHASE.CANNONS) return p.seen < step(table.turn, PHASE.TILE_PLACEMENT) || p.skipped === table.turn;
  return table.phase === PHASE.TILE_PLACEMENT && (p.seen < step(table.turn - 1, PHASE.CANNONS) || (table.cannons > 0 && table.turn > 1 && p.fired5 !== table.turn - 1));
};
// Phases 2 and 5 only. In phase 4 the server never ends or skips a turn on silence: a silent player may be a defeated player
// (the clients skip them) or a stopped player (the clients still wait for them), and the server can't
// tell which. It follows the clients instead, on the first order of a later phase, or the forced end ends the turn.
// Waiting for no one at all ends the phase at once (see `lose`).
const goneWhy = (table, p) => lapsed(table, p) ? 'silent for a whole turn'
  : p.bot && waited(table, BOT_IDLE_MS) ? `a bot silent for ${BOT_IDLE_MS / 1000} s`
  : suspect(table, p) && waited(table, SUSPECT_MS) ? 'presumed defeated' : null;
const allDone = table => alive(table).every(p => table.done.has(p.team) || goneWhy(table, p));
const endIfAllDone = (table, api) => {
  if (!allDone(table)) return;
  const notDone = alive(table).filter(p => !table.done.has(p.team)).map(p => `seat ${p.team} ${goneWhy(table, p)}`);
  endTurn(table, api, notDone.length ? `every other seat acted; ${notDone.join(', ')}` : 'every seat acted');
};

function onEndTurnRequest(table, p, m, api) {
  p.seen = step(table.turn, table.phase);
  if (m.turn !== table.turn || m.phase !== table.phase) return report(table, api, `dropped seat ${p.team}'s end-turn request for (${m.turn}, ${m.phase})`);
  if (table.phase === PHASE.PLAYER_TURNS) {
    if (table.ended4.has(p.team)) return report(table, api, `dropped seat ${p.team}'s end-turn request: its turn already ended or was skipped`);
    const skipped = alive(table).filter(o => o.team < p.team && !table.ended4.has(o.team));
    for (const o of skipped) { table.ended4.add(o.team); o.skipped = table.turn; }
    table.ended4.add(p.team);
    return endTurn(table, api, `seat ${p.team} ended its turn${skipped.length ? `, skipping seat ${skipped.map(o => o.team).join(', ')}` : ''}`);
  }
  table.done.add(p.team);
  endIfAllDone(table, api);
}

function onGame(table, p, data, api) {
  const m = gm.unpack(data);
  if (p.state === 'joining') { if (m.type === gm.TYPE.INIT) onJoinInfo(table, p, m.body, api); return; }
  if (m.type === gm.TYPE.END_TURN_REQUEST) return onEndTurnRequest(table, p, m, api); // never acked or forwarded
  // Clients are authoritative about the game state: follow them if they are ahead.
  if (m.turn > table.turn || (m.turn === table.turn && m.phase > table.phase)) {
    report(table, api, `seat ${p.team} is already in (${m.turn}, ${m.phase}): following the clients`);
    enterPhase(table, m.turn, m.phase);
  }
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
  if (table.phase === PHASE.TILE_PLACEMENT && m.type === gm.TYPE.PLACE_TILE) { table.done.add(p.team); endIfAllDone(table, api); }
  // Clients never request the end of phase 5 after their last shot: the original host ended it once no
  // shots were left (FUN_1000e430), one FireCannon per shot.
  if (table.phase === PHASE.CANNONS && m.type === gm.TYPE.FIRE_CANNON && table.cannons > 0) {
    const n = (table.fired.get(p.team) ?? 0) + 1;
    table.fired.set(p.team, n);
    if (n >= table.cannons) { p.fired5 = table.turn; table.done.add(p.team); endIfAllDone(table, api); }
  }
}

function lose(table, p, api) {
  if (!table.losers.includes(p)) table.losers.push(p);
  table.ended4.delete(p.team);
  if (!table.started || table.finished) return;
  if (table.phase === PHASE.TILE_PLACEMENT || table.phase === PHASE.CANNONS) return endIfAllDone(table, api);
  // Phase 4: if the player who lost held the last turn, every client has moved on to phase 5 by itself (re_rules.md section 3).
  if (table.phase === PHASE.PLAYER_TURNS && alive(table).length && alive(table).every(o => table.ended4.has(o.team))) {
    report(table, api, `seat ${p.team} lost holding the last turn: following the clients to phase 5`);
    enterPhase(table, table.turn, PHASE.CANNONS);
  }
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
  if ((table.phase === PHASE.TILE_PLACEMENT || table.phase === PHASE.CANNONS) && !table.finished && alive(table).length && allDone(table)) return endIfAllDone(table, api);
  const limit = table.forceAfter[table.phase] ?? -1;
  if (limit === -1 || table.finished) return;
  if (table.now() - table.phaseStart > limit) {
    let whose = '';
    if (table.phase === PHASE.PLAYER_TURNS) {
      // Turns run in ascending seat number, and players don't join in seat order.
      const cur = alive(table).filter(p => !table.ended4.has(p.team)).sort((x, y) => x.team - y.team)[0];
      if (cur) { table.ended4.add(cur.team); whose = ` of seat ${cur.team}'s turn`; }
    }
    endTurn(table, api, `forced end${whose} after ${Math.round(limit / 1000)} s`);
  }
}

module.exports = { PHASE, seatCounts, loadTemplates, createTable, seat, onGame, leave, result, tick };
