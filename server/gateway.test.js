// Self-check for idle session expiry and LAN addresses: node server/gateway.test.js
const assert = require('assert');
process.env.RG_DB = ':memory:';
const { staleSessions, lanAddresses, handle } = require('./gateway');

const now = 100000;
const sessions = new Map([['a', { name: 'gone', lastSeen: now - 46000 }], ['b', { name: 'here', lastSeen: now - 44000 }]]);
assert.deepEqual(staleSessions(sessions, now, 45000).map(s => s.name), ['gone']);
console.log('gateway idle expiry ok');

const interfaces = {
  lo: [{ address: '127.0.0.1', family: 'IPv4', internal: true }],
  'Wi-Fi': [{ address: 'fe80::1', family: 'IPv6', internal: false }, { address: '192.168.1.20', family: 'IPv4', internal: false }],
  Ethernet: [{ address: '10.0.0.5', family: 'IPv4', internal: false }],
};
assert.deepEqual(lanAddresses(interfaces), [['Wi-Fi', '192.168.1.20'], ['Ethernet', '10.0.0.5']]);
console.log('gateway lan addresses ok');

let reply;
handle({ cmd: 1, params: { 1: 'CPU_1', 2: 'password' } }, null, r => { reply = r; });
assert.match(reply, /^965 /);
handle({ cmd: 1, params: { 1: 'cpu_12', 2: '' } }, null, r => { reply = r; });
assert.match(reply, /^965 /);
console.log('gateway bot names ok');

// Without Discord, a name is the whole identity: the first login registers it and a second login drops the first session.
const names = [];
for (let i = 0; i < 2; i++) handle({ cmd: 1, params: { 1: 'Alice', 2: '' } }, null, r => names.push(r));
assert.match(names[0], /^200 /);
assert.match(names[1], /^200 /);
assert.notStrictEqual(names[0].split('\n')[1], names[1].split('\n')[1]); // a new session each time
console.log('gateway name login ok');
