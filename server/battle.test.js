// Self-check for the server's battles (server/battle.js) with fake clients: node server/battle.test.js
// Uses made-up templates (battle.fixture.js); with --real, the ones in data/templates and data/battle-templates.zip (docs/HOSTING.md).
const assert = require('assert');
const battle = require('./battle');
const fixture = require('./battle.fixture');
const gm = require('./gamemsg');
const g = require('./gameblob');
const { createReader, frames, T } = require('./mt');

const templates = process.argv.includes('--real') ? battle.loadTemplates() : fixture.templates();
const template = name => templates.find(t => t.name === name);

// Fake gateway: collects what each session receives, decoded back to GameMessages.
const inbox = new Map();
const api = { log() {}, templates, send(s, data) { inbox.get(s).push(...s.read(data)); } };
const client = name => { const s = { name, read: createReader() }; inbox.set(s, []); return s; };
// The scenarios below drive a table in seat order, so they join players in seat order 1, 2, ...
const inSeatOrder = table => { table?.freeSeats.sort((x, y) => x - y); return table; };
const take = s => inbox.get(s).splice(0).map(m => { assert.equal(m[0], T.GAME); return gm.unpack(m.subarray(1)); });
const fromClient = (host, s, m) => {
  const raw = Buffer.concat(frames(T.GAME, gm.pack(m)));
  battle.onGame(host, host.players.find(p => p.s === s), raw.subarray(3), api); // one frame, strip hdr + type
};

const host = inSeatOrder(battle.createTable(2, api));
assert(host, 'no 2-player template');
const [a, b] = [client('a'), client('b')];
const hero = g.parseGame(host.game).heroes[1];
const join = name => { const info = g.writeJoinInfo({ type: 0, slot: -1, aiType: 0, color: -1, name, random: 0, hero });
  return { seq: 1, type: gm.TYPE.INIT, sender: 0, body: Buffer.concat([Buffer.from(new Int32Array([info.length]).buffer), info]) }; };

for (const s of [a, b]) {
  battle.seat(host, s, api);
  const [init] = take(s);
  assert.equal(init.type, gm.TYPE.INIT);
  const game = g.parseGame(init.body.subarray(4));
  assert.deepEqual(game.players, []);
  assert(game.timeLimit.some(l => l > 0), 'a normal table keeps the template limits');
  fromClient(host, s, join(s.name));
}
const msgsA = take(a), msgsB = take(b);
// a: index/team, snapshot, PlayerJoined(a), PlayerJoined(b), BattleBegin
assert.deepEqual(msgsA.map(m => m.type), [0, 0, 12, 12, 1]);
assert.deepEqual([...msgsA[0].body.subarray(4)], [1, 0, 0, 0, 1, 0, 0, 0]);
// b got PlayerJoined(a) through the snapshot history, then its own, then BattleBegin.
assert.deepEqual(msgsB.map(m => m.type), [0, 0, 12, 1]);
assert.equal(msgsB[1].body.readInt32LE(4 + host.snap.length), 1, 'history holds PlayerJoined(a)');
assert.equal(host.turn, 1); assert.equal(host.phase, 2);

// An order from a: acked to a, forwarded unchanged to b.
fromClient(host, a, { seq: 1, type: gm.TYPE.PLACE_TILE, sender: 1, turn: 1, phase: 2, body: Buffer.from([1, 2, 3]) });
const [ack] = take(a);
assert.equal(ack.type, gm.TYPE.ACCEPTED);
assert.deepEqual([ack.body.readInt32LE(0), ack.body.readInt32LE(4)], [1, 1]);
const [fwd] = take(b);
assert.deepEqual([fwd.type, fwd.sender, fwd.seq, [...fwd.body]], [gm.TYPE.PLACE_TILE, 1, 1, [1, 2, 3]]);

// b ends its tile phase: everyone gets EndTurn for (1, 2) and the server moves to phase 4.
fromClient(host, b, { seq: 1, type: gm.TYPE.END_TURN_REQUEST, sender: 2, turn: 1, phase: 2 });
for (const s of [a, b]) assert.deepEqual(take(s).map(m => [m.type, m.turn, m.phase]), [[gm.TYPE.END_TURN, 1, 2]]);
assert.equal(host.phase, 4);

// Phase 4: a requests the end of its turn, then b; then phase 5.
fromClient(host, a, { seq: 2, type: gm.TYPE.END_TURN_REQUEST, sender: 1, turn: 1, phase: 4 });
assert.equal(host.phase, 4);
fromClient(host, b, { seq: 2, type: gm.TYPE.END_TURN_REQUEST, sender: 2, turn: 1, phase: 4 });
assert.equal(host.phase, 5);
take(a); take(b);

// Phase 5: every template gives each player 2 cannons. The phase ends right after the last shot.
const shot = (s, sender, seq) => fromClient(host, s, { seq, type: gm.TYPE.FIRE_CANNON, sender, turn: 1, phase: 5,
  body: Buffer.from(new Int32Array([3, 4]).buffer) });
shot(a, 1, 3); shot(a, 1, 4); shot(b, 2, 3);
assert.equal(host.phase, 5, 'b still has a shot');
shot(b, 2, 4);
// a sees b's last shot before the EndTurn.
assert.deepEqual(take(a).map(m => m.type).slice(-2), [gm.TYPE.FIRE_CANNON, gm.TYPE.END_TURN]);
assert.deepEqual(take(b).at(-1).type, gm.TYPE.END_TURN);
assert.deepEqual([host.turn, host.phase], [2, 2]);

// A 3-seat table with 2 players waits for the third until the start deadline.
const trio = inSeatOrder(battle.createTable(3, api));
assert(trio, 'no 3-player template');
const [c, d] = [client('c'), client('d')];
for (const s of [c, d]) { battle.seat(trio, s, api); fromClient(trio, s, join(s.name)); }
battle.tick(trio, api);
assert.equal(trio.started, false, 'started before the deadline');
trio.deadline = 0;
battle.tick(trio, api);
assert.equal(trio.started, true);

// d is defeated during turn 1 and sends nothing after its last shot.
const send = (s, sender, seq, type, turn, phase) => fromClient(trio, s, { seq, type, sender, turn, phase,
  body: Buffer.from(new Int32Array([3, 4]).buffer) });
send(c, 1, 1, gm.TYPE.PLACE_TILE, 1, 2); send(d, 2, 1, gm.TYPE.PLACE_TILE, 1, 2);
send(c, 1, 2, gm.TYPE.END_TURN_REQUEST, 1, 4); send(d, 2, 2, gm.TYPE.END_TURN_REQUEST, 1, 4);
send(c, 1, 3, gm.TYPE.FIRE_CANNON, 1, 5); send(c, 1, 4, gm.TYPE.FIRE_CANNON, 1, 5);
send(d, 2, 3, gm.TYPE.FIRE_CANNON, 1, 5); send(d, 2, 4, gm.TYPE.FIRE_CANNON, 1, 5);
assert.deepEqual([trio.turn, trio.phase], [2, 2]);
// Turn 2: d was active last turn, so phase 2 still waits for it, until the forced end.
send(c, 1, 5, gm.TYPE.PLACE_TILE, 2, 2);
assert.equal(trio.phase, 2, 'stopped waiting for d too early');
trio.phaseStart = 0;
battle.tick(trio, api);
assert.equal(trio.phase, 4);
// Every client skips d's turn; c's first shot moves the server to phase 5. d has now been silent for a
// whole turn, so phase 5 ends after c's last shot.
send(c, 1, 6, gm.TYPE.FIRE_CANNON, 2, 5);
assert.equal(trio.phase, 5);
send(c, 1, 7, gm.TYPE.FIRE_CANNON, 2, 5);
assert.deepEqual([trio.turn, trio.phase], [3, 2]);

// A bot that stays silent is defeated: its table stops waiting for it after 15 s, in phases 2 and 5.
const cpuTable = inSeatOrder(battle.createTable(2, api));
const person = client('person'), cpu = { ...client('CPU_1'), account: { bot: true } };
inbox.set(cpu, []);
for (const s of [person, cpu]) { battle.seat(cpuTable, s, api); fromClient(cpuTable, s, join(s.name)); }
const act = (s, sender, seq, type, phase, n = 1) => { for (let i = 0; i < n; i++) fromClient(cpuTable, s, { seq: seq + i, type, sender, turn: 1, phase,
  body: Buffer.from(new Int32Array([3, 4]).buffer) }); };
act(person, 1, 1, gm.TYPE.PLACE_TILE, 2);
battle.tick(cpuTable, api);
assert.equal(cpuTable.phase, 2, 'stopped waiting for a bot that may still be acting');
cpuTable.phaseStart = Date.now() - 16000;
battle.tick(cpuTable, api);
assert.equal(cpuTable.phase, 4);
fromClient(cpuTable, person, { seq: 2, type: gm.TYPE.END_TURN_REQUEST, sender: 1, turn: 1, phase: 4 });
assert.equal(cpuTable.phase, 4, 'the silent bot is still owed its turn in phase 4');
cpuTable.phaseStart = Date.now() - 16000; // clients skip the defeated bot and move to phase 5 on their own
act(person, 1, 3, gm.TYPE.FIRE_CANNON, 5, 2);
assert.equal(cpuTable.phase, 5);
battle.tick(cpuTable, api);
assert.equal(cpuTable.phase, 5, 'the bot just had its phase 5 start');
cpuTable.phaseStart = Date.now() - 16000;
battle.tick(cpuTable, api);
assert.deepEqual([cpuTable.turn, cpuTable.phase], [2, 2]);

// A relaxed match sends no phase time limits and forces the end of a phase only after 3 minutes (1 minute in phase 5).
const calm = inSeatOrder(battle.createTable(2, api, true));
const [e, f] = [client('e'), client('f')];
for (const s of [e, f]) {
  battle.seat(calm, s, api);
  assert(g.parseGame(take(s)[0].body.subarray(4)).timeLimit.every(l => l === -1), 'relaxed match sent a limit');
  fromClient(calm, s, join(s.name));
}
take(e); take(f);
assert.equal(calm.phase, 2);
calm.phaseStart = Date.now() - 170000;
battle.tick(calm, api);
assert.equal(calm.phase, 2, 'forced the end of phase 2 before 3 minutes');
calm.phaseStart = Date.now() - 181000;
battle.tick(calm, api);
assert.equal(calm.phase, 4);
assert.deepEqual(take(e).map(m => [m.type, m.turn, m.phase]), [[gm.TYPE.END_TURN, 1, 2]]);
// Phase 5 is forced after 1 minute: a stalled cannon phase would otherwise hold the table for 3.
for (const [s, sender] of [[e, 1], [f, 2]]) fromClient(calm, s, { seq: 9, type: gm.TYPE.END_TURN_REQUEST, sender, turn: 1, phase: 4 });
assert.equal(calm.phase, 5);
calm.phaseStart = Date.now() - 59000;
battle.tick(calm, api);
assert.equal(calm.phase, 5, 'forced the end of phase 5 before 1 minute');
calm.phaseStart = Date.now() - 61000;
battle.tick(calm, api);
assert.deepEqual([calm.turn, calm.phase], [2, 2]);
// Seats are random, so the first player to join may play second. A forced end of phase 4 skips the player whose
// turn it is, the one in the lowest seat, not the first to join.
const late = battle.createTable(2, api);
late.freeSeats = [2, 1];
const [g2, g1] = [client('g2'), client('g1')]; // g2 joins first and sits in seat 2
for (const s of [g2, g1]) { battle.seat(late, s, api); fromClient(late, s, join(s.name)); }
for (const [s, sender] of [[g2, 2], [g1, 1]]) fromClient(late, s, { seq: 1, type: gm.TYPE.END_TURN_REQUEST, sender, turn: 1, phase: 2 });
assert.equal(late.phase, 4);
late.phaseStart = 0;
battle.tick(late, api); // seat 1 ran out of time
fromClient(late, g2, { seq: 2, type: gm.TYPE.END_TURN_REQUEST, sender: 2, turn: 1, phase: 4 });
assert.equal(late.phase, 5, 'seat 2 could not end its turn after seat 1 was forced');

// The same random source gives the same table: template, battle seed, environment and seat order.
const mulberry = seed => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const drawn = seed => { const t = battle.createTable(4, { ...api, random: mulberry(seed) });
  return [t.template, t.seed, g.parseGame(t.game).environment, t.freeSeats.join()]; };
assert.deepEqual(drawn(7), drawn(7));
assert.notDeepEqual(drawn(7), drawn(8));

// A table picks its environment (the look of the playfield, 0 to 4) at random, as the engine does when a map names
// none, whatever environment the template was captured with; everything else stays as captured.
const environments = new Map(); // template -> environments its tables got
for (let n = 0; n < 80; n++) {
  const table = battle.createTable(2, api);
  const game = g.parseGame(table.game);
  assert(Number.isInteger(game.environment) && game.environment >= 0 && game.environment <= 4, `environment ${game.environment}`);
  if (!environments.has(table.template)) environments.set(table.template, []);
  environments.get(table.template).push(game.environment);
  const was = template(table.template).game;
  assert.deepEqual(game.blocks, was.blocks);
  assert.deepEqual(game.castles, was.castles);
}
for (const [name, list] of environments) assert(new Set(list).size > 1, `every table from ${name} got environment ${list[0]}`);

// Every table gets its own battle seed, in the Game and in the snapshot's copy of the RNG; the rest of the
// template reaches the clients unchanged, except the battlefield's next-monster kind (below). The expected bytes are built
// here from the RNG layout (i, j, 11, then the 11 state words), not by the server's code.
const rngLayout = r => Buffer.concat([new Int32Array([r.i, r.j, 11]), new Uint32Array(r.state)].map(a => Buffer.from(a.buffer)));
// Where the next-monster kind sits after the RNG (docs/re/re_replay.md, last section).
const kindAt = (bf, rngAt) => {
  let o = rngAt + 56 + 8;
  o += 4 + 4 * bf.readInt32LE(o);
  o += 4 + 8 * bf.readUInt32LE(o);
  return o + 6;
};
const seen = new Set();
for (let n = 0; n < 12; n++) {
  const table = battle.createTable(2, api);
  const rng = rngLayout(g.parseGame(table.game).rng);
  const bf = g.parseSnapshot(table.snap).battlefield;
  const at = bf.indexOf(rng);
  assert(at >= 0 && bf.indexOf(rng, at + 1) < 0, 'the snapshot carries the table\'s RNG exactly once');
  seen.add(rng.toString('hex'));
  const was = template(table.template).snapshot;
  const original = g.writeSnapshot(was);
  const wasRng = rngLayout(template(table.template).game.rng);
  const kind = kindAt(bf, at);
  assert.equal(table.snap.length, original.length);
  assert.deepEqual([...bf.subarray(0, at)], [...was.battlefield.subarray(0, at)]);
  assert.deepEqual([...bf.subarray(at + rng.length, kind)], [...was.battlefield.subarray(at + rng.length, kind)]);
  assert.deepEqual([...bf.subarray(kind + 4)], [...was.battlefield.subarray(kind + 4)]);
  assert.equal(was.battlefield.indexOf(wasRng), at, 'the template holds its RNG where the table does');
  assert.deepEqual([...g.parseSnapshot(table.snap).players], [...was.players]);
  assert.deepEqual([...g.parseSnapshot(table.snap).third], [...was.third]);
}
assert.equal(seen.size, 12, 'two tables shared a battle seed');

// The next-monster kind is the one the engine's own battlefield takes from the seed, so a replay, which builds the battlefield
// from the Game alone, starts where the players started. Seeds and kinds measured in the engine (research replay-feasibility.md).
for (const [seed, kind] of [[1542061598, 2], [-1935092673, 2], [797437583, 0], [1982280396, 0], [-996939403, 1]]) {
  const draws = [0, (seed >>> 0) / 2 ** 32]; // the template, then the battle seed (see randomInt)
  const table = battle.createTable(2, { ...api, random: () => draws.length ? draws.shift() : 0 });
  assert.equal(table.seed, seed);
  const bf = g.parseSnapshot(table.snap).battlefield;
  assert.equal(bf.readInt32LE(kindAt(bf, template(table.template).rngAt)), kind, `seed ${seed}`);
}

// Seats are handed out at random, each seat number once.
const firstSeats = new Set();
for (let n = 0; n < 40; n++) {
  const table = battle.createTable(2, api);
  const [x, y] = [client('x'), client('y')];
  const seatOf = s => { battle.seat(table, s, api); fromClient(table, s, join(s.name)); return take(s)[1].body.readInt32LE(4); }; // [0] is the Game
  const [sx, sy] = [seatOf(x), seatOf(y)];
  assert.deepEqual([sx, sy].sort(), [1, 2], 'two players on a 2-seat table take seats 1 and 2');
  firstSeats.add(sx);
}
assert.deepEqual([...firstSeats].sort(), [1, 2], 'the first player to join always got the same seat');

// Phase 4: when the player holding the last turn quits, every client is already in phase 5, so the server follows.
const left4 = inSeatOrder(battle.createTable(3, api));
const [m1, m2, m3] = ['m1', 'm2', 'm3'].map(client);
let mseq = 0;
const say = (table, s, sender, type, turn, phase) => fromClient(table, s, { seq: ++mseq, type, sender, turn, phase, body: Buffer.from(new Int32Array([3, 4]).buffer) });
for (const s of [m1, m2, m3]) { battle.seat(left4, s, api); fromClient(left4, s, join(s.name)); }
[m1, m2, m3].forEach((s, i) => say(left4, s, i + 1, gm.TYPE.PLACE_TILE, 1, 2));
say(left4, m1, 1, gm.TYPE.END_TURN_REQUEST, 1, 4); say(left4, m2, 2, gm.TYPE.END_TURN_REQUEST, 1, 4);
assert.equal(left4.phase, 4, 'm3 still holds the turn');
fromClient(left4, m3, { seq: ++mseq, type: gm.TYPE.END_GAME, sender: 3, turn: 1, phase: 4, body: Buffer.alloc(4) }); // reason 0: left through the menus
assert.deepEqual([left4.turn, left4.phase], [1, 5]);

// Phase 4: a seat that was silent for a whole turn may be a defeated player (the clients skip them) or a stopped player
// (they wait for them); the server can't tell, so it neither skips nor ends that turn on silence. It follows the clients instead.
const gap = inSeatOrder(battle.createTable(3, api));
const [n1, n2, n3] = ['n1', 'n2', 'n3'].map(client);
for (const s of [n1, n2, n3]) { battle.seat(gap, s, api); fromClient(gap, s, join(s.name)); }
[n1, n2, n3].forEach((s, i) => say(gap, s, i + 1, gm.TYPE.PLACE_TILE, 1, 2)); // n3 is defeated right after its tile
say(gap, n1, 1, gm.TYPE.END_TURN_REQUEST, 1, 4); say(gap, n2, 2, gm.TYPE.END_TURN_REQUEST, 1, 4);
for (const n of [1, 2]) for (let i = 0; i < 2; i++) say(gap, [n1, n2][n - 1], n, gm.TYPE.FIRE_CANNON, 1, 5);
assert.deepEqual([gap.turn, gap.phase], [1, 5], 'n3 may still owe shots: nothing shows it is defeated yet');
gap.phaseStart = Date.now() - 51000; battle.tick(gap, api);
assert.deepEqual([gap.turn, gap.phase], [2, 2]);
say(gap, n1, 1, gm.TYPE.PLACE_TILE, 2, 2); say(gap, n2, 2, gm.TYPE.PLACE_TILE, 2, 2);
assert.equal(gap.phase, 4, 'n3 has been silent for a whole turn');
say(gap, n1, 1, gm.TYPE.END_TURN_REQUEST, 2, 4); say(gap, n2, 2, gm.TYPE.END_TURN_REQUEST, 2, 4);
gap.phaseStart = Date.now() - 16000; battle.tick(gap, api);
assert.equal(gap.phase, 4, 'silence alone moved the server past n3\'s turn');
say(gap, n1, 1, gm.TYPE.FIRE_CANNON, 2, 5); // the clients skipped the defeated n3 and are in phase 5
assert.deepEqual([gap.turn, gap.phase], [2, 5]);
say(gap, n1, 1, gm.TYPE.FIRE_CANNON, 2, 5); say(gap, n2, 2, gm.TYPE.FIRE_CANNON, 2, 5); say(gap, n2, 2, gm.TYPE.FIRE_CANNON, 2, 5);
assert.deepEqual([gap.turn, gap.phase], [3, 2], 'phase 5 waited for the silent n3');

// A person who left turn 1's cannon phase unfinished is presumed defeated, and phase 2 stops waiting for them
// after 30 s: 3 minutes in a relaxed match would look like a hang.
const dropout = inSeatOrder(battle.createTable(3, api, true));
const [r1, r2, r3] = ['r1', 'r2', 'r3'].map(client);
for (const s of [r1, r2, r3]) { battle.seat(dropout, s, api); fromClient(dropout, s, join(s.name)); }
[r1, r2, r3].forEach((s, i) => say(dropout, s, i + 1, gm.TYPE.PLACE_TILE, 1, 2));
[r1, r2, r3].forEach((s, i) => say(dropout, s, i + 1, gm.TYPE.END_TURN_REQUEST, 1, 4));
for (const [s, n] of [[r1, 1], [r2, 2]]) for (let i = 0; i < 2; i++) say(dropout, s, n, gm.TYPE.FIRE_CANNON, 1, 5);
say(dropout, r3, 3, gm.TYPE.FIRE_CANNON, 1, 5); // r3's castle falls to r2's shots after its first
dropout.phaseStart = Date.now() - 61000; battle.tick(dropout, api);
assert.deepEqual([dropout.turn, dropout.phase], [2, 2]);
say(dropout, r1, 1, gm.TYPE.PLACE_TILE, 2, 2); say(dropout, r2, 2, gm.TYPE.PLACE_TILE, 2, 2);
dropout.phaseStart = Date.now() - 29000; battle.tick(dropout, api);
assert.equal(dropout.phase, 2, 'waited less than 30 s for r3');
dropout.phaseStart = Date.now() - 31000; battle.tick(dropout, api);
assert.equal(dropout.phase, 4, 'r3 is presumed defeated');

// Only a person's seat is held when its session leaves (docs/adr/0038). A bot's isn't: the others hear at once that it disconnected.
const botLeft = inSeatOrder(battle.createTable(2, api));
const [human, robot] = [client('human'), { ...client('CPU_1'), account: { id: 'bot1', bot: true } }];
inbox.set(robot, []);
for (const s of [human, robot]) { battle.seat(botLeft, s, api); fromClient(botLeft, s, join(s.name)); }
take(human);
battle.leave(botLeft, botLeft.players[1], api);
assert.deepEqual(take(human).map(m => [m.type, m.sender, m.body.readInt32LE(0)]), [[gm.TYPE.END_GAME, 2, 2]]);

// An absent player is timed out at the phase time limit, as their own engine would be (docs/adr/0040): a held seat, one the gateway
// can't reach, and one taken back, until the phase it lands in ends. A silent player who is still there keeps the forced end.
const clock = { t: 1e6 }, cut = new Set();
const after = ms => { clock.t = absent.phaseStart + ms; battle.tick(absent, { ...api, now: () => clock.t }); };
const absent = inSeatOrder(battle.createTable(3, { ...api, now: () => clock.t, unreachable: s => cut.has(s) }));
const person3 = name => Object.assign(client(name), { account: { id: name } });
const [x1, x2, x3] = ['x1', 'x2', 'x3'].map(person3);
for (const s of [x1, x2, x3]) { battle.seat(absent, s, api); fromClient(absent, s, join(s.name)); }
[x1, x2, x3].forEach((s, i) => say(absent, s, i + 1, gm.TYPE.PLACE_TILE, 1, 2));
assert.deepEqual([absent.turn, absent.phase], [1, 4]);
battle.leave(absent, absent.players[0], api); // x1's session ends in its own turn: its seat is held
take(x2);
after(22900);
assert(!absent.ended4.has(1), 'ended an absent turn before the limit and the grace');
after(23100);
assert.deepEqual(take(x2).map(m => m.type), [gm.TYPE.END_TURN], 'an absent player\'s turn ends at the phase time limit');
after(24000);
assert(!absent.ended4.has(2), 'a silent player who is still there was timed out like an absent one');
say(absent, x2, 2, gm.TYPE.END_TURN_REQUEST, 1, 4); say(absent, x3, 3, gm.TYPE.END_TURN_REQUEST, 1, 4);
for (const [s, n] of [[x2, 2], [x3, 3]]) for (let i = 0; i < 2; i++) say(absent, s, n, gm.TYPE.FIRE_CANNON, 1, 5);
after(19900);
assert.equal(absent.phase, 5, 'the cannon phase stopped waiting for an absent player before the limit');
after(20100);
assert.deepEqual([absent.turn, absent.phase], [2, 2]);
// Silent for a whole turn, x1 would be counted done at once; absent, the tile phase still waits out its time limit.
say(absent, x2, 2, gm.TYPE.PLACE_TILE, 2, 2); say(absent, x3, 3, gm.TYPE.PLACE_TILE, 2, 2);
assert.equal(absent.phase, 2, 'an absent player ended the tile phase before its time limit');
const x1back = person3('x1'); // x1 reloads and takes the seat back in this phase, where its engine does nothing
battle.seat(absent, x1back, api); fromClient(absent, x1back, join('x1'));
after(19900);
assert.equal(absent.phase, 2, 'a rejoined player ended the tile phase it landed in before the limit');
after(20100);
assert.deepEqual([absent.turn, absent.phase], [2, 4]);
after(24000);
assert(!absent.ended4.has(1), 'a rejoined player was still timed out after the phase it landed in');
say(absent, x1back, 1, gm.TYPE.END_TURN_REQUEST, 2, 4);
cut.add(x2); // the gateway can't reach x2 any more, though its session hasn't ended
take(x3);
after(23100);
assert.deepEqual(take(x3).map(m => m.type), [gm.TYPE.END_TURN], 'an unreachable player\'s turn ends at the phase time limit');
console.log('battle host ok');
