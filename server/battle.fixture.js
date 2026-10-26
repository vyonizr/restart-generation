// Made-up battle templates for tests, so the battle tests run without data/templates (which come from the game and
// stay out of the repository). They hold only what the server reads: one castle per seat, the phase time limits,
// the cannon rule, and the snapshot's copy of the Game's RNG. The rest is zeros and empty lists, no game data.
// Also a running battle with a held seat, for the tests of POST /seat.
const g = require('./gameblob');

const LIMIT_MS = 20000; // phase time limit in tile placement, player turns and cannons (docs/protocol.md "Battle")
const CANNONS = 2;      // shots per player in the cannon phase
const W = 4, H = 4;

const hero = type => ({ type, nameId: '', movement: 0, movementWithPrincess: 0, f10: 0, attack: 0, health: 0, f1c: 0,
  f20: [], specialSkill: 0, f30: 0, numberOfTurns: 0 });
const grid = () => ({ w: W, h: H, f8: 0, fc: 0, cells: Array(W * H).fill(0) });

// A template for `seats` players, shaped like the ones loadTemplates() returns.
function template(seats, name) {
  const rng = g.seedRng(seats * 101 + name.length);
  const game = {
    version: 'made up', randomSeed: 0, mapWidth: W, mapHeight: H,
    ints: [{ name: 'NumberOfCannonsInCastle', value: CANNONS }], bools: [{ name: 'IsNumCannonsEqualToNumPrincesses', value: 0 }],
    masks: [], tiles: [], strings: [],
    castles: Array.from({ length: seats }, (_, i) => ({ owner: i, x: i, y: 0, width: 1, height: 1, cannons: CANNONS, princess: 1 })),
    blocks: grid(), items: grid(), objects: [], playerSlots: 0, players: [], heroSlots: 0, slotHeroes: [],
    movementCosts: Array(6).fill(0), timeLimit: [-1, -1, LIMIT_MS, -1, LIMIT_MS, LIMIT_MS, -1, -1, -1],
    heroes: [hero('HEDGEHOG'), hero('PLUMBER')], monsters: [], princess: hero('PRINCESS'),
    itemsOnMatchStart: [], itemsOnMatchStartPerPlayers: [], itemGeneration: [], itemGenerationPerPlayers: [],
    environment: 0, f188: [Array(W).fill(0), Array(H).fill(0), Array(W).fill(0), Array(H).fill(0)], triggers: Buffer.alloc(0), rng,
  };
  const pad = Buffer.alloc(16, 0x5a);
  // After the RNG, the battlefield fields up to its next-monster kind (docs/re/re_replay.md, last section): two i32s, an empty
  // i32 list, an empty pair list, two bytes, an i32, and the kind itself, here 1, a template's stale value.
  const tail = Buffer.concat([Buffer.alloc(8 + 4 + 4 + 2 + 4), Buffer.from([1, 0, 0, 0]), pad]);
  const snapshot = { battlefield: Buffer.concat([pad, g.rngBytes(rng), tail]), players: Buffer.alloc(8, 1), third: Buffer.alloc(8, 2), b28: 0, b29: 0, i30: 0 };
  // Through the codecs both ways, as loadTemplates() reads real ones, so a field the server needs can't be missing.
  return { name, game: g.parseGame(g.writeGame(game)), snapshot: g.parseSnapshot(g.writeSnapshot(snapshot)), rngAt: pad.length, seats };
}

// Two templates per player count, so a table's choice of template is exercised too.
const templates = () => [2, 3, 4].flatMap(n => [template(n, `made_up_${n}p_a`), template(n, `made_up_${n}p_b`)]);

// A running ranked battle, made through the casino as the gateway does, in which account `acc` holds seat 1 against 'Other':
// its session left the table room (docs/adr/0038). Nothing is sent anywhere.
function heldSeat(acc) {
  const casino = require('./casino'), battle = require('./battle'), gm = require('./gamemsg'), { T } = require('./mt');
  const rooms = new Map();
  const api = { log() {}, capture() {}, templates: templates(), witness: { available: () => false }, rooms, send() {},
    createRoom: (name, max) => { const room = { id: name, name, max, members: new Set() }; rooms.set(name, room); return room; } };
  const players = [acc, { id: -1, name: 'Other' }].map(account => ({ name: account.name, userId: String(account.id), account }));
  casino.startTable(players, T.RANKED_CASINO, api);
  const [room] = rooms.values(), table = room.battle;
  table.freeSeats.sort((x, y) => x - y);
  for (const s of players) {
    room.members.add(s); s.room = room;
    battle.seat(table, s, api);
    const info = g.writeJoinInfo({ type: 0, slot: -1, aiType: 0, color: -1, name: s.name, random: 0, hero: g.parseGame(table.game).heroes[0] });
    const length = Buffer.alloc(4); length.writeInt32LE(info.length);
    battle.onGame(table, table.players.at(-1), gm.pack({ seq: 1, type: gm.TYPE.INIT, body: Buffer.concat([length, info]) }), api);
  }
  room.members.delete(players[0]); players[0].room = null;
  casino.onLeave(players[0], room, api);
}

module.exports = { template, templates, heldSeat };
