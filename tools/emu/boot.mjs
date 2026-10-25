// Headless boot test: loads the game DLL in the emulator and runs DllMain.
// Usage: node tools/emu/boot.mjs [ResetGeneration folder or .zip]   (default: RG_GAME)
import { loadGame } from '../../shared/game.mjs';
import { Machine } from '../../shared/emu/machine.js';

const files = await loadGame(process.argv[2]);
const m = new Machine({ log: s => console.log('[win32]', s) });
const t0 = performance.now();
try {
  const ret = m.loadDll(files['ResetGeneration-Win32-Web.dll']);
  console.log(`DllMain returned ${ret}, ${m.cpu.icount} instructions, ${(performance.now() - t0).toFixed(0)} ms`);
} catch (e) {
  console.error(e.message, `after ${m.cpu.icount} instructions`);
  process.exitCode = 1;
}
