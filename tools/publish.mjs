// Publishes a branch of this checkout to the public repository's main (docs/LEGAL.md, "Publishing"):
//   node tools/publish.mjs              build and check what is new, and show what a push would send
//   node tools/publish.mjs --push       the same, then push it
//   --branch <name>  the branch to publish (default development)     --remote <url>  another repository (default the public one)
// It works inside this checkout and only on what isn't published yet. It fetches the public main into refs/public/main, matches each
// published commit to its source commit by author date, committer date and message, and rewrites only the newer source commits on
// top of it: every author and committer becomes USER with GitHub's no-reply address, tools/scrub-tree.mjs rewrites wording and the
// source authors' real names, and the DROP folders are left out. A new commit's tree is its rewritten parent's tree plus what the
// commit changed, so only the files a commit touches are read. It then checks the new commits and pushes only if they pass, and never
// with force: if the public main has commits this checkout can't match, it stops. Every run also copies the public release tags onto
// the source commits they came from, as local tags it never pushes, so a server run from this checkout reports its version (ADR 0027).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { scrub, scrubbable, DROP } from './scrub-tree.mjs';
import { badSubject } from './commit-format.mjs';

const USER = 'vyonizr';
const EMAIL = `${USER}@users.noreply.github.com`;
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const opt = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback);
const branch = opt('--branch', 'development');
const remote = opt('--remote', `https://github.com/${USER}/restart-generation.git`);
const PUBLIC = 'refs/public/main';

const git = (args, { input, env, buffer } = {}) => {
  const r = spawnSync('git', args, { cwd: root, input, env: env && { ...process.env, ...env }, maxBuffer: 1 << 30 });
  if (r.status !== 0) { console.error(`git ${args.join(' ')} failed:\n${r.stderr}`); process.exit(1); }
  return buffer ? r.stdout : r.stdout.toString('utf8').trim();
};
const list = text => text.split('\n').filter(Boolean);

// Reads many objects with one git process: Map of id to Buffer.
function readObjects(ids) {
  const out = new Map();
  if (!ids.length) return out;
  const buf = git(['cat-file', '--batch'], { input: ids.join('\n') + '\n', buffer: true });
  for (let at = 0; at < buf.length;) {
    const eol = buf.indexOf(10, at);
    const [id, type, size] = buf.toString('utf8', at, eol).split(' ');
    if (type === 'missing') { console.error(`object ${id} is missing`); process.exit(1); }
    out.set(id, buf.subarray(eol + 1, eol + 1 + Number(size)));
    at = eol + 1 + Number(size) + 1;
  }
  return out;
}

// A raw commit: its parents, the two signature dates, the message, and the key that survives the rewrite.
function parseCommit(raw) {
  const text = raw.toString('utf8');
  const split = text.indexOf('\n\n');
  const head = text.slice(0, split), message = text.slice(split + 2);
  const parents = [...head.matchAll(/^parent ([0-9a-f]+)$/gm)].map(m => m[1]);
  const date = who => /^(?:author|committer) .* (\d+ [+-]\d{4})$/m.exec(head.split('\n').find(l => l.startsWith(`${who} `)))[1];
  const author = date('author'), committer = date('committer');
  return { parents, author, committer, message, key: `${author}\n${committer}\n${message}` };
}

// 1. The public main, and which source commit each of its commits came from.
const published = list(git(['ls-remote', remote, 'refs/heads/main'])).length > 0;
if (published) git(['fetch', '--quiet', '--no-tags', remote, `+refs/heads/main:${PUBLIC}`]);
const publicTip = published ? git(['rev-parse', PUBLIC]) : null;
const publicIds = publicTip ? list(git(['rev-list', publicTip])) : [];
const byKey = new Map();
for (const [id, raw] of readObjects(publicIds)) byKey.set(parseCommit(raw).key, id);

// 2. The source commits that have no published match, parents first.
const sourceIds = list(git(['rev-list', '--reverse', '--topo-order', branch]));
const source = new Map([...readObjects(sourceIds)].map(([id, raw]) => [id, parseCommit(raw)]));
const rewritten = new Map(); // source commit id to public commit id
for (const id of sourceIds) if (byKey.has(source.get(id).key)) rewritten.set(id, byKey.get(source.get(id).key));
if (publicTip && ![...rewritten.values()].includes(publicTip)) {
  console.error(`The public main (${publicTip.slice(0, 8)}) has commits that ${branch} doesn't have. Nothing was published.`);
  process.exit(1);
}

// 1b. The releases (ADR 0027). CI tags the public main, whose commits are the rewritten ones, so each release tag is copied onto the
// source commit it came from, as a local tag: `git describe` then finds it, and a server run from this checkout reports its version.
// This script never pushes tags, so the copies stay here. A tag already in this checkout is left as it is.
if (published) {
  const sourceOf = new Map([...rewritten].map(([sourceId, publicId]) => [publicId, sourceId]));
  const tagged = new Map(); // tag name to the public commit it marks; an annotated tag's peeled line (^{}) names the commit
  for (const [id, ref] of list(git(['ls-remote', '--tags', remote])).map(line => line.split('\t'))) {
    const name = ref.replace(/^refs\/tags\//, '').replace(/\^\{\}$/, '');
    if (/^v\d+\.\d+\.\d+/.test(name) && (ref.endsWith('^{}') || !tagged.has(name))) tagged.set(name, id);
  }
  for (const [name, publicId] of tagged) {
    const sourceId = sourceOf.get(publicId);
    const local = spawnSync('git', ['rev-parse', '--quiet', '--verify', `refs/tags/${name}^{commit}`], { cwd: root, encoding: 'utf8' }).stdout.trim();
    if (local === sourceId) continue;
    if (local) console.log(`Release ${name}: this checkout already has a tag of that name, on ${local.slice(0, 8)}; left as it is.`);
    else if (!sourceId) console.log(`Release ${name}: its public commit ${publicId.slice(0, 8)} matches no commit of ${branch}; not copied.`);
    else { git(['tag', name, sourceId]); console.log(`Release ${name}: tagged ${sourceId.slice(0, 8)} of ${branch}.`); }
  }
}
const fresh = sourceIds.filter(id => !rewritten.has(id));
if (!fresh.length) { console.log(`Nothing to publish: ${branch} is published as ${remote} main ${publicTip.slice(0, 8)}.`); process.exit(0); }

// 3. Rewrite them. The source authors' real names are scrubbed from the files too, as tools/scrub-tree.mjs describes.
const realNames = [...new Set(list(git(['log', '--format=%an%n%cn', branch])).filter(n => n.length > 3 && n !== USER))];
const dropped = rel => DROP.some(dir => rel === dir || rel.startsWith(`${dir}/`));
const scrubbed = new Map(); // source blob id to published blob id
const index = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rg-publish-')), 'index');
const indexEnv = { GIT_INDEX_FILE: index };
for (const id of fresh) {
  const { parents, author, committer, message } = source.get(id);
  // What changed against the first parent (everything, for a root commit), as rows of mode, blob, status and path.
  const changes = [];
  const diff = parents.length
    ? git(['diff-tree', '-r', '-z', '--no-renames', '--no-commit-id', parents[0], id]).split('\0')
    : git(['ls-tree', '-r', '-z', id]).split('\0').filter(Boolean).flatMap(row => { const [meta, rel] = row.split('\t'); const [mode, , blob] = meta.split(' '); return [`:000000 ${mode} ${'0'.repeat(40)} ${blob} A`, rel]; });
  for (let i = 0; i + 1 < diff.length; i += 2) {
    const [, mode, , blob, status] = diff[i].split(' ');
    changes.push({ mode, blob, status, rel: diff[i + 1] });
  }
  const toScrub = changes.filter(c => c.status !== 'D' && c.mode.startsWith('100') && scrubbable(c.rel) && !scrubbed.has(c.blob)).map(c => c.blob);
  for (const [blob, buf] of readObjects([...new Set(toScrub)])) {
    const text = buf.toString('utf8'), next = scrub(text, realNames, USER);
    scrubbed.set(blob, next === text ? blob : git(['hash-object', '-w', '--no-filters', '--stdin'], { input: Buffer.from(next, 'utf8') }));
  }
  const rows = changes.map(c => (c.status === 'D' || dropped(c.rel)
    ? `0 ${'0'.repeat(40)}\t${c.rel}`
    : `${c.mode} ${scrubbed.get(c.blob) ?? c.blob}\t${c.rel}`));
  if (parents.length) git(['read-tree', rewritten.get(parents[0])], { env: indexEnv });
  else git(['read-tree', '--empty'], { env: indexEnv });
  git(['update-index', '-z', '--index-info'], { input: rows.join('\0') + '\0', env: indexEnv });
  const tree = git(['write-tree'], { env: indexEnv });
  const env = { GIT_AUTHOR_NAME: USER, GIT_AUTHOR_EMAIL: EMAIL, GIT_AUTHOR_DATE: `@${author}`, GIT_COMMITTER_NAME: USER, GIT_COMMITTER_EMAIL: EMAIL, GIT_COMMITTER_DATE: `@${committer}` };
  rewritten.set(id, git(['commit-tree', '--no-gpg-sign', tree, ...parents.flatMap(p => ['-p', rewritten.get(p)])], { input: message, env }));
}
fs.rmSync(path.dirname(index), { recursive: true, force: true });
const tip = rewritten.get(git(['rev-parse', branch]));

// 4. Check what would be pushed: every commit that the public main doesn't already have.
const range = publicTip ? `${publicTip}..${tip}` : tip;
const problems = [];
if (publicTip && spawnSync('git', ['merge-base', '--is-ancestor', publicTip, tip], { cwd: root }).status !== 0) problems.push(`the result doesn't extend the public main ${publicTip.slice(0, 8)}`);
const identities = new Set(list(git(['log', '--format=%an <%ae>%n%cn <%ce>', range])));
if ([...identities].some(i => i !== `${USER} <${EMAIL}>`)) problems.push(`identities other than ${USER}: ${[...identities].join(', ')}`);
const check = spawnSync(process.execPath, [path.join(root, 'tools', 'legal-check.mjs'), '--history', range], { cwd: root, encoding: 'utf8' });
process.stdout.write(check.stdout); process.stderr.write(check.stderr);
if (check.status !== 0) problems.push('the legal check refused something');
// Nothing that the scrub rewrites may be left (the notes in docs/re, and the files that talk about the scrub, say it on purpose).
const left = git(['log', '--format=%h', '-G', 'Browser port of the Java|recovered from lib/rg-signed|SNAPMobileClient\\.(processServerError|netBuffer)|ServerComm\'s listener|LoginScreen in the Java|Java applet did|resetgeneration\\.[a-z0-9-]+\\.[a-z]{2,}', range, '--', '.', ':!docs/re', ':!docs/adr/0018*', ':!docs/LEGAL.md', ':!tools'])
  || git(['log', '--format=%h', '-G', 'screenshots of RedLynx|redlynx-(style|direction|ui)|nspired by RedLynx|Crimson', range, '--', '.', ':!docs/re', ':!tools']);
if (left) problems.push(`scrubbed wording left in ${list(left).join(', ')}`);
if (git(['log', '--format=%h', range, '--', ...DROP])) problems.push(`${DROP.join(', ')} still in the history`);
// The source's real names, addresses and the original client's password keys must appear in no file and no message.
const realKeys = [...new Set(git(['log', '-p', '--format=', '-G', '[0-9A-F]{64}', branch]).match(/(?<=')[0-9A-F]{64}(?=')/g) || [])];
const realEmails = [...new Set(list(git(['log', '--format=%ae%n%ce', branch])))].filter(e => e !== EMAIL);
const leaked = [...realEmails, ...realNames, ...realKeys].filter(s => git(['log', '--format=%h', '-S' + s, range, '--', '.']) || git(['log', '--format=%h', '-i', '--fixed-strings', '--grep=' + s, range]));
if (leaked.length) problems.push(`${leaked.length} author name(s), address(es) or key(s) found in files or messages`);
// Releases are numbered from Conventional Commits (ADR 0019). Only commits made after the format check arrived are held to it:
// those whose first parent already has tools/commit-format.mjs. Merge commits are exempt, as in the hook.
const misformatted = list(git(['log', '--format=%h%x09%P%x09%s', range])).map(line => line.split('\t')).filter(([, parents, subject]) => {
  const [parent, ...more] = parents.split(' ').filter(Boolean);
  if (!parent || more.length) return false;
  return spawnSync('git', ['cat-file', '-e', `${parent}:tools/commit-format.mjs`], { cwd: root }).status === 0 && badSubject(subject);
});
for (const [id, , subject] of misformatted) problems.push(`${id}: ${badSubject(subject)}`);

console.log(`\n${fresh.length} new commit(s) for ${remote} main, from ${branch}:`);
for (const line of list(git(['log', '--format=%h %s', range]))) console.log(`  ${line}`);
if (problems.length) {
  for (const p of problems) console.error(`  refused: ${p}`);
  console.error('Fix it in this checkout and run again. Nothing was pushed.');
  process.exit(1);
}
if (!argv.includes('--push')) { console.log('\nAll checks passed. Run again with --push to publish them.'); process.exit(0); }
git(['push', '--quiet', remote, `${tip}:refs/heads/main`]);
git(['update-ref', PUBLIC, tip]);
console.log(`\nPushed: ${remote} main is now ${tip.slice(0, 8)}.`);
