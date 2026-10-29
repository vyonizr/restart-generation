// Run before the server starts: builds the page (web/dist) when it is missing or older than its source, so a fresh clone needs only
// `npm install` and `npm start` (ADR 0013), and a server never sends a page from before the last change to web/ or shared/. It never
// installs packages itself. With --vite it only checks that Vite is installed (for `npm run dev:web`, which serves the source).
// buildPage() is the same check for the end-to-end tests (e2e/global-setup.mjs) and tools/showcase/showcase.mjs.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const vite = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');
const built = path.join(root, 'web', 'dist', 'index.html');

// The newest page source (web/ but its build output, shared/, the build's config) against the last build, so an unchanged page
// isn't built again. Throws when there is no build and none can be made; a stale build without Vite to replace it is kept, with a word.
export function buildPage() {
  const newest = dir => fs.readdirSync(dir, { withFileTypes: true }).reduce((t, e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'dist' && dir.endsWith('web') ? t : Math.max(t, newest(p));
    return Math.max(t, fs.statSync(p).mtimeMs);
  }, 0);
  const configs = ['vite.config.mjs', 'svelte.config.mjs', 'package-lock.json'].map(f => fs.statSync(path.join(root, f)).mtimeMs);
  const sources = Math.max(newest(path.join(root, 'web')), newest(path.join(root, 'shared')), ...configs);
  if (fs.existsSync(built) && fs.statSync(built).mtimeMs >= sources) return;
  if (!fs.existsSync(vite)) {
    if (!fs.existsSync(built)) throw new Error('Vite is not installed, and the page needs a build. Run `npm install` once, then start again.');
    console.warn('The page changed since its last build, and Vite is not installed to build it again: web/dist stays as it is. Run `npm install`.');
    return;
  }
  console.log(fs.existsSync(built) ? 'The page changed since its last build: building it (web/dist)…' : 'Building the page (web/dist)…');
  const r = spawnSync(process.execPath, [vite, 'build'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('the page did not build');
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    if (!process.argv.includes('--vite')) buildPage();
    else if (!fs.existsSync(vite)) throw new Error('Vite is not installed, and the page needs it. Run `npm install` once, then start again.');
  } catch (e) {
    console.error(e.message);
    process.exit(1);
  }
}
