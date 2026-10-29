// The checks before a merge to development and before publishing (docs/adr/0045):
//   npm run check                 npm test, the end-to-end tests' page tier and, with RG_GAME, test:effects; then the slow suites
//                                 whose `check-paths` header matches a file the branch changed since it left development
//   npm run check -- --all        every suite and the whole end-to-end run: what tools/publish.mjs asks for (about 22 minutes)
//   --base <ref>  the branch the changes are counted from (default development)     --dry-run  say what would run, and run nothing
//   node tools/check.mjs --merge-gate   the pre-merge-commit and pre-commit hooks (.githooks/): refuses a merge into development
//                                       whose merged commit has no stamp. It runs no test, so it takes a moment.
// A slow suite (tools/emu/*-test.mjs, perftest.mjs, shared/emu/effects.test.mjs, e2e/engine/*.spec.mjs) says what it covers in one
// or more `// check-paths: <glob> <glob> ...` lines near its top: repo-relative, forward slashes, `**` for any depth. Changing the
// suite's own file selects it too, and so do the files every engine spec runs on (ENGINE_TIER). Every suite but npm test and the
// page tier runs the engine, so it needs RG_GAME: when one is chosen and RG_GAME isn't set, the check fails instead of skipping it.
// When every chosen suite passes on a clean work tree, it writes tmp/check/<HEAD>.json (mode, suites, date): the stamp the hooks
// and tools/publish.mjs look for. A stamp is a statement about one commit, so a new commit needs a new check. It stops at the first
// failure. Uncommitted changes count for what is chosen, but a run with any of them writes no stamp.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const STAMPS = path.join(root, 'tmp', 'check');
const TARGET = 'development';

// Every engine spec runs on these, so a change to one of them selects them all.
const ENGINE_TIER = ['e2e/fixtures.mjs', 'e2e/engine/engine.mjs', 'e2e/global-setup.mjs', 'playwright.config.mjs'];

const git = (...args) => {
  const r = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  return r.status === 0 ? r.stdout.trim() : null;
};
const lines = text => (text ? text.split('\n').filter(Boolean) : []);

// Node's own glob matcher where it has one (22.5 on); else the subset the headers use: `**` any depth, `*` and `?` within one
// folder, `{a,b}` either.
const toRegExp = glob => new RegExp(`^${glob.replace(/\*\*\/|\*\*|\*|\?|\{([^}]*)\}|[.+^$()|[\]\\]/g, (m, alts) =>
  m === '**/' ? '(?:.*/)?' : m === '**' ? '.*' : m === '*' ? '[^/]*' : m === '?' ? '[^/]' : alts !== undefined ? `(?:${alts.split(',').join('|')})` : `\\${m}`)}$`);
export const matches = path.posix.matchesGlob
  ? (file, glob) => path.posix.matchesGlob(file, glob)
  : (file, glob) => toRegExp(glob).test(file);

// The globs a test file declares in its `// check-paths:` lines.
export const headerPaths = text => [...text.matchAll(/^\/\/ check-paths:(.*)$/gm)].flatMap(m => m[1].trim().split(/\s+/).filter(Boolean));

// The suites, in the order they run: the quickest first, so a failure shows as soon as it can. `file` is where its header is.
export function suites() {
  const specs = fs.readdirSync(path.join(root, 'e2e', 'engine')).filter(f => f.endsWith('.spec.mjs')).sort();
  const read = file => {
    const globs = headerPaths(fs.readFileSync(path.join(root, file), 'utf8'));
    return [file, ...globs];
  };
  return {
    base: [
      { name: 'npm test', run: 'npm test' },
      // Its gateway needs no game, and an empty RG_GAME keeps global-setup.mjs from starting the engine's.
      { name: 'e2e page tier', run: 'npm run e2e -- --project=page-desktop --project=page-touch', env: { RG_GAME: '' } },
    ],
    effects: { name: 'test:effects', run: 'npm run test:effects', file: 'shared/emu/effects.test.mjs', paths: read('shared/emu/effects.test.mjs') },
    slow: [
      { name: 'test:pointer', run: 'npm run test:pointer', file: 'tools/emu/pointer-test.mjs', paths: read('tools/emu/pointer-test.mjs') },
      ...specs.map(f => `e2e/engine/${f}`).map(file => ({ name: file, spec: file, file, paths: [...read(file), ...ENGINE_TIER] })),
      { name: 'test:perf', run: 'npm run test:perf', file: 'tools/emu/perftest.mjs', paths: read('tools/emu/perftest.mjs') },
      { name: 'test:wide', run: 'npm run test:wide', file: 'tools/emu/wide-test.mjs', paths: read('tools/emu/wide-test.mjs') },
    ],
  };
}

// What to run for these changed files: { run: [{ suite, why }], skipped: [{ suite, why }], needsGame: [names] }. `game` is
// whether RG_GAME is set. With `all`, every suite, and the end-to-end tests in one run of every project.
export function plan(changed, { all = false, game = false } = {}) {
  const { base, effects, slow } = suites();
  const run = [], skipped = [];
  if (all) {
    run.push({ suite: base[0], why: '--all' });
    for (const s of [effects, ...slow.filter(s => !s.spec)]) run.push({ suite: s, why: '--all' });
    run.push({ suite: { name: 'e2e', run: 'npm run e2e' }, why: '--all: both tiers, every spec' });
    return { run, skipped, needsGame: run.filter(r => r.suite !== base[0]).map(r => r.suite.name) };
  }
  for (const s of base) run.push({ suite: s, why: 'every check' });
  const hits = s => changed.flatMap(file => {
    const glob = s.paths.find(g => matches(file, g));
    return glob ? [glob === file ? file : `${file} (${glob})`] : [];
  });
  const because = list => list.length > 2 ? `${list.slice(0, 2).join(', ')} and ${list.length - 2} more` : list.join(', ');
  const needsGame = [];
  const effectsHits = hits(effects);
  if (effectsHits.length) { run.push({ suite: effects, why: because(effectsHits) }); needsGame.push(effects.name); }
  else if (game) run.push({ suite: effects, why: 'every check with RG_GAME' });
  else skipped.push({ suite: effects, why: 'RG_GAME is not set, and no changed file is in its paths' });
  const specs = [];
  for (const s of slow) {
    const h = hits(s);
    if (!h.length) { skipped.push({ suite: s, why: 'no changed file is in its paths' }); continue; }
    needsGame.push(s.name);
    if (s.spec) specs.push({ suite: s, why: because(h) });
    else run.push({ suite: s, why: because(h) });
  }
  // The chosen engine specs run in one Playwright run, before the minutes-long emulator suites, so its gateways start once.
  if (specs.length) {
    const engine = { name: 'e2e engine', run: `npm run e2e -- --project=engine-desktop --project=engine-touch ${specs.map(s => s.suite.spec).join(' ')}` };
    const at = run.findIndex(r => r.suite.name === 'test:perf' || r.suite.name === 'test:wide');
    run.splice(at < 0 ? run.length : at, 0, { suite: engine, why: `${specs.length} spec(s), in one run:`, specs: specs.map(s => ({ name: s.suite.name, why: s.why })) });
  }
  return { run, skipped, needsGame };
}

// Header globs that match no tracked file: a renamed or deleted file a header still names.
function staleGlobs() {
  const tracked = lines(git('ls-files'));
  const { effects, slow } = suites();
  return [effects, ...slow].flatMap(s => s.paths.filter(g => !ENGINE_TIER.includes(g) && !tracked.some(f => matches(f, g))).map(g => `${s.file}: ${g}`));
}

const stampFile = sha => path.join(STAMPS, `${sha}.json`);
export const readStamp = sha => { try { return JSON.parse(fs.readFileSync(stampFile(sha), 'utf8')); } catch { return null; } };

// The hooks' gate: on development, a merge of a commit with no stamp is refused. git runs pre-merge-commit before it writes
// MERGE_HEAD, so there the merged commits are the names `git merge` was given, which it puts in GIT_REFLOG_ACTION ("merge feature");
// a merge with conflicts is finished by `git commit`, whose pre-commit hook finds them in MERGE_HEAD. Anything else passes: a
// commit that isn't a merge, and a merge `git pull` makes (GIT_REFLOG_ACTION "pull ..."). Only reads files, so it stays fast.
function mergeGate() {
  if (git('symbolic-ref', '--short', '-q', 'HEAD') !== TARGET) return 0;
  const file = path.resolve(root, git('rev-parse', '--git-path', 'MERGE_HEAD') ?? '');
  const action = process.env.GIT_REFLOG_ACTION ?? '';
  const heads = fs.existsSync(file) ? lines(fs.readFileSync(file, 'utf8')).map(l => l.trim())
    : action.startsWith('merge ') ? action.slice(6).split(' ').filter(Boolean).map(name => git('rev-parse', '--verify', '-q', `${name}^{commit}`) ?? name)
    : [];
  const missing = heads.filter(sha => !fs.existsSync(stampFile(sha)));
  if (!missing.length) return 0;
  console.error(`Refused: ${missing.map(sha => sha.slice(0, 8)).join(', ')} has not passed \`npm run check\` (no tmp/check/<commit>.json).`);
  console.error('`git merge --abort` undoes this merge. Check out the branch, commit everything, run `npm run check` there, and merge');
  console.error('again (docs/adr/0045).');
  console.error('In an emergency, `git merge --no-verify` (or `git commit --no-verify` to finish a merge with conflicts) skips this.');
  return 1;
}

function main(argv) {
  if (argv.includes('--merge-gate')) return mergeGate();
  const all = argv.includes('--all'), dry = argv.includes('--dry-run');
  const target = argv.includes('--base') ? argv[argv.indexOf('--base') + 1] : TARGET;
  if (fs.existsSync(path.join(root, '.env'))) process.loadEnvFile(path.join(root, '.env'));
  const game = Boolean(process.env.RG_GAME);
  const head = git('rev-parse', 'HEAD');
  const dirty = lines(git('status', '--porcelain'));

  let changed = [];
  if (!all) {
    const base = git('merge-base', target, 'HEAD');
    if (!base) { console.error(`check: no common commit with ${target}. Name the branch to count from with --base <ref>, or run --all.`); return 1; }
    changed = lines(git('diff', '--name-only', '--no-renames', base, 'HEAD'));
    const uncommitted = [...lines(git('diff', '--name-only', '--no-renames', 'HEAD')), ...lines(git('ls-files', '--others', '--exclude-standard'))];
    changed = [...new Set([...changed, ...uncommitted])].sort();
    console.log(`check: ${changed.length} file(s) changed since ${target} (${base.slice(0, 8)})${uncommitted.length ? `, ${uncommitted.length} of them not committed` : ''}`);
  } else console.log('check --all: every suite');

  for (const g of staleGlobs()) console.warn(`  warning: check-paths in ${g} matches no tracked file`);
  const { run, skipped, needsGame } = plan(changed, { all, game });
  const row = (verb, name, why) => console.log(`  ${verb.padEnd(5)} ${name.padEnd(30)} ${why}`);
  for (const { suite, why, specs } of run) {
    row('run', suite.name, why);
    for (const s of specs ?? []) row('', `  ${s.name}`, s.why);
  }
  for (const { suite, why } of skipped) row('skip', suite.name, why);
  const steps = run.map(r => r.suite);
  if (needsGame.length && !game) {
    console.error(`\ncheck: ${needsGame.join(', ')} run(s) the engine, and RG_GAME is not set. Set it in .env to the game's folder or .zip.`);
    return 1;
  }
  if (dirty.length) console.log(`\nThe work tree has ${dirty.length} uncommitted change(s): this run writes no stamp.`);
  if (dry) return 0;

  const done = [];
  for (const suite of steps) {
    console.log(`\n── ${suite.name}: ${suite.run}`);
    const t0 = performance.now();
    const r = spawnSync(suite.run, { cwd: root, stdio: 'inherit', shell: true, env: { ...process.env, ...suite.env } });
    const seconds = Math.round((performance.now() - t0) / 100) / 10;
    done.push({ name: suite.name, seconds, passed: r.status === 0 });
    if (r.status !== 0) break;
  }
  console.log('\ncheck:');
  for (const s of done) console.log(`  ${s.passed ? 'passed' : 'FAILED'}  ${s.name.padEnd(14)} ${s.seconds} s`);
  if (done.some(s => !s.passed)) { console.error('No stamp: fix the failure and run the check again.'); return 1; }

  // The stamp, if the tree is still as it was and still clean. A paths stamp never replaces an --all one of the same commit.
  if (dirty.length || lines(git('status', '--porcelain')).length || git('rev-parse', 'HEAD') !== head) {
    console.log('Passed, but the work tree is not clean (or HEAD moved): no stamp. Commit, and run the check again to stamp.');
    return 0;
  }
  const mode = all ? 'all' : 'paths';
  if (mode === 'paths' && readStamp(head)?.mode === 'all') { console.log(`Passed. ${head.slice(0, 8)} already has an --all stamp; kept.`); return 0; }
  fs.mkdirSync(STAMPS, { recursive: true });
  fs.writeFileSync(stampFile(head), JSON.stringify({ commit: head, mode, suites: done.map(({ name, seconds }) => ({ name, seconds })), date: new Date().toISOString() }, null, 2) + '\n');
  console.log(`Passed: stamped ${head.slice(0, 8)} (tmp/check/${head}.json, ${mode}).`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) process.exitCode = main(process.argv.slice(2));
