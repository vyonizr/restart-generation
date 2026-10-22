// Self-check for a started gateway: node server/sendgame.test.js
// RG_GAME is the server copy; only RG_SEND_GAME=1 sends it (docs/adr/0020). A --public server names who runs it (docs/adr/0021).
// Starts a real gateway on free ports for each case, with a made-up game folder.
const assert = require('assert');
const fs = require('fs');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const gameDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sendgame-'));
const PAK = Buffer.from('made-up bytes, not the game');
fs.writeFileSync(path.join(gameDir, 'example.pak'), PAK);
const clean = Object.fromEntries(Object.entries(process.env).filter(([k]) => !k.startsWith('RG_'))); // the shell's .env mustn't count

const freePort = () => new Promise(resolve => { const s = net.createServer().listen(0, '127.0.0.1', () => { const p = s.address().port; s.close(() => resolve(p)); }); });
const wait = (until, ms) => new Promise((resolve, reject) => {
  const t0 = Date.now(), check = () => until() ? resolve() : Date.now() - t0 > ms ? reject(new Error('timed out')) : setTimeout(check, 50);
  check();
});
// Starts a gateway with `env` and `args`; resolves once it listens and has its server copy (if any) loaded, or once it exits.
const children = [];
async function gateway(env, args = []) {
  const [PORT, HTTP_PORT] = [await freePort(), await freePort()];
  const child = spawn(process.execPath, [path.join(__dirname, 'gateway.js'), ...args], { env: { ...clean, PORT, HTTP_PORT, RG_DB: ':memory:', ...env } });
  children.push(child);
  let out = '', code = null;
  child.stdout.on('data', d => { out += d; }); child.stderr.on('data', d => { out += d; });
  child.on('exit', c => { code = c; });
  await wait(() => code !== null || (out.includes('browser client on') && (!env.RG_GAME || out.includes('server copy from'))), 20000);
  const get = async url => { const r = await fetch(`http://127.0.0.1:${HTTP_PORT}${url}`); return { status: r.status, body: Buffer.from(await r.arrayBuffer()) }; };
  return { child, get, log: () => out, code: () => code };
}

(async () => {
  try {
    // The server copy alone: bots and the witness run it, but visitors bring their own files.
    let g = await gateway({ RG_GAME: gameDir });
    assert.strictEqual(JSON.parse((await g.get('/status')).body).servesGame, false);
    assert.strictEqual((await g.get('/game/example.pak')).status, 404);
    g.child.kill();

    // RG_SEND_GAME=1 sends it.
    g = await gateway({ RG_GAME: gameDir, RG_SEND_GAME: '1' });
    assert.strictEqual(JSON.parse((await g.get('/status')).body).servesGame, true);
    const sent = await g.get('/game/example.pak');
    assert.strictEqual(sent.status, 200);
    assert.deepStrictEqual(sent.body, PAK);
    g.child.kill();

    // RG_SEND_GAME=1 without a server copy sends nothing, and says so.
    g = await gateway({ RG_SEND_GAME: '1' });
    assert.strictEqual(JSON.parse((await g.get('/status')).body).servesGame, false);
    assert.strictEqual((await g.get('/game/example.pak')).status, 404);
    assert.match(g.log(), /RG_SEND_GAME=1 without RG_GAME/);
    g.child.kill();

    // A public server names its admin, who stores its data, and where to write, for its Terms and Privacy policy, whether or
    // not it sends the game. It doesn't start without all three, and says which are missing.
    g = await gateway({ RG_GAME: gameDir, RG_SEND_GAME: '1', RG_CONTACT: 'https://example.org/contact' }, ['--public']);
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
    console.log('gateway settings ok');
  } finally {
    for (const c of children) c.kill();
    fs.rmSync(gameDir, { recursive: true, force: true });
  }
})().catch(e => { console.error(e); process.exit(1); });
