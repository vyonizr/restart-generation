// Self-check for the seed accounts (docs/adr/0023): node server/seed.test.js
const assert = require('assert');
const store = require('./store');
const replays = require('./replays');
const stats = require('./stats');
const { apply, applyStats, check, settingsFile, tokenOf } = require('./seed');
const { GUEST_IDLE_MS, MEMBER_TOKEN_MS } = require('./auth');
const seed = require('./seed.json');

const now = 2e12;
const open = () => ({ accounts: store.open(':memory:'), replays: replays.open(':memory:') });
// Everything a server could show of an account file and its replays.
const dump = ({ accounts, replays: r }) => ({
  accounts: seed.accounts.map(a => accounts.byName(a.name)).filter(Boolean).map(acc => ({
    ...acc, dates: accounts.dates(acc), rank: acc.kind === 'guest' ? null : accounts.rank(acc),
    friends: accounts.friends(acc).map(f => [f.account.name, f.state]), saves: accounts.saves(acc),
    replays: r.ofAccount(acc.id),
  })),
});

(async () => {
  // The file in the repository is one the seed accepts.
  check(seed);

  // A second run over the first changes nothing.
  const db = open();
  apply(seed, { ...db, discord: true, now });
  const once = dump(db);
  apply(seed, { ...db, discord: true, now });
  assert.deepStrictEqual(dump(db), once);

  // Every account is one the server could have made: stats from ranked play only, and a saved game within the server's limits.
  for (const acc of once.accounts) {
    const s = acc.stats;
    assert.ok(s.wins <= s.matches && s.fame === 10 * s.wins && s.highestFame >= s.fame, acc.name);
    const bytes = acc.saves.reduce((n, f) => n + f.data.length, 0);
    assert.ok(acc.saves.length <= 16 && bytes <= 1024 * 1024 && acc.saves.every(f => f.data.length <= 256 * 1024), acc.name);
  }
  // Rankings fill every view the game shows (top 10, and 5 around a player) without overlapping.
  assert.ok(once.accounts.filter(a => a.kind !== 'guest').length >= 17);

  // The seed wins over what a developer changed in a seed account, and leaves every other account alone.
  const ada = db.accounts.byName('Dev_Ada'), own = db.accounts.create('MyOwnName', 'member', now - 5, '123456789012345678');
  ada.stats.wins += 5; ada.stats.matches += 5; ada.stats.fame += 50; db.accounts.save(ada);
  db.accounts.setLinks(ada, own, 'both', 'both');
  apply(seed, { ...db, discord: true, now });
  assert.strictEqual(db.accounts.byName('Dev_Ada').stats.wins, seed.accounts.find(a => a.name === 'Dev_Ada').wins);
  assert.strictEqual(db.accounts.byName('MyOwnName'), own);
  assert.deepStrictEqual(db.accounts.dates(own), { created: now - 5, lastActive: now - 5 });
  assert.strictEqual(db.accounts.linkState(own, ada), 'both');

  // Every seed replay is still kept by one of its players: Dev_Hoarder's oldest leave its list, which holds only the newest 25,
  // and stay on their opponents'.
  assert.deepStrictEqual(seed.replays.filter(r => !db.replays.get(r.id)).map(r => r.id), []);
  const hoarder = db.replays.ofAccount(db.accounts.byName('Dev_Hoarder').id);
  assert.strictEqual(hoarder.length, replays.KEEP);
  assert.ok(!hoarder.some(r => r.id === 'dev-replay-11'));
  assert.ok(db.replays.ofAccount(db.accounts.byName('Dev_Kofi').id).some(r => r.id === 'dev-replay-11'));

  // A developer signs in with the token the seed prints: a member's lasts 90 days, a guest's until the guest is wiped.
  assert.strictEqual(db.accounts.byToken(tokenOf('Dev_Bo'), now + MEMBER_TOKEN_MS - 1), db.accounts.byName('Dev_Bo'));
  assert.strictEqual(db.accounts.byToken(tokenOf('Dev_Bo'), now + MEMBER_TOKEN_MS + 1), null);
  assert.strictEqual(db.accounts.byToken(tokenOf('Guest900001'), now + 365 * GUEST_IDLE_MS), db.accounts.byName('Guest900001'));

  // One guest is minutes from the wipe, so a developer can watch it happen; the others outlast a working day.
  const wiped = () => seed.accounts.filter(a => a.kind === 'guest' && !db.accounts.byName(a.name)).map(a => a.name);
  db.accounts.sweepGuests(now + 10 * 60e3 - GUEST_IDLE_MS, () => false);
  assert.deepStrictEqual(wiped(), ['Guest900004']);

  // The page shows a seed member's custom keys, read from the saved game's settings.cfg the seed wrote.
  const { customKeys, DEFAULT_KEYS } = await import('../web/src/lib/input/keys.js');
  const keysOf = name => customKeys(new Uint8Array(db.accounts.saves(db.accounts.byName(name)).find(f => f.name === 'settings.cfg').data));
  assert.deepStrictEqual(keysOf('Dev_Ada'), { select: 90, back: 88, up: 87, down: 83, left: 65, right: 68, chat: 84 });
  assert.deepStrictEqual(keysOf('Dev_Bo'), DEFAULT_KEYS);
  assert.throws(() => settingsFile({ primary: 'F1' }), /Custom Keys/);

  // A played replay keeps the engine's text across runs and moves to the new id of an account wiped since.
  db.replays.put({ id: seed.played[0].id, created: now - 60e3, text: 'engine text', seats: [], meta: { ranked: true, environment: 0, players: [], result: null } });
  apply(seed, { ...db, discord: true, now });
  assert.strictEqual(db.replays.get(seed.played[0].id).text, 'engine text');
  const guest = db.accounts.byName('Guest900001');
  assert.ok(db.replays.ofAccount(guest.id).some(r => r.id === 'dev-replay-06'));

  // Visitor statistics land on the UTC days their offsets name. A second run over the first changes nothing, a seed day a
  // developer's server changed goes back to the file's counts, and a day the seed doesn't list is left alone.
  const visitors = stats.open(':memory:'), everything = () => visitors.summary('0000-01-01', '9999-12-31');
  applyStats(seed.visitorStatistics, visitors, now);
  const counted = everything();
  assert.deepStrictEqual(counted.days.map(d => d.day), seed.visitorStatistics.map(d => stats.dayOf(now - d.daysAgo * 24 * 3600e3)).sort());
  applyStats(seed.visitorStatistics, visitors, now);
  assert.deepStrictEqual(everything(), counted);
  visitors.add({ day: stats.dayOf(now), hour: 3, unique: true, page: 'privacy', referrer: 'example.org', country: 'FI', device: 'touch' });
  visitors.started('2000-01-01');
  applyStats(seed.visitorStatistics, visitors, now);
  assert.deepStrictEqual(visitors.summary('2000-01-02', '9999-12-31'), counted);
  assert.deepStrictEqual(visitors.summary('2000-01-01', '2000-01-01').days, [{ day: '2000-01-01', opens: 0, uniques: 0, started: true }]);

  // Name-only: every seed member is a named account with no Discord ID, token or saved game, and there are no guests.
  const names = open();
  const done = apply(seed, { ...names, discord: false, now });
  const named = dump(names).accounts;
  assert.deepStrictEqual([...new Set(named.map(a => a.kind))], ['named']);
  assert.ok(named.every(a => a.discordId === null && a.saves.length === 0));
  assert.strictEqual(names.accounts.byToken(tokenOf('Dev_Ada'), now), null);
  assert.strictEqual(names.accounts.byName('Guest900001'), null);
  assert.deepStrictEqual(done.signIns, []);

  // A seed with a mistake is refused before it reaches a file.
  const broken = edit => () => check({ ...seed, accounts: [{ ...seed.accounts[0], ...edit }] });
  assert.throws(broken({ wins: 9, matches: 3 }), /more wins/);
  assert.throws(broken({ name: 'Ada' }), /Dev_ prefix/);
  assert.throws(broken({ lastActive: 'yesterday' }), /time offset/);
  const marked = seed.replays.find(r => r.marks);
  const badMark = mark => () => check({ ...seed, replays: [{ ...marked, marks: [mark] }] });
  assert.throws(badMark({ at: 10, moments: [{ kind: 'knockout', seat: 9 }] }), /a mark that isn't one/);
  assert.throws(badMark({ at: 10, moments: [{ kind: 'rescue', seat: 1 }] }), /a mark that isn't one/);
  const day = seed.visitorStatistics[0], badDay = edit => () => check({ ...seed, visitorStatistics: [{ ...day, ...edit }] });
  assert.throws(badDay({ daysAgo: -1 }), /daysAgo/);
  assert.throws(() => check({ ...seed, visitorStatistics: [day, day] }), /daysAgo/);
  assert.throws(badDay({ uniques: day.opens + 1 }), /can't count/);
  assert.throws(badDay({ hours: Array(24).fill(0) }), /hours/);
  assert.throws(badDay({ device: { desktop: day.opens - 1 } }), /device counts/);
  assert.throws(badDay({ referrer: { 'www.reddit.com': day.opens } }), /isn't a referrer/);
  assert.throws(badDay({ page: { home: day.opens } }), /isn't a page/);

  console.log('seed: ok');
})().catch(e => { console.error(e); process.exit(1); });
