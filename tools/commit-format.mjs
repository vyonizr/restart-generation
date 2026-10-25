// The commit subject format that releases are numbered from (ADR 0019, CONTRIBUTING.md): Conventional Commits.
//   node tools/commit-format.mjs <message file>   the commit-msg hook (.githooks/commit-msg); exit code 1 refuses the commit
// tools/publish-check.mjs imports badSubject to refuse publishing a commit that the hook would have refused.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

export const TYPES = ['feat', 'fix', 'perf', 'refactor', 'docs', 'test', 'build', 'ci', 'chore', 'revert', 'style'];
const CONVENTIONAL = new RegExp(`^(${TYPES.join('|')})(\\([^()\\s]+\\))?!?: \\S`);
// Subjects that git writes itself: a merge, and git revert's default. They are exempt.
const GIT_WRITTEN = /^(Merge |Revert ")/;

// Why a subject is refused, or null when it is fine.
export function badSubject(subject) {
  if (GIT_WRITTEN.test(subject) || CONVENTIONAL.test(subject)) return null;
  return `"${subject}" is not "type: subject" or "type(scope): subject", with type one of ${TYPES.join(', ')} ("type!:" for a breaking change)`;
}

// The subject of a message as git will store it: the first line that isn't empty or a comment.
export const subjectOf = message => message.split(/\r?\n/).find(line => line.trim() && !line.startsWith('#'))?.trim() ?? '';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const subject = subjectOf(fs.readFileSync(process.argv[2], 'utf8'));
  // A fixup or squash commit is folded into another one before it is published, and git writes its subject.
  const problem = /^(fixup|squash|amend)! /.test(subject) ? null : badSubject(subject);
  if (problem) {
    console.error(`Commit refused: ${problem}.\nFor example: "fix: show the game download as a percentage of its bytes". See CONTRIBUTING.md.`);
    process.exit(1);
  }
}
