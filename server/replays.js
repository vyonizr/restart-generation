// Replays (CONTEXT.md), kept in their own SQLite file apart from the accounts (server/gateway.js picks it): one replay per online
// battle that began, for 30 days, found by an id that can't be guessed.
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');

const KEEP_MS = 30 * 24 * 3600 * 1000;

// meta is what the replay page shows around the battle (JSON); text is the engine's replay text (server/replay.js).
// players lists the accounts that played, so deleting one deletes its replays.
const SCHEMA = `
  CREATE TABLE IF NOT EXISTS replays (
    id TEXT PRIMARY KEY,
    created INTEGER NOT NULL,
    meta TEXT NOT NULL,
    text TEXT NOT NULL
  ) WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS replays_age ON replays (created);
  CREATE TABLE IF NOT EXISTS players (
    replay TEXT NOT NULL,
    account TEXT NOT NULL,
    PRIMARY KEY (account, replay)
  ) WITHOUT ROWID;
`;

function open(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);
  const q = {
    insert: db.prepare('INSERT INTO replays (id, created, meta, text) VALUES (?, ?, ?, ?)'),
    player: db.prepare('INSERT OR IGNORE INTO players (replay, account) VALUES (?, ?)'),
    replace: db.prepare('INSERT INTO replays (id, created, meta, text) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET created = excluded.created, meta = excluded.meta, text = excluded.text'),
    dropPlayers: db.prepare('DELETE FROM players WHERE replay = ?'),
    get: db.prepare('SELECT created, meta, text FROM replays WHERE id = ? AND created > ?'),
    list: db.prepare('SELECT r.id, r.created FROM replays r JOIN players p ON p.replay = r.id WHERE p.account = ? AND r.created > ? ORDER BY r.created, r.id'),
    listed: db.prepare('SELECT r.id, r.created, r.meta FROM replays r JOIN players p ON p.replay = r.id WHERE p.account = ? AND r.created > ? ORDER BY r.created DESC, r.id'),
    dropOfAccount: db.prepare('DELETE FROM replays WHERE id IN (SELECT replay FROM players WHERE account = ?)'),
    expired: db.prepare('DELETE FROM replays WHERE created <= ?'),
    orphans: db.prepare('DELETE FROM players WHERE replay NOT IN (SELECT id FROM replays)'),
    move: db.prepare('UPDATE OR IGNORE players SET account = ? WHERE account = ?'),
    dropAccount: db.prepare('DELETE FROM players WHERE account = ?'),
  };
  const inTransaction = fn => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  return {
    // { created, text, accounts: [account id], meta } → the new replay's id.
    save({ created, text, accounts, meta }) {
      const id = crypto.randomBytes(12).toString('base64url');
      inTransaction(() => {
        q.insert.run(id, created, JSON.stringify(meta), text);
        for (const account of new Set(accounts)) q.player.run(id, String(account));
      });
      return id;
    },
    // A replay under an id the caller chose, as a seed replay (docs/adr/0023): replaces one with that id and its players.
    put({ id, created, text, accounts, meta }) {
      inTransaction(() => {
        q.replace.run(id, created, JSON.stringify(meta), text);
        q.dropPlayers.run(id);
        for (const account of new Set(accounts)) q.player.run(id, String(account));
      });
    },
    // { text, meta } while the replay is younger than 30 days at `now`, else null.
    get(id, now) {
      const row = q.get.get(id, now - KEEP_MS);
      return row ? { text: row.text, meta: { ...JSON.parse(row.meta), created: row.created } } : null;
    },
    // [{ id, created }] of the replays of battles `account` played that are younger than 30 days at `now`, oldest first.
    ofAccount(account, now) { return q.list.all(String(account), now - KEEP_MS).map(r => ({ id: r.id, created: r.created })); },
    // The replays listed under the account's name (ADR 0024): [{ id, created, expires, ...meta }], newest first, as ofAccount's.
    listOf(account, now) {
      return q.listed.all(String(account), now - KEEP_MS).map(r => ({ ...JSON.parse(r.meta), id: r.id, created: r.created, expires: r.created + KEEP_MS }));
    },
    removeAccount(account) { inTransaction(() => { q.dropOfAccount.run(String(account)); q.orphans.run(); }); },
    // The replays of `from` become `to`'s, as when a guest signs in to a member that already exists (ADR 0024). A battle both
    // played stays listed once.
    moveAccount(from, to) { inTransaction(() => { q.move.run(String(to), String(from)); q.dropAccount.run(String(from)); }); },
    // Deletes every replay 30 days old at `now`; returns how many.
    sweep(now) { return inTransaction(() => { const n = Number(q.expired.run(now - KEEP_MS).changes); q.orphans.run(); return n; }); },
    close() { db.close(); },
  };
}

module.exports = { open, KEEP_MS };
