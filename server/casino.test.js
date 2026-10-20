// Self-check for the bot question at a friendly Start: node server/casino.test.js
const assert = require('assert');
const { botChoice, fillsWithBots } = require('./casino');

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

// The page recognises the engine's Start (web/snap.js) by the bytes this server reads.
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
