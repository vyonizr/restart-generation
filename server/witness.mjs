// The witness (server/witness.js, docs/adr/0020): the original engine, headless in a worker thread, following every battle on
// the server from the relay's own messages. Each table gets the engine's own battle logic, built, patched and fed as
// docs/re/re_witness.md describes. It reports each defeat the moment the engine sees it, each moment (CONTEXT.md) with the
// history index of the message that brought it about, and the ranks once the battle is over. It never plays, has no seat, and
// nobody sees it.
// In:  { start: { table, game, snap } }, { feed: { table, raw } }, { end: { table } }
// Out: { ready }, { defeat: { table, seat } }, { moment: { table, index, opener, kind, seat, by? } },
//      { ranks: { table, ranks: { seat: rank } } }, { failed: { table, cause } },
//      and { grown } after each end: how many bytes this worker grew since its boot.
import { parentPort } from 'worker_threads';
import { loadGame } from '../shared/game.mjs';
import { GameHost, NEVER_BUSY } from '../shared/emu/host.js';
import { IMAGE_BASE, ORIGINAL_BASE } from '../shared/emu/machine.js';
import { ECX } from '../shared/emu/cpu.js';

// Engine functions (docs/re/re_witness.md).
const FN = {
  NEW: 0x1014ffa4,          // operator new (cdecl)
  STREAM: 0x100f3800,       // memory stream constructor (this, 1, 1)
  GAME: 0x1003f2d0,         // Game constructor
  GAME_READ: 0x1003e440,    // Game::read(stream)
  GAME_PREPARE: 0x100400c0, // readies a Game for a battle logic
  LOGIC: 0x1000ecd0,        // ServerBattleLogic constructor (Game, hub, ?, flags, listener)
  LOGIC_START: 0x1000eeb0,  // vtable slot 4: builds the battlefield and arms the start check
  SNAP_LOAD: 0x10006b10,    // loads a BattleLogic snapshot (stream)
  FACTORY: 0x10005710,      // the message factory
  READ_MSG: 0x1000c020,     // factory: reads one GameMessage (stream)
  FROM_NET: 0x1000cfd0,     // marks a message as coming from the network
  ADDREF: 0x100f3e60,
  PROCESS: 0x1000e150,      // ServerBattleLogic::process(message)
  TICK: 0x1000ddf0,         // the logic's tick
};
const SIZE = { STREAM: 0x40, GAME: 0x25c, LOGIC: 0xb4 };
const AT = {
  TILE_SHAPES: 0x11c,    // Game: 0 until the default battle settings are loaded
  STREAM_OUT: 8,         // stream: its output side, whose first virtual method writes (buffer, length)
  START_CHECK: 0xb0,     // logic
  FINISHED: 0x28,        // logic: a byte, nonzero once the battle is finished
  BATTLEFIELD: 0x14,     // logic
  COMMANDER_COUNT: 0x28, // battlefield: slots in the Commander array, seat-indexed
  COMMANDERS: 0x2c,      // battlefield: the Commander array; a defeated seat's slot is cleared
  UNITS: 0x6c,           // battlefield: the unit list's first node; a node is +4 next, +8 unit
  PHASE: 0x94, SEAT: 0x98, TURN: 0x9c, // battlefield: the phase, the seat whose turn it is (0 outside phase 4), the battle turn
  KNOCKOUTS: 0x20,       // Commander: its hero's knock-outs so far
  PRINCESSES: 0x24,      // Commander: its own princess while she is home, plus every princess it rescued
  OWNER: 0x30, REMOVED: 0x34, KIND: 0xe4, CARRIES: 0xec, // unit: owner seat, removed flag, kind (0 a hero), carried princess
  STATS: 0x1c,           // logic: the per-player stats list (as server/bot.mjs reads it)
  STATS_COUNT: 0xc, STATS_ENTRIES: 0x10, RANK: 0x134,
};
// An address the loader relocated, as its 4 bytes in memory: the engine loads at IMAGE_BASE, not at its own base.
const pointer = va => { const b = Buffer.alloc(4); b.writeUInt32LE(va - ORIGINAL_BASE + IMAGE_BASE); return b.toString('hex'); };
const SERVER_VTABLE = 0x101779a0;
const PATCHES = [
  NEVER_BUSY,
  // The finish check (FUN_1000d4c0) ends a battle at once when the logic isn't a network host and has no local player,
  // and the witness has only remote players: the jne at 1000d4da becomes jmp.
  { what: 'no early finish without a local player', va: 0x1000d4da, from: '7515', to: 'eb15' },
  // Client mode: FireCannon and PlaceTile (vtable slots 16 and 17) go to the base handlers, without the server's own
  // EndTurn after them, so the logic moves on only on the relay's EndTurns, as the clients do.
  { what: 'FireCannon without the server EndTurn', va: SERVER_VTABLE + 16 * 4, from: pointer(0x1000e430), to: pointer(0x10007970) },
  { what: 'PlaceTile without the server EndTurn', va: SERVER_VTABLE + 17 * 4, from: pointer(0x1000e4f0), to: pointer(0x100078e0) },
];

// A patch the engine doesn't have the bytes for means another build of the game: the witness can't run on it.
const engine = new GameHost(await loadGame(), { patches: PATCHES, warn: what => { throw new Error(what); } });
engine.boot();
const cpu = engine.m.cpu;
const rd = a => cpu.rd32(a >>> 0) >>> 0, rs = a => cpu.rd32(a >>> 0);
// Calls engine code at a loaded address, `self` in ECX. If the engine faults, the CPU is put back as it was, so the next
// table's calls still work.
function run(at, self, args = []) {
  const regs = cpu.r.slice(), { eip, depth, stop } = cpu;
  cpu.r[ECX] = self;
  try { return cpu.call(at, args) >>> 0; } finally { cpu.r.set(regs); Object.assign(cpu, { eip, depth, stop }); }
}
const call = (va, self, args) => run(engine.m.addr(va), self, args);
const alloc = n => call(FN.NEW, 0, [n]);
// A memory stream holding `bytes`, ready to be read from the start.
function stream(bytes) {
  const s = alloc(SIZE.STREAM);
  call(FN.STREAM, s, [1, 1]);
  const buf = alloc(bytes.length);
  cpu.m8.set(bytes, buf);
  run(rd(rd(s + AT.STREAM_OUT)), s + AT.STREAM_OUT, [buf, bytes.length]);
  return s;
}
const newGame = () => { const game = alloc(SIZE.GAME); call(FN.GAME, game); return game; };

// Engine frames until a new Game gets the default battle settings, which takes 3; a Game built before deals its first tile
// modulo 0. No frames run after that, so the menus never run and the engine's clock never moves.
for (let frame = 1; ; frame++) {
  engine.tick();
  if (rs(newGame() + AT.TILE_SHAPES) > 0) break;
  if (frame === 100) throw new Error('the default battle settings never loaded');
}
const usage = () => { const u = process.memoryUsage(); return u.heapTotal + u.external; }; // this thread's own
const booted = usage();

const tables = new Map(); // id -> { logic, seated: Set, out: Set, ranked, failed }
const finished = t => cpu.m8[t.logic + AT.FINISHED] !== 0;

function start(id, game, snap) {
  const g = newGame();
  call(FN.GAME_READ, g, [stream(game)]);
  call(FN.GAME_PREPARE, g);
  const logic = alloc(SIZE.LOGIC);
  call(FN.LOGIC, logic, [g, 0, 0, 0, 0]); // no hub, flags 0: not a network host
  call(FN.LOGIC_START, logic);
  cpu.wr32(logic + AT.START_CHECK, 0); // only the relay's BattleBegin starts the battle
  call(FN.SNAP_LOAD, logic, [stream(snap)]);
  tables.set(id, { logic, seated: new Set(), out: new Set(), index: -1, opener: 0, turn: null, seats: null });
}

// One relayed message, then two ticks of the logic. A finished battle takes no more, as in the clients.
function feed(t, raw) {
  if (finished(t)) return;
  const msg = call(FN.READ_MSG, call(FN.FACTORY, 0), [stream(raw)]);
  if (!msg) throw new Error('a message the engine could not read');
  call(FN.FROM_NET, msg, [1]);
  call(FN.ADDREF, msg);
  call(FN.PROCESS, t.logic, [msg]);
  for (let i = 0; i < 2 && !finished(t); i++) call(FN.TICK, t.logic);
}

// Each seat's Commander state, read through its slot after every message: a defeated seat's Commander is freed later and its
// memory reused, so no pointer is kept from one message to the next.
function seats(bf) {
  const slots = rd(bf + AT.COMMANDERS), out = {};
  for (let seat = 1; seat < rs(bf + AT.COMMANDER_COUNT); seat++) {
    const c = rd(slots + 4 * seat);
    if (c) out[seat] = { knockouts: rs(c + AT.KNOCKOUTS), princesses: rs(c + AT.PRINCESSES), carried: 0 };
  }
  for (let node = rd(bf + AT.UNITS); node; node = rd(node + 4)) {
    const u = rd(node + 8), princess = u && cpu.m8[u + AT.REMOVED] === 0 && rs(u + AT.KIND) === 0 && rd(u + AT.CARRIES);
    if (princess && out[rs(u + AT.OWNER)]) out[rs(u + AT.OWNER)].carried = rs(princess + AT.OWNER);
  }
  return out;
}

// The moments (CONTEXT.md) the last message brought about, compared with the state after the one before
// (.scratch/replay-marks/research/moment-detection.md). A rescue raises the rescuer's princess count while its hero carried
// another seat's princess, or while a seat fell in the same message (a knock-out handed the princess over and the hero stood
// in its castle); bringing its own princess home raises the count too, and is no moment. Each moment names the message after
// which the battle's turn, phase and seat took the values they had before it: the start of the turn it happened in.
function moments(id, t, bf) {
  const now = seats(bf), before = t.seats, turn = `${rs(bf + AT.TURN)} ${rs(bf + AT.PHASE)} ${rs(bf + AT.SEAT)}`;
  const post = (kind, seat, by) => parentPort.postMessage({ moment: { table: id, index: t.index, opener: t.opener, kind, seat, ...(by && { by }) } });
  if (before) {
    const fallen = Object.keys(before).map(Number).filter(seat => !now[seat]);
    for (const [seat, s] of Object.entries(now).map(([k, v]) => [Number(k), v])) {
      const was = before[seat];
      if (!was) continue;
      if (s.knockouts > was.knockouts) post('knockout', seat);
      if (s.princesses <= was.princesses || was.carried === seat) continue;
      const owner = was.carried || fallen.find(f => f !== seat);
      if (owner) { post('rescue', owner, seat); fallen.splice(fallen.indexOf(owner), 1); }
    }
  }
  t.seats = now;
  if (turn !== t.turn) { t.turn = turn; t.opener = t.index; }
}

// A seat whose Commander is gone is defeated; the ranks are final once the logic is finished.
function report(id, t) {
  const bf = rd(t.logic + AT.BATTLEFIELD), slots = rd(bf + AT.COMMANDERS);
  moments(id, t, bf);
  for (let seat = 1; seat < rs(bf + AT.COMMANDER_COUNT); seat++) {
    if (rd(slots + 4 * seat)) t.seated.add(seat);
    else if (t.seated.has(seat) && !t.out.has(seat)) { t.out.add(seat); parentPort.postMessage({ defeat: { table: id, seat } }); }
  }
  if (t.ranked || !finished(t)) return;
  t.ranked = true;
  const stats = rd(t.logic + AT.STATS), list = rd(stats + AT.STATS_ENTRIES), ranks = {};
  for (let i = 0; i < rs(stats + AT.STATS_COUNT); i++) { const e = rd(list + 4 * i); if (e) ranks[i] = rs(e + AT.RANK); }
  parentPort.postMessage({ ranks: { table: id, ranks } });
}

// The logic's scalar deleting destructor (vtable slot 0) frees it; the Game stays, as nothing else frees it either.
function end(id) {
  const t = tables.get(id);
  tables.delete(id);
  try { if (t && !t.failed) run(rd(rd(t.logic)), t.logic, [1]); } catch { /* the battle is over either way */ }
  parentPort.postMessage({ grown: usage() - booted });
}

parentPort.on('message', ({ start: s, feed: f, end: e }) => {
  if (e) return end(e.table);
  const id = (s ?? f).table, t = tables.get(id);
  try {
    if (s) start(id, s.game, s.snap);
    else if (t && !t.failed) {
      t.index++; // the history index: a finished battle takes no more messages, but they still count
      if (finished(t)) return;
      feed(t, f.raw); report(id, t);
    }
  } catch (err) {
    // One table's failure stops only that table; the others go on in the same engine.
    if (t) t.failed = true; else tables.set(id, { failed: true });
    parentPort.postMessage({ failed: { table: id, cause: err.message } });
  }
});
parentPort.postMessage({ ready: true });
