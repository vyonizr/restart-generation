# Before 1.0, a feature raises the minor version

ADR 0019 numbered releases with release-it's `preMajor`: below `1.0.0`, a breaking change (CONTEXT.md) raised the minor number and everything else, features included, the patch number. The owner wants a release with a new feature to say so in its number, so before `1.0.0` a release now raises the minor number when it holds a feature (`feat`) or a breaking change, and the patch number otherwise. From `1.0.0`, SemVer's own rule applies, as before: a breaking change raises the major number, a feature the minor.

`.release-it.mjs` replaces `.release-it.json`, because the rule is a function (`whatBump`), which JSON can't hold. It reads the last `v*` tag to tell which side of `1.0.0` it is on. The release notes are unchanged: every commit type, grouped by type, with a breaking change's `BREAKING CHANGE:` footer in their own section.

## Considered options

- **Keep ADR 0019's numbers.** Rejected by the owner: `0.4.2` after a feature reads as a bug fix.
- **Turn `preMajor` off.** Rejected: a breaking change would then release `1.0.0`, which ADR 0019 keeps for the public server's opening, by hand.
- **Number this release by hand with the workflow's version input.** Rejected: the push releases first, so the commit would carry two tags, and every later feature would need the same.

## Consequences

- Before `1.0.0`, a new minor number no longer means a breaking change. An admin reads the notes of every release since the one they run; a breaking change is the one with a BREAKING CHANGES section, which says what to do (`docs/DEPLOY.md`, `CONTRIBUTING.md`).
- The first release under this rule is `0.5.0`, after `0.4.1`.
