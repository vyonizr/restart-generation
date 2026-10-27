// Plays into an Arcade battle with and without the JS fast paths (shared/emu/fast.js) in lockstep and
// reports the first tick where registers, flags, pixels, sound or memory differ. Memory below ESP is skipped:
// the guest's own calls leave scratch there that the fast paths don't reproduce. Sound is pulled as the page
// does (scenarios.mjs). With a scenario (scenarios.mjs), both engines play its keys on the Full board or on Classic,
// through one of a battle's cut-ins (docs/re/re_screen.md "What goes through the curtain"), and the run reports the
// ticks the cut-in played.
// Usage: node tools/emu/fasttest.mjs [ticks]
//        node tools/emu/fasttest.mjs fight|rescue full|classic [ticks]
import crypto from 'crypto';
import { loadGame } from '../../shared/game.mjs';
import { GameHost } from '../../shared/emu/host.js';
import { SCENARIOS, pinClock, scenarioEngine, playTick } from './scenarios.mjs';

const args = process.argv.slice(2), scenario = SCENARIOS[args[0]] && SCENARIOS[args.shift()], view = scenario && args.shift();
if (scenario && view !== 'full' && view !== 'classic') { console.log('usage: node tools/emu/fasttest.mjs [fight|rescue full|classic] [ticks]'); process.exit(2); }
const ticks = +(args[0] || (scenario ? scenario.ticks : 2200));
// Title, main menu, Arcade Mode, character, random opponents, Start.
const keys = new Map(scenario ? scenario.keys : [[620, 'CONTROL'], [700, 'CONTROL'], [820, 'DOWN'], [840, 'DOWN'], [860, 'CONTROL'], [1120, 'CONTROL'],
  [1220, 'CONTROL'], [1320, 'CONTROL'], [1620, 'UP'], [1640, 'CONTROL'], [1800, 'CONTROL'], [1900, 'CONTROL']]);
// clock() times the runs.
const clock = pinClock();
const files = await loadGame();
const engine = fast => {
  if (scenario) return scenarioEngine(files, view, fast);
  const g = new GameHost(files, { fast }); g.boot(); return g;
};
const a = engine(false), b = engine(true);
const pulled = new Map(), sound = new Map([[a, []], [b, []]]);
const step = (g, i) => playTick(g, keys, i, pulled, sound.get(g));
const state = g => {
  const c = g.m.cpu; c.materialize();
  return JSON.stringify({ r: [...c.r], eip: c.eip >>> 0, fl: c.lflags, now: g.m.win.now });
};
const hash = (m, from, to) => crypto.createHash('sha1').update(m.subarray(from, to)).digest('hex');
// The CRT security cookie (0x101b725c) is seeded from the wall clock, so it differs between runs.
const cookie = a.m.addr(0x101b725c);
const memHash = g => {
  const m = g.m.cpu.m8, esp = g.m.cpu.r[4] >>> 0; m.fill(0, cookie, cookie + 4);
  return hash(m, 0, 0x100000) + hash(m, esp, g.m.heap.top);
};
// The game object (0x101b828c) and its battle view (+0x9c), to tell when the scenario's cut-in plays.
const rdA = x => a.m.cpu.rd32(x) >>> 0, app = rdA(a.m.addr(0x101b828c));
let ta = 0, tb = 0, first = 0, last = 0;
for (let i = 1; i <= ticks; i++) {
  let t = clock(); step(a, i); ta += clock() - t;
  t = clock(); step(b, i); tb += clock() - t;
  const sa = state(a), sb = state(b);
  if (sa !== sb) { console.log(`tick ${i}: CPU state differs\n slow ${sa}\n fast ${sb}`); process.exit(1); }
  if (sound.get(a).join(';') !== sound.get(b).join(';')) { console.log(`tick ${i}: sound differs`); process.exit(1); }
  sound.get(a).length = 0; sound.get(b).length = 0;
  if (hash(new Uint8Array(a.pixels.buffer, a.pixels.byteOffset, a.pixels.byteLength)) !==
    hash(new Uint8Array(b.pixels.buffer, b.pixels.byteOffset, b.pixels.byteLength))) { console.log(`tick ${i}: pixels differ`); process.exit(1); }
  const bv = scenario ? rdA(app + 0x9c) : 0;
  if (bv && scenario.on(rdA, bv)) { first ||= i; last = i; }
  if (i % 100 === 0 || i === ticks) {
    if (memHash(a) !== memHash(b)) { console.log(`tick ${i}: memory differs`); process.exit(1); }
    console.log(`tick ${i}: identical (slow ${ta.toFixed(0)} ms, fast ${tb.toFixed(0)} ms)`);
  }
}
if (scenario) console.log(first ? `the cut-in played on ticks ${first}-${last}` : 'the cut-in didn\'t play');
