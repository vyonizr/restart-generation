// How the release workflow numbers and describes a release (docs/adr/0019, docs/adr/0032). release-it reads this file from the
// checkout; the workflow installs release-it and its changelog plugin outside the project, so this file imports nothing from them.
import { execFileSync } from 'node:child_process';

// The last release, which decides the rules: below 1.0.0, a feature or a breaking change raises the minor number and everything
// else the patch number (ADR 0032); from 1.0.0, SemVer's own (a breaking change raises the major number, a feature the minor).
const lastTag = () => {
  try { return execFileSync('git', ['describe', '--tags', '--abbrev=0', '--match', 'v*'], { encoding: 'utf8' }).trim(); }
  catch { return ''; }
};
const LEVEL = { major: 0, minor: 1, patch: 2 };

// conventional-recommended-bump's rule: `commits` are the parsed commits since the last tag. Every commit type counts for at least
// a patch, as the release notes list every type (ADR 0019). A breaking change is a `!` subject or a BREAKING CHANGE footer.
function whatBump(commits) {
  if (!commits.length) return null;
  const breaking = commits.filter(c => c.notes?.some(n => /^BREAKING[ -]CHANGE$/.test(n.title))).length;
  const features = commits.filter(c => c.type === 'feat' || c.type === 'feature').length;
  let level = breaking ? LEVEL.major : features ? LEVEL.minor : LEVEL.patch;
  if (/^v0\./.test(lastTag()) && level === LEVEL.major) level = LEVEL.minor;
  return { level, reason: `${breaking} breaking change${breaking === 1 ? '' : 's'} and ${features} feature${features === 1 ? '' : 's'}` };
}

export default {
  git: { commit: false, tagName: 'v${version}', tagAnnotation: 'Release ${version}', requireBranch: 'main' },
  npm: false,
  github: { release: true, releaseName: 'v${version}' },
  plugins: {
    '@release-it/conventional-changelog': {
      infile: false,
      whatBump,
      preset: {
        name: 'conventionalcommits',
        types: [
          { type: 'feat', section: 'Features' },
          { type: 'fix', section: 'Fixes' },
          { type: 'perf', section: 'Performance' },
          { type: 'revert', section: 'Reverts' },
          { type: 'refactor', section: 'Refactoring' },
          { type: 'docs', section: 'Documentation' },
          { type: 'test', section: 'Tests' },
          { type: 'build', section: 'Build' },
          { type: 'ci', section: 'CI' },
          { type: 'style', section: 'Style' },
          { type: 'chore', section: 'Chores' },
        ],
      },
    },
  },
};
