// Run before the server starts: builds the page (web/dist) when it is missing, so a fresh clone needs only `npm install` and
// `npm start` (ADR 0013). It never installs packages itself. Rebuild after changing web/ or shared/ with `npm run build`.
// With --vite it only checks that Vite is installed (for `npm run dev:web`).
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
if (!process.argv.includes('--vite') && fs.existsSync(path.join(root, 'web', 'dist', 'index.html'))) process.exit(0);
if (!fs.existsSync(vite)) {
  console.error('Vite is not installed, and the page needs it. Run `npm install` once, then start again.');
  process.exit(1);
}
if (process.argv.includes('--vite')) process.exit(0);
console.log('Building the page (web/dist)…');
const build = spawnSync(process.execPath, [vite, 'build'], { cwd: root, stdio: 'inherit' });
process.exit(build.status ?? 1);
