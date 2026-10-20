// Self-check for bot logins: node server/bots.test.js
// A bot account must come only from this process's key and a running bot's id.
const assert = require('assert');
const bots = require('./bots');

assert.strictEqual(bots.account('CPU_1', ''), null);
assert.strictEqual(bots.account('CPU_1', 'password'), null);
assert.strictEqual(bots.account('CPU_1', 'abc:1'), null);
assert.strictEqual(bots.account('CPU_1', '0'.repeat(24) + ':1'), null);
assert.strictEqual(bots.available(), false); // no server address yet
bots.spawn(3, () => {}).then(list => assert.deepStrictEqual(list, [])); // and so no bot is started

// The Expert hero pool: heroes 0 to 9, each with a reason; a bad entry fails when the server starts.
assert.ok(bots.loadHeroes().length > 0);
const bad = require('path').join(require('os').tmpdir(), 'bot-heroes-test.json');
for (const list of [[{ hero: 10, why: 'x' }], [{ hero: 2 }], [{ hero: 1.5, why: 'x' }]]) {
  require('fs').writeFileSync(bad, JSON.stringify(list));
  assert.throws(() => bots.loadHeroes(bad), /needs a hero from 0 to 9 and a why/);
}
require('fs').rmSync(bad);
console.log('bot logins ok');
