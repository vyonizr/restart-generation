// Headless boot test: loads the game DLL in the emulator and runs DllMain.
// Usage: node web/tools/boot.mjs <ResetGeneration folder>
import fs from 'fs';
import path from 'path';
import { Machine } from '../emu/machine.js';

const dir = process.argv[2] || 'tmp/ResetGeneration-Standalone/ResetGeneration';
const m = new Machine({ log: s => console.log('[win32]', s) });
const t0 = performance.now();
try {
  const ret = m.loadDll(fs.readFileSync(path.join(dir, 'ResetGeneration-Win32-Web.dll')));
  console.log(`DllMain returned ${ret}, ${m.cpu.icount} instructions, ${(performance.now() - t0).toFixed(0)} ms`);
} catch (e) {
  console.error(e.message, `after ${m.cpu.icount} instructions`);
  process.exitCode = 1;
}
