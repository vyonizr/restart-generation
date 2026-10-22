// Self-check for the page's SNAP client over a connection that drops: node web/snap.test.mjs
// A fake gateway and a fake clock stand in for fetch and timers; the replies are made up, in the protocol's format (docs/protocol.md).
import assert from 'node:assert';
import { SnapClient } from './snap.js';
import { CMD, REPLY } from './snap-ids.js';

const settle = () => new Promise(r => setImmediate(r));

// Timers that run only when the test moves time on.
function fakeClock() {
  let now = 0, next = 1;
  const timers = new Map(); // id -> { at, fn }
  return {
    now: () => now,
    setTimeout: (fn, ms) => { timers.set(next, { at: now + Math.max(0, ms), fn }); return next++; },
    clearTimeout: id => timers.delete(id),
    async advance(ms) {
      const end = now + ms;
      for (;;) {
        await settle();
        const [id, due] = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0] || [];
        if (!due) break;
        timers.delete(id); now = due.at; due.fn();
      }
      now = end;
      await settle();
    },
  };
}

const LOGIN = {
  [CMD.INIT]: '200 OK\n',
  [CMD.EXTENDED_LOGIN]: '200 OK\nsid|sid|sid|7\n',
  [CMD.GET_LOBBIES]: '200 OK\n1|resgen|1|0\n',
  [CMD.JOIN_LOBBY]: '200 OK\n',
  [CMD.UNIFIED_LOGOUT]: '200 OK\n',
  [CMD.SEND_GAME_PACKET_TO_GAME_SERVER]: '200 OK\n',
};
const presence = name => `307|9|${name}|available|42713|9|1||0|0|0|0|${btoa('SM2.0.1,')}`;

// A signed-in client. `answer(request)` decides each reply first: a body, { status, body }, 'drop' (the fetch fails) or 'hold'
// (no reply until the page aborts it); undefined falls back to the login replies, and a poll is held. `idle` is how long the page
// is open before the login.
async function signedIn(answer = () => undefined, { idle = 0 } = {}) {
  const clock = fakeClock(), sent = [], engine = [];
  const fetch = (url, { body, signal }) => {
    const field = k => body.split('&').find(f => f.startsWith(`${k}=`)).slice(k.length + 1);
    const req = { body, cmd: +field('C'), rid: field('R') };
    sent.push(req);
    const a = answer(req) ?? LOGIN[req.cmd] ?? 'hold';
    if (a === 'drop') return Promise.reject(new TypeError('Failed to fetch'));
    if (a === 'hold') return new Promise((_, reject) => signal.addEventListener('abort', () => reject(new Error('aborted'))));
    const { status = 200, body: text } = typeof a === 'string' ? { body: a } : a;
    return Promise.resolve({ status, text: async () => text });
  };
  const ui = { startLogin() {}, stopLogin() {}, attempting() {}, rejected() {}, accepted() {}, visible: () => false, credentials: () => ({ username: 'tester', password: 'x' }) };
  const client = new SnapClient({ ui, fetch, clock });
  client.attach({ jni: { str: s => s, ref: x => x }, snapEvent: (...e) => engine.push(e), readNet: len => new Uint8Array(len).fill(5), writeNet() {} });
  const snap = client.methods();
  await clock.advance(idle);
  snap.login();
  await clock.advance(0);
  // What the engine has been told so far.
  const told = () => { client.pump(); return engine; };
  const disconnects = () => told().filter(e => e[0] === 'onDisconnectedFromNAF@12').map(e => e[1]);
  const polls = () => sent.filter(r => r.cmd === CMD.RETRIEVE_ALL_EVENTS);
  assert.ok(told().some(e => e[0] === 'onArenaLoginCompleted@8'));
  return { client, snap, clock, sent, told, disconnects, polls };
}

// A dropped poll is resent unchanged, R included, so the gateway's reply cache can answer it; its events reach the engine.
{
  let n = 0;
  const t = await signedIn(r => r.cmd === CMD.RETRIEVE_ALL_EVENTS ? [, 'drop', `200 OK\n${presence('Pal')}\n`][++n] : undefined);
  await t.clock.advance(1000);
  const [first, again, next] = t.polls();
  assert.strictEqual(again.body, first.body);
  assert.notStrictEqual(next.rid, first.rid); // the poll after a reply is a new request
  assert.ok(t.told().some(e => e[0] === 'onPresence@20' && e[1] === 'Pal'));
  assert.deepStrictEqual(t.disconnects(), []);
}

// A proxy's 502, or a page that isn't a SNAP reply, is resent like a dropped request: it never ends the session.
{
  let n = 0;
  const t = await signedIn(r => r.cmd === CMD.RETRIEVE_ALL_EVENTS
    ? [, { status: 502, body: '502 Bad Gateway' }, '<html>Service Unavailable</html>', `200 OK\n${presence('Pal')}\n`][++n] : undefined);
  await t.clock.advance(5000);
  const [first, ...rest] = t.polls();
  assert.deepStrictEqual(rest.slice(0, 2).map(p => p.body), [first.body, first.body]);
  assert.ok(t.told().some(e => e[0] === 'onPresence@20'));
  assert.deepStrictEqual(t.disconnects(), []);
  assert.ok(t.client.loggedIn && !t.sent.some(r => r.cmd === CMD.UNIFIED_LOGOUT));
}

// 702 InvalidSession is a reply: the page gives up at once, without resending, and the engine hears of it once.
{
  const t = await signedIn(r => r.cmd === CMD.RETRIEVE_ALL_EVENTS ? `${REPLY.INVALID_SESSION} InvalidSession\n` : undefined);
  assert.deepStrictEqual(t.disconnects(), [REPLY.INVALID_SESSION]);
  await t.clock.advance(60000);
  assert.strictEqual(t.polls().length, 1);
  assert.deepStrictEqual(t.disconnects(), [REPLY.INVALID_SESSION]);
  assert.ok(!t.client.loggedIn);
}

// With no reply at all, the poll is resent at its deadline, and 40 s after the gateway's last reply the page gives up with 998.
{
  const t = await signedIn();
  await t.clock.advance(39999);
  assert.deepStrictEqual(t.disconnects(), []);
  const [first, ...rest] = t.polls();
  assert.ok(rest.length >= 1 && rest.every(p => p.body === first.body));
  await t.clock.advance(1);
  assert.deepStrictEqual(t.disconnects(), [REPLY.NETWORK_INTERRUPTED]);
}

// A game packet that fails is resent unchanged and then goes through, and the poll, which probably shared its dead connection, is
// restarted at once with the same R.
{
  let n = 0;
  const t = await signedIn(r => r.cmd === CMD.SEND_GAME_PACKET_TO_GAME_SERVER && ++n === 1 ? 'drop' : undefined);
  t.snap.send(12);
  await t.clock.advance(0);
  const packets = t.sent.filter(r => r.cmd === CMD.SEND_GAME_PACKET_TO_GAME_SERVER);
  assert.strictEqual(packets.length, 2);
  assert.strictEqual(packets[1].body, packets[0].body);
  const [poll, restarted] = t.polls();
  assert.strictEqual(restarted?.body, poll.body);
  await t.clock.advance(30000);
  assert.deepStrictEqual(t.disconnects(), []);
  assert.ok(t.client.loggedIn);
}

// A login long after the gateway's last reply still has 40 s to get through.
{
  const tried = new Set();
  const t = await signedIn(r => tried.has(r.cmd) ? undefined : (tried.add(r.cmd), 'drop'), { idle: 600000 });
  assert.strictEqual(t.sent.filter(r => r.cmd === CMD.EXTENDED_LOGIN).length, 2);
}

console.log('snap client ok');
