// The browser's SNAP Mobile client, as this server speaks the protocol (docs/protocol.md): every request is one HTTP POST, and
// events arrive through the long-poll command. It implements the functions the engine's networking interface calls and runs the
// engine's event callbacks between ticks.

const KEYS = ['318838622AB4EAF53C47A99A7E1D6D6F992212B1F0D55E11C9D1E23865586B78',
  'E39022408F7555A6D72E1FA3919543A0A5F372D252DDA646EAEB7826A3A4851F',
  '31EC97F2DD25C3AE7DC2DF3A4BC21431D32DB86F300B4B6BC96480293CF117E4',
  'B7F786FBC218C0DC92FD7E0733FB6F41E332A5ABFF7605666F5A1D1BD2A9A10D'].map(h => Uint8Array.from(h.match(/../g), x => parseInt(x, 16)));
const b64 = bytes => btoa(String.fromCharCode(...bytes));
const unb64 = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
const utf8 = s => new TextEncoder().encode(s);
const rotr = (b, n) => ((b >> n) | (b << (8 - n))) & 0xff;
// Password scrambling: rotr(b, k & 7) ^ k with a key chosen by K (server/snap.js).
const scramble = (bytes, k) => bytes.map((b, i) => { const key = KEYS[k][i % 32]; return rotr(b, key & 7) ^ key; });
const VALID_NAME = /^[A-Za-z0-9_]{1,15}$/;
const STATE = { NONE: 0, UNCONFIRMED: 1, REQUESTED: 2, ONLINE: 3, AWAY: 4, OFFLINE: 5 };
const FILL_BOTS = 900; // not a SNAP Mobile command: this server's own, P1 1 or 0 (server/gateway.js)

export class SnapClient {
  // ui: { startLogin(onReady, onCancel), stopLogin(), attempting(), rejected(badLogin), accepted() (optional), credentials() -> {username, password} }
  constructor({ url = 'snap', ui, log = () => {} }) {
    this.url = url; this.ui = ui; this.log = log;
    this.rid = 1000 + Math.floor(Math.random() * 1e6); // request ids must not collide with other clients
    this.key = Math.floor(Math.random() * 4);
    this.session = null; this.loggedIn = false; this.lobbyID = null;
    this.loginErrorState = 0; this.credentialsOK = false; this.returnedFromLoginInternal = true;
    this.loginCancelled = false; this.logoutQueued = false; this.loggingIn = false;
    this.gameRoomName = ''; this.isInGameRoom = false; this.numJoinRetries = 0;
    this.friends = new Map(); // name -> { presence, state }
    this.events = [];   // native callbacks to run between ticks
    this.actions = []; this.busy = false;
    this.polling = false;
    this.fillBots = false; // fill empty seats with bots in the friendly matches this player starts
  }
  attach(host) { this.host = host; }
  setFillBots(on) {
    this.fillBots = on;
    this.addAction(() => this.request(FILL_BOTS, { 1: on ? 1 : 0 }), false);
  }

  // ---- transport ----
  async request(cmd, params = {}, { sessionless = false } = {}) {
    let body = `R=${this.rid++}&V=1.4.4`;
    if (this.session && !sessionless) body += `&S=${this.session}`;
    if (cmd === 1) body += `&K=${this.key}`;
    body += `&C=${cmd}`;
    for (const i of Object.keys(params).map(Number).sort((a, b) => a - b)) {
      const v = params[i];
      if (v === null || v === undefined) continue;
      body += `&P${i}=${v}`;
    }
    let text;
    try {
      const res = await fetch(this.url, { method: 'POST', body });
      text = await res.text();
    } catch (e) {
      return { code: 998, message: `NetworkInterruptedError: ${e.message}`, lines: [] };
    }
    const lines = text.split('\n');
    const head = lines.shift(), sp = head.indexOf(' ');
    return { code: +head.slice(0, sp < 0 ? head.length : sp), message: sp < 0 ? '' : head.slice(sp + 1), lines: lines.filter(l => l.length) };
  }
  // What a failed reply means for the session.
  serverError(code, msg) {
    if (code === 200) return false;
    if (code === 914) this.events.push(() => this.native('onError@16', 1, this.str(msg)));
    if (code === 914 || code === 989) return true;
    if (code === 965 || code === 966) { this.loginErrorState = 1; return true; }
    if (this.loggedIn && !this.logoutQueued) this.handleError(code);
    this.loginErrorState = 2;
    return true;
  }
  handleError(code) {
    this.actions.length = 0;
    this.events.push(() => this.native('onDisconnectedFromNAF@12', code));
    this.addAction(() => this.logoutInternal(false), false);
  }

  // ---- action queue ----
  addAction(fn, allowNotLoggedIn) {
    if (!allowNotLoggedIn && (this.logoutQueued || !this.loggedIn)) return;
    this.actions.push(fn);
    if (!this.busy) this.drain();
  }
  async drain() {
    this.busy = true;
    while (this.actions.length) {
      const fn = this.actions.shift();
      try { await fn(); } catch (e) { this.log(`snap action failed: ${e.message}`); this.events.push(() => this.native('onArenaLoginCancelled@8')); }
    }
    this.busy = false;
  }

  async loginInternal() {
    this.returnedFromLoginInternal = false;
    this.gameRoomName = ''; this.isInGameRoom = false;
    try {
      await this.request(0, {}, { sessionless: true });
      const { username, password } = this.ui.credentials();
      if (!VALID_NAME.test(username)) { this.loginErrorState = 1; return; }
      this.ui.attempting();
      const presence = b64(utf8('SM2.0.1,'));
      const r = await this.request(1, { 1: username, 2: b64(scramble(utf8(password), this.key)), 5: 42713, 9: 1, 10: presence, 11: 0, 13: 'en_US' }, { sessionless: true });
      if (this.loginCancelled || this.logoutQueued) return;
      if (this.serverError(r.code, r.message)) { this.ui.rejected(this.loginErrorState === 1); this.events.push(() => this.native('onArenaLoginCancelled@8')); return; }
      const [sid, , , uid] = r.lines[0].split('|');
      this.session = sid; this.userId = uid; this.username = username;
      this.ui.accepted?.();
      const lobbies = await this.request(126);
      const lobby = lobbies.lines.map(l => l.split('|')).find(f => f[1].toLowerCase() === 'resgen');
      if (!lobby) return;
      this.lobbyID = lobby[0];
      await this.request(109, { 1: this.lobbyID });
      if (this.fillBots) await this.request(FILL_BOTS, { 1: 1 });
      this.credentialsOK = true;
      this.loggedIn = true;
      this.ui.stopLogin();
      this.loggingIn = false;
      this.events.push(() => this.native('onArenaLoginCompleted@8'));
      this.poll();
    } finally {
      this.returnedFromLoginInternal = true;
    }
  }
  async logoutInternal(setCancelled) {
    this.loginCancelled = setCancelled;
    if (this.loggedIn) await this.request(2);
    this.session = null; this.loggedIn = false;
    this.events.push(() => this.native('onArenaLoginCancelled@8'));
    this.logoutQueued = false;
  }
  // The event long-poll, repeated while the session lasts.
  async poll() {
    if (this.polling) return;
    this.polling = true;
    while (this.loggedIn) {
      const r = await this.request(3, { 1: 1 });
      if (!this.loggedIn) break;
      if (r.code !== 200) { if (r.code === 998) await new Promise(res => setTimeout(res, 1000)); this.serverError(r.code, r.message); continue; }
      for (const line of r.lines) this.onServerEvent(line.split('|'));
    }
    this.polling = false;
  }
  onServerEvent(f) {
    const id = +f[0];
    const text = s => (s ? new TextDecoder().decode(unb64(s)).trim() : '');
    switch (id) {
      case 117: {
        if (!this.isInGameRoom) return;
        const data = unb64(f[2] || ''), room = this.gameRoomName;
        this.events.push(() => { this.host.writeNet(data); this.native('onDataReceived@16', data.length, this.str(room)); });
        return;
      }
      case 307: { // presence: fromID|fromName|availability|...|#presence
        const name = f[2], avail = f[3], presence = text(f[12]);
        const state = avail === 'available' ? STATE.ONLINE : avail === 'unavailable' ? STATE.OFFLINE : avail === 'away' ? STATE.AWAY : STATE.NONE;
        this.events.push(() => {
          const fr = this.friends.get(name) || { presence, state };
          fr.presence = presence; fr.state = state; this.friends.set(name, fr);
          this.native('onPresence@20', this.str(name), state, this.str(presence));
        });
        return;
      }
      case 308: { const name = f[2], msg = text(f[3]); this.events.push(() => { if (!this.friends.has(name)) this.friends.set(name, { presence: '', state: STATE.UNCONFIRMED }); this.native('onFriendRequestReceived@16', this.str(name), this.str(msg)); }); return; }
      case 309: { const name = f[2], ok = f[3] === '1', msg = text(f[4]); this.events.push(() => this.native(ok ? 'onFriendRequestAccepted@16' : 'onFriendRequestRejected@16', this.str(name), this.str(msg))); return; }
      case 310: case 311: { const name = f[2]; this.events.push(() => { this.native('onFriendRemoved@12', this.str(name)); this.friends.delete(name); }); return; }
    }
  }

  // ---- rooms ----
  async gameRoomId(name) {
    const r = await this.request(125, { 1: this.lobbyID });
    const room = r.lines.map(l => l.split('|')).find(f => (f[1] || '').toLowerCase() === name.toLowerCase());
    return room ? room[0] : null;
  }
  async leaveRoomInternal(room) {
    if (room.toLowerCase() === this.gameRoomName.toLowerCase()) { await this.request(118); this.isInGameRoom = false; this.gameRoomName = ''; }
    this.events.push(() => this.native('onDisconnectedFromGameRoom@12', this.str(room)));
  }
  async joinRoomInternal(name) {
    if (this.isInGameRoom) await this.leaveRoomInternal(this.gameRoomName);
    const id = await this.gameRoomId(name);
    let ok = false;
    if (id) { const r = await this.request(117, { 1: id }); ok = r.code === 200 || r.code === 708; }
    if (ok) { this.gameRoomName = name; this.isInGameRoom = true; this.events.push(() => this.native('onConnected@8')); }
    return ok;
  }
  async createRoomInternal(name) {
    if (this.isInGameRoom) await this.leaveRoomInternal(this.gameRoomName);
    const r = await this.request(116, { 1: name, 3: 4, 4: 1 });
    if (r.code === 200 && r.lines[0]) { this.isInGameRoom = true; this.gameRoomName = name; this.events.push(() => this.native('onConnected@8')); }
    else { this.isInGameRoom = false; this.gameRoomName = ''; }
  }
  async joinWithRetry(name) {
    if (await this.joinRoomInternal(name)) return;
    if (this.numJoinRetries < 4) {
      await new Promise(r => setTimeout(r, 3000));
      this.numJoinRetries++;
      this.addAction(() => this.joinWithRetry(name), false);
    } else {
      this.loginErrorState = 3;
      if (this.loggedIn && !this.logoutQueued) this.handleError(2);
    }
  }

  // ---- friends ----
  async cacheBuddyList() {
    this.friends.clear();
    const r = await this.request(302);
    for (const l of r.lines) {
      const [, name, status] = l.split('|');
      this.friends.set(name, { presence: '', state: status === 'to' ? STATE.REQUESTED : status === 'from' ? STATE.UNCONFIRMED : STATE.OFFLINE });
    }
    const names = [...this.friends.keys()], list = names.map(n => this.friends.get(n));
    this.events.push(() => this.native('onFriendList@20', this.host.jni.ref(this.host.javaArray(names)),
      this.host.jni.ref(this.host.javaArray(list.map(f => f.presence))), this.host.jni.ref(this.host.javaIntArray(list.map(f => f.state)))));
  }

  // ---- NativeSNAPMobileInterface, called by the engine ----
  methods() {
    const v = o => (o && o.value !== undefined ? o.value : o); // Java String -> JS string
    return {
      init: () => true,
      login: () => { this.returnedFromLoginInternal = false; this.addAction(() => this.loginInternal(), true); return true; },
      moveToRoom: jname => { const name = v(jname); this.addAction(async () => {
        if (this.isInGameRoom) await this.leaveRoomInternal(this.gameRoomName);
        if (await this.gameRoomId(name)) await this.joinRoomInternal(name); else await this.createRoomInternal(name);
      }, false); },
      createRoom: name => { this.addAction(() => this.createRoomInternal(v(name)), false); return v(name); },
      leaveRoom: name => this.addAction(() => this.leaveRoomInternal(v(name)), false),
      joinRoom: name => { this.numJoinRetries = 0; this.addAction(() => this.joinWithRetry(v(name)), false); },
      logout: () => { this.logoutQueued = this.loggedIn; this.addAction(() => this.logoutInternal(true), true); this.loginCancelled = true; this.ui.stopLogin(); this.loggingIn = false; },
      send: len => {
        const data = this.host.readNet(len);
        this.addAction(async () => {
          const r = await this.request(133, { 1: b64(data) });
          if (r.code !== 200 && this.loggedIn && !this.logoutQueued) this.handleError(0);
        }, false);
        return len;
      },
      startLoginScreen: () => {
        this.loginErrorState = 0; this.credentialsOK = false; this.loginCancelled = false; this.loggingIn = false;
        // Submitting only hides the dialog; the engine then sees status 3
        // ("logging in", dialog hidden) and calls login() itself.
        this.ui.startLogin(
          () => { this.loginCancelled = false; },
          () => { this.loginCancelled = true; this.events.push(() => this.native('onArenaLoginCancelled@8')); });
      },
      stopLoginScreen: () => { this.ui.stopLogin(); this.loggingIn = false; },
      getLoginScreenStatus: () => {
        if (this.loginErrorState === 3) return 7;
        if (this.loginErrorState === 1) return 6;
        if (this.loginErrorState === 2) return 5;
        if (this.loginCancelled && !this.returnedFromLoginInternal) return 1;
        if (this.loginCancelled) return 2;
        if (this.credentialsOK) return 4;
        if (!this.ui.visible()) return 3; // the dialog is hidden: the engine is logging in
        return 0;
      },
      loginWasCancelled: () => this.loginCancelled,
      isLoggedIn: () => this.loggedIn,
      getFriendList: () => this.addAction(() => this.cacheBuddyList(), false),
      setPresence: (avail, presence) => this.addAction(() => this.request(305, { 1: avail, 2: b64(utf8(`SM2.0.1,${v(presence) || ''}`)) }), false),
      sendFriendRequest: name => {
        const n = v(name) || '';
        if (VALID_NAME.test(n)) this.addAction(() => this.request(306, { 1: n, 2: b64(utf8(' ')) }), false);
        else this.events.push(() => this.native('onError@16', 1, this.str('')));
      },
      removeFriend: name => this.addAction(async () => { await this.request(309, { 1: v(name) }); this.friends.delete(v(name)); }, false),
      acceptFriendRequest: name => this.addAction(() => this.request(307, { 1: v(name) }), false),
      declineFriendRequest: name => this.addAction(() => this.request(308, { 1: v(name) }), false),
    };
  }

  str(s) { return this.host.jni.str(s); }
  native(name, ...args) { this.host.snapEvent(name, ...args); }
  // Runs queued engine callbacks; call after each tick.
  pump() { while (this.events.length) this.events.shift()(); }
}
