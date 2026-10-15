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
console.log('battle host ok');
