// The browser's SNAP Mobile client, as this server speaks the protocol (docs/protocol.md): every request is one HTTP POST, and
// events arrive through the long-poll command. It implements the functions the engine's networking interface calls and runs the
// engine's event callbacks between ticks.

import { CMD, EVENT, REPLY, GAME_CLASS, PRESENCE_PREFIX, VALID_NAME, ROOM_MAX_USERS, LOGIN_COULD_NOT_CONNECT } from './snap-ids.js';

const b64 = bytes => btoa(String.fromCharCode(...bytes));
const unb64 = s => Uint8Array.from(atob(s), ch => ch.charCodeAt(0));
const utf8 = s => new TextEncoder().encode(s);
const STATE = { NONE: 0, UNCONFIRMED: 1, REQUESTED: 2, ONLINE: 3, AWAY: 4, OFFLINE: 5 };
// The room id in the engine's FRIENDLY_CASINO_START (one MT frame: 07 00 header, 11 00 1c, u32 id), or null for any other packet.
export const startRoom = d => d.length >= 9 && d[0] === 7 && d[1] === 0 && d[2] === 0x11 && d[3] === 0 && d[4] === 0x1c
  ? (d[5] | d[6] << 8 | d[7] << 16 | d[8] << 24) >>> 0 : null;

export class SnapClient {
  // ui: { startLogin(onReady, onCancel), stopLogin(), attempting(), rejected(), accepted() (optional), credentials() -> {username, password} }
  constructor({ url = 'snap', ui, log = () => {} }) {
    this.url = url; this.ui = ui; this.log = log;
    this.rid = 1000 + Math.floor(Math.random() * 1e6); // request ids must not collide with other clients
    this.session = null; this.loggedIn = false; this.lobby = null;
    this.problem = 0; this.admitted = false; this.loginRunning = false;
    this.cancelled = false; this.leaving = false;
    this.room = ''; this.inRoom = false; this.joinTries = 0;
    this.friends = new Map(); // name -> { presence, state }
    this.events = [];   // native callbacks to run between ticks
    this.actions = []; this.busy = false;
    this.polling = false;
    this.bots = null;   // set if the server can run bots: { ask() -> { answer, close } }, the question for the player
  }
  attach(host) { this.host = host; }

  // A friendly Start waits here while the player decides whether bots fill the empty seats. Resolves with
  // whether to send the Start on: not if another member's Start closed the room meanwhile.
  async askBots(room) {
    const query = async () => (await this.request(CMD.BOT_CHOICE, { 1: room })).lines[0];
    let state = await query();
    // 'ask' offers no bots, CPU or Expert; 'level' (a player alone) offers CPU or Expert. If the room changes while the
    // box is open, the box closes and the new state decides: a new question, or the Start going on or being dropped.
    while (state === 'ask' || state === 'level') {
      const question = this.bots.ask(state === 'level');
      let changed = null;
      const watch = setInterval(async () => { const s = await query(); if (s !== state) { changed = s; question.close(); } }, 2000);
      const answer = await question.answer; // 'none', 'cpu' or 'expert', or null once the room changed
      clearInterval(watch);
      if (answer === null) { state = changed ?? state; continue; }
      if (answer === 'none' && state === 'level') return false; // Back: a player alone can't start without bots
      await this.request(CMD.FILL_BOTS, { 1: { none: 0, cpu: 1, expert: 2 }[answer], 2: room });
      return true;
    }
    return state !== 'gone';
  }

  // ---- transport ----
  async request(cmd, params = {}, { sessionless = false } = {}) {
    let body = `R=${this.rid++}&V=1.4.4`;
    if (this.session && !sessionless) body += `&S=${this.session}`;
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
      return { code: REPLY.NETWORK_INTERRUPTED, message: `NetworkInterruptedError: ${e.message}`, lines: [] };
    }
    const lines = text.split('\n');
    const head = lines.shift(), sp = head.indexOf(' ');
    return { code: +head.slice(0, sp < 0 ? head.length : sp), message: sp < 0 ? '' : head.slice(sp + 1), lines: lines.filter(l => l.length) };
  }
  // What a failed reply means for the session. Returns true if the reply ended the attempt.
  checkReply(code, msg) {
    if (code === REPLY.OK) return false;
    if (code === 914) this.events.push(() => this.native('onError@16', 1, this.str(msg)));
    if (code === 914 || code === 989) return true;
    if (code === REPLY.AUTHENTICATION_FAILED || code === 966) { this.problem = 1; return true; }
    if (this.loggedIn && !this.leaving) this.dropped(code);
    this.problem = 2;
    return true;
  }
  dropped(code) {
    this.actions.length = 0;
    this.events.push(() => this.native('onDisconnectedFromNAF@12', code));
    this.queue(() => this.signOut(false), false);
  }

  // ---- actions: one runs at a time, in the order they were queued ----
  queue(fn, allowNotLoggedIn) {
    if (!allowNotLoggedIn && (this.leaving || !this.loggedIn)) return;
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

  async signIn() {
    this.loginRunning = true;
    this.room = ''; this.inRoom = false;
    try {
      await this.request(CMD.INIT, {}, { sessionless: true });
      const { username, password } = this.ui.credentials();
      if (!VALID_NAME.test(username)) { this.problem = 1; return; }
      this.ui.attempting();
      const presence = b64(utf8(PRESENCE_PREFIX));
      const r = await this.request(CMD.EXTENDED_LOGIN, { 1: username, 2: b64(utf8(password)), 5: GAME_CLASS, 9: 1, 10: presence, 11: 0, 13: 'en_US' }, { sessionless: true });
      if (this.cancelled || this.leaving) return;
      if (this.checkReply(r.code, r.message)) { this.ui.rejected(); this.events.push(() => this.native('onArenaLoginCancelled@8')); return; }
      const [sid, , , uid] = r.lines[0].split('|');
      this.session = sid; this.userId = uid; this.username = username;
      this.ui.accepted?.();
      const lobbies = await this.request(CMD.GET_LOBBIES);
      const found = lobbies.lines.map(l => l.split('|')).find(f => f[1].toLowerCase() === 'resgen');
      if (!found) return;
      this.lobby = found[0];
      await this.request(CMD.JOIN_LOBBY, { 1: this.lobby });
      this.admitted = true;
      this.loggedIn = true;
      this.ui.stopLogin();
      this.events.push(() => this.native('onArenaLoginCompleted@8'));
      this.poll();
    } finally {
      this.loginRunning = false;
    }
  }
  async signOut(setCancelled) {
    this.cancelled = setCancelled;
    if (this.loggedIn) await this.request(CMD.UNIFIED_LOGOUT);
    this.session = null; this.loggedIn = false;
    this.events.push(() => this.native('onArenaLoginCancelled@8'));
    this.leaving = false;
  }
  // The event long-poll, repeated for as long as the session lasts.
  async poll() {
    if (this.polling) return;
    this.polling = true;
    while (this.loggedIn) {
      const r = await this.request(CMD.RETRIEVE_ALL_EVENTS, { 1: 1 });
      if (!this.loggedIn) break;
      if (r.code !== REPLY.OK) { if (r.code === REPLY.NETWORK_INTERRUPTED) await new Promise(res => setTimeout(res, 1000)); this.checkReply(r.code, r.message); continue; }
      for (const line of r.lines) this.onServerEvent(line.split('|'));
    }
    this.polling = false;
  }
  onServerEvent(f) {
    const id = +f[0];
    const text = s => (s ? new TextDecoder().decode(unb64(s)).trim() : '');
    switch (id) {
      case EVENT.GAME_PACKET_TARGET: {
        if (!this.inRoom) return;
        const data = unb64(f[2] || ''), room = this.room;
        this.events.push(() => { this.host.writeNet(data); this.native('onDataReceived@16', data.length, this.str(room)); });
        return;
      }
      case EVENT.FRIEND_PRESENCE: { // fromID|fromName|availability|...|#presence
        const name = f[2], avail = f[3], presence = text(f[12]);
        const state = avail === 'available' ? STATE.ONLINE : avail === 'unavailable' ? STATE.OFFLINE : avail === 'away' ? STATE.AWAY : STATE.NONE;
        this.events.push(() => {
          const fr = this.friends.get(name) || { presence, state };
          fr.presence = presence; fr.state = state; this.friends.set(name, fr);
          this.native('onPresence@20', this.str(name), state, this.str(presence));
        });
        return;
      }
      case EVENT.FRIEND_REQUEST_RECEIVED: { const name = f[2], msg = text(f[3]); this.events.push(() => { if (!this.friends.has(name)) this.friends.set(name, { presence: '', state: STATE.UNCONFIRMED }); this.native('onFriendRequestReceived@16', this.str(name), this.str(msg)); }); return; }
      case EVENT.FRIEND_REQUEST_ANSWERED: { const name = f[2], ok = f[3] === '1', msg = text(f[4]); this.events.push(() => this.native(ok ? 'onFriendRequestAccepted@16' : 'onFriendRequestRejected@16', this.str(name), this.str(msg))); return; }
      case 310: case EVENT.FRIEND_REMOVED: { const name = f[2]; this.events.push(() => { this.native('onFriendRemoved@12', this.str(name)); this.friends.delete(name); }); return; }
    }
  }

  // ---- rooms ----
  async findRoom(name) {
    const r = await this.request(CMD.GET_GAME_ROOMS, { 1: this.lobby });
    const room = r.lines.map(l => l.split('|')).find(f => (f[1] || '').toLowerCase() === name.toLowerCase());
    return room ? room[0] : null;
  }
  async exitRoom(room) {
    if (room.toLowerCase() === this.room.toLowerCase()) { await this.request(CMD.LEAVE_GAME_ROOM); this.inRoom = false; this.room = ''; }
    this.events.push(() => this.native('onDisconnectedFromGameRoom@12', this.str(room)));
  }
  async enterRoom(name) {
    if (this.inRoom) await this.exitRoom(this.room);
    const id = await this.findRoom(name);
    let ok = false;
    if (id) { const r = await this.request(CMD.JOIN_GAME_ROOM, { 1: id }); ok = r.code === REPLY.OK || r.code === 708; }
    if (ok) { this.room = name; this.inRoom = true; this.events.push(() => this.native('onConnected@8')); }
    return ok;
  }
  async openRoom(name) {
    if (this.inRoom) await this.exitRoom(this.room);
    const r = await this.request(CMD.CREATE_GAME_ROOM, { 1: name, 3: ROOM_MAX_USERS, 4: 1 });
    if (r.code === REPLY.OK && r.lines[0]) { this.inRoom = true; this.room = name; this.events.push(() => this.native('onConnected@8')); }
    else { this.inRoom = false; this.room = ''; }
  }
  async enterRoomWithRetries(name) {
    if (await this.enterRoom(name)) return;
    if (this.joinTries < 4) {
      await new Promise(r => setTimeout(r, 3000));
      this.joinTries++;
      this.queue(() => this.enterRoomWithRetries(name), false);
    } else {
      this.problem = 3;
      if (this.loggedIn && !this.leaving) this.dropped(2);
    }
  }

  // ---- friends ----
  async loadFriends() {
    this.friends.clear();
    const r = await this.request(CMD.GET_BUDDY_LIST);
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
      login: () => { this.loginRunning = true; this.queue(() => this.signIn(), true); return true; },
      moveToRoom: jname => { const name = v(jname); this.queue(async () => {
        if (this.inRoom) await this.exitRoom(this.room);
        if (await this.findRoom(name)) await this.enterRoom(name); else await this.openRoom(name);
      }, false); },
      createRoom: name => { this.queue(() => this.openRoom(v(name)), false); return v(name); },
      leaveRoom: name => this.queue(() => this.exitRoom(v(name)), false),
      joinRoom: name => { this.joinTries = 0; this.queue(() => this.enterRoomWithRetries(v(name)), false); },
      logout: () => { this.leaving = this.loggedIn; this.queue(() => this.signOut(true), true); this.cancelled = true; this.ui.stopLogin(); },
      send: len => {
        const data = this.host.readNet(len), room = this.bots ? startRoom(data) : null;
        this.queue(async () => {
          if (room !== null && !(await this.askBots(room))) return; // holds the actions behind it, so the order stays
          const r = await this.request(CMD.SEND_GAME_PACKET_TO_GAME_SERVER, { 1: b64(data) });
          if (r.code !== REPLY.OK && this.loggedIn && !this.leaving) this.dropped(0);
        }, false);
        return len;
      },
      startLoginScreen: () => {
        this.problem = 0; this.admitted = false; this.cancelled = false;
        // Submitting the dialog only hides it; the engine then sees status 3 ("logging in", dialog hidden) and calls login() itself.
        this.ui.startLogin(
          () => { this.cancelled = false; },
          () => { this.cancelled = true; this.events.push(() => this.native('onArenaLoginCancelled@8')); });
      },
      stopLoginScreen: () => { this.ui.stopLogin(); },
      getLoginScreenStatus: () => {
        if (this.problem === 3) return LOGIN_COULD_NOT_CONNECT;
        if (this.problem === 1) return 6;
        if (this.problem === 2) return 5;
        if (this.cancelled && this.loginRunning) return 1;
        if (this.cancelled) return 2;
        if (this.admitted) return 4;
        if (!this.ui.visible()) return 3; // the dialog is hidden: the engine is logging in
        return 0;
      },
      loginWasCancelled: () => this.cancelled,
      isLoggedIn: () => this.loggedIn,
      getFriendList: () => this.queue(() => this.loadFriends(), false),
      setPresence: (avail, presence) => this.queue(() => this.request(CMD.SET_PRESENCE, { 1: avail, 2: b64(utf8(`${PRESENCE_PREFIX}${v(presence) || ''}`)) }), false),
      sendFriendRequest: name => {
        const n = v(name) || '';
        if (VALID_NAME.test(n)) this.queue(() => this.request(CMD.REQUEST_BUDDY, { 1: n, 2: b64(utf8(' ')) }), false);
        else this.events.push(() => this.native('onError@16', 1, this.str('')));
      },
      removeFriend: name => this.queue(async () => { await this.request(CMD.REMOVE_BUDDY, { 1: v(name) }); this.friends.delete(v(name)); }, false),
      acceptFriendRequest: name => this.queue(() => this.request(CMD.ACCEPT_BUDDY, { 1: v(name) }), false),
      declineFriendRequest: name => this.queue(() => this.request(CMD.DECLINE_BUDDY, { 1: v(name) }), false),
    };
  }

  str(s) { return this.host.jni.str(s); }
  native(name, ...args) { this.host.snapEvent(name, ...args); }
  // Runs the queued engine callbacks; call after each tick.
  pump() { while (this.events.length) this.events.shift()(); }
}
