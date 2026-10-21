// Self-check for the accounts backup: node server/backup.test.js
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { DatabaseSync } = require('node:sqlite');

import('./backup.mjs').then(({ backup }) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-backup-'));
  try {
    assert.throws(() => backup(dir), /No accounts database/);

    // A database in use: WAL mode, with a row that is still in the -wal file (a plain file copy would miss it).
    const live = new DatabaseSync(path.join(dir, 'accounts.db'));
    live.exec('PRAGMA journal_mode = WAL; CREATE TABLE t (k TEXT, v TEXT); INSERT INTO t VALUES (\'a\', \'1\')');
    const [first] = backup(dir, 2, new Date('2026-01-01T10:00:00Z'));
    live.exec('INSERT INTO t VALUES (\'b\', \'2\')');
    assert.ok(first.endsWith('accounts-20260101-100000.db'));
    const copy = new DatabaseSync(first);
    assert.deepEqual(copy.prepare('SELECT k, v FROM t ORDER BY k').all().map(r => [r.k, r.v]), [['a', '1']]);
    copy.close();

    // Only the newest <keep> stay, and nothing else in the folder is touched.
    fs.writeFileSync(path.join(dir, 'backups', 'notes.txt'), 'mine');
    backup(dir, 2, new Date('2026-01-02T10:00:00Z'));
    backup(dir, 2, new Date('2026-01-03T10:00:00Z'));
    assert.deepEqual(fs.readdirSync(path.join(dir, 'backups')).sort(), ['accounts-20260102-100000.db', 'accounts-20260103-100000.db', 'notes.txt']);
    assert.throws(() => backup(dir, 2, new Date('2026-01-03T10:00:00Z')), /exists already/);

    // Both kinds of server are covered, each pruned on its own.
    const names = new DatabaseSync(path.join(dir, 'accounts-names.db'));
    names.exec('CREATE TABLE t (k TEXT)');
    const both = backup(dir, 2, new Date('2026-01-04T10:00:00Z')).map(f => path.basename(f));
    assert.deepEqual(both, ['accounts-20260104-100000.db', 'accounts-names-20260104-100000.db']);
    live.close(); names.close();
    console.log('backup ok');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}).catch(e => { console.error(e); process.exit(1); });
