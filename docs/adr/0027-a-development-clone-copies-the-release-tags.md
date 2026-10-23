# A development clone copies the release tags

The Notices dialog showed a commit hash, such as `236e91b`, on a server run from `development`, and `0.1.2-1-gabc1234` on a server that pulled a commit before CI tagged it. CI tags only the public `main`, whose commits `tools/publish.mjs` rewrites (ADR 0019), so `git describe` on `development` found no release. Now every `tools/publish.mjs` run, a dry run too, copies each public `vX.Y.Z` tag onto the source commit it came from, as a local tag that the script never pushes, and the server reports its **version** (CONTEXT.md) as SemVer: `0.1.2` for a release, and `0.1.2+3`, with the commits past the release as build metadata, for anything newer.

- **Matching.** `tools/publish.mjs` already matches each public commit to its source commit by author date, committer date, and message; the tags follow that match. A tag whose public commit matches nothing, or whose name this checkout already uses, is reported and left alone.
- **When it arrives.** CI tags a push only after its checks pass, so a push's tag reaches `development` at the next `tools/publish.mjs` run.
- **Conversion.** The server converts `git describe`'s output, or `RG_VERSION`, once at startup (`server/version.js`), so `/status` and the dialog say the same. Without a release to count from (a clone without tags, a copy without `.git`, an image built without `RG_VERSION`), `/status` reports what it was given, and the dialog shows no version rather than a made-up one.

## Considered options

- **Ask GitHub for the latest tag when the server starts.** Rejected: the server would depend on the network, and it still couldn't tell how far `development` is past that tag.
- **A `version` in `package.json`.** Rejected in ADR 0019: a bump committed on the public `main` blocks the next publish.
- **Show only the last release, `0.1.2`.** Rejected: a server running newer code would claim to run that release, to a player reporting a bug or a rights holder.
- **Guess the next release, such as `0.1.3-dev.3`.** Rejected: the next number depends on commits CI hasn't read, and before 1.0.0 a minor bump means a breaking change.
- **Keep the hash as build metadata, `0.1.2+3.236e91b`.** Rejected: the hash is what readers didn't want to see, and the commit count with the release is enough to find the code.
