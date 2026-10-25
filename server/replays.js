// Replays (CONTEXT.md), kept in their own SQLite file apart from the accounts (server/gateway.js picks it): one replay per online
// battle that began, found by an id that can't be guessed. Each account keeps the replays of its last KEEP battles, and a replay
// goes once no account keeps it (docs/adr/0034).
const { DatabaseSync } = require('node:sqlite');
const crypto = require('crypto');

const KEEP = 25;

// meta is what the replay page shows around the battle (JSON); text is the engine's replay text (server/replay.js).
// players lists the accounts that played and the seat each played in (null where it isn't known yet; sweep fills it in).
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
    seat INTEGER,
    PRIMARY KEY (account, replay)
  ) WITHOUT ROWID;
  CREATE INDEX IF NOT EXISTS players_replay ON players (replay);
`;

function open(file) {
  const db = new DatabaseSync(file);
  db.exec('PRAGMA journal_mode = WAL');
  db.exec(SCHEMA);
  // A file from before seats were kept: its rows get theirs from the next sweep.
  if (!db.prepare('PRAGMA table_info(players)').all().some(c => c.name === 'seat')) db.exec('ALTER TABLE players ADD COLUMN seat INTEGER');
  const q = {
    insert: db.prepare('INSERT INTO replays (id, created, meta, text) VALUES (?, ?, ?, ?)'),
    player: db.prepare('INSERT OR IGNORE INTO players (replay, account, seat) VALUES (?, ?, ?)'),
    replace: db.prepare('INSERT INTO replays (id, created, meta, text) VALUES (?, ?, ?, ?) ON CONFLICT (id) DO UPDATE SET created = excluded.created, meta = excluded.meta, text = excluded.text'),
    dropPlayers: db.prepare('DELETE FROM players WHERE replay = ?'),
    get: db.prepare('SELECT created, meta, text FROM replays WHERE id = ?'),
    list: db.prepare('SELECT r.id, r.created FROM replays r JOIN players p ON p.replay = r.id WHERE p.account = ? ORDER BY r.created, r.id'),
    listed: db.prepare('SELECT r.id, r.created, r.meta, p.seat FROM replays r JOIN players p ON p.replay = r.id WHERE p.account = ? ORDER BY r.created DESC, r.id'),
    // An account's replays past its newest KEEP, in the order listed shows them.
    beyond: db.prepare('SELECT p.replay FROM players p JOIN replays r ON r.id = p.replay WHERE p.account = ? ORDER BY r.created DESC, r.id LIMIT -1 OFFSET ?'),
    dropPlayer: db.prepare('DELETE FROM players WHERE account = ? AND replay = ?'),
    dropIfUnkept: db.prepare('DELETE FROM replays WHERE id = ? AND NOT EXISTS (SELECT 1 FROM players WHERE replay = ?)'),
    dropOfAccount: db.prepare('DELETE FROM replays WHERE id IN (SELECT replay FROM players WHERE account = ?)'),
    unkept: db.prepare('DELETE FROM replays WHERE id NOT IN (SELECT replay FROM players)'),
    orphans: db.prepare('DELETE FROM players WHERE replay NOT IN (SELECT id FROM replays)'),
    move: db.prepare('UPDATE OR IGNORE players SET account = ? WHERE account = ?'),
    dropAccount: db.prepare('DELETE FROM players WHERE account = ?'),
    accounts: db.prepare('SELECT DISTINCT account FROM players'),
    unseated: db.prepare('SELECT p.replay, r.meta FROM players p JOIN replays r ON r.id = p.replay WHERE p.account = ? AND p.seat IS NULL'),
    setSeat: db.prepare('UPDATE players SET seat = ? WHERE account = ? AND replay = ?'),
  };
  const inTransaction = fn => { db.exec('BEGIN'); try { const r = fn(); db.exec('COMMIT'); return r; } catch (e) { db.exec('ROLLBACK'); throw e; } };
  // Takes each account's replays past its newest KEEP off its list, and deletes those no account keeps any more. Returns how many.
  const trim = accounts => {
    let n = 0;
    for (const account of accounts) {
      for (const { replay } of q.beyond.all(account, KEEP)) {
        q.dropPlayer.run(account, replay);
        n += Number(q.dropIfUnkept.run(replay, replay).changes);
      }
    }
    return n;
  };
  const link = (id, seats) => {
    for (const { account, seat } of seats) q.player.run(id, String(account), seat ?? null);
    trim([...new Set(seats.map(s => String(s.account)))]);
  };
  return {
    // { created, text, seats: [{ account: id, seat }], meta } → the new replay's id. An account it pushes past KEEP loses its oldest.
    save({ created, text, seats, meta }) {
      const id = crypto.randomBytes(12).toString('base64url');
      inTransaction(() => { q.insert.run(id, created, JSON.stringify(meta), text); link(id, seats); });
      return id;
    },
    // A replay under an id the caller chose, as a seed replay (docs/adr/0023): replaces one with that id and its players.
    put({ id, created, text, seats, meta }) {
      inTransaction(() => { q.replace.run(id, created, JSON.stringify(meta), text); q.dropPlayers.run(id); link(id, seats); });
    },
    // { text, meta } while some account keeps the replay, else null.
    get(id) {
      const row = q.get.get(id);
      return row ? { text: row.text, meta: { ...JSON.parse(row.meta), created: row.created } } : null;
    },
    // [{ id, created }] of the replays `account` keeps, oldest first.
    ofAccount(account) { return q.list.all(String(account)).map(r => ({ id: r.id, created: r.created })); },
    // The replays listed under the account's name (ADR 0024): [{ id, created, seat, ...meta }], newest first, `seat` the one the
    // account played in, or null when it isn't known.
    listOf(account) {
      return q.listed.all(String(account)).map(r => ({ ...JSON.parse(r.meta), id: r.id, created: r.created, seat: r.seat }));
    },
    removeAccount(account) { inTransaction(() => { q.dropOfAccount.run(String(account)); q.orphans.run(); }); },
    // The replays of `from` become `to`'s, as when a guest signs in to a member that already exists (ADR 0024). A battle both
    // played stays listed once, and `to` keeps its newest KEEP.
    moveAccount(from, to) { inTransaction(() => { q.move.run(String(to), String(from)); q.dropAccount.run(String(from)); trim([String(to)]); }); },
    // `nameOf(account)` is the account's name, or null for one that no longer exists, as a wiped guest. Takes those accounts' replays
    // off their lists, gives every row without a seat the seat its account's name played in, where a player of that name is in the
    // replay, keeps each account to its newest KEEP, and deletes every replay no account keeps. Returns how many it deleted.
    sweep(nameOf) {
      return inTransaction(() => {
        const kept = [];
        for (const { account } of q.accounts.all()) {
          const name = nameOf(account);
          if (name == null) { q.dropAccount.run(account); continue; }
          kept.push(account);
          for (const { replay, meta } of q.unseated.all(account)) {
            const p = JSON.parse(meta).players?.find(x => !x.bot && x.name.toLowerCase() === name.toLowerCase());
            if (p) q.setSeat.run(p.seat, account, replay);
          }
        }
        trim(kept);
        return Number(q.unkept.run().changes);
      });
    },
    close() { db.close(); },
  };
}

module.exports = { open, KEEP };
