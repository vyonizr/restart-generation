// An older version of the page for the showcase's comparison stills (docs/adr/0036): a git ref checked out in a temporary worktree,
// its page built there with this checkout's packages, and served by its own gateway in name-only mode with no game and no accounts,
// so it shows the page as a guest saw it then. Everything goes when it stops; nothing is committed.
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { root } from './stage.mjs';

const freePort = () => new Promise(resolve => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });

const git = (args, cwd = root) => {
  const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${(r.stderr || r.stdout).trim()}`);
  return r.stdout.trim();
};

// The link to this checkout's node_modules, removed as a link: removing the worktree must never reach into the packages it points at.
const unlink = link => { try { fs.unlinkSync(link); } catch { fs.rmdirSync(link); } };

// Serves `ref` and resolves with { url, ref, stop }. The worktree and its build are removed by stop(), or at once if serving fails.
export async function serveRef(ref) {
  const sha = git(['rev-parse', '--verify', `${ref}^{commit}`]);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-showcase-ref-'));
  const link = path.join(dir, 'node_modules');
  let child = null;
  const stop = () => {
    child?.kill();
    if (fs.existsSync(link)) unlink(link);
    try { git(['worktree', 'remove', '--force', dir]); } catch { /* not added yet */ }
    fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 });
    git(['worktree', 'prune']);
  };
  try {
    git(['worktree', 'add', '--detach', '--quiet', dir, sha]);
    fs.symlinkSync(path.join(root, 'node_modules'), link, 'junction');
    const build = spawnSync(process.execPath, [path.join('node_modules', 'vite', 'bin', 'vite.js'), 'build', '--logLevel', 'error'], { cwd: dir, encoding: 'utf8' });
    if (build.status !== 0) throw new Error(`the page at ${ref} did not build:\n${(build.stderr || build.stdout).slice(-2000)}`);
    const [PORT, HTTP_PORT] = [await freePort(), await freePort()];
    // The shell's .env mustn't decide how this server runs, and it gets no game: the still draws the battle itself.
    const env = { ...Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('RG_'))), PORT: String(PORT), HTTP_PORT: String(HTTP_PORT) };
    child = spawn(process.execPath, [path.join('server', 'gateway.js'), '--lan', '--dev'], { cwd: dir, env });
    let out = '';
    for (const s of [child.stdout, child.stderr]) s.on('data', d => { out += d; });
    await new Promise((resolve, reject) => {
      const t0 = Date.now();
      const check = () => {
        if (out.includes('browser client on')) return resolve();
        if (child.exitCode !== null || Date.now() - t0 > 60000) return reject(new Error(`the gateway at ${ref} did not start:\n${out.slice(-2000)}`));
        setTimeout(check, 100);
      };
      check();
    });
    return { url: `http://127.0.0.1:${HTTP_PORT}`, ref, stop };
  } catch (e) {
    stop();
    throw e;
  }
}
