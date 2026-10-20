// Self-check for SNAP login on a server with Discord sign-in: node server/gateway.auth.test.js
const assert = require('assert');
Object.assign(process.env, { RG_DB: ':memory:', RG_DISCORD_CLIENT_ID: 'id', RG_DISCORD_CLIENT_SECRET: 'secret', RG_PUBLIC_URL: 'https://x.test' });
const { handle, db } = require('./gateway');

const login = (user, password) => { let r; handle({ cmd: 1, params: { 1: user, 2: password } }, null, x => { r = x; }); return r; };

const guest = db.create('Guest000001', 'guest', Date.now());
const token = db.issueToken(guest);
assert.match(login('Alice', ''), /^965 /);              // a name alone is no longer an identity
assert.match(login('Guest000001', ''), /^965 /);
assert.match(login('Guest000001', 'nope'), /^965 /);
assert.match(login('Alice', token), /^965 /);            // a token opens only its own name
assert.match(login('Guest000001', token), /^200 /);
assert.strictEqual(db.byName('Alice'), null);            // nothing was registered by the refused logins
console.log('gateway token login ok');
