# Releases are tagged in CI on the public main

Every push to the public repository's `main` makes a release (CONTEXT.md "Release"): a GitHub Actions workflow runs release-it, which picks the next SemVer number from the Conventional Commits in the push, tags the pushed commit `vX.Y.Z`, and writes the notes into a GitHub Release. It commits nothing. `tools/publish.mjs` is the only writer of the public `main`, and it stops when that branch has a commit that `development` doesn't (ADR 0018), so a bump commit made on `main` would block the next publish.

## Considered options

- **Release locally on `development`, before publishing.** Rejected. The bump commit would pass through the rewrite, but tags would point at source commits, which aren't the published ones, and `tools/publish.mjs` pushes no tags. It also isn't "on every push".
- **CI commits the bump to `main`, and `tools/publish.mjs` brings it back to `development`.** Rejected: two writers of the public `main`, and the publish guard would need an exception.
- **Always a patch bump, with no commit convention.** Rejected: the number would say nothing about what an update asks of an admin.
- **release-it as a devDependency.** Rejected: the Docker page stage runs `npm ci`, so every image build would install it. The workflow runs a pinned `npx release-it` instead.

## Consequences

- `package.json` has no `version`, and the repository has no `CHANGELOG.md`. The tags and the GitHub Releases are the record. Nothing is published to npm.
- One `tools/publish.mjs --push` is one push, so one publish run is one release, even when it only holds `docs:` or `chore:` commits: every commit type counts for a patch, and the release notes list every type.
- Commits use Conventional Commits from this ADR on. A `commit-msg` hook (`npm run hooks`) and `tools/publish.mjs` refuse other subjects; merge commits and git's own `Revert "…"` are exempt. Older commits stay as they are and add nothing to the release notes.
- The first release, made when no tag exists yet, is `0.1.0`. Until `1.0.0`, `preMajor` lowers every bump by one level, so a minor bump means a breaking change (CONTEXT.md "Breaking change") and everything else is a patch. Changed by [ADR 0032](0032-before-1-0-a-feature-raises-the-minor-version.md): before `1.0.0`, a feature raises the minor number too, and `.release-it.mjs` replaces `.release-it.json`. A manual run of the workflow releases a version typed in by hand: `1.0.0` when the public server opens.
- The server reports its version in `/status`, and the Notices dialog shows it from there. It takes `RG_VERSION`, which the Docker build sets from a build argument because the image has no `.git`, then `git describe --tags --always`, then `dev`. A clone of `development` showed a commit hash, because the tags are on the rewritten commits; [ADR 0027](0027-a-development-clone-copies-the-release-tags.md) copies them onto `development` and reports the version as SemVer. An image built without `RG_VERSION` reports `unknown`.
- On the VPS, `docker compose up -d --build` runs with `RG_VERSION=$(git describe --tags --always)` in front (docs/DEPLOY.md). A pull made before the workflow tags the commit shows the commits past the last release, such as `0.1.2+1` (ADR 0027).
- A release is tagged only after the legal check and `npm test` pass in the same workflow. A push that fails gets no release; the next push that passes releases everything since the last tag, so the tag means the checks passed. This matters more without a staging server.
