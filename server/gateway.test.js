// Self-check for idle session expiry and LAN addresses: node server/gateway.test.js
const assert = require('assert');
const { staleSessions, lanAddresses } = require('./gateway');

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
