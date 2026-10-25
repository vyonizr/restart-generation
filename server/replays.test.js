// Self-check for keeping replays (server/replays.js): node server/replays.test.js
const assert = require('assert');
const replays = require('./replays');

const t0 = 1e12;
const META = { ranked: true, environment: 2, players: [{ name: 'Ada', hero: 'NINJA', seat: 1 }, { name: 'Bo', hero: 'PLUMBER', seat: 2 }] };
// A battle the accounts played, in seats 1, 2, … in that order.
const battle = (accounts, created = t0) => ({ created, text: 'QUJD', seats: accounts.map((account, i) => ({ account, seat: i + 1 })), meta: META });

const db = replays.open(':memory:');

// A saved replay is found by its id, with its text and what the page shows around it, and the id can't be guessed.
const id = db.save(battle(['1', '2']));
assert.match(id, /^[A-Za-z0-9_-]{16,}$/);
assert.notStrictEqual(db.save(battle(['1', '2'])), id, 'every replay gets its own id');
const got = db.get(id);
assert.strictEqual(got.text, 'QUJD');
assert.deepStrictEqual(got.meta, { ...META, created: t0 });
assert.strictEqual(db.get('no-such-replay-id'), null);

// Each account keeps its last KEEP battles (docs/adr/0034). A new one takes the oldest off the list at once, and a replay goes only
// when no account keeps it: Ada's oldest battle stays while Bo, who played it, still keeps it.
const keep = replays.open(':memory:');
const shared = keep.save(battle(['ada', 'bo'], t0));
const alone = keep.save(battle(['ada'], t0 + 1));
const ada = Array.from({ length: replays.KEEP - 1 }, (_, i) => keep.save(battle(['ada'], t0 + 2 + i)));
assert.strictEqual(keep.listOf('ada').length, replays.KEEP, 'the 26th battle pushed the oldest off');
assert(!keep.listOf('ada').some(r => r.id === shared), "off Ada's list");
assert(keep.get(shared), 'Bo still keeps it');
assert(keep.listOf('ada').some(r => r.id === alone));
keep.save(battle(['ada'], t0 + 100));
assert.strictEqual(keep.get(alone), null, 'a battle only Ada kept is deleted when it leaves her list');
assert.strictEqual(keep.listOf('ada')[0].created, t0 + 100, 'newest first');
assert.strictEqual(keep.listOf('ada').at(-1).id, ada[0]);
for (let i = 0; i < replays.KEEP; i++) keep.save(battle(['bo'], t0 + 200 + i));
assert.strictEqual(keep.get(shared), null, 'gone once it has left every list');

// The list says which seat the account played in, so the page can say whether it won and with which hero.
const seats = replays.open(':memory:');
seats.save(battle(['20', '21']));
assert.deepStrictEqual(seats.listOf('21'), [{ ...META, id: seats.listOf('21')[0].id, created: t0, seat: 2 }]);
assert.deepStrictEqual(seats.listOf('99'), []);

// The sweep: an account that no longer exists, as a wiped guest, keeps nothing, so a battle only it kept is deleted; a row from
// before seats were kept gets the seat its account's name played in, and none when the name isn't in the replay any more.
const sweep = replays.open(':memory:');
const wiped = sweep.save(battle(['guest'])), withBo = sweep.save(battle(['guest', 'bo']));
const unseated = sweep.save({ ...battle([]), seats: [{ account: 'ada' }, { account: 'renamed' }] });
assert.strictEqual(sweep.listOf('ada')[0].seat, null);
const names = { bo: 'Bo', ada: 'ADA', renamed: 'Somebody' };
assert.strictEqual(sweep.sweep(account => names[account] ?? null), 1);
assert.strictEqual(sweep.get(wiped), null);
assert(sweep.get(withBo), 'Bo still keeps the battle the guest played with him');
assert.deepStrictEqual(sweep.listOf('guest'), []);
assert.strictEqual(sweep.listOf('ada').find(r => r.id === unseated).seat, 1);
assert.strictEqual(sweep.listOf('renamed')[0].seat, null);

// A member who deletes their account deletes every replay of a battle they played in; the others' stay. Until then the account's
// replays are listed for Download my data, oldest first.
const both = db.save(battle(['10', '11'], t0));
const other = db.save(battle(['11', '12'], t0 + 1));
assert.deepStrictEqual(db.ofAccount('11'), [{ id: both, created: t0 }, { id: other, created: t0 + 1 }]);
db.removeAccount('10');
assert.strictEqual(db.get(both), null);
assert(db.get(other), 'a battle the member wasn\'t in keeps its replay');

// A guest who signs in to a member that already exists hands the member its replays, including a battle the two played together,
// and the member keeps its newest KEEP of them all.
const move = replays.open(':memory:');
const together = move.save(battle(['30', '31'], t0)), guestOnly = move.save(battle(['30'], t0 + 1));
move.moveAccount('30', '31');
assert.deepStrictEqual(move.listOf('31').map(r => r.id), [guestOnly, together]);
assert.deepStrictEqual(move.listOf('30'), []);
for (let i = 0; i < replays.KEEP; i++) move.save(battle(['32'], t0 + 10 + i));
move.moveAccount('32', '31');
assert.strictEqual(move.listOf('31').length, replays.KEEP);
assert.strictEqual(move.get(together), null);
console.log('replays ok');
