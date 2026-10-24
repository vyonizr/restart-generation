// The download code of a public server, through the running server (docs/adr/0031):
//   npm run download-code                      what the code is, until when, and what it has sent
//   npm run download-code -- --new [--days N] a new code, which ends the old one at once; it ends by itself after N days (30)
//   npm run download-code -- --end            ends the code at once: the server sends the game to nobody
// In Docker: docker compose exec rg npm run download-code -- --new
import { HTTP_PORT } from './ports.js';

const USAGE = 'Usage: npm run download-code [-- --new [--days N] | -- --end]';
const fail = message => { console.error(message); process.exitCode = 1; };

const args = process.argv.slice(2);
let method = 'GET', days = null, bad = false;
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--new' && method === 'GET') method = 'POST';
  else if (args[i] === '--end' && method === 'GET') method = 'DELETE';
  else if (args[i] === '--days' && /^\d+$/.test(args[i + 1] ?? '')) days = Number(args[++i]);
  else { bad = true; break; }
}
if (bad || (days !== null && method !== 'POST')) fail(USAGE);
else await run();

async function run() {
  const token = process.env.RG_ADMIN_TOKEN;
  if (!token) return fail('RG_ADMIN_TOKEN is not set here. Put the value the server uses in .env (or the container\'s environment).');
  const base = `http://127.0.0.1:${HTTP_PORT}`;
  let code = 0, body = null;
  try {
    const res = await fetch(`${base}/admin/download-code${days !== null ? `?days=${days}` : ''}`, { method, headers: { Authorization: `Bearer ${token}` } });
    code = res.status;
    try { body = JSON.parse(await res.text()); } catch { /* the switched-off endpoint answers plain text */ }
  } catch { /* nobody answered */ }
  if (code === 0) return fail(`No server answered at ${base}. Start it, or run this where it runs; in Docker:\n  docker compose exec rg npm run download-code ${args.length ? `-- ${args.join(' ')}` : ''}`);
  if (code === 401) return fail('The server refused the token: RG_ADMIN_TOKEN here is not the one the server runs with.');
  if (code === 404) return fail('The server has no admin endpoint: set RG_ADMIN_TOKEN where it runs and restart it.');
  if (code === 422 && body?.error === 'not_public') return fail('This server isn\'t public (--public): it sends the game to every visitor already, with no code.');
  if (code === 400 && body?.error === 'days') return fail('--days takes a whole number of days from 1 to 365.');
  if (code !== 200 || !body) return fail(`The server answered ${code}${body?.error ? ` (${body.error})` : ''}.`);

  const s = body;
  const mib = n => `${(n / 2 ** 20).toFixed(0)} MiB`;
  if (!s.public) console.log('This server isn\'t public (--public): it sends the game to every visitor, with no code.');
  else if (!s.code) console.log('No download code: the server sends the game to nobody. Make one with --new.');
  else {
    const site = process.env.RG_PUBLIC_URL ? process.env.RG_PUBLIC_URL.replace(/\/+$/, '') : 'https://YOUR-SITE';
    const why = s.live ? `live until ${new Date(s.ends).toISOString().slice(0, 16).replace('T', ' ')} UTC`
      : s.ended ? `ended ${new Date(s.ended).toISOString().slice(0, 16).replace('T', ' ')} UTC`
        : s.downloads >= s.maxDownloads ? 'ended: all its downloads are used' : 'ended: its time ran out';
    console.log(`Download code ${s.code}: ${why}. ${s.downloads} of ${s.maxDownloads} downloads used.`);
    if (s.live) console.log(`Give your friends this link, and nobody else: ${site}/?code=${s.code}`);
  }
  if (s.public) console.log(`Sent today: ${mib(s.sentToday)} of ${mib(s.budget)} (RG_GAME_MB_PER_DAY).${s.ready ? '' : ' The game bundle isn\'t ready yet: is RG_GAME set?'}`);
}
