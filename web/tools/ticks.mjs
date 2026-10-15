// Prints instructions and the return value of each of the first N ticks.
import { loadGame } from './game.mjs';
import { GameHost } from '../emu/host.js';
const files = await loadGame();
const g = new GameHost(files, { log: s => console.log('  log:', s) });
g.boot();
for (let i = 1; i <= +(process.argv[2] || 30); i++) {
  const before = g.m.cpu.icount, ret = g.tick(i * 33);
  console.log(`tick ${i}: ret=${ret} instr=${g.m.cpu.icount - before} now=${g.m.win.now}`);
}
