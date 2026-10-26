// Self-check for the bot question at a friendly Start, for scoring a battle and for rejoining one: node server/casino.test.js
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
// A battle whose players join in the order named, so the first is seat 1, and `losers` leave it through the game's menus. `outcome`
// is what the fake witness ends with: { ranks } or { failed }, after `delay` ms; null for a server without a server copy.
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
  for (const name of losers) {
    const p = table.players.find(o => o.s.name === name);
    battle.onGame(table, p, gm.pack({ seq: 2, type: gm.TYPE.END_GAME, sender: p.index, turn: table.turn, phase: table.phase, body: i32(0) }), api);
  }
  table.ranked = ranked;
  await finishMatch(table, api);
  const stats = Object.fromEntries(accounts.map(a => [a.name, a.stats && [a.stats.matches, a.stats.wins, a.stats.fame]]));
  return { line: logs.find(l => l.startsWith('battle over')), stats };
}

// Rejoin (docs/adr/0038), through the casino as the gateway drives it: a person whose session leaves a running battle holds the
// seat for the rejoin window, a new session of the account gets back to it through Quick Match, and POST /seat (seatAnswer) shows it.
{
  const casino = require('./casino');
  const { createReader } = require('./mt');
  let clock = 1e6, nextRoom = 1, nextAccount = 1;
  const rooms = new Map();
  const api = { log() {}, capture() {}, templates: fixture.templates(), witness: { available: () => false }, now: () => clock, rooms,
    save() {}, replays: null, send(s, data) { s.inbox.push(...s.read(data)); },
    createRoom(name, max) { const r = { id: `room${nextRoom++}`, name, max, members: new Set() }; rooms.set(r.id, r); return r; } };
  const session = (name, account) => ({ sid: `${name}-${Math.random()}`, userId: String(account.id), name, account, room: null, read: createReader(), inbox: [] });
  const person = name => session(name, { id: nextAccount++, name });
  const games = s => s.inbox.splice(0).filter(m => m[0] === T.GAME).map(m => gm.unpack(m.subarray(1)));
  const ofType = (msgs, type) => msgs.filter(m => m.type === type);
  const str = v => Buffer.concat([u32(0), u32(v.length), u32(v.length), Buffer.from(v, 'latin1')]);
  const request = (s, type, action, body = Buffer.alloc(0)) => casino.onPacket(s, encode(type, Buffer.concat([Buffer.from([0, action]), body])), api);
  const askMatch = (s, type) => request(s, type, 9, Buffer.concat([str('HEDGEHOG'), str('0')]));
  const fromClient = (s, m) => casino.onPacket(s, encode(T.GAME, gm.pack(m)), api);
  const order = (s, sender, seq, type, turn, phase) => fromClient(s, { seq, type, sender, turn, phase, body: Buffer.from([1, 2, 3]) });
  const joinInfo = (table, name) => {
    const info = g.writeJoinInfo({ type: 0, slot: -1, aiType: 0, color: -1, name, random: 0, hero: g.parseGame(table.game).heroes[1] });
    return { seq: 1, type: gm.TYPE.INIT, sender: 0, body: Buffer.concat([i32(info.length), info]) };
  };
  // What the gateway does when a session joins or leaves a room; the gateway keeps an empty room while casino.keepsRoom says so.
  const enter = (s, r) => { r.members.add(s); s.room = r; };
  const exit = s => { const r = s.room; r.members.delete(s); s.room = null; casino.onLeave(s, r, api); };
  const takeSeat = (s, table) => { request(s, T.TABLE, 0x0d, u32(Number(s.userId))); fromClient(s, joinInfo(table, s.name)); };
  // A started battle, its players seated in the order named (seat 1 first).
  const battleOf = (players, type) => {
    assert(casino.startTable(players, type, api));
    const r = [...rooms.values()].at(-1);
    r.battle.freeSeats.sort((x, y) => x - y);
    for (const s of players) { enter(s, r); takeSeat(s, r.battle); s.inbox.length = 0; }
    assert(r.battle.started);
    return r;
  };
  const seats = (...names) => names.map((name, i) => ({ seat: i + 1, name, bot: false }));

  // Ada's session leaves mid-battle (a reload's new login drops it): Bo is told nothing, and the empty seat keeps its room.
  const [ada, bo] = [person('Ada'), person('Bo')];
  const room = battleOf([ada, bo], T.RANKED_CASINO), table = room.battle;
  order(ada, 1, 1, gm.TYPE.PLACE_TILE, 1, 2);
  games(bo);
  exit(ada);
  assert.deepStrictEqual(games(bo), []);
  assert(casino.keepsRoom(room) && rooms.has(room.id));
  clock += 30000;
  assert.deepStrictEqual(casino.seatAnswer(ada.account, false, api), { held: { ranked: true, seat: 1, seats: seats('Ada', 'Bo'), leftMs: 90000 } });

  // Her new session asks for a match: an empty lobby, then LOCK and MATCHED_UP for her table on that casino type. She isn't queued.
  const ada2 = session('Ada', ada.account);
  askMatch(ada2, T.RANKED_CASINO);
  const [lobby, lock, matched] = ada2.inbox.splice(0);
  assert.deepStrictEqual([...lobby], [T.RANKED_CASINO, 1, 9, 0, 0, 0, 0, 0, 0]);
  assert.deepStrictEqual([...lock], [T.CASINO, 0, 0x1d, 0, 0, 0, 0]);
  assert.deepStrictEqual([...matched.subarray(0, 3)], [T.RANKED_CASINO, 2, 0x1f]);
  assert(matched.includes(Buffer.from(`naf://rg.com:80/${room.name}`)));
  assert.strictEqual(casino.waiting(), 0);

  // Her SEAT_TAKE gets step 1. Until her JoinInfo, battle messages wait for her (they are in the history), but her pings don't.
  enter(ada2, room);
  request(ada2, T.TABLE, 0x0d, u32(Number(ada2.userId)));
  assert.deepStrictEqual(games(ada2).map(m => [m.seq, m.type]), [[1, gm.TYPE.INIT]]);
  order(bo, 2, 1, gm.TYPE.PLACE_TILE, 1, 2); // the last tile: the server ends phase 2
  casino.onPacket(ada2, encode(T.PING, Buffer.from([7])), api);
  assert.deepStrictEqual(ada2.inbox.splice(0).map(m => [...m]), [[T.PONG, 7]]);
  games(bo);
  // Her JoinInfo: step 3 with her own index and team, step 4 with the snapshot and the whole history, and no PlayerJoined for anyone.
  fromClient(ada2, joinInfo(table, 'Ada'));
  const [step3, step4] = games(ada2);
  assert.deepStrictEqual([step3.seq, step3.body.readInt32LE(4), step3.body.readInt32LE(8)], [2, 1, 1]);
  assert.strictEqual(step4.seq, 3);
  assert(step4.body.subarray(4).equals(Buffer.concat([table.snap, i32(table.history.length), ...table.history])));
  assert.deepStrictEqual(table.history.map(raw => gm.parse(raw)).filter(m => m.type === gm.TYPE.PLACE_TILE).map(m => m.sender), [1, 2]);
  assert.strictEqual(table.history.filter(raw => gm.parse(raw).type === gm.TYPE.PLAYER_JOINED).length, 2);
  assert.deepStrictEqual(games(bo), []);
  // From then on she is an ordinary seat.
  order(bo, 2, 2, gm.TYPE.MOVE_UNIT, 1, 4);
  assert.deepStrictEqual(games(ada2).map(m => [m.type, m.sender]), [[gm.TYPE.MOVE_UNIT, 2]]);

  // She leaves again, and the window runs out: EndGame reason 2 as her own message, past her last one. POST /seat tells her once.
  exit(ada2);
  clock += battle.REJOIN_WINDOW_MS - 1;
  casino.tick(api);
  assert.deepStrictEqual(ofType(games(bo), gm.TYPE.END_GAME), []);
  clock += 1;
  casino.tick(api);
  const [end] = ofType(games(bo), gm.TYPE.END_GAME);
  assert.deepStrictEqual([end.sender, end.seq, end.body.readInt32LE(0)], [1, 2, 2]);
  assert.deepStrictEqual(casino.seatAnswer(ada.account, false, api), { dropped: { ranked: true, seat: 1, seats: seats('Ada', 'Bo') } });
  assert.deepStrictEqual(casino.seatAnswer(ada.account, false, api), {});

  // A friendly seat comes back the same way, on the friendly casino type. Giving it up instead (Leave) is EndGame reason 0, and
  // leaves nothing to tell. The room goes once no seat is held in it any more.
  const [cy, di] = [person('Cy'), person('Di')];
  const friendlyRoom = battleOf([cy, di], T.FRIENDLY_CASINO);
  exit(di);
  const di2 = session('Di', di.account);
  askMatch(di2, T.FRIENDLY_CASINO);
  assert.deepStrictEqual([...di2.inbox.at(-1).subarray(0, 3)], [T.FRIENDLY_CASINO, 2, 0x1f]);
  assert.strictEqual(casino.seatAnswer(di.account, false, api).held.ranked, false);
  assert.deepStrictEqual(casino.seatAnswer(di.account, true, api), {});
  const [gaveUp] = ofType(games(cy), gm.TYPE.END_GAME);
  assert.deepStrictEqual([gaveUp.sender, gaveUp.body.readInt32LE(0)], [2, 0]);
  assert.deepStrictEqual(casino.seatAnswer(di.account, false, api), {});
  exit(cy);
  assert(rooms.has(friendlyRoom.id), 'Cy holds a seat in it now');
  clock += battle.REJOIN_WINDOW_MS;
  casino.tick(api);
  assert(!casino.keepsRoom(friendlyRoom) && !rooms.has(friendlyRoom.id));

  // After a reload the old session stays seated until the page's new login ends it, and the page asks before that login: the seat
  // counts as held, with the whole window ahead. Leave gives it up at once, and what the lingering session still sends counts no more.
  const [gus, hal] = [person('Gus'), person('Hal')];
  battleOf([gus, hal], T.RANKED_CASINO);
  assert.strictEqual(casino.seatAnswer(hal.account, false, api).held.leftMs, battle.REJOIN_WINDOW_MS);
  assert.deepStrictEqual(casino.seatAnswer(hal.account, true, api), {});
  const [left] = ofType(games(gus), gm.TYPE.END_GAME);
  assert.deepStrictEqual([left.sender, left.body.readInt32LE(0)], [2, 0]);
  order(hal, 2, 1, gm.TYPE.PLACE_TILE, 1, 2);
  assert.deepStrictEqual(games(gus), []);
  assert.deepStrictEqual(casino.seatAnswer(hal.account, false, api), {});

  // A rejoined seat's silence counts from the next turn: it couldn't act while away, so the others' tiles in the next tile phase
  // don't end that phase on it (before, it counted as silent for a whole turn and lost its tile), not even after the end-turn
  // request its engine sends in the phase it lands in.
  const [jo, kim] = [person('Jo'), person('Kim')];
  const quietRoom = battleOf([jo, kim], T.RANKED_CASINO);
  order(jo, 1, 1, gm.TYPE.PLACE_TILE, 1, 2);
  exit(jo);
  const jo2 = session('Jo', jo.account);
  askMatch(jo2, T.RANKED_CASINO);
  enter(jo2, quietRoom);
  takeSeat(jo2, quietRoom.battle);
  fromClient(jo2, { seq: 2, type: gm.TYPE.END_TURN_REQUEST, sender: 1, turn: 1, phase: 2, body: Buffer.alloc(0) });
  order(kim, 2, 1, gm.TYPE.PLACE_TILE, 1, 2);
  games(kim);
  order(kim, 2, 2, gm.TYPE.PLACE_TILE, 2, 2); // the clients are in turn 2's tile phase; only Kim has placed
  assert.deepStrictEqual(ofType(games(kim), gm.TYPE.END_TURN), []);
  assert.deepStrictEqual([quietRoom.battle.turn, quietRoom.battle.phase], [2, 2]);

  // A battle that ends while a seat is held releases it: nothing to rejoin or to tell, and the next match is an ordinary one.
  const [ed, flo] = [person('Ed'), person('Flo')];
  const endingRoom = battleOf([ed, flo], T.RANKED_CASINO);
  exit(flo);
  request(ed, T.TABLE, 0x0e); // SEAT_LEAVE: the battle is over
  assert(!casino.keepsRoom(endingRoom));
  assert.deepStrictEqual(casino.seatAnswer(flo.account, false, api), {});
  const flo2 = session('Flo', flo.account);
  askMatch(flo2, T.RANKED_CASINO);
  assert.strictEqual(casino.waiting(), 1);
  request(flo2, T.RANKED_CASINO, 0x0a); // CANCEL_MATCHMAKING
  exit(ed);
  assert(!rooms.has(endingRoom.id));
  console.log('rejoin ok');
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
