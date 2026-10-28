// Self-check for visitor statistics (server/stats.js, server/countries.js, server/stats.mjs): node server/stats.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { spawnSync } = require('child_process');
const stats = require('./stats');
const { parse, lookup, createCountries } = require('./countries');
const { clientAddress } = require('./auth');
const { applyStats } = require('./seed');
const seed = require('./seed.json');

const HOUR = 3600e3, DAY = 24 * HOUR;
const t0 = Date.UTC(2026, 9, 28, 22, 30); // 2026-10-28 22:30 UTC

(async () => {
  // ---- Counting page opens ----
  let t = t0;
  const store = stats.open(':memory:');
  const visits = stats.createVisits({ store, countries: { lookup: ip => (ip === '36.80.0.1' ? 'ID' : '') }, now: () => t });
  const open = (body, request = {}) => visits.visit({ body: JSON.stringify(body), ip: '36.80.0.1', userAgent: 'Firefox', gpc: false, ...request });
  const day = d => store.summary(d, d);
  const tally = (s, dimension) => Object.fromEntries(s.tallies[dimension].map(x => [x.value, x.opens]));

  // Starting marks today, since a visitor counted before the restart may count again.
  assert.deepStrictEqual(day('2026-10-28').days, [{ day: '2026-10-28', opens: 0, uniques: 0, started: true }]);

  // A page open adds one to its day, to its hour, and to each of the four tallies on its own.
  assert.strictEqual(open({ page: 'game', referrer: 'www.Reddit.com', touch: true }), 204);
  assert.strictEqual(open({ page: 'privacy', referrer: '', touch: 'yes' }, { ip: '2001:db8::1' }), 204);
  let s = day('2026-10-28');
  assert.deepStrictEqual(s.days, [{ day: '2026-10-28', opens: 2, uniques: 2, started: true }]);
  assert.strictEqual(s.hours[22], 2);
  assert.strictEqual(s.hours.reduce((a, b) => a + b), 2);
  assert.deepStrictEqual(tally(s, 'page'), { game: 1, privacy: 1 });
  assert.deepStrictEqual(tally(s, 'referrer'), { 'reddit.com': 1, '': 1 });
  assert.deepStrictEqual(tally(s, 'country'), { ID: 1, '': 1 });
  assert.deepStrictEqual(tally(s, 'device'), { touch: 1, desktop: 1 }, 'only touch: true is a touch device');

  // A visitor is one address with one browser, counted once a day however many pages they open.
  open({ page: 'replay' });
  assert.deepStrictEqual(day('2026-10-28').days[0], { day: '2026-10-28', opens: 3, uniques: 2, started: true });
  open({ page: 'game' }, { userAgent: 'Chrome' });
  assert.strictEqual(day('2026-10-28').days[0].uniques, 3, 'another browser on the same address is another visitor');

  // From the next UTC midnight the same visitor is a unique visitor of the new day; the day before keeps its counts.
  t = Date.UTC(2026, 9, 29, 0, 5);
  open({ page: 'game' });
  assert.deepStrictEqual(day('2026-10-29').days, [{ day: '2026-10-29', opens: 1, uniques: 1, started: false }]);
  assert.strictEqual(day('2026-10-28').days[0].opens, 4);

  // One visitor adds at most 50 page opens a day, and is answered as counted past them; the next day counts them again.
  for (let i = 0; i < 60; i++) assert.strictEqual(open({ page: 'game' }, { ip: '10.0.0.1' }), 204);
  assert.deepStrictEqual(day('2026-10-29').days[0], { day: '2026-10-29', opens: 1 + stats.OPENS_PER_VISITOR_DAY, uniques: 2, started: false });
  t += DAY;
  open({ page: 'game' }, { ip: '10.0.0.1' });
  assert.deepStrictEqual(day('2026-10-30').days[0], { day: '2026-10-30', opens: 1, uniques: 1, started: false });

  // A browser sending Global Privacy Control is never counted, whatever it asks.
  const before = day('2026-10-30');
  assert.strictEqual(open({ page: 'game' }, { ip: '10.9.9.9', gpc: true }), 204);
  assert.strictEqual(open({ page: 'nope' }, { gpc: true }), 204);
  assert.deepStrictEqual(day('2026-10-30'), before);

  // A page that isn't one of the four, or a body that isn't JSON, is refused and counts nothing, not even the visitor.
  assert.strictEqual(open({ page: 'admin' }, { ip: '10.9.9.9' }), 400);
  assert.strictEqual(open(null, { ip: '10.9.9.9' }), 400);
  assert.strictEqual(visits.visit({ body: 'page=game', ip: '10.9.9.9', userAgent: '', gpc: false }), 400);
  assert.deepStrictEqual(day('2026-10-30'), before);

  // The referring site is kept only as a host name, lowercase and without www.; anything else is none.
  const sites = { 'www.Reddit.com': 'reddit.com', 'WWW.EXAMPLE.ORG': 'example.org', 'news.ycombinator.com': 'news.ycombinator.com',
    'www.': '', localhost: '', 'example.com:8080': '', 'https://reddit.com/r/x': '', '[::1]': '', 'a b.com': '', '': '',
    [`${'a'.repeat(250)}.com`]: '', 'xn--bcher-kva.example': 'xn--bcher-kva.example' };
  for (const [sent, kept] of Object.entries(sites)) assert.strictEqual(stats.referringSite(sent), kept, sent);
  assert.strictEqual(stats.referringSite(42), '');

  // ---- 25 months ----
  // A day is kept until the same calendar day 25 months later, or that month's last day when it has no such day.
  assert.strictEqual(stats.firstKept('2026-10-28'), '2024-09-28');
  assert.strictEqual(stats.firstKept('2026-01-15'), '2023-12-15');
  assert.strictEqual(stats.firstKept('2026-03-31'), '2024-02-29');
  assert.strictEqual(stats.firstKept('2027-03-31'), '2025-02-28');
  const old = stats.open(':memory:');
  const someDay = { opens: 1, uniques: 1, hours: [1, ...Array(23).fill(0)], page: { game: 1 }, referrer: { '': 1 }, country: { '': 1 }, device: { desktop: 1 } };
  for (const d of ['2024-09-27', '2024-09-28']) old.putDay(d, someDay);
  const sweeper = stats.createVisits({ store: old, countries: { lookup: () => '' }, now: () => t0 });
  assert.strictEqual(sweeper.sweep(), 1);
  assert.deepStrictEqual(old.summary('2024-09-27', '2024-09-27'), { days: [], hours: Array(24).fill(0), tallies: { page: [], referrer: [], country: [], device: [] } });
  assert.strictEqual(old.summary('2024-09-28', '2024-09-28').days[0].opens, 1);

  // ---- The visitor's address ----
  // As the guest limit finds it (the last X-Forwarded-For hop behind a proxy, else the socket), but whole, and an IPv4-mapped
  // IPv6 address as IPv4.
  const req = (socket, forwarded) => ({ socket: { remoteAddress: socket }, headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded } });
  assert.strictEqual(clientAddress(req('172.18.0.3', '1.1.1.1, ::ffff:36.80.0.1'), true), '36.80.0.1');
  assert.strictEqual(clientAddress(req('172.18.0.3', '1.1.1.1, 36.80.0.1'), false), '172.18.0.3');
  assert.strictEqual(clientAddress(req('::ffff:10.0.0.1'), true), '10.0.0.1');
  assert.strictEqual(clientAddress(req('2001:db8:1:2:3:4:5:6'), false), '2001:db8:1:2:3:4:5:6');

  // ---- Countries ----
  const CSV = [
    '0.0.0.0,0.255.255.255,ZZ',
    '1.0.0.0,1.0.0.255,AU',
    '1.0.1.0,1.0.3.255,CN',
    '1.0.4.0,255.255.255.255,US',
    '::,1fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff,ZZ',
    '2000::,2001:db7:ffff:ffff:ffff:ffff:ffff:ffff,DE',
    '2001:db8::,2001:db8::ffff,FI',
    '2001:db8::1:0,2001:db8::ffff:ffff:ffff,JP',
    '2001:db8:0:0:1::,ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff,SE',
  ].join('\r\n') + '\r\n';
  const table = parse(CSV);
  const at = {
    '0.0.0.0': '', '0.255.255.255': '', '1.0.0.0': 'AU', '1.0.0.255': 'AU', '1.0.1.0': 'CN', '1.0.3.255': 'CN', '1.0.4.0': 'US', '255.255.255.255': 'US',
    '::ffff:1.0.0.255': 'AU', '::ffff:1.0.1.0': 'CN', '::FFFF:100:3ff': 'CN', '::ffff:0:0': '',
    '::1': '', '1fff:ffff:ffff:ffff:ffff:ffff:ffff:ffff': '', '2000::': 'DE', '2001:db7:ffff:ffff:ffff:ffff:ffff:ffff': 'DE',
    '2001:db8::': 'FI', '2001:db8::ffff': 'FI', '2001:db8::1:0': 'JP', '2001:db8:0:0:0:ffff:ffff:ffff': 'JP', '2001:db8:0:0:1::': 'SE',
    'ffff:ffff:ffff:ffff:ffff:ffff:ffff:ffff': 'SE', 'fe80::1%eth0': 'SE',
    '': '', 'not an address': '', '1.0.0.256': '', '1.0.0': '', '2001:db8:::1': '', '1:2:3:4:5:6:7:8:9': '', '1::2::3': '',
  };
  for (const [ip, country] of Object.entries(at)) assert.strictEqual(lookup(table, ip), country, ip);
  assert.strictEqual(lookup(null, '1.0.0.0'), '', 'no table: unknown');
  // A damaged file is refused rather than used.
  assert.throws(() => parse(CSV.replace('1.0.1.0,', '0.0.0.9,')), /line 3: out of order/);
  assert.throws(() => parse(CSV.replace('2001:db8::1:0,', '2001:db8::1:0:0:0:0:0:0,')), /line 8: not an IPv6 address/);
  assert.throws(() => parse(CSV.replace(',AU', ',Australia')), /line 2: not start,end,CC/);
  assert.throws(() => parse(CSV.split('\r\n').slice(0, 4).join('\n')), /no IPv4 or no IPv6/);

  // The file in data/: this month's, else last month's while this month's isn't out; a newer month replaces the older file.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-stats-'));
  const gz = zlib.gzipSync(CSV), logs = [], asked = [];
  let published = { '2026-10': gz };
  const fetch = async url => {
    asked.push(url);
    const month = /lite-(\d{4}-\d{2})\.csv\.gz$/.exec(url)[1];
    if (published === null) throw new Error('offline');
    const data = published[month];
    return data ? { ok: true, status: 200, arrayBuffer: async () => data.buffer.slice(data.byteOffset, data.byteOffset + data.length) } : { ok: false, status: 404 };
  };
  let when = Date.UTC(2026, 10, 2);
  const files = () => fs.readdirSync(dir).sort();
  const countries = createCountries({ dir, fetch, now: () => when, log: line => logs.push(line) });
  await countries.start();
  assert.deepStrictEqual(asked.map(u => u.slice(-14)), ['2026-11.csv.gz', '2026-10.csv.gz']);
  assert.strictEqual(asked[0], 'https://download.db-ip.com/free/dbip-country-lite-2026-11.csv.gz');
  assert.deepStrictEqual(files(), ['dbip-country-lite-2026-10.csv.gz']);
  assert.strictEqual(countries.lookup('1.0.1.0'), 'CN');
  // Checked again while this month's isn't out: last month's stays, and isn't downloaded again.
  asked.length = 0;
  await countries.check();
  assert.deepStrictEqual(asked.map(u => u.slice(-14)), ['2026-11.csv.gz']);
  // A damaged download, or none, keeps the table there is.
  published = { '2026-11': zlib.gzipSync('1.0.0.0,1.0.0.255,AU\n0.0.0.0,0.0.0.255,ZZ\n::,ffff::,ZZ\n') };
  await countries.check();
  published = null;
  await countries.check();
  assert.strictEqual(countries.lookup('1.0.1.0'), 'CN');
  assert.deepStrictEqual(files(), ['dbip-country-lite-2026-10.csv.gz']);
  assert.ok(logs.some(l => /still using dbip-country-lite-2026-10\.csv\.gz: line 2: out of order/.test(l)), logs.join('\n'));
  // A server started again loads the file it kept, and a newer month's replaces it.
  published = { '2026-11': zlib.gzipSync(CSV.replace(',CN', ',TW')) };
  const restarted = createCountries({ dir, fetch, now: () => when, log: () => {} });
  await restarted.start();
  assert.strictEqual(restarted.lookup('1.0.1.0'), 'TW');
  assert.deepStrictEqual(files(), ['dbip-country-lite-2026-11.csv.gz']);
  // With no file and no download, every country is unknown.
  const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-stats-'));
  const none = createCountries({ dir: empty, fetch, now: () => when, log: line => logs.push(line) });
  published = null;
  await none.start();
  assert.strictEqual(none.lookup('1.0.1.0'), '');
  assert.match(logs.at(-1), /so countries are unknown: offline/);

  // ---- The report (npm run stats) ----
  const { report } = await import('./stats.mjs');
  const file = path.join(dir, 'stats.db'), seeded = stats.open(file);
  applyStats(seed.visitorStatistics, seeded, t0);
  const sum = list => list.reduce((a, b) => a + b, 0);
  const days = seed.visitorStatistics, from = stats.dayOf(t0 - Math.max(...days.map(d => d.daysAgo)) * DAY), to = stats.dayOf(t0);
  const lines = report(seeded, { from, to, tz: 7, file: 'seeded' });
  const text = lines.join('\n');
  // Each day, with a mark on the days the server started; the totals, unique visitors summed over the days.
  const dayLines = lines.filter(l => /^\d{4}-\d{2}-\d{2} /.test(l));
  assert.strictEqual(dayLines.length, days.length);
  assert.strictEqual(dayLines.filter(l => / \* /.test(l)).length, days.filter(d => d.started).length);
  assert.ok(text.includes(`Page opens: ${sum(days.map(d => d.opens)).toLocaleString('en-US')}\n`), text);
  assert.ok(text.includes(`Unique visitors, summed over the days: ${sum(days.map(d => d.uniques)).toLocaleString('en-US')} `), text);
  // The ten largest referring sites by name, then the rest as other, then none.
  const referrers = {};
  for (const d of days) for (const [site, n] of Object.entries(d.referrer)) referrers[site] = (referrers[site] ?? 0) + n;
  const named = Object.entries(referrers).filter(([site]) => site).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1));
  assert.ok(named.length > 10, 'the seed has more than ten referring sites');
  const section = heading => lines.slice(lines.findIndex(l => l.startsWith(heading)) + 1).filter((l, i, all) => all.slice(0, i + 1).every(x => x.startsWith('  ')));
  const listed = section('Referring sites').map(l => l.trim().split(/\s{2,}/));
  assert.deepStrictEqual(listed.map(r => r[0]), [...named.slice(0, 10).map(([site]) => site), 'other', 'none']);
  assert.strictEqual(listed.at(-2)[1], sum(named.slice(10).map(([, n]) => n)).toLocaleString('en-US'));
  // The hours, shifted by --tz: 07 in UTC+7 is midnight UTC.
  const hour = h => section('Page opens by hour').find(l => l.startsWith(`  ${h}  `)).trim().split(/\s+/)[1];
  assert.match(text, /Page opens by hour \(UTC\+7\)/);
  assert.strictEqual(hour('07'), sum(days.map(d => d.hours[0])).toLocaleString('en-US'));
  assert.strictEqual(hour('06'), sum(days.map(d => d.hours[23])).toLocaleString('en-US'));

  // The command reads the file while the server has it open; a file with nothing says so in one line; no file fails.
  const command = args => spawnSync(process.execPath, [path.join(__dirname, 'stats.mjs'), ...args], { encoding: 'utf8', env: { ...process.env, RG_STATS_DB: '' } });
  const run = command(['--db', file, '--from', from, '--to', to]);
  assert.strictEqual(run.status, 0, run.stderr);
  assert.ok(run.stdout.includes(`Page opens: ${sum(days.map(d => d.opens)).toLocaleString('en-US')}\n`), run.stdout);
  const blank = path.join(dir, 'blank.db');
  stats.open(blank).close();
  const nothing = command(['--db', blank]);
  assert.strictEqual(nothing.status, 0, nothing.stderr);
  assert.strictEqual(nothing.stdout.trim().split('\n').length, 1);
  assert.match(nothing.stdout, /RG_STATS=1/);
  const missing = command(['--db', path.join(dir, 'missing.db')]);
  assert.strictEqual(missing.status, 1);
  assert.match(missing.stderr, /No visitor statistics file at .*missing\.db/);
  assert.strictEqual(command(['--days', '0']).status, 2);

  seeded.close();
  fs.rmSync(dir, { recursive: true, force: true });
  fs.rmSync(empty, { recursive: true, force: true });
  console.log('stats: ok');
})().catch(e => { console.error(e); process.exit(1); });
