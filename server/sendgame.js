// Sending the server copy to visitors (docs/adr/0031), as one compressed game bundle (web/bundle.js).
// A server that isn't public sends it to every visitor: GET /game/bundle. A public server sends it only for its download code
// (CONTEXT.md), POST /game/bundle with the code as the body, within its limits, and answers everything else, a wrong code, an ended
// one, a server with no code or over its limits, with the same bare 404, so nothing tells a visitor that it ever sends the game.
// The code is kept in `file` (download-code.json); the counts per network and per day stay in memory, and no address is logged.
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

// Six characters from 31: digits and capitals without the look-alikes 0, O, 1, I and L.
const ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const CODE_LENGTH = 6;
const HOUR = 3600e3, DAY = 24 * HOUR;
// A code ends after `days` (unless the admin sets another lifetime) or `downloads`. One network gets `perNetworkDay` downloads a
// day. After `wrongPerNetworkHour` wrong codes from one network, or `wrongPerHour` from all of them, in the last hour, every code is
// refused, the right one too, until the oldest of them is an hour old.
const LIMITS = { days: 30, downloads: 20, perNetworkDay: 2, wrongPerNetworkHour: 10, wrongPerHour: 100 };
const BUNDLE_FORMAT = 1; // part of the cache's name: a change to web/bundle.js's layout starts the cache over

const gzip = promisify(zlib.gzip), brotli = promisify(zlib.brotliCompress);
const digest = data => crypto.createHash('sha256').update(data).digest();
const makeCode = () => Array.from({ length: CODE_LENGTH }, () => ALPHABET[crypto.randomInt(ALPHABET.length)]).join('');

// opts: public (--public), file (where the code is kept), cacheDir (where a public server keeps its brotli bundle between starts),
// ipOf(req) -> the request's network, budget (bytes a public server sends a day), now, log, limits.
function createSender({ public: pub, file, cacheDir, ipOf, budget, now = Date.now, log = () => {}, limits = LIMITS }) {
  let bundle = null; // { size, gzip, br }: br only on a public server, once it is made
  let code = null;   // { code, made, ends, downloads, ended }
  try { code = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* none yet */ }
  const sent = { day: -1, bytes: 0 };
  const perNetwork = new Map(); // network -> downloads today (sent.day)
  const wrong = new Map();      // network -> times of wrong codes in the last hour
  let wrongAll = [];

  // Forgets wrong codes older than an hour and the counts of an earlier day, so that no address stays in memory longer than that.
  const sweep = (t = now()) => {
    wrongAll = wrongAll.filter(x => x > t - HOUR);
    for (const [ip, times] of wrong) { const recent = times.filter(x => x > t - HOUR); if (recent.length) wrong.set(ip, recent); else wrong.delete(ip); }
    const day = Math.floor(t / DAY);
    if (sent.day !== day) { sent.day = day; sent.bytes = 0; perNetwork.clear(); }
  };

  const save = () => {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(code));
    fs.renameSync(`${file}.tmp`, file);
  };
  const live = t => Boolean(code && !code.ended && t < code.ends && code.downloads < limits.downloads);

  // The brotli bundle from cacheDir, else made and kept there: brotli at its best takes two or three minutes for the whole game. The
  // bundle's own digest names the file, so a changed server copy makes a new one, and the older one is deleted. Only a public server
  // makes it, so test and LAN servers that share data/ never touch it.
  async function brotliOf(raw) {
    const name = `game-bundle-${BUNDLE_FORMAT}-${digest(raw).toString('hex').slice(0, 16)}.br`;
    try { return fs.readFileSync(path.join(cacheDir, name)); } catch { /* not made yet */ }
    const data = await brotli(raw, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 11, [zlib.constants.BROTLI_PARAM_LGWIN]: 24, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: raw.length } });
    fs.mkdirSync(cacheDir, { recursive: true });
    for (const f of fs.readdirSync(cacheDir)) if (/^game-bundle-.*\.br$/.test(f) && f !== name) fs.rmSync(path.join(cacheDir, f));
    fs.writeFileSync(path.join(cacheDir, `${name}.tmp`), data);
    fs.renameSync(path.join(cacheDir, `${name}.tmp`), path.join(cacheDir, name));
    return data;
  }

  // Whether `given` may have `bytes` sent now, counting the download if so. Over either limit on wrong codes, every code is refused.
  function claim(ip, given, bytes) {
    const t = now();
    sweep(t);
    if (wrongAll.length >= limits.wrongPerHour || (wrong.get(ip)?.length ?? 0) >= limits.wrongPerNetworkHour) return false;
    const right = code && crypto.timingSafeEqual(digest(String(given).trim().toUpperCase()), digest(code.code));
    if (!right) { wrongAll.push(t); wrong.set(ip, [...(wrong.get(ip) || []), t]); return false; }
    if (!live(t)) return false;
    const mine = perNetwork.get(ip) ?? 0;
    if (mine >= limits.perNetworkDay || sent.bytes + bytes > budget) return false;
    perNetwork.set(ip, mine + 1);
    sent.bytes += bytes;
    code.downloads++;
    save();
    log(`sent the game for the download code: download ${code.downloads} of ${limits.downloads}${code.downloads >= limits.downloads ? ', so the code has ended' : ''}`);
    return true;
  }

  // brotli where the browser takes it and it is made, else gzip, which every browser takes.
  const pick = req => (bundle.br && /\bbr\b/.test(String(req.headers['accept-encoding'] || '')) ? ['br', bundle.br] : ['gzip', bundle.gzip]);
  const send = (res, [encoding, data]) => {
    // X-Game-Size is the bundle's own size, which the page counts its download against: Content-Length counts the compressed bytes.
    res.writeHead(200, { 'Content-Type': 'application/octet-stream', 'Content-Encoding': encoding, 'Content-Length': data.length, 'X-Game-Size': bundle.size, 'Cache-Control': 'no-store', Vary: 'Accept-Encoding' });
    res.end(data);
  };
  const notFound = res => { res.writeHead(404, { 'Content-Type': 'text/plain', 'Cache-Control': 'no-store' }); res.end('not found'); };

  return {
    // Makes the bundle from the server copy's files. A server that isn't public sends it as soon as its gzip is made, in seconds; a
    // public one also makes brotli, which takes two or three minutes the first time and is then kept in cacheDir.
    async setGame(files) {
      const { packBundle } = await import('../web/bundle.js');
      const raw = await packBundle(files);
      bundle = { size: raw.length, gzip: await gzip(raw, { level: 9 }), br: null };
      log(`game bundle ready: ${(raw.length / 2 ** 20).toFixed(1)} MiB, ${(bundle.gzip.length / 2 ** 20).toFixed(1)} MiB with gzip`);
      if (!pub) return;
      bundle.br = await brotliOf(raw);
      log(`game bundle: ${(bundle.br.length / 2 ** 20).toFixed(1)} MiB with brotli`);
    },
    // Whether every visitor gets the game, which /status says: only a server that isn't public, once its bundle is made.
    servesAll: () => !pub && bundle !== null,

    // Handles /game/*. Returns false for any other request.
    http(req, res, url) {
      if (!url.pathname.startsWith('/game/')) return false;
      if (url.pathname !== '/game/bundle' || !bundle) { notFound(res); return true; }
      if (req.method === 'GET' && !pub) { send(res, pick(req)); return true; }
      if (req.method !== 'POST' || !pub) { notFound(res); return true; }
      let body = '';
      req.setEncoding('utf8');
      req.on('data', chunk => { body += chunk; if (body.length > 64) req.destroy(); });
      req.on('end', () => {
        const chosen = pick(req);
        if (claim(ipOf(req), body, chosen[1].length)) send(res, chosen); else notFound(res);
      });
      return true;
    },

    // Call every hour: see sweep.
    sweep: () => sweep(),

    // For the admin (server/admin.js): the code and its counts, a new code, or the code ended.
    status() {
      const t = now();
      sweep(t);
      return { public: pub, ready: bundle !== null, code: code?.code ?? null, live: live(t), ends: code?.ends ?? null, ended: code?.ended ?? null,
        downloads: code?.downloads ?? 0, maxDownloads: limits.downloads, sentToday: sent.bytes, budget };
    },
    make(days = limits.days) {
      const t = now();
      code = { code: makeCode(), made: t, ends: t + days * DAY, downloads: 0, ended: null };
      save();
      log(`made a download code, ending in ${days} days`);
      return this.status();
    },
    end() {
      if (code && !code.ended) { code.ended = now(); save(); log('ended the download code'); }
      return this.status();
    },
  };
}

module.exports = { createSender, ALPHABET, CODE_LENGTH, LIMITS };
