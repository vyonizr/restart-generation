// Self-check for the bot question at a friendly Start and for scoring a battle: node server/casino.test.js
const assert = require('assert');
for (const k of Object.keys(process.env)) if (k.startsWith('RG_')) delete process.env[k]; // the shell's .env mustn't change the result
const { botChoice, fillsWithBots, finishMatch, abandonMatch, fameLevel } = require('./casino');

const room = n => ({ lobby: Array(n).fill({}) });
assert.strictEqual(botChoice(undefined, true), 'gone');
assert.strictEqual(botChoice({ ...room(2), starting: true }, true), 'gone');
assert.strictEqual(botChoice(room(1), true), 'go');    // alone: no bots, and the Start fails as the game's own would
assert.strictEqual(botChoice(room(2), true), 'ask');
assert.strictEqual(botChoice(room(3), true), 'ask');
assert.strictEqual(botChoice(room(4), true), 'go');   // no empty seat
assert.strictEqual(botChoice(room(2), false), 'go');  // the server can't run bots

assert.strictEqual(fillsWithBots(1, true, true), false);  // alone, even with an older page's yes
assert.strictEqual(fillsWithBots(2, true, true), true);
assert.strictEqual(fillsWithBots(3, true, true), true);
assert.strictEqual(fillsWithBots(3, false, true), false);
assert.strictEqual(fillsWithBots(2, true, false), false);
assert.strictEqual(fillsWithBots(4, true, true), false);
console.log('friendly bot choice ok');

// The client has 14 fame badges and draws badge fameLevel - 1 without a check (docs/re/re_casino.md §2.9).
const level = fame => fameLevel({ stats: { fame } });
assert.deepStrictEqual([0, 99, 100, 1299, 1300, 2140, 1e6].map(level), [1, 1, 2, 13, 14, 14, 14]);
console.log('fame levels ok');

// The page recognizes the engine's Start (shared/snap.js) by the bytes this server reads.
const { encode, T, u32 } = require('./mt');
import('../shared/snap.js').then(({ startRoom }) => {
  const start = id => encode(T.CASINO, Buffer.concat([Buffer.from([0, 0x1c]), u32(id)]));
  assert.strictEqual(startRoom(start(1002)), 1002);
  assert.strictEqual(startRoom(start(0xdeadbeef)), 0xdeadbeef);
  assert.strictEqual(startRoom(encode(T.CASINO, Buffer.from([0, 0x14, 0, 0, 0, 0]))), null); // CREATE
  assert.strictEqual(startRoom(Buffer.alloc(0)), null);
  console.log('friendly start bytes ok');
});

// The page holds a Start while it asks, and sends the answer first.
import('../shared/snap.js').then(async ({ SnapClient }) => {
  // answers: what each question gets, in order; undefined leaves that question open until the room changes.
  // Resolves with whether the Start goes on, the commands sent, and how many questions were asked.
  const run = async (choices, answers = []) => {
    const sent = [], c = new SnapClient({ ui: {} });
    let asked = 0;
    c.request = async (cmd, params) => { sent.push([cmd, params[1]]); return { lines: [cmd === 901 ? choices.shift() : ''] }; };
    c.bots = { ask: () => {
      asked++;
      const answer = answers.shift(), p = { close: () => resolve(null) }; let resolve;
      p.answer = new Promise(r => { resolve = r; if (answer !== undefined) r(answer); });
      return p;
    } };
    return [await c.askBots(1002), sent, asked];
  };
  assert.deepStrictEqual(await run(['ask'], [true]), [true, [[901, 1002], [900, 1]], 1]);
  assert.deepStrictEqual(await run(['ask'], [false]), [true, [[901, 1002], [900, 0]], 1]);
  assert.deepStrictEqual(await run(['go']), [true, [[901, 1002]], 0]);   // full, alone, or no bots on this server: no question
  assert.deepStrictEqual(await run(['gone']), [false, [[901, 1002]], 0]); // another member started the match
  assert.deepStrictEqual(await run(['ask', 'gone']), [false, [[901, 1002], [901, 1002]], 1]); // closed while asking
  // The others leave while the box is open: it closes and the Start goes on, for the server to refuse.
  assert.deepStrictEqual(await run(['ask', 'go']), [true, [[901, 1002], [901, 1002]], 1]);
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

  // Replays (CONTEXT.md): every online battle that began becomes one replay, with what the replay page shows around it, and each
  // person who played it in a browser is told its id. Seats follow the join order; each player picks the hero named.
  async function played(players, { replays = true, end = finishMatch, outcome = { ranks: { 1: 2, 2: 1 } }, begin = true } = {}) {
    const saved = [], told = [];
    const witness = { available: () => true, follow() {}, feed() {}, forget() {}, result: async () => outcome };
    const api = { log() {}, templates: fixture.templates(), witness, send() {}, save() {},
      replays: replays && { save(r) { saved.push(r); return `replay${saved.length}`; } },
      replaySaved(s, id) { told.push([s.name, id]); } };
    const table = battle.createTable(begin ? players.length : players.length + 1, api);
    table.freeSeats.sort((x, y) => x - y);
    table.ranked = true;
    const heroes = g.parseGame(table.game).heroes;
    players.forEach(({ name, hero, web = true, bot = false }, i) => {
      const s = { name, web, account: bot ? { id: `bot${i}`, name, bot: true } : { id: String(i + 1), name } };
      battle.seat(table, s, api);
      const info = g.writeJoinInfo({ type: 0, slot: -1, aiType: 0, color: -1, name, random: 0, hero: heroes.find(h => h.type === hero) });
      battle.onGame(table, table.players.at(-1), gm.pack({ seq: 1, type: gm.TYPE.INIT, sender: 0, body: Buffer.concat([i32(info.length), info]) }), api);
    });
    await end(table, api);
    return { saved, told, table };
  }
  const ada = { name: 'Ada', hero: 'HEDGEHOG' }, bo = { name: 'Bo', hero: 'PLUMBER' };

  // A finished ranked battle: the players, their heroes and seats, and the witness's result.
  let r = await played([ada, bo]);
  assert.strictEqual(r.saved.length, 1);
  assert.deepStrictEqual(r.saved[0].seats, [{ account: '1', seat: 1 }, { account: '2', seat: 2 }]);
  assert.deepStrictEqual(r.saved[0].meta, {
    ranked: true, environment: g.parseGame(r.table.game).environment,
    players: [{ name: 'Ada', hero: 'HEDGEHOG', seat: 1, bot: false }, { name: 'Bo', hero: 'PLUMBER', seat: 2, bot: false }],
    result: { winners: [2], ranks: { 1: 2, 2: 1 }, guessed: false },
  });
  assert.strictEqual(typeof r.saved[0].text, 'string');
  assert.deepStrictEqual(r.told, [['Ada', 'replay1'], ['Bo', 'replay1']]);
  // Ending twice (each client sends SEAT_LEAVE) still makes one replay.
  await finishMatch(r.table, { log() {}, save() {}, replays: { save() { throw new Error('saved twice'); } }, replaySaved() {} });

  // A guessed result says so; bots and the Java client (not a browser) aren't told, and bots have no account to delete.
  r = await played([ada, { name: 'Robo', hero: 'PLUMBER', bot: true }, { name: 'Cy', hero: 'HEDGEHOG', web: false }], { outcome: { failed: 'test' } });
  assert.deepStrictEqual(r.saved[0].seats, [{ account: '1', seat: 1 }, { account: '3', seat: 3 }]);
  assert.strictEqual(r.saved[0].meta.result.guessed, true);
  assert.strictEqual(r.saved[0].meta.result.ranks, null);
  assert.deepStrictEqual(r.saved[0].meta.players.map(p => p.bot), [false, true, false]);
  assert.deepStrictEqual(r.told, [['Ada', 'replay1']]);

  // Every player left without the battle ending: the replay is kept, without a result.
  r = await played([ada, bo], { end: abandonMatch });
  assert.strictEqual(r.saved.length, 1);
  assert.strictEqual(r.saved[0].meta.result, null);

  // A table that never began has nothing to replay.
  r = await played([ada, bo], { end: abandonMatch, begin: false });
  assert.strictEqual(r.table.started, false);
  assert.deepStrictEqual([r.saved, r.told], [[], []]);

  // With replays turned off (RG_REPLAYS=0), nothing is kept and nobody is told.
  r = await played([ada, bo], { replays: false });
  assert.deepStrictEqual(r.told, []);

  // A replay that can't be kept (a full disk, say) costs nobody their match: the result is still scored, and the log says why.
  {
    const logs = [], saved = [];
    const api = { log: line => logs.push(line), templates: fixture.templates(), save: acc => saved.push(acc.name), send() {}, replaySaved() {},
      witness: { available: () => true, follow() {}, feed() {}, forget() {}, result: async () => ({ ranks: { 1: 1, 2: 2 } }) },
      replays: { save() { throw new Error('disk full'); } } };
    const table = battle.createTable(2, api);
    table.freeSeats.sort((x, y) => x - y);
    table.ranked = true;
    const hero = g.parseGame(table.game).heroes[0];
    for (const [i, name] of ['Ada', 'Bo'].entries()) {
      battle.seat(table, { name, web: true, account: { id: String(i + 1), name } }, api);
      const info = g.writeJoinInfo({ type: 0, slot: -1, aiType: 0, color: -1, name, random: 0, hero });
      battle.onGame(table, table.players.at(-1), gm.pack({ seq: 1, type: gm.TYPE.INIT, sender: 0, body: Buffer.concat([i32(info.length), info]) }), api);
    }
    await finishMatch(table, api);
    assert.deepStrictEqual(saved, ['Ada', 'Bo']);
    assert(logs.includes('battle over: Ada won'), logs.join('\n'));
    assert(logs.some(l => /replay not kept: disk full/.test(l)), logs.join('\n'));
  }
  console.log('battle replays ok');
})();
