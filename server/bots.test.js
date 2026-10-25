// Self-check for bot logins: node server/bots.test.js
// A bot account must come only from this process's key and a running bot's id.
const assert = require('assert');
for (const k of Object.keys(process.env)) if (k.startsWith('RG_')) delete process.env[k]; // the shell's .env mustn't change the result
const bots = require('./bots');

assert.strictEqual(bots.account('CPU_1', ''), null);
assert.strictEqual(bots.account('CPU_1', 'password'), null);
assert.strictEqual(bots.account('CPU_1', 'abc:1'), null);
assert.strictEqual(bots.account('CPU_1', '0'.repeat(24) + ':1'), null);
assert.strictEqual(bots.available(), false); // no server address yet
bots.spawn(3, () => {}).then(list => assert.deepStrictEqual(list, [])); // and so no bot is started
console.log('bot logins ok');
