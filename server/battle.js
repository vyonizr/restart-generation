// Online battle host: the server's half of a match, replacing the original ServerBattleLogic
// (handshake FUN_1000d8c0, per-message v16, EndTurnRequest v29, timers v6). It does not simulate the
// battle: it hands out the Game and snapshot, relays orders, acks them, and drives turns by copying
// (turn, phase) from the clients, as described in docs/protocol.md "Battle". A witness, where the server has a
// server copy, follows the same messages and tells it each defeat and the result (server/witness.js, docs/adr/0020).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const zlib = require('zlib');
const { T, frames } = require('./mt');
const gm = require('./gamemsg');
const g = require('./gameblob');
const { zipEntries } = require('../shared/zip.js');
const defaultWitness = require('./witness');
const { encode: replayText, marks: replayMarks } = require('./replay');

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
// How long a person's seat is held after their session leaves a running battle (CONTEXT.md "Rejoin window", docs/adr/0038).
const REJOIN_WINDOW_MS = 120000;
// An absent player's turn ends this long after the phase time limit (docs/adr/0040): if the server's idea of whose turn it is
// is wrong (the clients skipped a defeated player nobody reported), the live turn owner's own end-turn request gets in first,
// and the server doesn't end that one turn twice.
const ABSENT_GRACE_MS = 3000;
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

// The battlefield's next-monster kind, after the RNG copy: two i32s, an i32 list, a list of 8-byte pairs, two bytes and an i32
// come first (docs/re/re_replay.md, last section).
function nextMonsterKindAt(battlefield, rngAt) {
  let at = rngAt + 56 + 8;
  at += 4 + 4 * battlefield.readInt32LE(at);
  at += 4 + 8 * battlefield.readUInt32LE(at);
  return at + 6;
}

// The .game and .snap files in a zip, by file name, whatever folder holds them: a zip of the templates folder and a zip
// of its files both work, and so do the backslash paths Windows PowerShell's Compress-Archive writes. Stored and deflated
// entries (what Windows and zip tools write); ZIP64 isn't supported.
// shared/zip.js's zipEntries reads the file list synchronously, because the server checks its templates before it starts listening.
function templateFilesInZip(bytes) {
  const files = new Map();
  for (const { name, method, data } of zipEntries(bytes)) {
    const file = name.split(/[/\\]/).pop();
    if (!/\.(game|snap)$/.test(file)) continue;
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
// and a new battle seed, written into both copies of the RNG. The snapshot also gets the next-monster kind the engine takes from
// that seed, where a capture keeps its own battle's: a replay builds its battlefield from the Game alone (docs/re/re_replay.md).
function tableState(t, timeLimit, api) {
  const seed = randomInt(api, 2 ** 32) | 0;
  const rng = g.seedRng(seed);
  const firstDraw = g.rngNext(rng); // captures hold the seeded state plus the battlefield's first draw
  const battlefield = Buffer.from(t.snapshot.battlefield);
  g.rngBytes(rng).copy(battlefield, t.rngAt);
  battlefield.writeInt32LE(firstDraw % 3, nextMonsterKindAt(battlefield, t.rngAt));
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
// stalled phase. api.templates replaces data/templates (tests use made-up ones, battle.fixture.js), and api.witness
// replaces server/witness.js.
function createTable(seats, api, relaxed = false) {
  const fit = (api.templates ?? (templates ??= loadTemplates())).filter(t => t.seats === seats);
  if (!fit.length) { api.log(`no battle template for ${seats} players in data/templates or data/${ZIP}`); return null; }
  const t = fit[randomInt(api, fit.length)];
  const limits = t.game.timeLimit;
  const { seed, game, snap } = tableState(t, relaxed ? limits.map(() => -1) : limits, api);
  api.log(`table uses template ${t.name}, seed ${seed}${relaxed ? ' without phase time limits' : ''}`);
  const now = api.now ?? Date.now; // the clock, injectable so tests can run a battle in simulated time
  const table = {
    seats, template: t.name, seed, game, snap,
    freeSeats: shuffledSeats(seats, api), // handed out in this order as players send their join info
    players: [],        // { s, index, team, hero, state, lastSeq, seen }
    history: [],        // raw reliable GameMessages, replayed to late joiners (handshake step 4)
    times: [],          // when each of them reached the relay, in ms since the table was made: its replay's pacing
    seq: 3, started: false, // server seq continues after the handshake messages (1-3)
    now, createdAt: now(),
    deadline: now() + START_DEADLINE_MS,
    turn: 0, phase: 0, phaseStart: 0, part: 0, done: new Set(), ended4: new Set(),
    cannons: cannonCount(t.game), fired: new Map(), // team -> FireCannon count this phase
    forceAfter: limits.map((l, phase) => l === -1 ? -1 : relaxed ? (phase === PHASE.CANNONS ? RELAXED_CANNON_MS : RELAXED_MS) : l + OVERTIME_MS), // ms, per phase
    limits, // the template's phase time limits, a relaxed match's too: an absent player is timed out at them (docs/adr/0040)
    // Whether the gateway can no longer reach a session (a browser silent too long, a Java client whose connection closed).
    unreachable: api.unreachable ?? (() => false),
    losers: [], lastOrderTeam: 0, finished: false,
  };
  const witness = api.witness ?? defaultWitness;
  if (witness.available()) {
    table.witness = witness;
    table.moments = new Map(); // `${index} ${kind} ${seat}` -> the witness's moment; a restarted witness reports some again
    witness.follow(table, seat => defeated(table, seat, api), m => table.moments.set(`${m.index} ${m.kind} ${m.seat}`, m));
  }
  return table;
}

// Every reliable message, in the order the clients get it: replayed to late joiners (handshake step 4), fed to the witness, and
// kept with its time for the battle's replay.
function record(table, raw) {
  table.history.push(raw);
  table.times.push(table.now() - table.createdAt);
  table.witness?.feed(table, raw);
}

function sendMsg(table, p, m, api) {
  for (const f of frames(T.GAME, gm.pack(m))) api.send(p.s, f);
}
function broadcast(table, m, api, except) {
  const raw = gm.write(m);
  if (m.reliable !== 0) record(table, raw);
  for (const p of table.players) if (p !== except && listens(p)) sendMsg(table, p, m, api);
}
const serverMsg = (table, type, body) => ({ seq: ++table.seq, type, sender: 0, recipients: [0],
  turn: table.turn, phase: table.phase, body });
const alive = table => table.players.filter(p => p.state === 'playing' && !table.losers.includes(p));
// A seat the relay sends battle messages to: playing, with its session there (not held), and past step 4 if it is rejoining.
// What a rejoining seat misses before step 4 is in the history step 4 sends.
const listens = p => p.state === 'playing' && p.away === null && p.rejoining === null;
// The seats held for their absent players (docs/adr/0038), only while the battle runs: once it ends, every hold is released.
// `away` is when the seat's session left; a held seat stays a stopped player for the others (see `leave`).
const held = table => (table.started && !table.finished ? table.players.filter(p => p.away !== null) : []);
// What is left of a seat's rejoin window, in ms: of a held seat's, or of one being taken back, which is held again from then if
// the new session leaves before step 4; a seat still in play has the whole window ahead of it.
const windowLeft = (table, p) => {
  const since = p.away ?? p.rejoining;
  return since === null ? REJOIN_WINDOW_MS : Math.max(0, REJOIN_WINDOW_MS - (table.now() - since));
};
// The seat account `acc` has in this running battle and hasn't lost, or null: held for it, or still in play. POST /seat counts both,
// because the page asks before its own login, and after a reload the old session stays seated until that login ends it.
const seatOf = (table, acc) => (table.started && !table.finished && table.players.find(p => !p.bot && p.s.account?.id === acc.id
  && (p.away !== null || (p.state === 'playing' && !table.losers.includes(p))))) || null;

const step1 = table => ({ seq: 1, type: gm.TYPE.INIT, body: initBody(Buffer.concat([table.game, i32(1)])) });

// Handshake step 1, after the SEAT_TAKE response (lobby FUN_100ebed0 waits for this). A session whose account holds a seat here
// takes that seat back (a rejoin, docs/adr/0038), whoever else fills the table: its index, team and hero stay, and its JoinInfo
// gets steps 3 and 4 (onRejoinInfo). `rejoining` keeps when the seat was first held, in case this session leaves before step 4.
function seat(table, s, api) {
  const back = s.account && held(table).find(p => p.s.account?.id === s.account.id);
  if (back) {
    report(table, api, `${s.name} takes seat ${back.team} back`);
    Object.assign(back, { s, rejoining: back.away, away: null });
    return sendMsg(table, back, step1(table), api);
  }
  if (table.players.some(p => p.s === s) || table.players.length >= table.seats) return;
  const p = { s, state: 'joining', index: 0, team: 0, lastSeq: 0, seen: step(1, PHASE.TILE_PLACEMENT), skipped: 0, fired5: 0, bot: Boolean(s.account?.bot),
    away: null, rejoining: null, backIn: -1 };
  table.players.push(p);
  sendMsg(table, p, step1(table), api);
}

// Handshake steps 3 and 4: the seat's index and team, then the snapshot taken before anyone joined and every reliable message since.
function catchUp(table, p, api) {
  sendMsg(table, p, { seq: 2, type: gm.TYPE.INIT, body: initBody(Buffer.concat([i32(p.index), i32(p.team)])) }, api);
  sendMsg(table, p, { seq: 3, type: gm.TYPE.INIT,
    body: initBody(Buffer.concat([table.snap, i32(table.history.length), ...table.history])) }, api);
}

function onJoinInfo(table, p, body, api) {
  const info = g.parseJoinInfo(body.subarray(4));
  p.hero = info.hero.type;
  // Step 3: index and team are the next free seat number (FUN_10023f40, FUN_10024c60 hand out the lowest).
  p.index = p.team = table.freeSeats.shift();
  catchUp(table, p, api);
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

// A rejoin's JoinInfo (docs/protocol.md "Rejoin"): steps 3 and 4 with the seat's own index and team, and its engine replays the
// history to where the battle stands. No step 5: the seat's PlayerJoined is in that history, and a second one would give the seat a
// new Commander in every engine. Its hero is the one it joined with; the JoinInfo's is ignored. From here it is an ordinary seat.
// Its silence counts afresh from the next turn: it couldn't act while it was away, and it doesn't in the phase it lands in, so the
// silence rules would otherwise end its next tile phase the moment the others had placed (a whole turn silent), or 30 s in
// (presumed defeated for the cannon phase it missed). So it counts as having acted through this turn's cannon phase. It stays
// absent until this phase or turn ends (`absentLimit`), since its engine doesn't end the one it lands in.
function onRejoinInfo(table, p, api) {
  catchUp(table, p, api);
  p.rejoining = null;
  p.seen = step(table.turn, PHASE.CANNONS); p.fired5 = table.turn; p.skipped = 0; p.backIn = table.part;
  report(table, api, `${p.s.name} rejoined as player ${p.index} with ${table.history.length} messages`);
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

// `part` counts every start of a phase, or of a turn in phase 4: what `phaseStart` times.
function enterPhase(table, turn, phase) {
  table.turn = turn; table.phase = phase; table.phaseStart = table.now(); table.part++;
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
    if (left.length) { table.phaseStart = table.now(); table.part++; return; }
    return enterPhase(table, turn, PHASE.CANNONS);
  }
  return enterPhase(table, turn + 1, PHASE.TILE_PLACEMENT);
}

// (turn, phase) as one ascending number; p.seen is the step of the team's last order or EndTurnRequest, or the later step a rejoin
// credits it with (onRejoinInfo). It never goes back: an EndTurnRequest a rejoined engine sends in the phase it lands in mustn't undo
// that credit.
const step = (turn, phase) => turn * 10 + phase;
// Clients stop sending after their castle or princess is captured, and nothing they send shows it (docs/re/re_rules.md
// section 5). A witness reports each defeat (see `defeated`); without one, or for a stopped player, whom no engine sees
// as defeated, silence is the only sign. From weakest to strongest:
// ponytail: all guesses; a live idle player is treated the same.
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
// Absent (docs/adr/0040): a person whose seat is held, who is taking it back, or who took it back in this phase or turn, or whose
// session the gateway can't reach any more. No engine ends their phase, so the server ends it at the phase time limit, as their own
// engine would have: they hold the others up no longer, and no sooner, than a live player who does nothing. Returns that limit in
// ms, or null for a seat that isn't absent or a phase without one.
const absentLimit = (table, p) => {
  const limit = table.limits[table.phase] ?? -1;
  return limit > 0 && !p.bot && (p.away !== null || p.rejoining !== null || p.backIn === table.part || table.unreachable(p.s)) ? limit : null;
};
// Phases 2 and 5 only. In phase 4 the server never ends or skips a turn on silence: a silent player may be a defeated player
// (the clients skip them) or a stopped player (the clients still wait for them), and the server can't
// tell which. It follows the clients instead, on the first order of a later phase, or the forced end ends the turn.
// Waiting for no one at all ends the phase at once (see `lose`). An absent player is done at the phase time limit, never sooner.
const goneWhy = (table, p) => {
  const limit = absentLimit(table, p);
  if (limit !== null) return waited(table, limit) ? `absent past the ${limit / 1000} s phase time limit` : null;
  return lapsed(table, p) ? 'silent for a whole turn'
    : p.bot && waited(table, BOT_IDLE_MS) ? `a bot silent for ${BOT_IDLE_MS / 1000} s`
    : suspect(table, p) && waited(table, SUSPECT_MS) ? 'presumed defeated' : null;
};
const allDone = table => alive(table).every(p => table.done.has(p.team) || goneWhy(table, p));
const endIfAllDone = (table, api) => {
  if (!allDone(table)) return;
  const notDone = alive(table).filter(p => !table.done.has(p.team)).map(p => `seat ${p.team} ${goneWhy(table, p)}`);
  endTurn(table, api, notDone.length ? `every other seat acted; ${notDone.join(', ')}` : 'every seat acted');
};

function onEndTurnRequest(table, p, m, api) {
  p.seen = Math.max(p.seen, step(table.turn, table.phase));
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
  if (p.state === 'left') return; // a seat given up (`quit`) while its session lingers: nothing it sends counts
  if (p.state === 'joining') { if (m.type === gm.TYPE.INIT) onJoinInfo(table, p, m.body, api); return; }
  if (p.rejoining !== null) { if (m.type === gm.TYPE.INIT) onRejoinInfo(table, p, api); return; }
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
  if (ORDERS.has(m.type)) { table.lastOrderTeam = p.team; p.seen = Math.max(p.seen, step(table.turn, table.phase)); }
  // Forward unchanged to the other players (v16), keeping the client's own seq and sender.
  if (m.reliable) record(table, gm.write(m));
  for (const o of table.players) if (o !== p && listens(o)) sendMsg(table, o, m, api);
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

// The witness saw seat `seat` defeated: stop waiting for it, as for a player who quit or left. Seen after the server has
// already moved on (a witness catching up), it only makes the seat a loser from then on.
function defeated(table, seat, api) {
  const p = table.players.find(o => o.team === seat);
  if (!p || table.losers.includes(p)) return;
  report(table, api, `the witness saw seat ${seat} defeated`);
  lose(table, p, api);
}

// A player's session left the table room. In a running battle, a person's seat is held for the rejoin window (docs/adr/0038):
// nothing is sent, and the others see a stopped player until the seat is taken back (`seat`), given up (`quit`), or drops out
// when the window runs out (`tick`). A rejoin that hadn't reached step 4 holds it again from when it was first held. A bot's
// seat isn't held: the others are told at once that it disconnected.
function leave(table, p, api) {
  if (p.state === 'playing' && table.started && !table.finished && !table.losers.includes(p)) {
    if (p.bot) return dropOut(table, p, 2, api);
    p.away = p.rejoining ?? table.now();
    p.rejoining = null;
    return report(table, api, `seat ${p.team} is held for ${p.s.name}`);
  }
  p.state = 'left';
}

// The seat leaves the battle for good: the others get EndGame with `reason` (2 a disconnect, 0 a player who left through the
// game's menus) as the seat's own message, sender = the seat, numbered past its last one, as the original did. With sender 0
// every client would believe it won.
function dropOut(table, p, reason, api) {
  const m = { seq: p.lastSeq + 1, type: gm.TYPE.END_GAME, sender: p.index, recipients: [0],
    turn: table.turn, phase: table.phase, body: i32(reason) };
  lose(table, p, api);
  p.state = 'left';
  p.away = null;
  broadcast(table, m, api);
}

// The player gave their seat up (POST /seat), held or still in play (`seatOf`): EndGame reason 0, so the others see a player who
// left, not one who disconnected. The battle counts as a defeat for them. A session still seated there gets nothing more.
function quit(table, p, api) {
  if (seatOf(table, p.s.account) !== p) return;
  report(table, api, `${p.s.name} gave seat ${p.team} up`);
  dropOut(table, p, 0, api);
}

// The result once the battle is over: { winners, players, ranks, guessed }. With a witness that waits up to `waitMs` for its ranks,
// the winners are every player it ranks first (two after a tie, none if nobody is first), `ranks` are its ranks by seat, and
// `guessed` is null. Otherwise the result is guessed (CONTEXT.md "Guessed result"), `ranks` is null, and `guessed` says why: the
// last player standing, else the one who made the final move before the game ended (clients compute the result locally and
// never upload it).
async function result(table, waitMs) {
  let timer;
  const seen = table.witness && await Promise.race([table.witness.result(table),
    new Promise(resolve => { timer = setTimeout(resolve, waitMs, { failed: 'no result in time' }); })]);
  clearTimeout(timer);
  if (seen?.ranks) return { winners: table.players.filter(p => seen.ranks[p.index] === 1), players: table.players, ranks: seen.ranks, guessed: null };
  const standing = table.players.filter(p => !table.losers.includes(p));
  const winner = standing.length === 1 ? standing[0] : standing.find(p => p.team === table.lastOrderTeam);
  return { winners: winner ? [winner] : [], players: table.players, ranks: null, guessed: seen ? `witness failed: ${seen.failed}` : 'no server copy' };
}

// The battle's replay (CONTEXT.md), for server/replays.js: the engine's replay text, the accounts that played with their seats, and what the replay
// page shows around it. `outcome` is result()'s, or null for a battle everyone left before it ended. Its marks come from the
// witness's moments (docs/adr/0030), unless the witness failed.
function replay(table, outcome) {
  const players = [...table.players].sort((x, y) => x.team - y.team);
  const begin = table.history.findIndex(raw => gm.parse(raw).type === gm.TYPE.BATTLE_BEGIN);
  const marks = table.moments?.size && begin >= 0 && !outcome?.guessed ? replayMarks(table.times, begin, [...table.moments.values()]) : [];
  return {
    created: table.now(),
    text: replayText(table.game, table.history.map((raw, i) => ({ t: table.times[i], raw }))),
    seats: players.filter(p => !p.bot).map(p => ({ account: p.s.account.id, seat: p.team })),
    meta: {
      ranked: Boolean(table.ranked),
      environment: g.parseGame(table.game).environment,
      players: players.map(p => ({ name: p.s.name, hero: p.hero, seat: p.team, bot: p.bot })),
      result: outcome && { winners: outcome.winners.map(p => p.team).sort((x, y) => x - y), ranks: outcome.ranks, guessed: Boolean(outcome.guessed) },
      ...(marks.length && { marks }),
    },
  };
}

// The table is gone or its result is in: the witness stops following it.
const forget = table => table.witness?.forget(table);

// Every second (casino.js): held seats whose rejoin window ran out drop out as a disconnect (EndGame reason 2), then the battle
// moves on. Returns the seats that dropped out.
function tick(table, api) {
  const out = held(table).filter(p => windowLeft(table, p) === 0);
  for (const p of out) { report(table, api, `seat ${p.team}'s rejoin window ran out`); dropOut(table, p, 2, api); }
  advance(table, api);
  return out;
}

// The seat whose phase-4 turn the server believes it is: turns run in ascending seat number, and players don't join in seat order.
const current = table => alive(table).filter(p => !table.ended4.has(p.team)).sort((x, y) => x.team - y.team)[0];

function advance(table, api) {
  if (!table.started) return maybeBegin(table, api);
  if ((table.phase === PHASE.TILE_PLACEMENT || table.phase === PHASE.CANNONS) && !table.finished && alive(table).length && allDone(table)) return endIfAllDone(table, api);
  if (table.finished) return;
  if (table.phase === PHASE.PLAYER_TURNS) {
    const cur = current(table);
    const absent = cur ? absentLimit(table, cur) : null;
    if (absent !== null && waited(table, absent + ABSENT_GRACE_MS)) {
      table.ended4.add(cur.team);
      return endTurn(table, api, `seat ${cur.team} is absent: its turn ended after the ${absent / 1000} s phase time limit`);
    }
  }
  const limit = table.forceAfter[table.phase] ?? -1;
  if (limit === -1) return;
  if (table.now() - table.phaseStart > limit) {
    let whose = '';
    if (table.phase === PHASE.PLAYER_TURNS) {
      const cur = current(table);
      if (cur) { table.ended4.add(cur.team); whose = ` of seat ${cur.team}'s turn`; }
    }
    endTurn(table, api, `forced end${whose} after ${Math.round(limit / 1000)} s`);
  }
}

module.exports = { PHASE, REJOIN_WINDOW_MS, seatCounts, loadTemplates, createTable, seat, onGame, leave, quit, held, seatOf, windowLeft, result, replay, forget, tick };
