// Seed accounts (CONTEXT.md, docs/adr/0023): made-up accounts, friends, tokens, saved games and replays from server/seed.json,
// upserted into a development server's files so that rankings, friends, rooms and replays look lived-in.
//
// Usage: node --env-file-if-exists=.env server/seed.js [--lan] [--play] [--db FILE [--replays-db FILE]]
//   --lan         seed the name-only files, as `npm run dev:lan` opens them; otherwise the mode follows .env, as `npm run dev`
//   --play        also play the seed's `played` battles that have no replay yet, between Bots logged in as seed accounts, for
//                 replays the engine can play (needs RG_GAME and battle templates; a few minutes each)
//   --db FILE     seed this accounts file instead of data/dev/'s; its replays go beside it unless --replays-db names a file
//
// The seed owns the names in seed.json: each run puts those rows back to the file's values and leaves every other row alone.
// Times in seed.json are offsets from the run ("-3d", "-23h55m"), so guests never age out of their 24 hours. Dev_Hoarder has more
// battles than an account keeps (docs/adr/0034), so its oldest leave its list and stay on its opponents'.
const crypto = require('crypto');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { Worker } = require('worker_threads');
const { pathToFileURL } = require('url');
const store = require('./store');
const replays = require('./replays');
const { modeFrom, dataFiles, MEMBER_TOKEN_MS } = require('./auth');
const { VALID_NAME } = require('../web/snap-ids.js');

const DATA_DIR = path.join(__dirname, '..', 'data');
const PLACEHOLDER_TEXT = 'QUJD'; // not a replay the engine can play; see --play
const FILL_FILE_BYTES = 256 * 1024; // one saved game file at the server's limit (server/auth.js)

// "-1d3h" -> milliseconds from the run (negative: before it).
function offset(text) {
  const m = /^-?(?:(\d+)d)?(?:(\d+)h)?(?:(\d+)m)?$/.exec(String(text));
  if (!m || text === '' || text === '-') throw new Error(`seed: "${text}" is not a time offset such as -3d or -23h55m`);
  const ms = ((+(m[1] || 0) * 24 + +(m[2] || 0)) * 60 + +(m[3] || 0)) * 60e3;
  return String(text).startsWith('-') ? -ms : ms;
}

// A seed account's token comes from its name, so it is the same on every run and on every developer's machine. That makes it
// public: it only ever opens a development server's files (docs/adr/0023).
const tokenOf = name => crypto.createHash('sha256').update(`restart-generation seed token ${name.toLowerCase()}`).digest('base64url');

// settings.cfg, built from docs/re/re_settings.md: the header the engine writes by default (in English), then the 13 key lists.
const KEY_IDS = { Up: 1, Down: 2, Left: 3, Right: 4, Enter: 5, Space: 6, Ctrl: 9, Shift: 11 };
for (let d = 0; d <= 9; d++) KEY_IDS[String(d)] = 22 + d;
for (let c = 0; c < 26; c++) KEY_IDS[String.fromCharCode(65 + c)] = 32 + c;
const ENTER = 5, BACKSPACE = 8, ESC = 21, KP_ENTER = 82, KEYBOARD = 1;
function settingsFile(keys = {}) {
  const id = action => {
    const fallback = { primary: 'Ctrl', secondary: 'Shift', up: 'Up', down: 'Down', left: 'Left', right: 'Right', chat: 'E' }[action];
    const key = keys[action] ?? fallback;
    if (!(key in KEY_IDS)) throw new Error(`seed: ${action} key "${key}" is not one the Custom Keys screen takes`);
    return KEY_IDS[key];
  };
  const select = [id('primary'), ENTER, KP_ENTER], back = [id('secondary'), ESC, BACKSPACE];
  const dirs = ['left', 'right', 'up', 'down'].map(a => [id(a)]);
  const lists = [select, back, ...dirs, select, back, ...dirs, [id('chat')]];
  const words = [0x4b455953];
  for (const list of lists) { words.push(list.length); for (const k of list) words.push((KEYBOARD << 16 | k) >>> 0); }
  words.push(0x600dc0de);
  const bytes = Buffer.alloc(19 + words.length * 4);
  bytes.set([1, 1, 0], 0);
  [4, 4, 4, 126].forEach((n, i) => bytes.writeInt32LE(n, 3 + i * 4));
  words.forEach((w, i) => bytes.writeUInt32LE(w, 19 + i * 4));
  return bytes;
}

// Upserts the seed into an open account store and replay store. In name-only mode (discord false), members become named
// accounts without a Discord ID, tokens or saved game, and guests are left out with their friends. Returns what a developer
// needs to sign in, and the played battles that have no replay yet.
function apply(seed, { accounts, replays: replayStore, discord, now = Date.now() }) {
  const ids = new Map(), signIns = [];
  for (const a of seed.accounts) {
    if (a.kind === 'guest' && !discord) continue;
    const kind = discord ? a.kind : 'named';
    const acc = accounts.upsert({ name: a.name, kind, discordId: discord && a.kind === 'member' ? a.discord : null, created: now + offset(a.created), lastActive: now + offset(a.lastActive) });
    const fame = 10 * a.wins; // a ranked win is worth 10 fame, and nothing takes fame away (server/casino.js)
    acc.stats = { fame, matches: a.matches, wins: a.wins, rescues: 0, favouriteHero: -1, highestFame: fame };
    acc.achievements = null;
    accounts.save(acc);
    ids.set(a.name, acc);
    if (!discord) continue;
    const token = tokenOf(a.name);
    accounts.putToken(acc, token, a.kind === 'member' ? now + MEMBER_TOKEN_MS : null);
    signIns.push({ name: a.name, kind: a.kind, token });
    if (a.kind !== 'member') continue;
    accounts.putSave(acc, 'settings.cfg', settingsFile(a.keys));
    for (let i = 1; i <= (a.fill ?? 0); i++) accounts.putSave(acc, `dev_fill_${i}.bin`, Buffer.alloc(FILL_FILE_BYTES, i));
  }
  let friends = 0;
  for (const [a, b, state] of seed.friends) {
    if (!ids.has(a) || !ids.has(b)) continue;
    accounts.setLinks(ids.get(a), ids.get(b), state, state === 'to' ? 'from' : state);
    friends++;
  }
  // The seats [{ account, seat }] of the seed accounts among a replay's players ({ name, seat, bot }), as a battle's replay keeps them.
  const seated = players => players.filter(p => !p.bot && ids.has(p.name)).map(p => ({ account: ids.get(p.name).id, seat: p.seat }));
  for (const r of seed.replays) {
    const players = r.players.map(p => ({ name: p.name, hero: p.hero, seat: p.seat, bot: Boolean(p.bot) }));
    replayStore.put({ id: r.id, created: now + offset(r.created), text: PLACEHOLDER_TEXT, seats: seated(players),
      meta: { ranked: r.ranked, environment: r.environment, players, result: r.result } });
  }
  const unplayed = [];
  for (const p of seed.played) {
    const kept = replayStore.get(p.id);
    if (!kept) { unplayed.push(p); continue; }
    const { created, ...meta } = kept.meta;
    replayStore.put({ id: p.id, created: now + offset(p.created), text: kept.text, seats: seated(meta.players), meta });
  }
  return { accounts: ids.size, friends, replays: seed.replays.length + seed.played.length - unplayed.length, signIns, unplayed, seated };
}

// What seed.json must hold for apply() to give accounts the server itself could have made.
function check(seed) {
  const names = new Set();
  for (const a of seed.accounts) {
    if (!VALID_NAME.test(a.name)) throw new Error(`seed: ${a.name} is not a valid name`);
    if (names.has(a.name.toLowerCase())) throw new Error(`seed: ${a.name} is listed twice`);
    names.add(a.name.toLowerCase());
    if (a.kind === 'member' ? !/^Dev_/.test(a.name) : a.kind === 'guest' ? !/^Guest9000\d\d$/.test(a.name) : true) throw new Error(`seed: ${a.name} needs the Dev_ prefix (members) or a Guest9000NN name (guests)`);
    if (!(a.wins >= 0 && a.wins <= a.matches)) throw new Error(`seed: ${a.name} has more wins than matches`);
    offset(a.created); offset(a.lastActive);
  }
  for (const [a, b, state] of seed.friends) {
    if (!names.has(a.toLowerCase()) || !names.has(b.toLowerCase()) || !['to', 'both'].includes(state)) throw new Error(`seed: friends ${a}, ${b}, ${state}`);
  }
}

// ---- --play: a battle between Bots logged in as seed accounts, on a throwaway name-only gateway, as tools/selfplay.mjs does ----

const freePort = () => new Promise(resolve => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const PLAY_TIMEOUT_MS = 25 * 60e3;

// -> { text, meta } of the battle's replay, as the gateway kept it.
async function play(players) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'seed-play-'));
  const [PORT, HTTP_PORT] = [await freePort(), await freePort()];
  const lines = [];
  // Bots join 3 s apart: a table of more than two waits for all of them (casino.js), as in tools/selfplay.mjs.
  const gateway = spawn(process.execPath, [path.join(__dirname, 'gateway.js')], {
    env: { ...process.env, PORT, HTTP_PORT, RG_DB: path.join(dir, 'accounts.db'), RG_REPLAYS_DB: path.join(dir, 'replays.db'), RG_GATHER_MS: players.length === 2 ? '500' : '30000',
      RG_DISCORD_CLIENT_ID: '', RG_DISCORD_CLIENT_SECRET: '', RG_PUBLIC_URL: '' } });
  const feed = chunk => { for (const l of String(chunk).split('\n')) if (l.trim()) lines.push(l.trim()); };
  gateway.stdout.on('data', feed); gateway.stderr.on('data', feed);
  const workers = [];
  try {
    for (let i = 0; !lines.some(l => l.includes('browser client on')); i++) { if (i > 100) throw new Error(`the gateway did not start:\n${lines.slice(-5).join('\n')}`); await sleep(100); }
    const url = `http://127.0.0.1:${HTTP_PORT}/snap`;
    await new Promise((resolve, reject) => {
      const ended = new Set();
      const timer = setTimeout(() => reject(new Error(`no result in ${PLAY_TIMEOUT_MS / 60e3} min`)), PLAY_TIMEOUT_MS);
      players.forEach(({ name, hero }, i) => setTimeout(() => {
        const w = new Worker(new URL('./bot.mjs', pathToFileURL(__filename)), { workerData: { name, password: '', url, deltas: [], hero, report: true, speed: 8 } });
        workers.push(w);
        w.on('message', m => { if (m.ended) ended.add(name); if (ended.size === players.length) { clearTimeout(timer); resolve(); } });
        w.on('error', e => { clearTimeout(timer); reject(new Error(`${name}: ${e.message}`)); });
      }, i * 3000));
    });
    // A Bot leaves its seat after the battle, and the gateway then scores the battle and keeps its replay with the result. Should
    // the Bots not leave, stopping them lets their sessions time out (45 s), and the replay is kept without a result.
    const kept = () => lines.map(l => / kept as replay ([\w-]+)/.exec(l)?.[1]).find(Boolean);
    for (let i = 0; i < 900 && !kept(); i++) await sleep(100);
    for (const w of workers) w.terminate();
    for (let i = 0; i < 900 && !kept(); i++) await sleep(100);
    if (!kept()) throw new Error('the gateway kept no replay');
    const r = await fetch(`http://127.0.0.1:${HTTP_PORT}/replay/${kept()}/data`);
    if (!r.ok) throw new Error(`the replay answered ${r.status}`);
    const { text, meta } = await r.json();
    delete meta.created;
    return { text, meta };
  } finally {
    for (const w of workers) w.terminate();
    gateway.kill();
    try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5 }); } catch { /* a temp file the OS still holds */ }
  }
}

async function main(argv) {
  const arg = name => { const i = argv.indexOf(`--${name}`); return i < 0 ? '' : argv[i + 1] || ''; };
  const mode = modeFrom([...argv, '--dev'], process.env);
  let files = dataFiles(mode, DATA_DIR);
  if (arg('db')) {
    const accountsFile = path.resolve(arg('db'));
    const base = path.basename(accountsFile);
    const replaysFile = arg('replays-db') ? path.resolve(arg('replays-db')) : /^accounts/.test(base) ? path.join(path.dirname(accountsFile), base.replace(/^accounts/, 'replays')) : '';
    if (!replaysFile) throw new Error('--db names a file whose name doesn\'t start with "accounts": name its replays file with --replays-db');
    files = { dir: path.dirname(accountsFile), accounts: accountsFile, replays: replaysFile };
  }
  const seed = JSON.parse(fs.readFileSync(path.join(__dirname, 'seed.json'), 'utf8'));
  check(seed);
  fs.mkdirSync(files.dir, { recursive: true });
  const accounts = store.open(files.accounts), replayStore = replays.open(files.replays);
  try {
    const now = Date.now();
    let done = apply(seed, { accounts, replays: replayStore, discord: mode.discord, now });
    if (argv.includes('--play') && done.unplayed.length) {
      if (!process.env.RG_GAME) throw new Error('--play needs RG_GAME, the server copy of the game (.env)');
      for (const p of done.unplayed) {
        console.log(`Playing ${p.id}: ${p.players.map(x => x.name).join(' against ')}…`);
        const { text, meta } = await play(p.players);
        replayStore.put({ id: p.id, created: now + offset(p.created), text, meta, seats: done.seated(meta.players) });
      }
      done = apply(seed, { accounts, replays: replayStore, discord: mode.discord, now });
    }
    console.log(`Seeded ${files.accounts}: ${done.accounts} accounts, ${done.friends} friend pairs, ${done.replays} replays (${mode.discord ? 'Discord sign-in' : 'name-only'}).`);
    if (done.unplayed.length) console.log(`${done.unplayed.length} played replay${done.unplayed.length > 1 ? 's are' : ' is'} missing; \`npm run seed -- --play\` plays ${done.unplayed.length > 1 ? 'them' : 'it'} (needs RG_GAME).`);
    if (!mode.discord) { console.log('To play as a seed account, choose Change name under Start and type its name, such as Dev_Ada.'); return; }
    console.log('To play as a seed account, open the page in a private window, paste its line into the console, and reload:');
    for (const s of done.signIns) console.log(`  ${s.name.padEnd(15)} ${s.kind.padEnd(6)} localStorage.setItem('rg:account', '${JSON.stringify({ name: s.name, token: s.token })}')`);
  } finally {
    accounts.close(); replayStore.close();
  }
}

if (require.main === module) main(process.argv.slice(2)).catch(e => { console.error(e.message); process.exitCode = 1; });

module.exports = { apply, check, settingsFile, offset, tokenOf };
