// Boots the game, runs N ticks, and when the given original address (0x10xxxxxx) executes,
// prints the registers and a few dwords at [ecx]. Usage: node web/tools/probe.mjs <hexva> [ticks]
import { loadGame } from './game.mjs';
import { GameHost } from '../emu/host.js';

const target = parseInt(process.argv[2], 16), ticks = +(process.argv[3] || 60);
const files = await loadGame();
const g = new GameHost(files);
g.boot();
const cpu = g.m.cpu, addr = g.m.addr(target), hex = v => (v >>> 0).toString(16);
let hits = 0;
const orig = cpu.fetch.bind(cpu);
cpu.codeCache[addr - cpu.codeBase] = undefined;
cpu.fetch = function (eip) {
  const f = orig(eip);
  if (eip !== addr) return f;
  const wrapped = () => {
    if (hits++ < 3) {
      const r = cpu.r, words = [];
      for (let i = 0; i < 12; i++) words.push(hex(cpu.dv.getUint32((r[1] >>> 0) + i * 4, true)));
      console.log(`hit ${hits}: eax=${hex(r[0])} ecx=${hex(r[1])} edx=${hex(r[2])} esp=${hex(r[4])} [ecx]: ${words.join(' ')}`);
    }
    f();
  };
  cpu.codeCache[eip - cpu.codeBase] = wrapped;
  return wrapped;
};
for (let i = 1; i <= ticks; i++) g.tick(i * 33);
console.log(`${hits} hits`);
if (process.env.DUMP) {
  const [a, n] = process.env.DUMP.split(':').map(x => parseInt(x, 16));
  console.log(`dump ${hex(a)}:`, [...cpu.m8.subarray(a, a + n)].map(b => b.toString(16).padStart(2, '0')).join(' '));
}
