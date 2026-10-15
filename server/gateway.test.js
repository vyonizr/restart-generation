// Self-check for idle session expiry: node server/gateway.test.js
const assert = require('assert');
const { staleSessions } = require('./gateway');

const now = 100000;
const sessions = new Map([['a', { name: 'gone', lastSeen: now - 46000 }], ['b', { name: 'here', lastSeen: now - 44000 }]]);
assert.deepEqual(staleSessions(sessions, now, 45000).map(s => s.name), ['gone']);
console.log('gateway idle expiry ok');
