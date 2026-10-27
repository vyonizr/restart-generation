// The showcase's stage (docs/adr/0036): the cast's battles, played once by Bots and cached, and a throwaway gateway in Discord mode
// whose files hold the cast as members, with their friends, stats and replays, as e2e/global-setup.mjs makes its engine gateway.
import crypto from 'node:crypto';
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { PLAYERS, FRIENDS, BATTLES, HERO } from './cast.mjs';

const require = createRequire(import.meta.url);
const seed = require('../../server/seed.js');
const store = require('../../server/store.js');
const replays = require('../../server/replays.js');

export const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const freePort = () => new Promise(resolve => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });

// What makes a battle's replay and its marks: a change to any of these plays the battles again, as e2e/global-setup.mjs does.
const REPLAY_CODE = ['server/battle.js', 'server/replay.js', 'server/witness.mjs', 'server/bot.mjs'];
const keyOf = battle => {
  const hash = crypto.createHash('sha256').update(JSON.stringify(battle.players));
  for (const file of REPLAY_CODE) hash.update(fs.readFileSync(path.join(root, file)));
  return hash.digest('hex');
};

// The cast's battles as { id, created, text, meta }, from `cacheDir` where a battle's players and the replay code are unchanged,
// else played now by Bots (a few minutes each) and each cached as it ends, so a run that stops keeps the battles it finished. Each
// battle has a gateway of its own, so they are played at once, as many as the machine has a core for each player and the witness.
// With `play` false, only the cached battles, and none is played.
export async function battles(cacheDir, { fresh = false, play = true, log = console.log } = {}) {
  fs.mkdirSync(cacheDir, { recursive: true });
  const load = b => {
    const file = path.join(cacheDir, `${b.id}.json`);
    const cached = !fresh && fs.existsSync(file) && JSON.parse(fs.readFileSync(file, 'utf8'));
    return cached && cached.key === keyOf(b) ? { ...b, text: cached.text, meta: cached.meta } : null;
  };
  const out = BATTLES.map(load);
  if (!play) return out.filter(Boolean);
  const todo = BATTLES.filter((b, i) => !out[i]);
  const cores = os.availableParallelism();
  const playOne = async b => {
    log(`Playing ${b.id}: ${b.players.map(p => p.name).join(' against ')} (a few minutes)…`);
    const { text, meta } = await seed.play(b.players);
    if (!meta.marks?.length) log(`  ${b.id} has no moments marked: its clips start at its beginning`);
    fs.writeFileSync(path.join(cacheDir, `${b.id}.json`), JSON.stringify({ key: keyOf(b), text, meta }));
    out[BATTLES.indexOf(b)] = { ...b, text, meta };
  };
  // Waves of battles whose players and witnesses fit the cores.
  while (todo.length) {
    const wave = [];
    for (let used = 0; todo.length && (!wave.length || used + todo[0].players.length + 1 <= cores);) {
      used += todo[0].players.length + 1;
      wave.push(todo.shift());
    }
    await Promise.all(wave.map(playOne));
  }
  return out;
}

// Made-up Discord sign-in (e2e/global-setup.mjs): the page signs in with the seed token of a name (server/seed.js tokenOf), and never
// reaches Discord. Guests are allowed generously, as the e2e gateways do.
const discord = url => ({ RG_DISCORD_CLIENT_ID: 'showcase', RG_DISCORD_CLIENT_SECRET: 'showcase', RG_PUBLIC_URL: url, RG_GUESTS_PER_IP_HOUR: '100000' });

// The cast in `dir`'s files: members with Discord IDs, tokens and a default saved game (server/seed.js apply()), the stats of cast.mjs,
// the friends, and the played battles as replays seated with the members who played them.
function fill(dir, played) {
  const accounts = store.open(path.join(dir, 'accounts.db')), replayStore = replays.open(path.join(dir, 'replays.db'));
  try {
    const now = Date.now();
    const cast = {
      accounts: PLAYERS.map((p, i) => ({ name: p.name, kind: 'member', discord: String(910000000000000000n + BigInt(i)), created: `-${200 - i * 9}d`,
        lastActive: p.name === HERO ? '-1m' : `-${1 + i}h`, wins: p.wins, matches: p.matches })),
      friends: FRIENDS, replays: [], played: [],
    };
    seed.apply(cast, { accounts, replays: replayStore, discord: true, now });
    for (const p of PLAYERS) {
      const acc = accounts.byName(p.name);
      acc.stats = { fame: 10 * p.wins, matches: p.matches, wins: p.wins, rescues: p.rescues, favouriteHero: p.hero, highestFame: 10 * p.wins };
      accounts.save(acc);
    }
    for (const b of played) {
      const seats = b.meta.players.filter(p => !p.bot && accounts.byName(p.name)).map(p => ({ account: accounts.byName(p.name).id, seat: p.seat }));
      const { created, ...meta } = b.meta;
      replayStore.put({ id: b.id, created: now + seed.offset(b.created), text: b.text, seats, meta });
    }
  } finally {
    accounts.close(); replayStore.close();
  }
}

// A gateway on free ports over `dir`'s cast, sending the server copy `game` (RG_GAME) to the page, or none if `game` is null.
// Resolves with its address, the hero's sign-in, and a way to stop it, once it listens and its game bundle (if any) is ready.
export async function gateway(dir, game, played) {
  fs.mkdirSync(dir, { recursive: true });
  fill(dir, played);
  const [PORT, HTTP_PORT] = [await freePort(), await freePort()];
  const url = `http://127.0.0.1:${HTTP_PORT}`;
  // The shell's .env mustn't decide how this server runs: only the server copy is taken from it.
  const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('RG_')));
  const env = { ...clean, ...discord(url), ...(game ? { RG_GAME: game } : {}), PORT: String(PORT), HTTP_PORT: String(HTTP_PORT),
    RG_DB: path.join(dir, 'accounts.db'), RG_REPLAYS_DB: path.join(dir, 'replays.db') };
  const child = spawn(process.execPath, [path.join(root, 'server', 'gateway.js')], { cwd: root, env });
  const log = fs.createWriteStream(path.join(dir, 'gateway.log'));
  let out = '';
  for (const s of [child.stdout, child.stderr]) s.on('data', d => { out += d; log.write(d); });
  await new Promise((resolve, reject) => {
    const t0 = Date.now();
    const check = () => {
      if (/RG_GAME: /.test(out)) return reject(new Error(`the gateway couldn't load the server copy:\n${out.slice(-2000)}`));
      if (out.includes('browser client on') && (!game || out.includes('game bundle ready'))) return resolve();
      if (child.exitCode !== null || Date.now() - t0 > 60000) return reject(new Error(`the gateway did not start:\n${out.slice(-2000)}`));
      setTimeout(check, 100);
    };
    check();
  }).catch(e => { child.kill(); throw e; });
  // friend: a friend of the hero's, who joins the hero's room so that it can start (shots.mjs room).
  const friend = FRIENDS.find(([a, , state]) => a === HERO && state === 'both')[1];
  return { url, account: { name: HERO, token: seed.tokenOf(HERO) }, friend: { name: friend, token: seed.tokenOf(friend) }, stop: () => child.kill() };
}
