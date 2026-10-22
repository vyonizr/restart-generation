// Account storage (ADR 0010): SQLite through node:sqlite. Every account SQL statement in the server lives here; replays have their
// own file and module (server/replays.js).
// An account is one object per id for as long as it is cached, so sessions can compare accounts by identity.
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');

// kind: 'guest' (temporary, ADR 0011), 'member' (signed in with Discord) or 'named' (name-only servers, ADR 0009).
// Only guests are left out of the rankings.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE,
    kind TEXT NOT NULL CHECK (kind IN ('guest', 'member', 'named')),
    discord_id TEXT UNIQUE,
    created INTEGER NOT NULL,
    last_active INTEGER NOT NULL,
    fame INTEGER NOT NULL DEFAULT 0,
    matches INTEGER NOT NULL DEFAULT 0,
    wins INTEGER NOT NULL DEFAULT 0,
    rescues INTEGER NOT NULL DEFAULT 0,
    highest_fame INTEGER NOT NULL DEFAULT 0,
    favourite_hero INTEGER NOT NULL DEFAULT -1,
    achievements TEXT
  );
  CREATE INDEX IF NOT EXISTS accounts_ranked ON accounts (fame DESC, id) WHERE kind != 'guest';
  CREATE INDEX IF NOT EXISTS accounts_guest_age ON accounts (last_active) WHERE kind = 'guest';
  CREATE TABLE IF NOT EXISTS tokens (
    hash TEXT PRIMARY KEY,
    account INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    expires INTEGER
  ) WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS tokens_account ON tokens (account);
  CREATE TABLE IF NOT EXISTS friends (
    a INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    b INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    state TEXT NOT NULL CHECK (state IN ('to', 'from', 'both')),
    PRIMARY KEY (a, b)
  ) WITHOUT ROWID;
  CREATE TABLE IF NOT EXISTS saves (
    account INTEGER NOT NULL REFERENCES accounts (id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    data BLOB NOT NULL,
    PRIMARY KEY (account, name)
  ) WITHOUT ROWID;
`;

const hash = token => crypto.createHash('sha256').update(String(token)).digest('hex');
const like = s => s.replace(/[\\%_]/g, c => '\\' + c) + '%';

function open(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);
  const q = {};
  const sql = (name, text) => { q[name] = db.prepare(text); };
  sql('byId', 'SELECT * FROM accounts WHERE id = ?');
  sql('byName', 'SELECT * FROM accounts WHERE name = ?');
  sql('byDiscord', 'SELECT * FROM accounts WHERE discord_id = ?');
  sql('byToken', 'SELECT a.*, t.expires AS token_expires FROM tokens t JOIN accounts a ON a.id = t.account WHERE t.hash = ?');
  sql('dates', 'SELECT created, last_active FROM accounts WHERE id = ?');
  sql('insert', 'INSERT INTO accounts (name, kind, discord_id, created, last_active) VALUES (?, ?, ?, ?, ?)');
  sql('upsert', 'INSERT INTO accounts (name, kind, discord_id, created, last_active) VALUES (?, ?, ?, ?, ?) ON CONFLICT (name) DO UPDATE SET kind = excluded.kind, discord_id = excluded.discord_id, created = excluded.created, last_active = excluded.last_active');
  sql('touch', 'UPDATE accounts SET last_active = ? WHERE id = ?');
  sql('save', 'UPDATE accounts SET fame = ?, matches = ?, wins = ?, rescues = ?, highest_fame = ?, favourite_hero = ?, achievements = ? WHERE id = ?');
  sql('promote', "UPDATE accounts SET kind = 'member', name = ?, discord_id = ? WHERE id = ?");
  sql('remove', 'DELETE FROM accounts WHERE id = ?');
  sql('addToken', 'INSERT INTO tokens (hash, account, expires) VALUES (?, ?, ?)');
  sql('putToken', 'INSERT INTO tokens (hash, account, expires) VALUES (?, ?, ?) ON CONFLICT (hash) DO UPDATE SET account = excluded.account, expires = excluded.expires');
  sql('renewToken', 'UPDATE tokens SET expires = ? WHERE hash = ?');
  sql('dropToken', 'DELETE FROM tokens WHERE hash = ?');
  sql('dropTokens', 'DELETE FROM tokens WHERE account = ?');
  sql('expiredTokens', 'DELETE FROM tokens WHERE expires IS NOT NULL AND expires < ?');
  sql('staleGuests', "SELECT id FROM accounts WHERE kind = 'guest' AND last_active < ?");
  sql('countGuests', "SELECT COUNT(*) AS n FROM accounts WHERE kind = 'guest'");
  sql('links', 'SELECT b, state FROM friends WHERE a = ?');
  sql('link', 'SELECT state FROM friends WHERE a = ? AND b = ?');
  sql('setLink', 'INSERT INTO friends (a, b, state) VALUES (?, ?, ?) ON CONFLICT (a, b) DO UPDATE SET state = excluded.state');
  sql('clearLink', 'DELETE FROM friends WHERE a = ? AND b = ?');
  sql('saves', 'SELECT name, data FROM saves WHERE account = ? ORDER BY name');
  sql('putSave', 'INSERT INTO saves (account, name, data) VALUES (?, ?, ?) ON CONFLICT (account, name) DO UPDATE SET data = excluded.data');
  sql('dropSave', 'DELETE FROM saves WHERE account = ? AND name = ?');
  sql('saveUsage', 'SELECT COUNT(*) AS files, COALESCE(SUM(LENGTH(data)), 0) AS bytes FROM saves WHERE account = ? AND name != ?');
  sql('find', "SELECT * FROM accounts WHERE name LIKE ? ESCAPE '\\' ORDER BY id LIMIT ?");
  sql('window', "SELECT * FROM accounts WHERE kind != 'guest' ORDER BY fame DESC, id LIMIT ? OFFSET ?");
  sql('rankOf', "SELECT COUNT(*) AS n FROM accounts WHERE kind != 'guest' AND (fame > ? OR (fame = ? AND id < ?))");

  const cache = new Map(); // id -> account
  const account = row => {
    if (!row) return null;
    const id = String(row.id);
    let acc = cache.get(id);
    if (!acc) {
      acc = {
        id, name: row.name, kind: row.kind, discordId: row.discord_id, achievements: row.achievements,
        stats: { fame: row.fame, matches: row.matches, wins: row.wins, rescues: row.rescues, favouriteHero: row.favourite_hero, highestFame: row.highest_fame },
      };
      cache.set(id, acc);
    }
    return acc;
  };
  const transaction = fn => {
    db.exec('BEGIN');
    try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; }
  };

  return {
    byId: id => account(q.byId.get(Number(id))),
    byName: name => account(q.byName.get(String(name))),
    byDiscord: id => account(q.byDiscord.get(String(id))),
    // The account a token belongs to, or null if it is unknown or expired. A token that expires is pushed out to `renewTo`.
    byToken(token, now, renewTo) {
      const row = q.byToken.get(hash(token));
      if (!row || (row.token_expires !== null && row.token_expires < now)) return null;
      if (renewTo && row.token_expires !== null) q.renewToken.run(renewTo, hash(token));
      return account(row);
    },
    // When the account was made and last used, in milliseconds since 1970.
    dates(acc) { const r = q.dates.get(Number(acc.id)); return { created: r.created, lastActive: r.last_active }; },
    create(name, kind, now, discordId = null) {
      return account(q.byId.get(q.insert.run(name, kind, discordId, now, now).lastInsertRowid));
    },
    // A seed account (docs/adr/0023): made, or brought back to the seed's kind, Discord ID and dates. Stats are save()'s.
    upsert({ name, kind, discordId = null, created, lastActive }) {
      q.upsert.run(name, kind, discordId, created, lastActive);
      const acc = account(q.byName.get(name));
      acc.name = name; acc.kind = kind; acc.discordId = discordId;
      return acc;
    },
    // A fresh token for the account, which the caller hands to the browser. Only its hash is stored.
    issueToken(acc, expires = null) {
      const token = crypto.randomBytes(32).toString('base64url');
      q.addToken.run(hash(token), Number(acc.id), expires);
      return token;
    },
    // A token the caller already holds, as a seed account's: stored by its hash, moved to `acc` if another account had it.
    putToken(acc, token, expires = null) { q.putToken.run(hash(token), Number(acc.id), expires); },
    revokeToken: token => { q.dropToken.run(hash(token)); },
    revokeTokens: acc => { q.dropTokens.run(Number(acc.id)); },
    dropExpiredTokens: now => { q.expiredTokens.run(now); },
    touch: (acc, now) => { if (!acc.bot) q.touch.run(now, Number(acc.id)); },
    // Writes what the game changes: stats and achievements. Bots have no row.
    save(acc) {
      if (acc.bot) return;
      const s = acc.stats;
      q.save.run(s.fame, s.matches, s.wins, s.rescues, s.highestFame ?? s.fame, s.favouriteHero, acc.achievements ?? null, Number(acc.id));
    },
    // A guest becomes a member: same id, so its friend links, stats and tokens carry over.
    promote(acc, name, discordId) {
      q.promote.run(name, discordId, Number(acc.id));
      acc.name = name; acc.kind = 'member'; acc.discordId = discordId;
    },
    remove(acc) { q.remove.run(Number(acc.id)); cache.delete(acc.id); },
    guestCount: () => q.countGuests.get().n,
    // Deletes guests idle since before `cutoff`, with their links and tokens, unless busy(id) says one is online.
    sweepGuests(cutoff, busy) {
      let n = 0;
      for (const { id } of q.staleGuests.all(cutoff)) {
        if (busy(String(id))) continue;
        q.remove.run(id); cache.delete(String(id)); n++;
      }
      return n;
    },
    // Friend links. `state` is what the first account sees: 'to' (it asked), 'from' (it was asked) or 'both'.
    friends: acc => q.links.all(Number(acc.id)).map(r => ({ account: account(q.byId.get(r.b)), state: r.state })),
    linkState: (a, b) => q.link.get(Number(a.id), Number(b.id))?.state,
    setLinks(a, b, stateA, stateB) {
      const set = (x, y, state) => state ? q.setLink.run(Number(x.id), Number(y.id), state) : q.clearLink.run(Number(x.id), Number(y.id));
      transaction(() => { set(a, b, stateA); set(b, a, stateB); });
    },
    // A member's saved game (ADR 0014): the engine's files, kept as the browser sent them and never read by the server.
    // They go with the account when it is deleted.
    saves: acc => q.saves.all(Number(acc.id)).map(r => ({ name: r.name, data: Buffer.from(r.data) })),
    putSave: (acc, name, data) => { q.putSave.run(Number(acc.id), name, data); },
    dropSave: (acc, name) => { q.dropSave.run(Number(acc.id), name); },
    // How many files and bytes the account holds apart from `except`, the one a write is about to replace.
    saveUsage: (acc, except) => q.saveUsage.get(Number(acc.id), except),
    findByPrefix: (prefix, limit) => q.find.all(like(prefix), limit).map(account),
    // Rankings list everyone but guests, by fame, oldest account first among equals.
    ranking: (offset, limit) => q.window.all(limit, Math.max(0, offset)).map(account),
    // The 1-based place the account holds or, for a guest, would hold.
    rank: acc => q.rankOf.get(acc.stats.fame, acc.stats.fame, Number(acc.id)).n + 1,
    close: () => db.close(),
  };
}

module.exports = { open };
