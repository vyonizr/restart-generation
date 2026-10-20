// Bots for the empty seats of a friendly match (CONTEXT.md "Bot", docs/adr/0008).
// Each one runs server/bot.mjs in a worker thread and logs in through this server's own HTTP SNAP endpoint
// with a password only this process knows. Bot accounts live in memory and are never saved.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { Worker } = require('worker_threads');

const KEY = crypto.randomBytes(12).toString('hex');

// The heroes Expert Bots choose from: [{ hero: 0 to 9, name, why }], the hero's step along the lobby's list (server/bot.mjs).
function loadHeroes(file = path.join(__dirname, 'bot-heroes.json')) {
  const list = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const h of list) if (!Number.isInteger(h.hero) || h.hero < 0 || h.hero > 9 || !h.why) throw new Error(`bot-heroes.json: ${JSON.stringify(h)} needs a hero from 0 to 9 and a why`);
  return list;
}
const HEROES = loadHeroes();
const READY_MS = 60000; // a bot that isn't waiting in Quick Match by then is given up
// ponytail: fixed cap; each bot holds 350 to 410 MB. Make it a setting if hosts differ in memory.
const MAX_RUNNING = 6;
const ID_BASE = 1e6;    // bot account ids, above any saved account's
let url = null, nextId = 1;
const workers = new Map(); // bot id -> Worker
const waiting = new Map(); // bot id -> resolve(session), until the bot asks for a match

// The server's own SNAP address, once its HTTP port listens. Bots also need the server's game copy.
const configure = snapUrl => { url = snapUrl; };
const available = () => Boolean(url && process.env.RG_GAME);
const idOf = s => Number(s.userId) - ID_BASE;

// A bot's login (server/gateway.js): its in-memory account, or null for any other login.
function account(name, password) {
  const m = /^(\w+):(\d+)$/.exec(password);
  return m && m[1] === KEY && workers.has(+m[2]) ? { id: String(ID_BASE + +m[2]), name, bot: true } : null;
}

// Starts bots named CPU_1..CPU_n, fewer if MAX_RUNNING would be passed. Resolves with the session of each one
// that reached Quick Match in time. The 'expert' level runs the AI profiles of server/bot-ai.json and picks heroes from
// server/bot-heroes.json (docs/adr/0012); 'cpu' runs the game's own profiles with a random hero.
function spawn(n, log, level = 'cpu') {
  if (!available()) return Promise.resolve([]); // no SNAP address (a --public server) or no game copy: no engine is ever started
  if (workers.size + n > MAX_RUNNING) log(`${MAX_RUNNING} bots running at most: starting ${Math.max(0, MAX_RUNNING - workers.size)} of ${n}`);
  n = Math.max(0, Math.min(n, MAX_RUNNING - workers.size));
  return Promise.all(Array.from({ length: n }, (_, i) => new Promise(resolve => {
    const id = nextId++, name = `CPU_${i + 1}`;
    const worker = new Worker(path.join(__dirname, 'bot.mjs'), { workerData: { name, password: `${KEY}:${id}`, url, deltas: level === 'expert' ? undefined : [], pool: level === 'expert' ? HEROES.map(h => h.hero) : undefined } });
    workers.set(id, worker);
    const done = s => { clearTimeout(timer); waiting.delete(id); resolve(s); };
    const timer = setTimeout(() => { log(`${name} didn't reach Quick Match`); workers.get(id)?.terminate(); done(null); }, READY_MS);
    waiting.set(id, done);
    worker.on('error', e => log(`${name} stopped: ${e.stack || e.message}`));
    worker.on('exit', () => { workers.delete(id); if (waiting.has(id)) done(null); });
  }))).then(list => list.filter(Boolean));
}

// A bot asked for a ranked match (server/casino.js): it's ready to be seated.
const ready = s => waiting.get(idOf(s))?.(s);
// Stops a bot after its battle, or when it's no longer needed.
const stop = s => workers.get(idOf(s))?.terminate();

module.exports = { configure, available, account, spawn, ready, stop, loadHeroes };
