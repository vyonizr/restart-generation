// Self-check for bot logins: node server/bots.test.js
// A bot account must come only from this process's key and a running bot's id.
const assert = require('assert');
const bots = require('./bots');

assert.strictEqual(bots.account('CPU_1', ''), null);
assert.strictEqual(bots.account('CPU_1', 'password'), null);
assert.strictEqual(bots.account('CPU_1', 'abc:1'), null);
assert.strictEqual(bots.account('CPU_1', '0'.repeat(24) + ':1'), null);
assert.strictEqual(bots.available(), false); // no server address yet
console.log('bot logins ok');
