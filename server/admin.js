// The admin's way to delete an account (ADR 0016), used by `npm run delete-user`. It works on every server, Discord or name-only,
// and it is off unless RG_ADMIN_TOKEN is set: then every /admin/ path answers 404 as if it did not exist.
const crypto = require('crypto');

const digest = s => crypto.createHash('sha256').update(String(s)).digest();

// opts: store, token (RG_ADMIN_TOKEN, or empty to switch the endpoint off), discord (whether accounts have Discord IDs),
// busy(id) -> whether that account has a live session, remove(acc) to end its sessions, log.
function createAdmin({ store, token, discord, busy, remove, log = () => {} }) {
  const json = (res, code, body) => {
    res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(body));
  };
  // Constant time: both sides are hashed first so the comparison never sees two lengths.
  const allowed = req => {
    const given = /^Bearer (\S+)$/.exec(req.headers.authorization || '')?.[1];
    return Boolean(given) && crypto.timingSafeEqual(digest(given), digest(token));
  };

  // The account a request names: by `name`, or by `discord` on a server that has Discord IDs. Answers the request itself and
  // returns null when it can't name exactly one.
  const accountOf = (url, res) => {
    const name = url.searchParams.get('name'), id = url.searchParams.get('discord');
    if ((name === null) === (id === null)) return json(res, 400, { error: 'name_or_discord' }), null;
    if (id !== null && !discord) return json(res, 422, { error: 'no_discord' }), null;
    const acc = name !== null ? store.byName(name) : store.byDiscord(id);
    if (!acc) return json(res, 404, { error: 'no_account' }), null;
    return acc;
  };

  const routes = {
    // What a delete would take away, for the admin to check before confirming.
    'GET /admin/account': (req, res, url) => {
      const acc = accountOf(url, res);
      if (!acc) return;
      json(res, 200, {
        name: acc.name, kind: acc.kind, fame: acc.stats.fame, matches: acc.stats.matches,
        friends: store.friends(acc).length, files: store.saveUsage(acc, '').files, online: busy(acc.id),
      });
    },
    // The same path as a player deleting their own account (POST /auth/delete): sessions end, then the row and what hangs off it.
    'DELETE /admin/account': (req, res, url) => {
      const acc = accountOf(url, res);
      if (!acc) return;
      remove(acc); store.remove(acc);
      log(`admin deleted ${acc.name}`);
      res.writeHead(204); res.end();
    },
  };

  return {
    // Handles /admin/*. Returns false for any other request.
    http(req, res, url) {
      if (!url.pathname.startsWith('/admin/')) return false;
      if (!token) { res.writeHead(404); res.end('not found'); return true; }
      if (!allowed(req)) { json(res, 401, { error: 'unauthorized' }); return true; }
      const route = routes[`${req.method} ${url.pathname}`];
      if (!route) { res.writeHead(404); res.end('not found'); return true; }
      try { route(req, res, url); } catch (e) { log(`${url.pathname}: ${e.message}`); if (!res.headersSent) json(res, 400, { error: 'bad_request' }); }
      return true;
    },
  };
}

module.exports = { createAdmin };
