// The checks every commit passes before it reaches the public repository (docs/LEGAL.md, "Publishing"; ADR 0018).
//   tools/publish.mjs runs checkPublished() on the commits it is about to push.
//   node tools/publish-check.mjs <remote> <url>   the pre-push hook (.githooks/pre-push), with git's ref lines on stdin. A push to the
//     public repository passes only when every commit it sends passes checkPublished(), so a plain `git push` can't send this
//     checkout's own history: its authors' names, the files tools/scrub-tree.mjs rewrites, or the folders it drops. Publish with
//     tools/publish.mjs instead. A push to any other repository gets the legal check on what it sends.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { DROP } from './scrub-tree.mjs';
import { badSubject } from './commit-format.mjs';
import { checkHistory } from './legal-check.mjs';

export const USER = 'vyonizr';
export const EMAIL = `${USER}@users.noreply.github.com`;
export const PUBLIC_REMOTE = `https://github.com/${USER}/restart-generation.git`;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const git = args => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 1 << 30 });
  if (r.status !== 0) { console.error(`git ${args.join(' ')} failed:\n${r.stderr}`); process.exit(1); }
  return r.stdout.trim();
};
const list = text => text.split('\n').filter(Boolean);

// Whether a remote URL is the public repository, in any form GitHub accepts (https, ssh, with or without .git).
export const isPublic = url => new RegExp(`github\\.com[/:]${USER}/restart-generation(?:\\.git)?/?$`, 'i').test(url.trim());

// What keeps the commits that `revs` (git rev-list arguments) select out of the public repository, as a list of reasons. `source` is
// the branch whose authors' names, addresses and the original client's password keys must appear in none of them.
export function checkPublished(revs, source = 'development') {
  const problems = [];
  const identities = new Set(list(git(['log', '--format=%an <%ae>%n%cn <%ce>', ...revs])));
  if ([...identities].some(i => i !== `${USER} <${EMAIL}>`)) problems.push(`identities other than ${USER}: ${[...identities].join(', ')}`);
  const legal = checkHistory(revs);
  console.log(`checked ${legal.files} file versions in ${legal.commits} commits`);
  for (const p of legal.problems) console.error(`  refused: ${p}`);
  if (legal.problems.length) problems.push('the legal check refused something');
  // Nothing that the scrub rewrites may be left (the notes in docs/re, and the files that talk about the scrub, say it on purpose).
  const left = git(['log', '--format=%h', '-G', 'Browser port of the Java|recovered from lib/rg-signed|SNAPMobileClient\\.(processServerError|netBuffer)|ServerComm\'s listener|LoginScreen in the Java|Java applet did|resetgeneration\\.[a-z0-9-]+\\.[a-z]{2,}', ...revs, '--', '.', ':!docs/re', ':!docs/adr/0018*', ':!docs/LEGAL.md', ':!tools'])
    || git(['log', '--format=%h', '-G', 'screenshots of RedLynx|redlynx-(style|direction|ui)|nspired by RedLynx|Crimson', ...revs, '--', '.', ':!docs/re', ':!tools']);
  if (left) problems.push(`scrubbed wording left in ${list(left).join(', ')}`);
  if (git(['log', '--format=%h', ...revs, '--', ...DROP])) problems.push(`${DROP.join(', ')} still in the history`);
  // The source's real names, addresses and the original client's password keys must appear in no file and no message.
  const realNames = [...new Set(list(git(['log', '--format=%an%n%cn', source])).filter(n => n.length > 3 && n !== USER))];
  const realKeys = [...new Set(git(['log', '-p', '--format=', '-G', '[0-9A-F]{64}', source]).match(/(?<=')[0-9A-F]{64}(?=')/g) || [])];
  const realEmails = [...new Set(list(git(['log', '--format=%ae%n%ce', source])))].filter(e => e !== EMAIL);
  const leaked = [...realEmails, ...realNames, ...realKeys].filter(s => git(['log', '--format=%h', '-S' + s, ...revs, '--', '.']) || git(['log', '--format=%h', '-i', '--fixed-strings', '--grep=' + s, ...revs]));
  if (leaked.length) problems.push(`${leaked.length} author name(s), address(es) or key(s) found in files or messages`);
  // Releases are numbered from Conventional Commits (ADR 0019). Only commits made after the format check arrived are held to it:
  // those whose first parent already has tools/commit-format.mjs. Merge commits are exempt, as in the hook.
  const misformatted = list(git(['log', '--format=%h%x09%P%x09%s', ...revs])).map(line => line.split('\t')).filter(([, parents, subject]) => {
    const [parent, ...more] = parents.split(' ').filter(Boolean);
    if (!parent || more.length) return false;
    return spawnSync('git', ['cat-file', '-e', `${parent}:tools/commit-format.mjs`], { cwd: root }).status === 0 && badSubject(subject);
  });
  for (const [id, , subject] of misformatted) problems.push(`${id}: ${badSubject(subject)}`);
  return problems;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const [name, url = name] = process.argv.slice(2);
  const toPublic = isPublic(url ?? '');
  const zero = /^0+$/;
  const problems = [];
  for (const [, localId, remoteRef, remoteId] of list(fs.readFileSync(0, 'utf8')).map(line => line.split(' '))) {
    if (zero.test(localId)) continue; // a deletion sends no commits
    // What the remote doesn't have yet, as far as this checkout knows: its tracking refs, the published main, and the ref's old tip.
    const known = !zero.test(remoteId) && spawnSync('git', ['cat-file', '-e', `${remoteId}^{commit}`], { cwd: root }).status === 0;
    const revs = [localId, '--not', `--remotes=${name}`, '--glob=refs/public/*', ...(known ? [remoteId] : [])];
    const count = list(git(['rev-list', ...revs])).length;
    if (!count) continue;
    console.log(`checking ${count} commit(s) for ${remoteRef}${toPublic ? ', as a publish' : ''}`);
    const found = toPublic ? checkPublished(revs) : checkHistory(revs).problems;
    for (const p of found) problems.push(`${remoteRef}: ${p}`);
  }
  if (problems.length) {
    for (const p of problems) console.error(`  refused: ${p}`);
    console.error(toPublic
      ? `\nNothing was pushed. ${url} is the public repository: publish to it with node tools/publish.mjs (docs/LEGAL.md, "Publishing").`
      : '\nNothing was pushed. Read docs/LEGAL.md; an exception goes in tools/legal-allow.json with where the file comes from.');
    process.exit(1);
  }
}
