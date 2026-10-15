// Self-check for the battle host with two fake clients: node server/battle.test.js
// Needs a 2-player template in data/templates (see tools/rgtrace/import-template.js).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const battle = require('./battle');
const gm = require('./gamemsg');
const g = require('./gameblob');
const { createReader, frames, T } = require('./mt');

// Fake gateway: collects what each session receives, decoded back to GameMessages.
const inbox = new Map();
const api = { log() {}, send(s, data) { inbox.get(s).push(...s.read(data)); } };
const client = name => { const s = { name, read: createReader() }; inbox.set(s, []); return s; };
const take = s => inbox.get(s).splice(0).map(m => { assert.equal(m[0], T.GAME); return gm.unpack(m.subarray(1)); });
const fromClient = (host, s, m) => {
  const raw = Buffer.concat(frames(T.GAME, gm.pack(m)));
  battle.onGame(host, host.players.find(p => p.s === s), raw.subarray(3), api); // one frame, strip hdr + type
};

const host = battle.createTable(2, api);
assert(host, 'no 2-player template');
const [a, b] = [client('a'), client('b')];
const hero = g.parseGame(fs.readFileSync(path.join(__dirname, '..', 'data', 'templates', `${host.template}.game`))).heroes[1];
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

// b ends its tile phase: everyone gets EndTurn for (1, 2) and the host moves to phase 4.
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
const trio = battle.createTable(3, api);
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
// Turn 2: d was active last turn, so phase 2 still waits for it, until the forced EndTurn.
send(c, 1, 5, gm.TYPE.PLACE_TILE, 2, 2);
assert.equal(trio.phase, 2, 'stopped waiting for d too early');
trio.phaseStart = 0;
battle.tick(trio, api);
assert.equal(trio.phase, 4);
// Every client skips d's turn; c's first shot moves the host to phase 5. d has now been silent for a
// whole turn, so phase 5 ends after c's last shot.
send(c, 1, 6, gm.TYPE.FIRE_CANNON, 2, 5);
assert.equal(trio.phase, 5);
send(c, 1, 7, gm.TYPE.FIRE_CANNON, 2, 5);
assert.deepEqual([trio.turn, trio.phase], [3, 2]);

// A relaxed table sends no phase time limits and forces the end of a phase only after 3 minutes.
const calm = battle.createTable(2, api, true);
const [e, f] = [client('e'), client('f')];
for (const s of [e, f]) {
  battle.seat(calm, s, api);
  assert(g.parseGame(take(s)[0].body.subarray(4)).timeLimit.every(l => l === -1), 'relaxed table sent a limit');
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
console.log('battle host ok');
