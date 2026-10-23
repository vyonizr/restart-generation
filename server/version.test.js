// Self-check for the version a server reports (docs/adr/0027): node server/version.test.js
const assert = require('assert');
const { versionOf } = require('./version');

// A release, and the commits past one
assert.strictEqual(versionOf('v0.1.2'), '0.1.2');
assert.strictEqual(versionOf('v0.1.2-3-gabc1234'), '0.1.2+3');
assert.strictEqual(versionOf('v0.10.12-140-g236e91b0c'), '0.10.12+140');
// A pre-release tag keeps its label, with the commits past it as build metadata
assert.strictEqual(versionOf('v1.0.0-rc.1'), '1.0.0-rc.1');
assert.strictEqual(versionOf('v1.0.0-rc.1-2-gdeadbee'), '1.0.0-rc.1+2');
// No release to count from: what the server knows passes through, and the page shows no version
for (const raw of ['236e91b', 'dev', 'unknown', 'v1.2', 'release-5-gabc1234']) assert.strictEqual(versionOf(raw), raw);

console.log('version ok');
