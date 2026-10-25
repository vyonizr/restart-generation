// Before the end-to-end tests (docs/adr/0025): builds the page if web/ changed since the last build, then starts throwaway gateways
// on free ports, each with its own account and replay files seeded from server/seed.json (docs/adr/0023).
//   E2E_PAGE_URL    Discord mode, no game: what every visitor sees before they bring their files. CI runs only against this one.
//   E2E_ENGINE_URL  Discord mode, sending its server copy (RG_GAME) to visitors, as a server that isn't public does, with the seed's
//                   played battles as replays the engine can play.
//   E2E_NAMES_URL   name-only (ADR 0009), sending its server copy: where the engine asks for a name to go online.
// The last two only when RG_GAME is set; without it the engine tests skip. Nothing here touches data/dev or a running
// `npm run dev`. The played replays are cached in data/e2e/ (ignored by git: they are made from battle templates, docs/LEGAL.md)
// and played again only when server/seed.json's `played` list, or the code that makes a replay and its marks, changes.
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const CACHE = path.join(root, 'data', 'e2e');

const freePort = () => new Promise(resolve => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });

// The shell's .env mustn't decide how the test servers run; only RG_GAME is taken from it, and only for the server copy.
const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('RG_')));
// Discord mode with made-up credentials: the tests sign in with seed tokens and never reach Discord. A run makes a guest per
// browser context, more than the 30 an address may make in an hour.
const discord = url => ({ RG_DISCORD_CLIENT_ID: 'e2e', RG_DISCORD_CLIENT_SECRET: 'e2e', RG_PUBLIC_URL: url, RG_GUESTS_PER_IP_HOUR: '100000' });

// The newest page source (web/ but its build output, shared/, the build's config) against the last build, so an unchanged page
// isn't built again.
function buildPage() {
  const built = path.join(root, 'web', 'dist', 'index.html');
  const newest = dir => fs.readdirSync(dir, { withFileTypes: true }).reduce((t, e) => {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === 'dist' && dir.endsWith('web') ? t : Math.max(t, newest(p));
    return Math.max(t, fs.statSync(p).mtimeMs);
  }, 0);
  const configs = ['vite.config.mjs', 'svelte.config.mjs', 'package-lock.json'].map(f => fs.statSync(path.join(root, f)).mtimeMs);
  const sources = Math.max(newest(path.join(root, 'web')), newest(path.join(root, 'shared')), ...configs);
  if (fs.existsSync(built) && fs.statSync(built).mtimeMs >= sources) return;
  console.log('e2e: building the page (web/dist)…');
  const r = spawnSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build'], { cwd: root, stdio: 'inherit' });
  if (r.status !== 0) throw new Error('the page did not build');
}

function runSeed(env, args) {
  const r = spawnSync(process.execPath, [path.join(root, 'server', 'seed.js'), ...args], { cwd: root, env, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`server/seed.js ${args.join(' ')} failed:\n${r.stdout}${r.stderr}`);
}

// The seed's played battles, played once by Bots and kept in data/e2e/replays.db. A different `played` list, or a change to what
// the server keeps of a battle (its relay, its witness, the replay text and marks), starts the cache over.
const REPLAY_CODE = ['server/battle.js', 'server/replay.js', 'server/witness.mjs'];
function playedReplays(env) {
  const { played } = JSON.parse(fs.readFileSync(path.join(root, 'server', 'seed.json'), 'utf8'));
  const hash = crypto.createHash('sha256').update(JSON.stringify(played));
  for (const file of REPLAY_CODE) hash.update(fs.readFileSync(path.join(root, file)));
  const key = hash.digest('hex');
  const keyFile = path.join(CACHE, 'played.sha256');
  if (fs.existsSync(keyFile) && fs.readFileSync(keyFile, 'utf8') === key) return path.join(CACHE, 'replays.db');
  fs.rmSync(CACHE, { recursive: true, force: true });
  fs.mkdirSync(CACHE, { recursive: true });
  console.log(`e2e: playing the seed's ${played.length} played battles for data/e2e/ (a few minutes, once)…`);
  runSeed(env, ['--play', '--db', path.join(CACHE, 'accounts.db')]);
  fs.writeFileSync(keyFile, key);
  return path.join(CACHE, 'replays.db');
}

// A gateway on free ports with seeded files in `dir`, in Discord mode unless `names`. Resolves with its address and a way to stop it
// once it listens and, if it has a server copy, its game bundle is ready to send; kills it if it doesn't get there.
async function gateway(dir, { game = null, names = false, replays = null } = {}) {
  fs.mkdirSync(dir);
  const [PORT, HTTP_PORT] = [await freePort(), await freePort()];
  const url = `http://127.0.0.1:${HTTP_PORT}`;
  const env = { ...clean, ...(names ? {} : discord(url)), ...(game ? { RG_GAME: game } : {}),
    PORT: String(PORT), HTTP_PORT: String(HTTP_PORT), RG_DB: path.join(dir, 'accounts.db'), RG_REPLAYS_DB: path.join(dir, 'replays.db') };
  if (replays) fs.copyFileSync(replays, env.RG_REPLAYS_DB);
  runSeed(env, ['--db', env.RG_DB, '--replays-db', env.RG_REPLAYS_DB]);
  const child = spawn(process.execPath, [path.join(root, 'server', 'gateway.js')], { cwd: root, env });
  const log = fs.createWriteStream(path.join(dir, 'gateway.log'));
  let out = '';
  for (const s of [child.stdout, child.stderr]) s.on('data', d => { out += d; log.write(d); });
  try {
    await new Promise((resolve, reject) => {
      const t0 = Date.now();
      const check = () => {
        if (/RG_GAME: /.test(out)) return reject(new Error(`the gateway in ${dir} couldn't load its server copy:\n${out.slice(-2000)}`));
        if (out.includes('browser client on') && (!game || out.includes('game bundle ready'))) return resolve();
        if (child.exitCode !== null || Date.now() - t0 > 60000) return reject(new Error(`the gateway in ${dir} did not start:\n${out.slice(-2000)}`));
        setTimeout(check, 100);
      };
      check();
    });
  } catch (e) {
    child.kill();
    throw e;
  }
  return { url, stop: () => child.kill() };
}

export default async function globalSetup() {
  buildPage();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-e2e-'));
  const stops = [];
  const teardown = () => {
    for (const stop of stops) stop();
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }); } catch { /* a file the OS still holds */ }
  };
  try {
    const page = await gateway(path.join(dir, 'page'));
    stops.push(page.stop);
    process.env.E2E_PAGE_URL = page.url;
    if (process.env.RG_GAME) {
      const game = path.resolve(root, process.env.RG_GAME);
      const replays = playedReplays({ ...clean, ...discord('http://127.0.0.1'), RG_GAME: game });
      const engine = await gateway(path.join(dir, 'engine'), { game, replays });
      stops.push(engine.stop);
      process.env.E2E_ENGINE_URL = engine.url;
      const names = await gateway(path.join(dir, 'names'), { game, names: true });
      stops.push(names.stop);
      process.env.E2E_NAMES_URL = names.url;
    }
  } catch (e) {
    teardown();
    throw e;
  }
  return teardown;
}
