// Self-check for serving replays: node server/replaypage.test.js
// The replay page's link preview (server/replaypage.js), and a started gateway's replay data, gone replays, and RG_REPLAYS=0.
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const replays = require('./replays');
const { replayPage } = require('./replaypage');

const meta = { created: Date.UTC(2026, 9, 22, 18), ranked: true, environment: 3,
  players: [{ name: 'Ada', hero: 'LEVEL_50_ELF', seat: 1, bot: false }, { name: 'Bo', hero: 'PLUMBER', seat: 2, bot: false },
    { name: 'Robo', hero: 'DR_LOVEBOMBER', seat: 3, bot: true }],
  result: null };

// A chat app reads the preview from the page's head, without running it: the players, their heroes, the kind of match, the
// environment and the day. Text only: the only picture there could be is the game's.
const shell = '<!doctype html><html><head><meta charset="utf-8"><title>Replay · Restart Generation</title></head><body></body></html>';
const page = replayPage(shell, meta);
assert.match(page, /<title>Ada, Bo and Robo · Replay · Restart Generation<\/title>/);
assert.match(page, /<meta property="og:title" content="Ada, Bo and Robo · Replay · Restart Generation">/);
const description = 'A ranked match on soccer, 22 October 2026. Ada played Level 50 Elf, Bo played Plumber and Robo (CPU) played Dr Lovebomber.';
assert(page.includes(`<meta property="og:description" content="${description}">`), page);
assert(page.includes(`<meta name="description" content="${description}">`));
assert.doesNotMatch(page, /og:image/);
// Anything a name could carry is escaped.
assert.match(replayPage(shell, { ...meta, players: [{ ...meta.players[0], name: '<b>"&' }] }), /<title>&lt;b&gt;&quot;&amp; · Replay/);
// A replay that is gone keeps the page's own title, so the page can say it's gone.
assert.strictEqual(replayPage(shell, null), shell);
// A hero type is whatever the client sent; replacement patterns in it stay text.
const odd = replayPage(shell, { ...meta, players: [{ ...meta.players[0], hero: "$`$&$'" }] });
assert.strictEqual(odd.split('<title>').length, 2, 'the head is written once');
assert(odd.includes("Ada played $`$&amp;$&#39;."), odd);
console.log('replay preview ok');

const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('RG_')));
const freePort = () => new Promise(resolve => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (until, ms) => new Promise((resolve, reject) => {
  const t0 = Date.now(), check = () => until() ? resolve() : Date.now() - t0 > ms ? reject(new Error('timed out')) : setTimeout(check, 50);
  check();
});
const children = [];
async function gateway(env) {
  const [PORT, HTTP_PORT] = [await freePort(), await freePort()];
  const child = spawn(process.execPath, [path.join(__dirname, 'gateway.js')], { env: { ...clean, PORT, HTTP_PORT, RG_DB: ':memory:', ...env } });
  children.push(child);
  let out = '';
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  await wait(() => out.includes('browser client on'), 20000);
  const get = async url => { const r = await fetch(`http://127.0.0.1:${HTTP_PORT}${url}`); return { status: r.status, body: await r.text() }; };
  return { child, get };
}

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'replays-'));
const file = path.join(dir, 'replays.db'), accountsFile = path.join(dir, 'accounts.db');
const accounts = require('./store').open(accountsFile);
const ada = accounts.create('Ada', 'named', Date.now());
accounts.close();
const db = replays.open(file);
const id = db.save({ created: Date.now(), text: 'QUJD', accounts: [ada.id], meta: { ...meta, created: undefined } });
const old = db.save({ created: Date.now() - replays.KEEP_MS - 1000, text: 'QUJD', accounts: [ada.id], meta });
db.close();

(async () => {
  try {
    // The page fetches a replay's text and what it shows around it; one that doesn't exist or is 30 days old is gone.
    let g = await gateway({ RG_REPLAYS_DB: file, RG_DB: accountsFile });
    assert.strictEqual(JSON.parse((await g.get('/status')).body).replays, true);
    const found = await g.get(`/replay/${id}/data`);
    assert.strictEqual(found.status, 200);
    const data = JSON.parse(found.body);
    assert.strictEqual(data.text, 'QUJD');
    assert.deepStrictEqual(data.meta.players, meta.players);
    assert.strictEqual((await g.get('/replay/no-such-replay-id/data')).status, 404);
    assert.strictEqual((await g.get(`/replay/${old}/data`)).status, 404);
    // Anyone can list the replays under a player's name, whatever its case (ADR 0024); a name nobody holds has none.
    const listed = JSON.parse((await g.get('/replays?name=ADA')).body);
    assert.deepStrictEqual(listed.replays.map(r => [r.id, r.ranked, r.players.length]), [[id, true, 3]]);
    assert.strictEqual(listed.replays[0].expires - listed.replays[0].created, replays.KEEP_MS);
    assert.deepStrictEqual(JSON.parse((await g.get('/replays?name=Nobody')).body), { replays: [] });
    g.child.kill();

    // RG_REPLAYS=0 keeps no replays and serves none of those already kept.
    g = await gateway({ RG_REPLAYS_DB: file, RG_DB: accountsFile, RG_REPLAYS: '0' });
    assert.strictEqual(JSON.parse((await g.get('/status')).body).replays, false);
    assert.strictEqual((await g.get(`/replay/${id}/data`)).status, 404);
    assert.strictEqual((await g.get('/replays?name=Ada')).status, 404);
    g.child.kill();
    console.log('replay routes ok');
  } finally {
    // Windows keeps the file locked until each gateway has exited.
    await Promise.all(children.map(c => c.exitCode !== null || c.signalCode ? null : new Promise(resolve => { c.on('exit', resolve); c.kill(); })));
    fs.rmSync(dir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exit(1); });
