// Self-check for account storage: node server/store.test.js
const assert = require('assert');
const { open } = require('./store');

const DAY = 86400e3;
const t0 = 1e12;
const db = open(':memory:');

// Ids are never reused, so a wipe can't hand a living account's id to a new one.
const a = db.create('Alice', 'member', t0);
const b = db.create('Bob', 'guest', t0);
db.remove(b);
const c = db.create('Carol', 'guest', t0);
assert.notStrictEqual(c.id, b.id);
assert.ok(Number(c.id) > Number(b.id));

// A name is one name whatever its case.
assert.strictEqual(db.byName('alice'), a);
assert.throws(() => db.create('ALICE', 'guest', t0));

// A guest who signs in keeps its id, stats, friends and name check: it is the same account.
c.stats.fame = 30; c.stats.matches = 3; db.save(c);
db.setLinks(a, c, 'both', 'both');
db.promote(c, 'CarolM', 'discord-1');
assert.strictEqual(db.byDiscord('discord-1'), c);
assert.strictEqual(db.byName('CarolM'), c);
assert.strictEqual(db.byName('Carol'), null);
assert.strictEqual(c.kind, 'member');
assert.strictEqual(db.linkState(a, c), 'both');
assert.strictEqual(db.friends(c)[0].account, a);

// Links are what each side sees, and removing one side's view leaves the other's.
db.setLinks(a, c, null, 'from');
assert.strictEqual(db.linkState(a, c), undefined);
assert.strictEqual(db.linkState(c, a), 'from');

// The wipe deletes idle guests with their links and tokens, and spares members and anyone online.
const idle = db.create('Guest000001', 'guest', t0 - 2 * DAY);
const online = db.create('Guest000002', 'guest', t0 - 2 * DAY);
const fresh = db.create('Guest000003', 'guest', t0 - DAY / 2);
const oldMember = db.create('Dave', 'member', t0 - 400 * DAY);
const token = db.issueToken(idle);
db.setLinks(a, idle, 'to', 'from');
assert.strictEqual(db.byToken(token, t0), idle);
assert.strictEqual(db.sweepGuests(t0 - DAY, id => id === online.id), 1);
assert.strictEqual(db.byName('Guest000001'), null);
assert.strictEqual(db.byToken(token, t0), null);
assert.strictEqual(db.linkState(a, idle), undefined);
assert.strictEqual(db.byName('Guest000002'), online);
assert.strictEqual(db.byName('Guest000003'), fresh);
assert.strictEqual(db.byName('Dave'), oldMember);
assert.ok(!db.friends(a).some(f => f.account === idle));

// A token with an expiry stops working after it, and one that is used is pushed out.
const member = db.issueToken(a, t0 + 10);
assert.strictEqual(db.byToken(member, t0 + 5, t0 + 100), a);
assert.strictEqual(db.byToken(member, t0 + 50), a);
assert.strictEqual(db.byToken(member, t0 + 101), null);
db.revokeToken(token);

// Rankings leave guests out, order by fame and break ties by age, and a guest gets the place it would hold.
const r = open(':memory:');
const mk = (name, kind, fame) => { const x = r.create(name, kind, t0); x.stats.fame = fame; r.save(x); return x; };
const first = mk('First', 'member', 50), second = mk('Second', 'member', 20), tie = mk('Tie', 'named', 20), guest = mk('Guest000009', 'guest', 999);
assert.deepStrictEqual(r.ranking(0, 10).map(x => x.name), ['First', 'Second', 'Tie']);
assert.deepStrictEqual(r.ranking(1, 1).map(x => x.name), ['Second']);
assert.deepStrictEqual([first, second, tie].map(x => r.rank(x)), [1, 2, 3]);
assert.strictEqual(r.rank(guest), 1); // 999 fame would lead the table
assert.deepStrictEqual(r.findByPrefix('t', 5).map(x => x.name), ['Tie']);
assert.deepStrictEqual(r.findByPrefix('guest_', 5), []); // _ is a character, not a wildcard

console.log('store ok');
