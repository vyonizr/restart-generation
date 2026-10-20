// Self-check for the admin's account delete (ADR 0016): node server/admin.test.js
const assert = require('assert');
const { open } = require('./store');
const { createAdmin } = require('./admin');

const TOKEN = 'long-enough-secret';
const setup = ({ token = TOKEN, discord = true } = {}) => {
  const store = open(':memory:');
  const live = new Set(), removed = [], logged = [];
  const admin = createAdmin({ store, token, discord, busy: id => live.has(id), remove: acc => removed.push(acc.name), log: m => logged.push(m) });
  return { store, admin, live, removed, logged };
};

// One request through admin.http: -> { code, body, handled }.
function call(admin, method, path, { token = TOKEN } = {}) {
  const req = { method, url: path, headers: token ? { authorization: `Bearer ${token}` } : {} };
  const out = { code: null, body: null };
  const res = {
    headersSent: false,
    writeHead(code) { out.code = code; this.headersSent = true; },
    end(text) { try { out.body = text ? JSON.parse(text) : null; } catch { out.body = text; } },
  };
  out.handled = admin.http(req, res, new URL(path, 'http://x'));
  return out;
}

// Off unless a token is set: every /admin/ path is a plain 404, and nothing is deleted, even with a token in the request.
let { admin, store } = setup({ token: '' });
const keep = store.create('Alice', 'member', 1, 'd1');
for (const [m, p] of [['GET', '/admin/account?name=Alice'], ['DELETE', '/admin/account?name=Alice']]) {
  for (const token of [TOKEN, '', 'x']) assert.strictEqual(call(admin, m, p, { token }).code, 404, `${m} ${token}`);
}
assert.ok(store.byName('Alice'));
assert.strictEqual(call(admin, 'GET', '/status').handled, false); // anything outside /admin/ is not its business

// With a token, a missing or wrong one is refused and nothing is deleted.
({ admin, store } = setup());
store.create('Alice', 'member', 1, 'd1');
for (const token of [null, '', 'wrong', TOKEN + 'x', TOKEN.slice(1)]) {
  assert.strictEqual(call(admin, 'DELETE', '/admin/account?name=Alice', { token }).code, 401, String(token));
}
assert.ok(store.byName('Alice'));
assert.strictEqual(call(admin, 'GET', '/admin/other').code, 404);

// What a delete would take away: found by name in any case, or by Discord ID.
let live, removed, logged;
({ admin, store, live, removed, logged } = setup());
const alice = store.create('Alice', 'member', 1, 'd1');
const bob = store.create('Bob', 'member', 1, 'd2');
alice.stats.fame = 250; alice.stats.matches = 7; store.save(alice);
store.setLinks(alice, bob, 'both', 'both');
store.putSave(alice, 'a.save', Buffer.from([1])); store.putSave(alice, 'b.save', Buffer.from([2, 3]));
const shown = { name: 'Alice', kind: 'member', fame: 250, matches: 7, friends: 1, files: 2, online: false };
assert.deepStrictEqual(call(admin, 'GET', '/admin/account?name=alice').body, shown);
assert.deepStrictEqual(call(admin, 'GET', '/admin/account?discord=d1').body, shown);
live.add(alice.id);
assert.strictEqual(call(admin, 'GET', '/admin/account?name=Alice').body.online, true);
live.clear();

// Exactly one of name and discord; and a name nobody has is a 404 that says so, unlike the switched-off endpoint's.
for (const q of ['', '?name=Alice&discord=d1', '?name=', '?discord=nobody', '?name=Nobody']) {
  const r = call(admin, 'GET', `/admin/account${q}`);
  assert.deepStrictEqual([r.code, r.body.error], q === '' || q.includes('&') ? [400, 'name_or_discord'] : [404, 'no_account'], q);
}
assert.strictEqual(call(admin, 'DELETE', '/admin/account').code, 400);
assert.ok(store.byName('Alice') && store.byName('Bob'));

// Deleting takes the account, its friend links, saved game and tokens, ends its sessions, and frees the name.
const token = store.issueToken(alice);
live.add(alice.id);
assert.strictEqual(call(admin, 'DELETE', '/admin/account?name=ALICE').code, 204);
assert.deepStrictEqual(removed, ['Alice']);
assert.deepStrictEqual(logged, ['admin deleted Alice']);
assert.strictEqual(store.byName('Alice'), null);
assert.strictEqual(store.byDiscord('d1'), null);
assert.strictEqual(store.byToken(token, 2), null);
assert.deepStrictEqual(store.friends(bob), []); // Bob loses the link to a friend who is gone
assert.deepStrictEqual(store.saves(alice), []);
assert.strictEqual(call(admin, 'DELETE', '/admin/account?name=Alice').code, 404); // a second delete finds nothing
assert.deepStrictEqual(removed, ['Alice']);
assert.ok(store.byName('Bob')); // and nobody else went with it
assert.ok(store.create('Alice', 'member', 3)); // the name is free again

// Guests are deleted too, by name; on a name-only server (no Discord IDs) a Discord lookup is refused, and a name works.
const guest = store.create('Guest000001', 'guest', 1);
assert.strictEqual(call(admin, 'DELETE', '/admin/account?name=Guest000001').code, 204);
assert.strictEqual(store.byId(guest.id), null);
({ admin, store } = setup({ discord: false }));
store.create('Named', 'named', 1);
assert.deepStrictEqual([call(admin, 'GET', '/admin/account?discord=1').code, call(admin, 'GET', '/admin/account?discord=1').body.error], [422, 'no_discord']);
assert.strictEqual(call(admin, 'GET', '/admin/account?name=Named').body.kind, 'named');
assert.strictEqual(call(admin, 'DELETE', '/admin/account?name=Named').code, 204);
assert.strictEqual(store.byName('Named'), null);

console.log('admin ok');
