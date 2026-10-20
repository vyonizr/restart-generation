// Guests and members (ADR 0011). Enabled only when the operator configures a Discord application;
// otherwise the server keeps the name-only login of ADR 0009 and none of this runs.
const crypto = require('crypto');

const HOUR = 3600e3;
const DAY = 24 * HOUR;
const GUEST_IDLE_MS = DAY;          // a guest is wiped this long after its last activity
const MEMBER_TOKEN_MS = 90 * DAY;   // a member stays signed in this long, renewed on each visit
const PENDING_MS = 10 * 60e3;       // how long a Discord round trip may take
const NAME = /^[A-Za-z0-9_]{1,15}$/;
const RESERVED = /^(guest\d+|cpu_\d+)$/i;
const DISCORD_INVITE = /^https:\/\/(discord\.gg|discord\.com\/invite)\/[\w-]+$/;

// Settings from the environment. `enabled` needs all three Discord values: the redirect address can't be derived behind a proxy.
// `invite` is the operator's own community link, which the page shows if it is set.
function configFrom(env) {
  const config = {
    clientId: env.RG_DISCORD_CLIENT_ID || '',
    clientSecret: env.RG_DISCORD_CLIENT_SECRET || '',
    publicUrl: (env.RG_PUBLIC_URL || '').replace(/\/+$/, ''),
    invite: DISCORD_INVITE.test(env.RG_DISCORD_INVITE || '') ? env.RG_DISCORD_INVITE : '',
    trustProxy: env.RG_TRUST_PROXY === '1',
    guestsPerIpHour: Number(env.RG_GUESTS_PER_IP_HOUR || 10),
    guestCap: Number(env.RG_GUEST_CAP || 5000),
  };
  config.enabled = Boolean(config.clientId && config.clientSecret && config.publicUrl);
  return config;
}

// Discord's side of the sign-in: the authorization address and the code exchange, asking for `identify` only.
function discordClient({ clientId, clientSecret, publicUrl }) {
  const redirect = `${publicUrl}/auth/discord/callback`;
  const form = body => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  return {
    authorizeUrl: state => 'https://discord.com/oauth2/authorize?' + new URLSearchParams({
      response_type: 'code', client_id: clientId, scope: 'identify', state, redirect_uri: redirect,
    }),
    // -> { id, username } of the Discord user who approved, or throws.
    async identify(code) {
      const t = await fetch('https://discord.com/api/v10/oauth2/token', form({
        grant_type: 'authorization_code', code, redirect_uri: redirect, client_id: clientId, client_secret: clientSecret,
      }));
      if (!t.ok) throw new Error(`Discord token exchange: ${t.status}`);
      const { access_token: token } = await t.json();
      try {
        const u = await fetch('https://discord.com/api/v10/users/@me', { headers: { Authorization: `Bearer ${token}` } });
        if (!u.ok) throw new Error(`Discord user: ${u.status}`);
        const { id, username } = await u.json();
        return { id: String(id), username: String(username) };
      } finally { // nothing more is needed from Discord, so the grant is revoked
        fetch('https://discord.com/api/v10/oauth2/token/revoke', form({ token, token_type_hint: 'access_token', client_id: clientId, client_secret: clientSecret })).catch(() => {});
      }
    },
  };
}

// opts: store, config, fameLevel(acc), busy(id) -> whether that account has a live session, remove(acc) to end its sessions,
// discord (default: the real one), now (default: Date.now), log.
function createAuth({ store, config, fameLevel, busy, remove, discord = config.enabled ? discordClient(config) : null, now = Date.now, log = () => {} }) {
  const states = new Map();   // state -> { guest: account id or null, expires }
  const pending = new Map();  // sign-in code -> { discordId, username, guest, member, expires }
  const created = new Map();  // ip -> [times of new guests in the last hour]

  const prune = map => { for (const [k, v] of map) if (v.expires < now()) map.delete(k); };
  const rand = () => crypto.randomBytes(24).toString('base64url');
  const view = acc => ({ name: acc.name, kind: acc.kind, fame: acc.stats.fame, level: fameLevel(acc) });
  const progress = guest => guest.stats.matches > 0;

  // A member's name, free of every case clash and reserved pattern.
  const nameProblem = name => {
    if (!NAME.test(name)) return 'invalid';
    if (RESERVED.test(name)) return 'reserved';
    if (store.byName(name)) return 'taken';
    return null;
  };
  const suggest = username => {
    const base = username.replace(/[^A-Za-z0-9_]/g, '').slice(0, 15);
    if (base && !nameProblem(base)) return base;
    for (let i = 0; i < 20; i++) {
      const n = `${(base || 'Player').slice(0, 11)}${Math.floor(Math.random() * 1000)}`;
      if (!nameProblem(n)) return n;
    }
    return '';
  };

  // The client address, for the guest limit. Behind a proxy the operator turns trustProxy on, and the address the proxy
  // appended (the last one) is used: earlier ones are written by the client.
  const ipOf = req => {
    if (config.trustProxy) {
      const last = String(req.headers['x-forwarded-for'] || '').split(',').pop().trim();
      if (last) return last;
    }
    return req.socket.remoteAddress || '';
  };
  const guestAllowed = ip => {
    const t = now(), recent = (created.get(ip) || []).filter(x => x > t - HOUR);
    if (recent.length >= config.guestsPerIpHour) { created.set(ip, recent); return false; }
    recent.push(t); created.set(ip, recent);
    return true;
  };

  const bearer = req => /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1] || null;
  const accountOfRequest = req => {
    const token = bearer(req);
    return token ? store.byToken(token, now(), now() + MEMBER_TOKEN_MS) : null;
  };

  function createGuest() {
    for (let i = 0; i < 20; i++) {
      const name = `Guest${String(Math.floor(Math.random() * 1e6)).padStart(6, '0')}`;
      if (store.byName(name)) continue;
      const acc = store.create(name, 'guest', now());
      return { acc, token: store.issueToken(acc) };
    }
    throw new Error('no free guest name');
  }

  // Ends a sign-in whose Discord user is known: the member's token, and the guest's account folded in or dropped.
  function complete(p, name) {
    const guest = p.guest && store.byId(p.guest);
    const live = guest && guest.kind === 'guest' ? guest : null;
    let acc;
    if (p.member) {
      acc = store.byId(p.member);
      if (live) { remove(live); store.remove(live); }
    } else if (live) {
      store.promote(live, name, p.discordId);
      store.revokeTokens(live);
      acc = live;
    } else {
      acc = store.create(name, 'member', now(), p.discordId);
    }
    log(`signed in ${acc.name} (${p.member ? 'existing member' : 'new member'})`);
    return { name: acc.name, token: store.issueToken(acc, now() + MEMBER_TOKEN_MS) };
  }

  const json = (res, code, body) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
  const readJson = req => new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', c => { size += c.length; if (size > 4096) { reject(new Error('too large')); req.destroy(); } else chunks.push(c); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}')); } catch (e) { reject(e); } });
    req.on('error', reject);
  });

  const routes = {
    'POST /auth/guest': (req, res) => {
      if (store.guestCount() >= config.guestCap) return json(res, 503, { error: 'full' });
      if (!guestAllowed(ipOf(req))) return json(res, 429, { error: 'too_many' });
      const { acc, token } = createGuest();
      log(`guest ${acc.name}`);
      json(res, 200, { name: acc.name, token });
    },
    'GET /auth/me': (req, res) => {
      const acc = accountOfRequest(req);
      if (!acc) return json(res, 401, { error: 'unknown' });
      store.touch(acc, now());
      json(res, 200, view(acc));
    },
    'POST /auth/discord/start': (req, res) => {
      const acc = accountOfRequest(req);
      prune(states);
      const state = rand();
      states.set(state, { guest: acc?.kind === 'guest' ? acc.id : null, expires: now() + PENDING_MS });
      json(res, 200, { url: discord.authorizeUrl(state) });
    },
    'POST /auth/exchange': async (req, res) => {
      const { code } = await readJson(req);
      const p = pending.get(code);
      if (!p || p.expires < now()) return json(res, 404, { error: 'expired' });
      if (!p.member) return json(res, 200, { status: 'name', suggested: suggest(p.username) });
      const guest = p.guest && store.byId(p.guest);
      if (guest && guest.kind === 'guest' && progress(guest)) {
        return json(res, 200, { status: 'confirm', name: store.byId(p.member).name, guestFame: guest.stats.fame });
      }
      pending.delete(code);
      json(res, 200, { status: 'done', ...complete(p) });
    },
    'POST /auth/finish': async (req, res) => {
      const { code, name, confirm } = await readJson(req);
      const p = pending.get(code);
      if (!p || p.expires < now()) return json(res, 404, { error: 'expired' });
      if (p.member) {
        const guest = p.guest && store.byId(p.guest);
        if (guest && guest.kind === 'guest' && progress(guest) && confirm !== true) return json(res, 409, { error: 'confirm' });
        pending.delete(code);
        return json(res, 200, complete(p));
      }
      const problem = nameProblem(String(name ?? ''));
      if (problem) return json(res, 422, { error: problem });
      pending.delete(code);
      json(res, 200, complete(p, name));
    },
    'POST /auth/signout': (req, res) => {
      const token = bearer(req);
      if (token) store.revokeToken(token);
      res.writeHead(204); res.end();
    },
    'POST /auth/delete': (req, res) => {
      const acc = accountOfRequest(req);
      if (!acc) return json(res, 401, { error: 'unknown' });
      remove(acc); store.remove(acc);
      log(`deleted ${acc.name}`);
      res.writeHead(204); res.end();
    },
  };

  // The Discord redirect: turns the approval into a one-time code that the page swaps (/auth/exchange) in a request of its own.
  async function callback(url, res) {
    const back = hash => { res.writeHead(302, { Location: `/#${hash}`, 'Cache-Control': 'no-store' }); res.end(); };
    prune(states);
    const state = states.get(url.searchParams.get('state'));
    states.delete(url.searchParams.get('state'));
    const code = url.searchParams.get('code');
    if (!state || !code) return back('signin-error=cancelled');
    try {
      const who = await discord.identify(code);
      const member = store.byDiscord(who.id);
      const id = rand();
      prune(pending);
      pending.set(id, { discordId: who.id, username: who.username, guest: state.guest, member: member?.id ?? null, expires: now() + PENDING_MS });
      back(`signin=${id}`);
    } catch (e) {
      log(e.message);
      back('signin-error=failed');
    }
  }

  return {
    enabled: config.enabled,
    // The account for a SNAP login: the token in the password slot must belong to the account named in P1.
    login(name, token) {
      const acc = token ? store.byToken(token, now(), now() + MEMBER_TOKEN_MS) : null;
      return acc && acc.name.toLowerCase() === String(name).toLowerCase() ? acc : null;
    },
    // Handles /auth/*. Returns false for any other request.
    async http(req, res, url) {
      if (!url.pathname.startsWith('/auth/')) return false;
      if (!config.enabled) { res.writeHead(404); res.end('not found'); return true; }
      if (req.method === 'GET' && url.pathname === '/auth/discord/callback') { await callback(url, res); return true; }
      const route = routes[`${req.method} ${url.pathname}`];
      if (!route) { res.writeHead(404); res.end('not found'); return true; }
      try { await route(req, res); } catch (e) { log(`${url.pathname}: ${e.message}`); if (!res.headersSent) json(res, 400, { error: 'bad_request' }); }
      return true;
    },
    // Deletes guests idle for a day, except any with a live session.
    sweep() {
      store.dropExpiredTokens(now());
      for (const [ip, times] of created) if (!times.some(t => t > now() - HOUR)) created.delete(ip);
      const n = store.sweepGuests(now() - GUEST_IDLE_MS, busy);
      if (n) log(`wiped ${n} guest${n === 1 ? '' : 's'}`);
      return n;
    },
  };
}

module.exports = { configFrom, createAuth, GUEST_IDLE_MS, MEMBER_TOKEN_MS };
