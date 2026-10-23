// The version a server reports (CONTEXT.md "Version", docs/adr/0027), from what `git describe --tags` says of its checkout: the
// release tag v0.1.2 is 0.1.2, and v0.1.2-3-gabc1234, three commits past that release, is 0.1.2+3 (SemVer build metadata). Anything
// else, such as a bare commit with no release before it, dev or unknown, isn't a version and passes through as it is.
const DESCRIBED = /^v?(\d+\.\d+\.\d+(?:-[0-9A-Za-z.]+)?)(?:-(\d+)-g[0-9a-f]+)?$/;

function versionOf(described) {
  const m = DESCRIBED.exec(described);
  return m ? m[1] + (m[2] ? `+${m[2]}` : '') : described;
}

module.exports = { versionOf };
