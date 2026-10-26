// Self-check for idle session expiry, LAN addresses, logins, polls and POST /seat: node server/gateway.test.js
const assert = require('assert');
for (const k of Object.keys(process.env)) if (k.startsWith('RG_')) delete process.env[k]; // the shell's .env mustn't change the result
process.env.RG_DB = ':memory:';
const { staleSessions, lanAddresses, handle, processRequest, seatRequest, db } = require('./gateway');

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

// Behind a proxy (Caddy) every browser has the proxy's address. Two players whose login R happens to match must each get their
// own session, and a retransmitted login must get its first reply again, not a second session.
const proxied = (text) => { let out; processRequest(text, '172.18.0.2', b => { out = b.toString('utf8'); }); return out; };
const sid = reply => reply.split('\n')[1].split('|')[0];
const bob = proxied('R=4242&V=1.4.4&C=1&P1=Bob&P2=');
const carol = proxied('R=4242&V=1.4.4&C=1&P1=Carol&P2=');
assert.match(bob, /^200 /);
assert.match(carol, /^200 /);
assert.notStrictEqual(sid(bob), sid(carol));
assert.strictEqual(proxied('R=4242&V=1.4.4&C=1&P1=Bob&P2='), bob);
console.log('gateway shared-address logins ok');

// The page resends a poll with the same R while the first copy is held, sometimes more than once. The newest copy takes over
// the held poll, so the events reach it, and a later copy gets that same reply from the cache.
const dave = sid(proxied('R=1&V=1.4.4&C=1&P1=Dave&P2=')), erin = sid(proxied('R=2&V=1.4.4&C=1&P1=Erin&P2='));
const copies = [];
const pollCopy = () => { const i = copies.push(null) - 1; processRequest(`R=77&V=1.4.4&S=${dave}&C=3&P1=1`, '172.18.0.2', b => { copies[i] = b.toString('utf8'); }); };
pollCopy(); pollCopy(); pollCopy();
proxied(`R=78&V=1.4.4&S=${erin}&C=306&P1=Dave`); // a friend request: an event for Dave
assert.match(copies[2], /^200 OK\n308\|\d+\|Erin\|/);
assert.deepStrictEqual(copies.slice(0, 2), [null, null]); // the copies it replaced get nothing, and nothing is cached for them
pollCopy();
assert.strictEqual(copies[3], copies[2]);
console.log('gateway poll resends ok');

// POST /seat (docs/adr/0038) asks with the login's credentials. Without Discord the name is the whole identity: Alice's name shows
// the seat she holds. A name nobody holds, or no name, shows nothing, and the question registers no name.
require('./battle.fixture').heldSeat(db.byName('Alice'));
const { held } = seatRequest({ name: 'Alice' });
assert.deepStrictEqual([held.seat, held.seats.map(s => s.name)], [1, ['Alice', 'Other']]);
assert.deepStrictEqual(seatRequest({ name: 'Nobody' }), {});
assert.strictEqual(db.byName('Nobody'), null);
assert.deepStrictEqual(seatRequest(null), {});
assert.deepStrictEqual(seatRequest({ name: ['Alice'] }), {});
console.log('gateway seat ok');
