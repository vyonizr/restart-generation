// Visitor statistics (CONTEXT.md, docs/adr/0043), counted by the gateway itself on a public server whose admin sets RG_STATS=1,
// and kept in their own SQLite file (server/gateway.js picks it). Each day keeps its page opens and unique visitors, the page opens
// of each hour, and one count per kind of page, per referring site, per country and per kind of device, each on its own: no row
// holds two of them together, so no row can single out a visitor. Days are UTC, and are deleted after 25 months.
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');

const PAGES = ['game', 'replay', 'terms', 'privacy'];
const DEVICES = ['desktop', 'touch'];
const DIMENSIONS = ['page', 'referrer', 'country', 'device'];
const MONTHS_KEPT = 25; // the CNIL's recommended limit for audience measurement
const OPENS_PER_VISITOR_DAY = 50; // one visitor's page opens counted in a day: a script can't inflate the counts past it

// `started` marks a day the server started on: its visitors already counted that day may count again (createVisits).
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS days (day TEXT PRIMARY KEY, opens INTEGER NOT NULL DEFAULT 0, uniques INTEGER NOT NULL DEFAULT 0, started INTEGER NOT NULL DEFAULT 0) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS hours (day TEXT NOT NULL, hour INTEGER NOT NULL, opens INTEGER NOT NULL, PRIMARY KEY (day, hour)) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS tallies (day TEXT NOT NULL, dimension TEXT NOT NULL, value TEXT NOT NULL, opens INTEGER NOT NULL, PRIMARY KEY (day, dimension, value)) WITHOUT ROWID;
`;

const dayOf = t => new Date(t).toISOString().slice(0, 10);

// The first day kept on `day`: the same calendar day 25 months before, or that month's last day when it has no such day
// (2027-03-31 keeps 2025-02-28 on).
function firstKept(day) {
  const [y, m, d] = day.split('-').map(Number);
  const months = y * 12 + (m - 1) - MONTHS_KEPT, year = Math.floor(months / 12), month = months % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return dayOf(Date.UTC(year, month, Math.min(d, last)));
}

// A referring site as the server keeps it: lowercase, without a leading www., and only when it is a host name; else '' (none).
function referringSite(text) {
  const host = (typeof text === 'string' ? text : '').toLowerCase().replace(/^www\./, '');
  return host.length <= 253 && /^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(host) ? host : '';
}

// The statistics file. `readOnly` is for the report (server/stats.mjs), which reads it while the server writes.
function open(file, { readOnly = false } = {}) {
  const db = new DatabaseSync(file, { readOnly });
  if (!readOnly) {
    db.exec('PRAGMA journal_mode = WAL');
    // Every page open is a write. In WAL mode, NORMAL skips the disk sync of each one and still never corrupts the file; a power
    // cut may lose the last few counts, which is fine for counts.
    db.exec('PRAGMA synchronous = NORMAL');
    db.exec(SCHEMA);
  }
  const q = {
    open: db.prepare('INSERT INTO days (day, opens, uniques) VALUES (?, 1, ?) ON CONFLICT (day) DO UPDATE SET opens = opens + 1, uniques = uniques + excluded.uniques'),
    hour: db.prepare('INSERT INTO hours (day, hour, opens) VALUES (?, ?, 1) ON CONFLICT (day, hour) DO UPDATE SET opens = opens + 1'),
    tally: db.prepare('INSERT INTO tallies (day, dimension, value, opens) VALUES (?, ?, ?, 1) ON CONFLICT (day, dimension, value) DO UPDATE SET opens = opens + 1'),
    started: db.prepare('INSERT INTO days (day, started) VALUES (?, 1) ON CONFLICT (day) DO UPDATE SET started = 1'),
    putDay: db.prepare('INSERT INTO days (day, opens, uniques, started) VALUES (?, ?, ?, ?)'),
    putHour: db.prepare('INSERT INTO hours (day, hour, opens) VALUES (?, ?, ?)'),
    putTally: db.prepare('INSERT INTO tallies (day, dimension, value, opens) VALUES (?, ?, ?, ?)'),
    drop: ['days', 'hours', 'tallies'].map(t => db.prepare(`DELETE FROM ${t} WHERE day = ?`)),
    before: ['days', 'hours', 'tallies'].map(t => db.prepare(`DELETE FROM ${t} WHERE day < ?`)),
    any: db.prepare('SELECT 1 FROM days LIMIT 1'),
    days: db.prepare('SELECT day, opens, uniques, started FROM days WHERE day BETWEEN ? AND ? ORDER BY day'),
    hours: db.prepare('SELECT hour, SUM(opens) AS opens FROM hours WHERE day BETWEEN ? AND ? GROUP BY hour'),
    tallies: db.prepare('SELECT dimension, value, SUM(opens) AS opens FROM tallies WHERE day BETWEEN ? AND ? GROUP BY dimension, value ORDER BY opens DESC, value'),
  };
  const inTransaction = fn => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  return {
    // One page open: { day, hour, unique (the visitor's first today), page, referrer, country, device }.
    add: o => inTransaction(() => {
      q.open.run(o.day, o.unique ? 1 : 0);
      q.hour.run(o.day, o.hour);
      for (const d of DIMENSIONS) q.tally.run(o.day, d, o[d]);
    }),
    started: day => { q.started.run(day); },
    // Deletes every day before `day`. Returns how many days went.
    deleteBefore: day => inTransaction(() => { const n = Number(q.before[0].run(day).changes); q.before[1].run(day); q.before[2].run(day); return n; }),
    // Puts a whole day back to the given counts (server/seed.js): { opens, uniques, started, hours: [24], page: { value: opens }, ... }.
    putDay: (day, d) => inTransaction(() => {
      for (const s of q.drop) s.run(day);
      q.putDay.run(day, d.opens, d.uniques, d.started ? 1 : 0);
      d.hours.forEach((opens, hour) => { if (opens) q.putHour.run(day, hour, opens); });
      for (const dim of DIMENSIONS) for (const [value, opens] of Object.entries(d[dim])) if (opens) q.putTally.run(day, dim, value, opens);
    }),
    // Whether the file has any day at all.
    any: () => Boolean(q.any.get()),
    // The days from `from` to `to` (inclusive): { days: [{ day, opens, uniques, started }], hours: [24 sums], tallies: { page:
    // [{ value, opens }] largest first, referrer, country, device } }.
    summary: (from, to) => {
      const hours = Array(24).fill(0), tallies = Object.fromEntries(DIMENSIONS.map(d => [d, []]));
      for (const r of q.hours.all(from, to)) hours[r.hour] = Number(r.opens);
      for (const r of q.tallies.all(from, to)) tallies[r.dimension]?.push({ value: r.value, opens: Number(r.opens) });
      const days = q.days.all(from, to).map(r => ({ day: r.day, opens: Number(r.opens), uniques: Number(r.uniques), started: Boolean(r.started) }));
      return { days, hours, tallies };
    },
    close: () => db.close(),
  };
}

// Counts the page opens that POST /visit reports (server/gateway.js). A visitor is told apart by a hash of the day's salt, their IP
// address and their browser's name. The salt is 32 random bytes made when the day starts, kept only in memory: at the next UTC
// midnight it and the day's hashes are replaced, so nothing ties one day's visitor to another's, and nothing made from an address
// is ever written down. The address is used for the country and the hash, then dropped; it is never logged.
// opts: store (open()), countries ({ lookup(ip) -> 'CC' or '' }), now, random (n -> n random bytes).
// Making one marks today as a day the server started, since its set of today's visitors starts empty.
function createVisits({ store, countries, now = Date.now, random = crypto.randomBytes }) {
  let today = '', salt = null, seen = new Map(); // hash -> the visitor's page opens counted today

  const turn = t => {
    const day = dayOf(t);
    if (day !== today) { today = day; salt = random(32); seen = new Map(); }
    return day;
  };
  store.started(turn(now()));

  // One request: { body (its text), ip, userAgent, gpc (it sent Sec-GPC: 1) } -> the HTTP status to answer. A browser that sends
  // Global Privacy Control is never counted, nor a visitor past their page opens for the day; both are answered as counted.
  function visit({ body, ip, userAgent, gpc }) {
    if (gpc) return 204;
    let asked = null;
    try { asked = JSON.parse(body); } catch { /* answered as a page that isn't one */ }
    if (!asked || !PAGES.includes(asked.page)) return 400;
    const t = now(), day = turn(t);
    const hash = crypto.createHash('sha256').update(salt).update(`${ip}\n${userAgent}`).digest('base64');
    const opens = seen.get(hash) ?? 0;
    if (opens >= OPENS_PER_VISITOR_DAY) return 204;
    seen.set(hash, opens + 1);
    store.add({ day, hour: new Date(t).getUTCHours(), unique: opens === 0, page: asked.page, referrer: referringSite(asked.referrer),
      country: countries.lookup(ip), device: asked.touch === true ? 'touch' : 'desktop' });
    return 204;
  }

  // Every hour (server/gateway.js): a new day's salt and set of visitors from its midnight on, and days past 25 months deleted.
  // Returns how many days went.
  const sweep = () => store.deleteBefore(firstKept(turn(now())));

  return { visit, sweep };
}

module.exports = { open, createVisits, referringSite, firstKept, dayOf, PAGES, DEVICES, DIMENSIONS, OPENS_PER_VISITOR_DAY };
