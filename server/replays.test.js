// Self-check for keeping replays (server/replays.js): node server/replays.test.js
const assert = require('assert');
const replays = require('./replays');

const DAY = 24 * 3600 * 1000;
const t0 = 1e12;
const battle = (accounts, created = t0) => ({
  created, text: 'QUJD', accounts,
  meta: { ranked: true, environment: 2, players: [{ name: 'Ada', hero: 'NINJA', seat: 1 }, { name: 'Bo', hero: 'PLUMBER', seat: 2 }] },
});

const db = replays.open(':memory:');

// A saved replay is found by its id, with its text and what the page shows around it, and the id can't be guessed.
const id = db.save(battle(['1', '2']));
assert.match(id, /^[A-Za-z0-9_-]{16,}$/);
assert.notStrictEqual(db.save(battle(['1', '2'])), id, 'every replay gets its own id');
const got = db.get(id, t0 + DAY);
assert.strictEqual(got.text, 'QUJD');
assert.deepStrictEqual(got.meta, { ...battle([]).meta, created: t0 });
assert.strictEqual(db.get('no-such-replay-id', t0), null);

// A replay is kept for 30 days, whatever happens to the accounts in it.
const old = db.save(battle(['3'], t0));
assert(db.get(old, t0 + 30 * DAY - 1), 'still there just before 30 days');
assert.strictEqual(db.get(old, t0 + 30 * DAY), null, 'gone at 30 days, before any sweep');
const fresh = db.save(battle(['3'], t0 + 10 * DAY));
assert(db.sweep(t0 + 30 * DAY) >= 1, 'the sweep deletes what has expired');
assert.strictEqual(db.get(old, t0), null, 'a swept replay is gone for good');
assert(db.get(fresh, t0 + 30 * DAY), 'a newer replay outlives the sweep');

// A member who deletes their account deletes every replay of a battle they played in; the others' stay. Until then the account's
// replays are listed for Download my data, oldest first, without the expired ones.
const both = db.save(battle(['10', '11']));
const other = db.save(battle(['11', '12'], t0 + 1));
assert.deepStrictEqual(db.ofAccount('11', t0 + DAY), [{ id: both, created: t0 }, { id: other, created: t0 + 1 }]);
assert.deepStrictEqual(db.ofAccount('11', t0 + 30 * DAY), [{ id: other, created: t0 + 1 }]);
db.removeAccount('10');
assert.strictEqual(db.get(both, t0), null);
assert(db.get(other, t0), 'a battle the member wasn\'t in keeps its replay');

// A battle with only bots and guests that are gone is still kept: nothing but its age removes it.
const bots = db.save(battle([]));
assert(db.get(bots, t0));
console.log('replays ok');
