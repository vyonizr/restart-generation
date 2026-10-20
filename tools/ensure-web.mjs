// Run before the server starts: builds the page (web/dist) when it is missing, so a fresh clone needs only `npm install` and
// `npm start` (ADR 0013). It never installs packages itself. Rebuild after changing web/ with `npm run build`.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
if (fs.existsSync(path.join(root, 'web', 'dist', 'index.html'))) process.exit(0);

const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
if (!fs.existsSync(vite)) {
  console.error('The page is not built yet, and Vite is not installed. Run `npm install` once, then start again.');
  process.exit(1);
}
console.log('Building the page (web/dist)…');
const build = spawnSync(process.execPath, [vite, 'build'], { cwd: root, stdio: 'inherit' });
process.exit(build.status ?? 1);
