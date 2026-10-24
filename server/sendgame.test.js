// Self-check for sending the server copy (docs/adr/0031): node server/sendgame.test.js
// First the download code of a public server, through server/sendgame.js with a made-up clock; then real gateways on free ports:
// a server that isn't public sends its copy to every visitor, and a --public server names who runs it (docs/adr/0021).
// The game is a made-up folder with a small .pak of our own, never the game's files.
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const { Readable } = require('stream');
const { spawn } = require('child_process');
const { createSender, ALPHABET, LIMITS } = require('./sendgame');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'sendgame-'));
const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('RG_'))); // the shell's .env mustn't count
const TEXT = Buffer.from('made-up text, not the game. '.repeat(40));
const BIN = Buffer.from([1, 2, 3, 4, 5, 6, 7, 8]);

// A .pak (web/pak.js) holding data/a.txt deflated and data/b.bin stored.
function makePak(pathHash) {
  const bodies = [[pathHash('data/a.txt'), zlib.deflateSync(TEXT), TEXT.length, 1], [pathHash('data/b.bin'), BIN, BIN.length, 0]];
  const head = 8 + 17 * bodies.length, out = Buffer.alloc(head + bodies.reduce((n, b) => n + b[1].length, 0));
  out.writeUInt32LE(head, 0); out.writeUInt32LE(bodies.length, 4);
  let at = head;
  bodies.forEach(([hash, data, size, flag], i) => {
    const o = 8 + 17 * i;
    out.writeUInt32LE(hash, o); out.writeUInt32LE(data.length, o + 4); out.writeUInt32LE(size, o + 8); out[o + 12] = flag; out.writeUInt32LE(at, o + 13);
    data.copy(out, at); at += data.length;
  });
  return out;
}

// One request through sender.http, with `body` and the address `ip`: -> { code, headers, body (decoded) }.
function call(sender, method, { body = '', ip = '1.1.1.1', encoding = 'gzip, deflate, br' } = {}) {
  return new Promise(resolve => {
    const req = Readable.from(body ? [Buffer.from(body)] : [], { objectMode: false });
    Object.assign(req, { method, headers: { 'accept-encoding': encoding }, socket: { remoteAddress: ip } });
    let code, headers;
    const res = {
      writeHead(c, h) { code = c; headers = h; },
      end(data) {
        const e = headers?.['Content-Encoding'];
        resolve({ code, headers, body: e === 'br' ? zlib.brotliDecompressSync(data) : e === 'gzip' ? zlib.gunzipSync(data) : data });
      },
    };
    assert.strictEqual(sender.http(req, res, new URL('/game/bundle', 'http://x')), true);
  });
}

const freePort = () => new Promise(resolve => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (until, ms) => new Promise((resolve, reject) => {
  const t0 = Date.now(), check = () => until() ? resolve() : Date.now() - t0 > ms ? reject(new Error('timed out')) : setTimeout(check, 50);
  check();
});
// Starts a gateway with `env` and `args`; resolves once it listens and has its bundle (if it has a copy) ready, or once it exits.
const children = [];
async function gateway(env, args = []) {
  const [PORT, HTTP_PORT] = [await freePort(), await freePort()];
  const child = spawn(process.execPath, [path.join(__dirname, 'gateway.js'), ...args], { env: { ...clean, PORT, HTTP_PORT, RG_DB: ':memory:', ...env } });
  children.push(child);
  let out = '', code = null;
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  child.on('exit', c => { code = c; });
  await wait(() => code !== null || (out.includes('browser client on') && (!env.RG_GAME || out.includes('game bundle ready'))), 20000);
  const fetchOf = async (url, init) => { const r = await fetch(`http://127.0.0.1:${HTTP_PORT}${url}`, init); return { status: r.status, headers: r.headers, body: new Uint8Array(await r.arrayBuffer()) }; };
  return { child, fetch: fetchOf, log: () => out, code: () => code };
}

(async () => {
  const { pathHash, pakRead } = await import('../web/pak.js');
  const { unpackBundle, GAME_FILES } = await import('../web/bundle.js');
  const PAK = makePak(pathHash);
  // Every file the engine runs from, made up: each .pak our small one, the rest a few bytes; and one file the engine doesn't use.
  const GAME = Object.fromEntries([...GAME_FILES, 'unused.jar'].map(n => [n, new Uint8Array(n.endsWith('.pak') ? PAK : BIN)]));
  // The page's view of a bundle: every file the engine runs from and nothing else, each pak entry reading as it did.
  const sameGame = async bytes => {
    const files = await unpackBundle(new Uint8Array(bytes));
    assert.deepStrictEqual(Object.keys(files), GAME_FILES);
    assert.deepStrictEqual(Buffer.from(files['ResetGeneration-Win32-Web.dll']), BIN);
    assert.deepStrictEqual(Buffer.from(await pakRead(files['gameplay.pak'], 'data/a.txt')), TEXT);
    assert.deepStrictEqual(Buffer.from(await pakRead(files['gameplay.pak'], 'DATA\\B.BIN')), BIN);
  };

  try {
    // ---- A public server: only for its download code ----
    let t = Date.UTC(2026, 9, 24, 12);
    const file = path.join(tmp, 'download-code.json'), cacheDir = path.join(tmp, 'cache'), logged = [];
    const make = (budget = 1e9) => createSender({ public: true, file, cacheDir, ipOf: req => req.socket.remoteAddress, budget, now: () => t, log: m => logged.push(m) });
    let s = make();
    assert.strictEqual((await call(s, 'POST', { body: 'ABCDEF' })).code, 404); // no game yet
    await s.setGame(GAME);
    assert.strictEqual(s.servesAll(), false); // /status never says that a public server sends the game
    assert.strictEqual((await call(s, 'GET')).code, 404);
    assert.strictEqual((await call(s, 'POST', { body: 'ABCDEF' })).code, 404); // no code made
    assert.ok(fs.readdirSync(cacheDir).some(f => f.endsWith('.br')));

    const { code } = s.make();
    assert.match(code, new RegExp(`^[${ALPHABET}]{6}$`));
    const ok = await call(s, 'POST', { body: ` ${code.toLowerCase()}\n` }); // as typed into a link: any case, spaces around
    assert.strictEqual(ok.code, 200);
    assert.strictEqual(ok.headers['Content-Encoding'], 'br');
    assert.strictEqual(ok.headers['X-Game-Size'], ok.body.length);
    await sameGame(ok.body);
    assert.strictEqual((await call(s, 'POST', { body: code, ip: '1.1.1.2', encoding: 'gzip' })).headers['Content-Encoding'], 'gzip');
    assert.strictEqual((await call(s, 'GET', { body: code })).code, 404); // a public server sends nothing for a GET, code or not

    // Two downloads a day per network; the next day it has two more.
    assert.strictEqual((await call(s, 'POST', { body: code })).code, 200);
    assert.strictEqual((await call(s, 'POST', { body: code })).code, 404);
    t += 24 * 3600e3;
    assert.strictEqual((await call(s, 'POST', { body: code })).code, 200);

    // Wrong codes: after 10 from one network in an hour, that network gets nothing, the right code included; others still do.
    for (let i = 0; i < LIMITS.wrongPerNetworkHour; i++) assert.strictEqual((await call(s, 'POST', { body: 'WRONG1', ip: '6.6.6.6' })).code, 404);
    assert.strictEqual((await call(s, 'POST', { body: code, ip: '6.6.6.6' })).code, 404);
    assert.strictEqual((await call(s, 'POST', { body: code, ip: '7.7.7.7' })).code, 200);
    t += 3600e3 + 1;
    assert.strictEqual((await call(s, 'POST', { body: code, ip: '6.6.6.6' })).code, 200);
    // And after 100 from everywhere in an hour, nobody does.
    for (let i = 0; i < LIMITS.wrongPerHour; i++) await call(s, 'POST', { body: 'WRONG2', ip: `10.0.${i >> 8}.${i & 255}` });
    assert.strictEqual((await call(s, 'POST', { body: code, ip: '8.8.8.8' })).code, 404);
    t += 3600e3 + 1;

    // The code and its count outlive a restart; it ends after 20 downloads.
    s = make();
    await s.setGame(GAME);
    assert.strictEqual(s.status().downloads, 6);
    for (let i = 6; i < LIMITS.downloads; i++) assert.strictEqual((await call(s, 'POST', { body: code, ip: `20.0.0.${i}` })).code, 200, `download ${i + 1}`);
    assert.strictEqual(s.status().live, false);
    assert.strictEqual((await call(s, 'POST', { body: code, ip: '30.0.0.1' })).code, 404);
    assert.match(logged.join('\n'), /download 20 of 20, so the code has ended/);
    assert.doesNotMatch(logged.join('\n'), /\d+\.\d+\.\d+\.\d+/); // no address in the log

    // A new code ends the old one; it ends after its days, or when the admin ends it.
    const second = s.make(2).code;
    assert.strictEqual((await call(s, 'POST', { body: code, ip: '30.0.0.2' })).code, 404);
    assert.strictEqual((await call(s, 'POST', { body: second, ip: '30.0.0.3' })).code, 200);
    t += 2 * 24 * 3600e3;
    assert.strictEqual((await call(s, 'POST', { body: second, ip: '30.0.0.4' })).code, 404);
    const third = s.make().code;
    s.end();
    assert.strictEqual((await call(s, 'POST', { body: third, ip: '30.0.0.5' })).code, 404);

    // The day's budget: a download that would go over it is refused.
    fs.rmSync(file);
    s = make(1);
    await s.setGame(GAME);
    const fourth = s.make().code;
    assert.strictEqual((await call(s, 'POST', { body: fourth })).code, 404);
    assert.strictEqual(s.status().downloads, 0);

    // ---- Real gateways ----
    const gameDir = path.join(tmp, 'game');
    fs.mkdirSync(gameDir);
    for (const [name, bytes] of Object.entries(GAME)) fs.writeFileSync(path.join(gameDir, name), bytes);

    // A server that isn't public sends its copy to every visitor, with no code, as one bundle.
    let g = await gateway({ RG_GAME: gameDir });
    assert.strictEqual(JSON.parse(Buffer.from((await g.fetch('/status')).body)).servesGame, true);
    const sent = await g.fetch('/game/bundle');
    assert.strictEqual(sent.status, 200);
    assert.strictEqual(Number(sent.headers.get('X-Game-Size')), sent.body.length);
    await sameGame(sent.body);
    assert.strictEqual((await g.fetch('/game/gameplay.pak')).status, 404); // single files aren't sent
    g.child.kill();

    // Without a server copy it sends nothing, and the page asks for the player's files.
    g = await gateway({});
    assert.strictEqual(JSON.parse(Buffer.from((await g.fetch('/status')).body)).servesGame, false);
    assert.strictEqual((await g.fetch('/game/bundle')).status, 404);
    g.child.kill();

    // A public server names its admin, who stores its data, and where to write, for its Terms and Privacy policy, whether or
    // not it sends the game. It doesn't start without all three, and says which are missing.
    g = await gateway({ RG_GAME: gameDir, RG_CONTACT: 'https://example.org/contact' }, ['--public']);
    await wait(() => g.code() !== null, 20000);
    assert.strictEqual(g.code(), 1);
    assert.match(g.log(), /Refusing to start a --public server without RG_ADMIN_NAME, RG_HOSTING\b/);
    g = await gateway({ RG_ADMIN_NAME: 'Jane Doe', RG_HOSTING: 'Example Cloud', RG_CONTACT: 'http://not-https.example.org' }, ['--public']);
    await wait(() => g.code() !== null, 20000);
    assert.match(g.log(), /Refusing to start a --public server without RG_CONTACT\b/); // set, but not an address the page can link
    g = await gateway({ RG_ADMIN_NAME: 'Jane Doe', RG_HOSTING: 'Example Cloud', RG_CONTACT: 'https://example.org/contact' }, ['--public']);
    await wait(() => g.code() !== null || g.log().includes('browser client on'), 20000);
    // Past the check: it starts, or stops at the next one, the battle templates, which a fresh clone doesn't have.
    assert.match(g.log(), /browser client on|no usable battle template/);
    assert.doesNotMatch(g.log(), /without RG_/);
    g.child.kill();
    console.log('sending the game ok');
  } finally {
    for (const c of children) c.kill();
    fs.rmSync(tmp, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exit(1); });
