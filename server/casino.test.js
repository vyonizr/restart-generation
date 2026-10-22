// Self-check for the bot question at a friendly Start and for scoring a battle: node server/casino.test.js
const assert = require('assert');
for (const k of Object.keys(process.env)) if (k.startsWith('RG_')) delete process.env[k]; // the shell's .env mustn't change the result
const { botChoice, fillsWithBots, finishMatch } = require('./casino');

const room = n => ({ lobby: Array(n).fill({}) });
assert.strictEqual(botChoice(undefined, true), 'gone');
assert.strictEqual(botChoice({ ...room(2), starting: true }, true), 'gone');
assert.strictEqual(botChoice(room(1), true), 'level'); // alone: the player picks the level
assert.strictEqual(botChoice(room(2), true), 'ask');
assert.strictEqual(botChoice(room(3), true), 'ask');
assert.strictEqual(botChoice(room(4), true), 'go');   // no empty seat
assert.strictEqual(botChoice(room(2), false), 'go');  // the server can't run bots

assert.strictEqual(fillsWithBots(1, false, true), true);
assert.strictEqual(fillsWithBots(1, false, false), false);
assert.strictEqual(fillsWithBots(2, true, true), true);
assert.strictEqual(fillsWithBots(3, false, true), false);
assert.strictEqual(fillsWithBots(4, true, true), false);
console.log('friendly bot choice ok');

// The page recognizes the engine's Start (web/snap.js) by the bytes this server reads.
const { encode, T, u32 } = require('./mt');
import('../web/snap.js').then(({ startRoom }) => {
  const start = id => encode(T.CASINO, Buffer.concat([Buffer.from([0, 0x1c]), u32(id)]));
  assert.strictEqual(startRoom(start(1002)), 1002);
  assert.strictEqual(startRoom(start(0xdeadbeef)), 0xdeadbeef);
  assert.strictEqual(startRoom(encode(T.CASINO, Buffer.from([0, 0x14, 0, 0, 0, 0]))), null); // CREATE
  assert.strictEqual(startRoom(Buffer.alloc(0)), null);
  console.log('friendly start bytes ok');
});

// The page holds a Start while it asks, and sends the answer first.
import('../web/snap.js').then(async ({ SnapClient }) => {
  // answers: what each question gets, in order; undefined leaves that question open until the room changes.
  const run = async (choices, answers = []) => {
    const sent = [], asked = [], c = new SnapClient({ ui: {} });
    c.request = async (cmd, params) => { sent.push([cmd, params[1]]); return { lines: [cmd === 901 ? choices.shift() : ''] }; };
    c.bots = { ask: alone => {
      asked.push(alone);
      const answer = answers.shift(), p = { close: () => resolve(null) }; let resolve;
      p.answer = new Promise(r => { resolve = r; if (answer !== undefined) r(answer); });
      return p;
    } };
    return [await c.askBots(1002), sent, asked];
  };
  assert.deepStrictEqual(await run(['ask'], ['cpu']), [true, [[901, 1002], [900, 1]], [false]]);
  assert.deepStrictEqual(await run(['ask'], ['expert']), [true, [[901, 1002], [900, 2]], [false]]);
  assert.deepStrictEqual(await run(['ask'], ['none']), [true, [[901, 1002], [900, 0]], [false]]);
  assert.deepStrictEqual(await run(['level'], ['expert']), [true, [[901, 1002], [900, 2]], [true]]); // alone: two buttons
  assert.deepStrictEqual(await run(['level'], ['cpu']), [true, [[901, 1002], [900, 1]], [true]]);
  assert.deepStrictEqual(await run(['level'], ['none']), [false, [[901, 1002]], [true]]);           // Back: no Start without bots
  assert.deepStrictEqual(await run(['go']), [true, [[901, 1002]], []]);   // full, or no bots on this server: no question
  assert.deepStrictEqual(await run(['gone']), [false, [[901, 1002]], []]); // another member started the match
  assert.deepStrictEqual(await run(['ask', 'gone']), [false, [[901, 1002], [901, 1002]], [false]]); // closed while asking
  // Someone joins a lone player's room while the box is open: it closes and the other question opens.
  assert.deepStrictEqual(await run(['level', 'ask'], [undefined, 'expert']), [true, [[901, 1002], [901, 1002], [900, 2]], [true, false]]);
  console.log('page bot question ok');
});

// Scoring a ranked match (docs/adr/0020): every player the witness ranks first gets a win and +10 fame, and every player a match.
// Without the witness's ranks, the result is guessed, and the log says why.
const battle = require('./battle');
const fixture = require('./battle.fixture');
const gm = require('./gamemsg');
const g = require('./gameblob');
const i32 = v => { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; };
// A battle whose players join in the order named, so the first is seat 1. `outcome` is what the fake witness ends with:
// { ranks } or { failed }, after `delay` ms; null for a server without a server copy.
async function score(names, outcome, { ranked = true, delay = 0, losers = [] } = {}) {
  const logs = [];
  const witness = outcome && { available: () => true, follow() {}, feed() {}, forget() {},
    result: () => new Promise(resolve => setTimeout(resolve, delay, outcome)) };
  const api = { log: line => logs.push(line), templates: fixture.templates(), witness, send() {}, save() {} };
  const table = battle.createTable(names.length, api);
  table.freeSeats.sort((x, y) => x - y);
  const hero = g.parseGame(table.game).heroes[1];
  const accounts = names.map(name => {
    const s = { name, account: { name } };
    battle.seat(table, s, api);
    const info = g.writeJoinInfo({ type: 0, slot: -1, aiType: 0, color: -1, name, random: 0, hero });
    battle.onGame(table, table.players.at(-1), gm.pack({ seq: 1, type: gm.TYPE.INIT, sender: 0, body: Buffer.concat([i32(info.length), info]) }), api);
    return s.account;
  });
  for (const name of losers) battle.leave(table, table.players.find(p => p.s.name === name), api);
  table.ranked = ranked;
  await finishMatch(table, api);
  const stats = Object.fromEntries(accounts.map(a => [a.name, a.stats && [a.stats.matches, a.stats.wins, a.stats.fame]]));
  return { line: logs.find(l => l.startsWith('battle over')), stats };
}

(async () => {
  // [matches, wins, fame] per player
  assert.deepStrictEqual(await score(['Alice', 'Bob'], { ranks: { 1: 2, 2: 1 } }),
    { line: 'battle over: Bob won', stats: { Alice: [1, 0, 0], Bob: [1, 1, 10] } });
  assert.deepStrictEqual(await score(['Alice', 'Bob', 'Carol'], { ranks: { 1: 1, 2: 3, 3: 1 } }), // a tie: two winners
    { line: 'battle over: Alice and Carol won', stats: { Alice: [1, 1, 10], Bob: [1, 0, 0], Carol: [1, 1, 10] } });
  assert.deepStrictEqual(await score(['Alice', 'Bob'], { ranks: { 1: 2, 2: 2 } }), // nobody first
    { line: 'battle over: no winner', stats: { Alice: [1, 0, 0], Bob: [1, 0, 0] } });
  // Ranks that come while the witness is still catching up count.
  assert.deepStrictEqual(await score(['Alice', 'Bob'], { ranks: { 1: 1, 2: 2 } }, { delay: 200 }),
    { line: 'battle over: Alice won', stats: { Alice: [1, 1, 10], Bob: [1, 0, 0] } });
  // A failed witness: the last player standing wins, as the server guesses.
  assert.deepStrictEqual(await score(['Alice', 'Bob'], { failed: 'the worker exited with code 1' }, { losers: ['Alice'] }),
    { line: 'battle over: result guessed (witness failed: the worker exited with code 1): Bob won', stats: { Alice: [1, 0, 0], Bob: [1, 1, 10] } });
  assert.deepStrictEqual(await score(['Alice', 'Bob'], null, { losers: ['Bob'] }),
    { line: 'battle over: result guessed (no server copy): Alice won', stats: { Alice: [1, 1, 10], Bob: [1, 0, 0] } });
  // A friendly match changes no stats.
  assert.deepStrictEqual(await score(['Alice', 'Bob'], { ranks: { 1: 1, 2: 2 } }, { ranked: false }),
    { line: 'battle over: Alice won', stats: { Alice: undefined, Bob: undefined } });
  console.log('battle results ok');
})();
