// The player's account on a server with Discord sign-in (ADR 0011): a guest the server hands out on a first visit, or a member
// who signed in with Discord. The name and token are kept in local storage; the server keeps everything else. The token goes
// to the game in the SNAP login's password slot.

const KEY = 'rg:account';

export class AccountError extends Error {
  // code: 'offline', 'too_many' (this network made too many guests), 'full' (the server holds no more guests),
  // 'invalid', 'reserved', 'taken' (a name problem), 'confirm', 'expired' or 'failed'
  constructor(code) { super(code); this.code = code; }
}

export class Account {
  constructor({ fetch: fetchFn = (...a) => fetch(...a), storage = localStorage } = {}) {
    this.fetch = fetchFn; this.storage = storage;
    this.name = ''; this.token = ''; this.kind = 'guest'; this.fame = 0;
  }

  get member() { return this.kind === 'member'; }

  #read() { try { return JSON.parse(this.storage.getItem(KEY)); } catch { return null; } }
  #write(v) { try { v ? this.storage.setItem(KEY, JSON.stringify(v)) : this.storage.removeItem(KEY); } catch { /* storage blocked: the account lasts until the page closes */ } }

  async #call(method, path, { body, bytes, keepalive, auth = true } = {}) {
    const headers = {};
    if (auth && this.token) headers.Authorization = `Bearer ${this.token}`;
    if (bytes) headers['Content-Type'] = 'application/octet-stream';
    let res;
    try { res = await this.fetch(path, { method, headers, body: bytes ?? (body && JSON.stringify(body)), keepalive }); } catch { throw new AccountError('offline'); }
    const text = await res.text();
    let json = null;
    try { json = text ? JSON.parse(text) : null; } catch { /* not JSON */ }
    return { status: res.status, json };
  }

  #adopt({ name, kind, fame }) { Object.assign(this, { name, kind, fame }); }

  // The account this browser holds: the saved one if the server still knows it, otherwise a new guest.
  async open() {
    const saved = this.#read();
    if (saved?.token) {
      this.token = saved.token;
      const r = await this.#call('GET', '/auth/me');
      if (r.status === 200) { this.#adopt(r.json); return this; }
      if (r.status !== 401) throw new AccountError('failed');
    }
    return this.#newGuest();
  }

  async #newGuest() {
    this.token = '';
    const r = await this.#call('POST', '/auth/guest', { auth: false });
    if (r.status === 429) throw new AccountError('too_many');
    if (r.status === 503) throw new AccountError('full');
    if (r.status !== 200) throw new AccountError('failed');
    this.token = r.json.token;
    this.#write({ name: r.json.name, token: r.json.token });
    this.#adopt({ name: r.json.name, kind: 'guest', fame: 0 });
    return this;
  }

  // Reads fame again, e.g. after a match. False if the server no longer knows the account.
  async refresh() {
    const r = await this.#call('GET', '/auth/me');
    if (r.status !== 200) return false;
    this.#adopt(r.json);
    return true;
  }

  // The Discord page to send the browser to. The account's guest, if it has one, comes back signed in.
  async discordUrl() {
    const r = await this.#call('POST', '/auth/discord/start');
    if (r.status !== 200) throw new AccountError('failed');
    return r.json.url;
  }

  // What a sign-in code from Discord needs next: { status: 'name', suggested }, { status: 'confirm', name, guestFame } or
  // { status: 'done' }, which has already signed the account in.
  async exchange(code) {
    const r = await this.#call('POST', '/auth/exchange', { body: { code }, auth: false });
    if (r.status === 404) throw new AccountError('expired');
    if (r.status !== 200) throw new AccountError('failed');
    if (r.json.status === 'done') this.#signedIn(r.json);
    return r.json;
  }

  // Ends a sign-in with the member's name (new member) or `confirm` (the guest's progress is dropped).
  async finish(code, { name, confirm } = {}) {
    const r = await this.#call('POST', '/auth/finish', { body: { code, name, confirm }, auth: false });
    if (r.status === 404) throw new AccountError('expired');
    if (r.status === 409 || r.status === 422) throw new AccountError(r.json.error);
    if (r.status !== 200) throw new AccountError('failed');
    this.#signedIn(r.json);
  }

  #signedIn({ name, token }) { this.token = token; this.#write({ name, token }); }

  // A member's saved game (ADR 0014), kept on the server: { file name: base64 }. Guests have none.
  async saves() {
    const r = await this.#call('GET', '/auth/saves');
    if (r.status !== 200) throw new AccountError('failed');
    return r.json.files;
  }

  // Stores one file of the saved game, or removes it. 'too_large' if the server's limits refuse it.
  async putSave(name, bytes, keepalive = false) {
    const r = await this.#call('PUT', `/auth/saves/${name}`, { bytes, keepalive });
    if (r.status === 413) throw new AccountError('too_large');
    if (r.status !== 204) throw new AccountError('failed');
  }
  async dropSave(name, keepalive = false) {
    const r = await this.#call('DELETE', `/auth/saves/${name}`, { keepalive });
    if (r.status !== 204) throw new AccountError('failed');
  }

  // Back to a new guest. The server forgets this browser's token.
  async signOut() {
    await this.#call('POST', '/auth/signout').catch(() => {});
    this.#write(null);
    return this.#newGuest();
  }

  async remove() {
    const r = await this.#call('POST', '/auth/delete');
    if (r.status !== 204 && r.status !== 401) throw new AccountError('failed');
    this.#write(null);
    return this.#newGuest();
  }
}
