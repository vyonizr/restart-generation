// Backs up the accounts database while the server runs (ADR 0010, docs/DEPLOY.md):
//   npm run backup [-- --keep 7]
// In Docker: docker compose exec rg npm run backup
// It writes data/backups/<database>-<UTC date>-<time>.db with `VACUUM INTO`, which gives a consistent copy of a database in use
// (copying the file mid-write is not), and removes older backups of the same database beyond the newest <keep> (7 by default).
// A backup holds Discord IDs and saved games: keep it private and never publish it (docs/LEGAL.md).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';

const DATABASES = ['accounts.db', 'accounts-names.db']; // a Discord server's, and a name-only server's (server/auth.js)
const stamp = now => now.toISOString().replace(/\.\d+Z$/, '').replace(/[-:]/g, '').replace('T', '-');

// Returns the backups written, as file paths. Throws when the folder has no database to back up.
export function backup(dataDir, keep = 7, now = new Date()) {
  const found = DATABASES.filter(name => fs.existsSync(path.join(dataDir, name)));
  if (!found.length) throw new Error(`No accounts database in ${dataDir}.`);
  const outDir = path.join(dataDir, 'backups');
  fs.mkdirSync(outDir, { recursive: true });
  const written = [];
  for (const name of found) {
    const base = path.basename(name, '.db');
    const target = path.join(outDir, `${base}-${stamp(now)}.db`);
    if (fs.existsSync(target)) throw new Error(`${target} exists already.`);
    const db = new DatabaseSync(path.join(dataDir, name));
    try { db.exec(`VACUUM INTO '${target.replace(/'/g, "''")}'`); } finally { db.close(); }
    try { fs.chmodSync(target, 0o600); } catch { /* not on every file system */ }
    written.push(target);
    const mine = new RegExp(`^${base}-\\d{8}-\\d{6}\\.db$`);
    const all = fs.readdirSync(outDir).filter(f => mine.test(f)).sort().reverse(); // the stamp sorts by time
    for (const old of all.slice(keep)) fs.rmSync(path.join(outDir, old));
  }
  return written;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const options = { keep: 7, data: path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data') };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--keep' && /^[1-9]\d*$/.test(args[i + 1] ?? '')) options.keep = Number(args[++i]);
    else if (args[i] === '--data' && args[i + 1]) options.data = path.resolve(args[++i]);
    else { console.error(`Unexpected ${JSON.stringify(args[i])}.\nUsage: npm run backup [-- --keep <how many to keep, 7>] [--data <folder>]`); process.exit(2); }
  }
  try {
    for (const file of backup(options.data, options.keep)) console.log(`wrote ${file}`);
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
