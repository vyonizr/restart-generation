// Makes the checkout that is published (docs/LEGAL.md, "Publishing"):
//   node tools/export-public.mjs <github-username> <new-folder> [branch]     (branch defaults to development)
// It clones only that branch, as `main`, and rewrites its history: every commit's author and committer become <github-username> with
// GitHub's no-reply address (so no personal name or email goes public), and tools/scrub-tree.mjs rewrites wording that names the
// original client's classes. It then drops the link to this checkout and runs tools/legal-check.mjs over every commit of the result
// with the rules in THIS checkout. It never pushes: it prints what to do next. The folder must not exist.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = 'restart-generation'; // the repository the history is for: https://github.com/<user>/restart-generation
const [user, out, branch = 'development'] = process.argv.slice(2);
if (!user || !out || !/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/.test(user)) {
  console.error('Usage: node tools/export-public.mjs <github-username> <new-folder> [branch]');
  process.exit(2);
}
const dest = path.resolve(out);
if (fs.existsSync(dest)) { console.error(`${dest} exists; give a folder that doesn't.`); process.exit(2); }

const run = (cmd, args, opts = {}) => {
  const r = spawnSync(cmd, args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], ...opts });
  if (r.status !== 0) { console.error(`${cmd} ${args.join(' ')} failed:\n${r.stderr || r.stdout}`); process.exit(1); }
  return r.stdout.trim();
};

run('git', ['clone', '--no-local', '--single-branch', '--branch', branch, root, dest]);
const email = `${user}@users.noreply.github.com`;
const rewrite = `export GIT_AUTHOR_NAME='${user}' GIT_AUTHOR_EMAIL='${email}' GIT_COMMITTER_NAME='${user}' GIT_COMMITTER_EMAIL='${email}'`;
const scrub = `node "${path.join(root, 'tools', 'scrub-tree.mjs').replace(/\\/g, '/')}"`;
run('git', ['filter-branch', '-f', '--env-filter', rewrite, '--tree-filter', scrub, '--', '--all'], { cwd: dest, env: { ...process.env, FILTER_BRANCH_SQUELCH_WARNING: '1' } });
run('git', ['branch', '-m', 'main'], { cwd: dest });
run('git', ['remote', 'remove', 'origin'], { cwd: dest });
fs.rmSync(path.join(dest, '.git', 'refs', 'original'), { recursive: true, force: true });
run('git', ['reflog', 'expire', '--expire=now', '--all'], { cwd: dest });
run('git', ['gc', '--prune=now', '-q'], { cwd: dest });

const authors = run('git', ['log', '--format=%an <%ae>|%cn <%ce>'], { cwd: dest }).split('\n');
const identities = new Set(authors.flatMap(l => l.split('|')));
const commits = authors.length;
const check = spawnSync(process.execPath, [path.join(root, 'tools', 'legal-check.mjs'), '--history', 'HEAD', '--repo', dest], { encoding: 'utf8' });
process.stdout.write(check.stdout); process.stderr.write(check.stderr);
// Nothing that the scrub rewrites may be left in any commit (the notes in docs/re, and the files that talk about the scrub, say it on purpose).
const left = run('git', ['log', '--format=%h', '-G', 'Browser port of the Java|recovered from lib/rg-signed|SNAPMobileClient\\.(processServerError|netBuffer)|ServerComm\'s listener|LoginScreen in the Java|Java applet did', '--', '.', ':!docs/re', ':!docs/adr/0018*', ':!docs/LEGAL.md', ':!tools'], { cwd: dest });
console.log(`\n${commits} commits on main (from ${branch}) in ${dest}; identities in them: ${[...identities].join(', ')}`);
console.log(`commits that still hold scrubbed wording: ${left ? left.split('\n').length : 0}`);
if (check.status !== 0 || left) { console.error('Something above needs fixing in the source checkout (a legal check refusal, or wording the scrub missed). Export again after; nothing was pushed.'); process.exit(1); }
console.log(`\nNext, by hand (this script never pushes):\n  1. Create the empty repository ${user}/${REPO} on GitHub, without a README or licence.\n  2. cd ${dest}\n  3. git remote add origin https://github.com/${user}/${REPO}.git\n  4. git push -u origin main`);
