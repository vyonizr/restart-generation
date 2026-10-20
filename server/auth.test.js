// Self-check for guests and members: node server/auth.test.js
const assert = require('assert');
const { Readable } = require('stream');
const { open } = require('./store');
const { configFrom, modeFrom, createAuth, GUEST_IDLE_MS } = require('./auth');

assert.strictEqual(configFrom({}).enabled, false);
assert.strictEqual(configFrom({ RG_DISCORD_INVITE: 'https://discord.gg/abc-123' }).invite, 'https://discord.gg/abc-123');
assert.strictEqual(configFrom({ RG_DISCORD_INVITE: 'javascript:alert(1)' }).invite, ''); // the page links to it, so only Discord addresses pass
assert.strictEqual(configFrom({ RG_DISCORD_INVITE: 'https://discord.gg.evil.test/x' }).invite, '');
assert.strictEqual(configFrom({ RG_DISCORD_CLIENT_ID: 'a', RG_DISCORD_CLIENT_SECRET: 'b' }).enabled, false); // no public address
assert.strictEqual(configFrom({ RG_DISCORD_CLIENT_ID: 'a', RG_DISCORD_CLIENT_SECRET: 'b', RG_PUBLIC_URL: 'https://x.test/' }).enabled, true);

// The server's mode: --lan is name-only whatever the Discord settings, --public and a plain start use Discord when it is configured,
// and the two kinds of server keep separate account files.
const DISCORD = { RG_DISCORD_CLIENT_ID: 'a', RG_DISCORD_CLIENT_SECRET: 'b', RG_PUBLIC_URL: 'https://x.test' };
const mode = (flags, env) => { const m = modeFrom(['node', 'gateway.js', ...flags], env); return [m.listenAll, m.discord, m.config.enabled, m.db, m.ignoredDiscord]; };
assert.deepStrictEqual(mode([], {}), [false, false, false, 'accounts-names.db', false]);
assert.deepStrictEqual(mode([], DISCORD), [false, true, true, 'accounts.db', false]);              // this PC only, to try the sign-in
assert.deepStrictEqual(mode(['--lan'], {}), [true, false, false, 'accounts-names.db', false]);
assert.deepStrictEqual(mode(['--lan'], DISCORD), [true, false, false, 'accounts-names.db', true]);  // Discord is configured, --lan turns it off
assert.deepStrictEqual(mode(['--public'], DISCORD), [true, true, true, 'accounts.db', false]);
assert.deepStrictEqual(mode(['--public'], {}), [true, false, false, 'accounts-names.db', false]);   // nothing configured: name-only
assert.throws(() => modeFrom(['--lan', '--public'], DISCORD), /choose one/);
// Only --public marks a server for the internet, which never runs Bots.
assert.deepStrictEqual([[], ['--lan'], ['--public']].map(f => modeFrom(['node', 'gateway.js', ...f], DISCORD).public), [false, false, true]);

let clock = 1e12;
const setup = (over = {}) => {
  const store = open(':memory:');
  const config = { ...configFrom({ RG_DISCORD_CLIENT_ID: 'id', RG_DISCORD_CLIENT_SECRET: 's', RG_PUBLIC_URL: 'https://x.test' }), ...over.config };
  const live = new Set(), removed = [];
  const who = { id: 'd1', username: 'Cool User!' };
  const auth = createAuth({
    store, config, now: () => clock,
    busy: id => live.has(id), remove: acc => removed.push(acc.name),
    discord: { authorizeUrl: s => `https://discord.test/authorize?state=${s}`, identify: async () => who },
  });
  return { store, auth, live, removed, who };
};

// One request through auth.http: -> { code, body }.
async function call(auth, method, path, { body, bytes, token, ip = '1.1.1.1', headers = {} } = {}) {
  const req = Readable.from(bytes ? [Buffer.from(bytes)] : body === undefined ? [] : [Buffer.from(JSON.stringify(body))]);
  Object.assign(req, { method, url: path, headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, socket: { remoteAddress: ip } });
  const out = { code: null, body: null, location: null };
  const res = {
    headersSent: false,
    writeHead(code, h = {}) { out.code = code; out.location = h.Location ?? null; this.headersSent = true; },
    end(text) { try { out.body = text ? JSON.parse(text) : null; } catch { out.body = text; } },
  };
  await auth.http(req, res, new URL(path, 'http://x'));
  return out;
}

(async () => {
  // Guests: a name and a token, and the token must belong to that name.
  let { auth, store, live, removed, who } = setup();
  const g = (await call(auth, 'POST', '/auth/guest')).body;
  assert.match(g.name, /^Guest\d{6}$/);
  assert.strictEqual(auth.login(g.name, g.token).name, g.name);
  assert.strictEqual(auth.login(g.name.toLowerCase(), g.token).name, g.name);
  assert.strictEqual(auth.login(g.name, 'wrong'), null);
  assert.strictEqual(auth.login(g.name, ''), null);
  const other = (await call(auth, 'POST', '/auth/guest', { ip: '2.2.2.2' })).body;
  assert.strictEqual(auth.login(g.name, other.token), null); // someone else's token does not open this name
  assert.strictEqual((await call(auth, 'GET', '/auth/me', { token: g.token })).body.name, g.name);
  assert.strictEqual((await call(auth, 'GET', '/auth/me', { token: 'nope' })).code, 401);

  // A guest is wiped after a day idle, unless it is online, and its token stops working.
  clock += GUEST_IDLE_MS - 1000;
  assert.strictEqual(auth.sweep(), 0);
  clock += 2000;
  live.add(store.byName(g.name).id); live.add(store.byName(other.name).id);
  assert.strictEqual(auth.sweep(), 0); // online, so spared
  live.delete(store.byName(other.name).id);
  assert.strictEqual(auth.sweep(), 1);
  live.clear();
  assert.strictEqual(auth.sweep(), 1); // both guests are past a day
  assert.strictEqual(auth.login(g.name, g.token), null);
  assert.strictEqual((await call(auth, 'GET', '/auth/me', { token: g.token })).code, 401);

  // New guests per address are limited, and one address does not use up another's allowance.
  ({ auth } = setup({ config: { guestsPerIpHour: 2, guestCap: 3 } }));
  assert.strictEqual((await call(auth, 'POST', '/auth/guest')).code, 200);
  assert.strictEqual((await call(auth, 'POST', '/auth/guest')).code, 200);
  assert.strictEqual((await call(auth, 'POST', '/auth/guest')).code, 429);
  assert.strictEqual((await call(auth, 'POST', '/auth/guest', { ip: '9.9.9.9' })).code, 200);
  assert.strictEqual((await call(auth, 'POST', '/auth/guest', { ip: '8.8.8.8' })).code, 503); // the cap on guests
  clock += 3600e3 + 1;
  assert.strictEqual((await call(auth, 'POST', '/auth/guest')).code, 503); // still capped by count
  // A forged X-Forwarded-For is ignored unless the admin trusts the proxy; then the proxy's own entry counts.
  ({ auth } = setup({ config: { guestsPerIpHour: 1, trustProxy: false } }));
  await call(auth, 'POST', '/auth/guest', { headers: { 'x-forwarded-for': '5.5.5.5' } });
  assert.strictEqual((await call(auth, 'POST', '/auth/guest', { headers: { 'x-forwarded-for': '6.6.6.6' } })).code, 429);
  ({ auth } = setup({ config: { guestsPerIpHour: 1, trustProxy: true } }));
  await call(auth, 'POST', '/auth/guest', { headers: { 'x-forwarded-for': 'forged, 5.5.5.5' } });
  assert.strictEqual((await call(auth, 'POST', '/auth/guest', { headers: { 'x-forwarded-for': 'other, 5.5.5.5' } })).code, 429);
  assert.strictEqual((await call(auth, 'POST', '/auth/guest', { headers: { 'x-forwarded-for': 'other, 6.6.6.6' } })).code, 200);

  // Signing in: a guest with progress becomes a member, keeping its account.
  ({ auth, store, live, removed, who } = setup());
  const guest = (await call(auth, 'POST', '/auth/guest')).body;
  const acc = store.byName(guest.name);
  acc.stats.fame = 40; acc.stats.matches = 4; store.save(acc);
  const friend = store.create('Pal', 'member', clock, 'd9');
  store.setLinks(acc, friend, 'both', 'both');

  const start = (await call(auth, 'POST', '/auth/discord/start', { token: guest.token })).body;
  const state = new URL(start.url).searchParams.get('state');
  const back = new URL((await call(auth, 'GET', `/auth/discord/callback?code=abc&state=${state}`)).location, 'http://x');
  const code = new URLSearchParams(back.hash.slice(1)).get('signin');
  assert.ok(code);
  assert.strictEqual((await call(auth, 'GET', `/auth/discord/callback?code=abc&state=${state}`)).location, '/#signin-error=cancelled'); // a state works once

  const ex = (await call(auth, 'POST', '/auth/exchange', { body: { code } })).body;
  assert.deepStrictEqual(ex, { status: 'name', suggested: 'CoolUser' });
  for (const [name, error] of [['', 'invalid'], ['has space', 'invalid'], ['Guest123456', 'reserved'], ['cpu_7', 'reserved'], ['PAL', 'taken']]) {
    const r = await call(auth, 'POST', '/auth/finish', { body: { code, name } });
    assert.deepStrictEqual([r.code, r.body.error], [422, error], name);
  }
  const done = (await call(auth, 'POST', '/auth/finish', { body: { code, name: 'CoolUser' } })).body;
  assert.strictEqual(done.name, 'CoolUser');
  assert.strictEqual(store.byName('CoolUser'), acc); // the same account
  assert.deepStrictEqual([acc.kind, acc.stats.fame, store.linkState(acc, friend)], ['member', 40, 'both']);
  assert.strictEqual(auth.login('CoolUser', done.token), acc);
  assert.strictEqual(auth.login('CoolUser', guest.token), null); // the guest token is gone
  assert.strictEqual((await call(auth, 'POST', '/auth/finish', { body: { code, name: 'Again' } })).code, 404); // a code works once

  // The same Discord user signing in with a new guest: the member wins, and a guest with progress needs a confirmation.
  const g2 = (await call(auth, 'POST', '/auth/guest', { ip: '3.3.3.3' })).body;
  const a2 = store.byName(g2.name);
  a2.stats.fame = 10; a2.stats.matches = 1; store.save(a2);
  const s2 = new URL((await call(auth, 'POST', '/auth/discord/start', { token: g2.token })).body.url).searchParams.get('state');
  const c2 = new URLSearchParams(new URL((await call(auth, 'GET', `/auth/discord/callback?code=x&state=${s2}`)).location, 'http://x').hash.slice(1)).get('signin');
  assert.deepStrictEqual((await call(auth, 'POST', '/auth/exchange', { body: { code: c2 } })).body, { status: 'confirm', name: 'CoolUser', guestFame: 10 });
  assert.strictEqual((await call(auth, 'POST', '/auth/finish', { body: { code: c2 } })).code, 409);
  assert.ok(store.byName(g2.name)); // still there: nothing was lost without a yes
  const merged = (await call(auth, 'POST', '/auth/finish', { body: { code: c2, confirm: true } })).body;
  assert.strictEqual(merged.name, 'CoolUser');
  assert.strictEqual(store.byName(g2.name), null);
  assert.deepStrictEqual(removed, [g2.name]); // its sessions were ended
  assert.strictEqual(acc.stats.fame, 40); // the member's own progress is untouched

  // A guest with no progress does not need asking, and a plain visit with no guest signs straight in.
  const g3 = (await call(auth, 'POST', '/auth/guest', { ip: '4.4.4.4' })).body;
  const s3 = new URL((await call(auth, 'POST', '/auth/discord/start', { token: g3.token })).body.url).searchParams.get('state');
  const c3 = new URLSearchParams(new URL((await call(auth, 'GET', `/auth/discord/callback?code=x&state=${s3}`)).location, 'http://x').hash.slice(1)).get('signin');
  assert.strictEqual((await call(auth, 'POST', '/auth/exchange', { body: { code: c3 } })).body.status, 'done');
  assert.strictEqual(store.byName(g3.name), null);
  const s4 = new URL((await call(auth, 'POST', '/auth/discord/start')).body.url).searchParams.get('state');
  const c4 = new URLSearchParams(new URL((await call(auth, 'GET', `/auth/discord/callback?code=x&state=${s4}`)).location, 'http://x').hash.slice(1)).get('signin');
  assert.strictEqual((await call(auth, 'POST', '/auth/exchange', { body: { code: c4 } })).body.status, 'done');

  // Members stay signed in for 90 days of use, sign out, and delete themselves.
  const member = (await call(auth, 'POST', '/auth/exchange', { body: { code: c4 } })).code; // already used
  assert.strictEqual(member, 404);
  const tok = merged.token;
  clock += 80 * 86400e3;
  assert.strictEqual(auth.login('CoolUser', tok), acc); // used, so pushed out another 90 days
  clock += 80 * 86400e3;
  assert.strictEqual(auth.login('CoolUser', tok), acc);
  clock += 91 * 86400e3;
  assert.strictEqual(auth.login('CoolUser', tok), null);
  const again = merged.token;
  assert.strictEqual((await call(auth, 'POST', '/auth/signout', { token: again })).code, 204);
  assert.strictEqual(auth.login('CoolUser', again), null);

  const fresh = setup();
  const gx = (await call(fresh.auth, 'POST', '/auth/guest')).body;
  const ax = fresh.store.byName(gx.name);
  fresh.store.setLinks(ax, fresh.store.create('Friend', 'member', clock), 'both', 'both');
  assert.strictEqual((await call(fresh.auth, 'POST', '/auth/delete', { token: gx.token })).code, 204);
  assert.strictEqual(fresh.store.byName(gx.name), null);
  assert.deepStrictEqual(fresh.removed, [gx.name]);
  assert.strictEqual((await call(fresh.auth, 'POST', '/auth/delete', { token: gx.token })).code, 401);

  // A member's saved game (ADR 0014): the engine's files, kept per account, for members only.
  ({ auth, store } = setup());
  const sg = (await call(auth, 'POST', '/auth/guest')).body;
  const saver = store.create('Saver', 'member', clock), saverToken = store.issueToken(saver);
  const rival = store.create('Rival', 'member', clock), rivalToken = store.issueToken(rival);
  const put = (name, bytes, token = saverToken) => call(auth, 'PUT', `/auth/saves/${name}`, { bytes, token });
  assert.strictEqual((await call(auth, 'GET', '/auth/saves', { token: sg.token })).code, 403); // a guest keeps its files in the browser
  assert.strictEqual((await put('single_player_game.save', [1], sg.token)).code, 403);
  assert.strictEqual((await call(auth, 'GET', '/auth/saves', { token: 'nope' })).code, 401);
  assert.deepStrictEqual((await call(auth, 'GET', '/auth/saves', { token: saverToken })).body, { files: {} });
  assert.strictEqual((await put('single_player_game.save', [1, 2, 3])).code, 204);
  assert.strictEqual((await put('single_player_game.save', [9, 8])).code, 204); // a second write replaces the first
  assert.strictEqual((await put('settings.cfg', [])).code, 204); // an empty file is a file
  assert.deepStrictEqual((await call(auth, 'GET', '/auth/saves', { token: saverToken })).body, { files: { 'settings.cfg': '', 'single_player_game.save': Buffer.from([9, 8]).toString('base64') } });
  assert.deepStrictEqual((await call(auth, 'GET', '/auth/saves', { token: rivalToken })).body, { files: {} }); // one member's files are theirs alone
  for (const name of ['noextension', '..%2Fx.save', 'a b.save', 'x.toolongext', '.save']) assert.strictEqual((await put(name, [1])).code, 400, name);
  assert.strictEqual((await call(auth, 'DELETE', '/auth/saves/settings.cfg', { token: saverToken })).code, 204);
  assert.deepStrictEqual(Object.keys((await call(auth, 'GET', '/auth/saves', { token: saverToken })).body.files), ['single_player_game.save']);

  // Limits: 256 KB a file, 1 MB in all and 16 files; a write that is refused leaves what the member had.
  assert.strictEqual((await put('big.save', Buffer.alloc(256 * 1024 + 1))).code, 413);
  assert.strictEqual((await put('big.save', Buffer.alloc(256 * 1024))).code, 204);
  for (const n of ['b', 'c', 'd']) assert.strictEqual((await put(`${n}.save`, Buffer.alloc(256 * 1024))).code, n === 'd' ? 413 : 204, n); // the fourth full file, with 2 bytes already held, passes 1 MB
  assert.strictEqual((await put('single_player_game.save', Buffer.alloc(256 * 1024))).code, 204); // replacing a file counts only its new size
  ({ auth, store } = setup());
  const packed = store.create('Packed', 'member', clock), packedToken = store.issueToken(packed);
  for (let i = 0; i < 16; i++) assert.strictEqual((await put(`f${i}.dat`, [i], packedToken)).code, 204);
  assert.strictEqual((await put('f16.dat', [1], packedToken)).code, 413);
  assert.strictEqual((await put('f3.dat', [7, 7], packedToken)).code, 204); // but a file it holds can still change
  // Deleting the account takes its files with it.
  assert.strictEqual((await call(auth, 'POST', '/auth/delete', { token: packedToken })).code, 204);
  assert.deepStrictEqual(store.saves(packed), []);

  // Without a Discord application there is no /auth at all.
  const off = createAuth({ store: open(':memory:'), config: configFrom({}), busy: () => false, remove() {} });
  assert.strictEqual((await call(off, 'POST', '/auth/guest')).code, 404);
  assert.strictEqual(off.enabled, false);

  console.log('auth ok');
})().catch(e => { console.error(e); process.exit(1); });
