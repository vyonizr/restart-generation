// Liveness check for the battle host: node server/battle.model.test.js
// Model clients play whole battles against the host in simulated time (api.now). A defeated client goes quiet
// (the host can't see defeats, docs/re/re_rules.md section 5), a person may also quit or drop. The clients
// move through phases only on the host's EndTurn messages, as the real ones do, so a host that stalls
// leaves them stuck. Checked in every phase:
//  - the EndTurns match what the clients expect and reach every player, in one order;
//  - the host is never ahead of the clients;
//  - tile and cannon phases end soon after the last living client acted. A defeat costs at most one forced
//    phase, the first one where nothing yet shows it (see `exempt`); every later phase ends in 32 s.
// Needs the 2, 3 and 4-player templates in data/templates.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const battle = require('./battle');
const gm = require('./gamemsg');
const g = require('./gameblob');
const { createReader, frames, T } = require('./mt');

const SEC = 1000;
const QUIET_BOUND = 32 * SEC; // the host waits 30 s for a presumed-defeated person, one tick of slack
const TURNS = 4;
const step = (turn, phase) => turn * 10 + phase;
const i32 = v => { const b = Buffer.alloc(4); b.writeInt32LE(v); return b; };
const rng = seed => () => { // mulberry32
  seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};

// opts: seed, seats, relaxed, bots (per seat), defeats [{ team, turn, phase 4|5, count, how: silent|quit|drop }].
// A defeat happens in `phase` of `turn` once `count` phase 4 turns, or phase 5 shots, are done.
// Returns how many defeats happened.
function play({ seed, seats, relaxed, bots, defeats }) {
  const rand = rng(seed);
  const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const clock = { t: Date.UTC(2026, 9, 18) };
  const inbox = new Map();
  const api = { log() {}, now: () => clock.t, send(s, data) { inbox.get(s).push(...s.read(data)); } };
  const table = battle.createTable(seats, api, relaxed);
  assert(table, `no ${seats}-player template`);
  const label = () => `seed ${seed}, ${seats} seats${relaxed ? ', relaxed' : ''}, bots [${bots.map(Number)}], defeats ${JSON.stringify(defeats)}`;
  const fail = text => assert.fail(`${text}\n  ${label()}`);

  const hero = g.parseGame(fs.readFileSync(path.join(__dirname, '..', 'data', 'templates', `${table.template}.game`))).heroes[1];
  const join = name => { const info = g.writeJoinInfo({ type: 0, slot: -1, aiType: 0, color: -1, name, random: 0, hero });
    return { seq: 1, type: gm.TYPE.INIT, sender: 0, body: Buffer.concat([i32(info.length), info]) }; };
  const playerOf = s => table.players.find(p => p.s === s);
  const send = (s, m) => battle.onGame(table, playerOf(s), Buffer.concat(frames(T.GAME, gm.pack(m))).subarray(3), api);
  const sessions = bots.map((bot, i) => {
    const s = { name: bot ? `CPU_${i + 1}` : `person_${i + 1}`, read: createReader(), account: bot ? { bot: true } : undefined };
    inbox.set(s, []);
    battle.seat(table, s, api);
    send(s, join(s.name));
    return s;
  });
  assert(table.started && table.cannons > 0, 'the table starts, with a known number of shots');
  const shots = table.cannons;
  const sessionOf = new Map(sessions.map(s => [playerOf(s).team, s]));
  const isBot = t => playerOf(sessionOf.get(t)).bot;

  // The clients' game: (turn, phase), the living teams, and what each of them is about to do.
  const live = new Set(sessionOf.keys());
  const exempt = new Set(); // steps whose end may wait for the forced EndTurn: the first one a quiet defeat can't show in
  let turn = 1, phase = 2, phaseAt = clock.t, work = 0; // work: when the last planned action of the phase is due
  let plan = [], moved = new Set(), fired = 0, lastMover = 0, happened = 0, over = false;
  const seqs = new Map();
  const order = (t, type, body = Buffer.from(new Int32Array([3, 4]).buffer)) =>
    send(sessionOf.get(t), { seq: seqs.set(t, (seqs.get(t) ?? 0) + 1).get(t), type, sender: t, turn, phase, body });

  function defeat(d) {
    happened++;
    live.delete(d.team);
    plan = plan.filter(a => a.team !== d.team);
    if (d.how === 'quit') order(d.team, gm.TYPE.END_GAME, i32(0));
    else if (d.how === 'drop') battle.leave(table, playerOf(sessionOf.get(d.team)), api);
    else { exempt.add(step(turn, 5)); if (phase === 5) exempt.add(step(turn + 1, 2)); }
    if (live.size < 2) over = true; // the clients end the battle
  }
  const due = () => (defeats ?? []).filter(d => !d.done && live.has(d.team) && d.turn === turn && d.phase === phase
    && (phase === 4 ? moved.size : fired) >= d.count);
  const defeatDue = () => { for (const d of due()) { d.done = true; defeat(d); if (over) return; } };

  function enter(newTurn, newPhase) {
    turn = newTurn; phase = newPhase; phaseAt = clock.t; plan = []; moved = new Set(); fired = 0; lastMover = 0;
    if (turn > TURNS) { over = true; return; }
    if (phase === 4) return nextMover();
    for (const t of live) {
      let at = phase === 2 ? isBot(t) ? between(3 * SEC, 5 * SEC) : between(SEC, relaxed ? 25 * SEC : 14 * SEC)
        : isBot(t) ? between(3 * SEC, 5 * SEC) : between(SEC, relaxed ? 20 * SEC : 10 * SEC);
      if (phase === 2) plan.push({ at, team: t, run: () => rand() < 0.2 ? order(t, gm.TYPE.END_TURN_REQUEST) : order(t, gm.TYPE.PLACE_TILE) });
      else for (let i = 0; i < shots; i++, at += between(500, 2500)) plan.push({ at, team: t, run: () => { fired++; order(t, gm.TYPE.FIRE_CANNON); } });
    }
    work = Math.max(0, ...plan.map(a => a.at));
  }
  // Phase 4: the clients give the turn to the next living team, or go on to phase 5 when none is left.
  function nextMover() {
    defeatDue();
    if (over) return;
    const t = [...live].sort().find(x => x > lastMover);
    if (!t) return enter(turn, 5);
    lastMover = t; phaseAt = clock.t; plan = [];
    let at = 0;
    for (let i = between(0, 2); i > 0; i--) plan.push({ at: at += between(SEC, 3 * SEC), team: t, run: () => order(t, gm.TYPE.MOVE_UNIT) });
    plan.push({ at: at += between(SEC, isBot(t) ? 3 * SEC : 8 * SEC), team: t, run: () => { order(t, gm.TYPE.END_TURN_REQUEST); moved.add(t); } });
  }
  const sync = (what) => { if (step(table.turn, table.phase) !== step(turn, phase)) fail(`${what}: the host is in (${table.turn}, ${table.phase}), the clients in (${turn}, ${phase})`); };

  function onEndTurn(t, ph) {
    if (t !== turn || ph !== phase) fail(`EndTurn (${t}, ${ph}) reached clients in (${turn}, ${phase})`);
    if (phase === 2) { enter(turn, 4); sync('after phase 2'); }
    else if (phase === 4) nextMover();
    else { enter(turn + 1, 2); if (!over) sync('after phase 5'); }
  }
  function drain() {
    const seen = [];
    for (const [s, box] of inbox) {
      const msgs = box.splice(0).map(m => { assert.equal(m[0], T.GAME); return gm.unpack(m.subarray(1)); });
      if (playerOf(s).state === 'playing') seen.push(msgs.filter(m => m.type === gm.TYPE.END_TURN).map(m => [m.turn, m.phase]));
    }
    for (const e of seen) if (JSON.stringify(e) !== JSON.stringify(seen[0])) fail(`players saw different EndTurns: ${JSON.stringify(seen)}`);
    for (const [t, ph] of seen[0] ?? []) { if (over) return; onEndTurn(t, ph); }
  }

  enter(1, 2); drain();
  for (let n = 0; !over; n++) {
    if (n > 1500) fail(`the battle hung in (${turn}, ${phase})`);
    clock.t += SEC;
    for (const a of [...plan].sort((x, y) => x.at - y.at)) {
      if (over || a.at > clock.t - phaseAt || !plan.includes(a)) continue;
      plan.splice(plan.indexOf(a), 1);
      if (live.has(a.team)) { a.run(); drain(); defeatDue(); }
    }
    if (over) break;
    battle.tick(table, api); drain();
    defeatDue();
    if (over) break;
    if (step(table.turn, table.phase) > step(turn, phase)) fail(`the host is ahead of the clients: (${table.turn}, ${table.phase}) vs (${turn}, ${phase})`);
    if (phase === 2 || phase === 5) {
      // A forced EndTurn counts from when the host entered the phase, which can be as late as a client's first order.
      const bound = exempt.has(step(turn, phase)) ? table.forceAfter[phase] + work + 2 * SEC : Math.max(work, QUIET_BOUND);
      if (clock.t - phaseAt > bound) fail(`phase ${phase} of turn ${turn} still open ${(clock.t - phaseAt) / SEC} s after it began; the last living client acted at ${work / SEC} s`);
    }
  }
  return happened;
}

const person = false, bot = true;
const scenarios = [];
for (const relaxed of [true, false]) {
  // 2 people and 2 bots, the shape a friendly room makes (casino.startWithBots), then every other shape.
  const mixes = [[person, person, bot, bot], [person, bot, bot, bot], [person, person, person, bot], [person, person, person, person],
    [person, bot, bot], [person, person, bot], [person, person, person], [person, bot], [person, person]];
  for (const bots of mixes) for (const team of [1, 2, 3, 4].filter(t => t <= bots.length)) for (const [phase, count] of [[4, 0], [4, 1], [4, 2], [5, 0], [5, 1], [5, 3]]) {
    for (const how of bots[team - 1] ? ['silent'] : ['silent', 'quit', 'drop']) {
      scenarios.push({ seed: scenarios.length, seats: bots.length, relaxed, bots, defeats: [{ team, turn: 1, phase, count, how }] });
    }
  }
}
const named = scenarios.reduce((n, s) => n + play(s), 0);
assert(named > scenarios.length / 2, `the named scenarios defeat teams (${named} in ${scenarios.length})`);

// Random battles: 0 to 2 defeats at random moments, in the first two turns so that later turns show the aftermath.
let defeated = 0, random = 0;
for (let seed = 1; seed <= 400; seed++) {
  const rand = rng(seed * 7919);
  const between = (lo, hi) => lo + Math.floor(rand() * (hi - lo + 1));
  const seats = between(2, 4), relaxed = rand() < 0.5;
  const bots = Array.from({ length: seats }, () => rand() < 0.5);
  bots[0] = false; // a battle needs a person
  const teams = [1, 2, 3, 4].slice(0, seats).sort(() => rand() - 0.5).slice(0, between(0, Math.min(2, seats - 1)));
  const defeats = teams.map(team => { const ph = rand() < 0.5 ? 4 : 5;
    return { team, turn: between(1, 2), phase: ph, count: ph === 4 ? between(0, 2) : between(0, 3), how: bots[team - 1] || rand() < 0.6 ? 'silent' : rand() < 0.5 ? 'quit' : 'drop' }; });
  defeated += play({ seed, seats, relaxed, bots, defeats });
  random++;
}
assert(defeated > random / 2, `the random battles defeat teams (${defeated} in ${random})`);
console.log(`battle model ok (${scenarios.length} named scenarios, ${random} random battles, ${defeated} random defeats)`);
