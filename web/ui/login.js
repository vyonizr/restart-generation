// The player's online identity on a server without accounts, kept in this browser: a name, with no password (ADR 0009).
// The name is a random GuestNNNNNN until the player sets one, which sets `named`. The server registers it on its first login.
// The Arena login dialog sets the name; it appears at the first online login.
import { page } from './page.svelte.js';
import { focusOn } from './focus.js';

const KEY = 'rg:guest';
const saveGuest = guest => { try { localStorage.setItem(KEY, JSON.stringify(guest)); } catch {} };

function guestIdentity() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) return saved;
  } catch {}
  const guest = { username: `Guest${crypto.getRandomValues(new Uint32Array(1))[0] % 1e6}` };
  saveGuest(guest);
  return guest;
}

// The saved identity stays as it is until the server accepts the name the player typed (pending).
let guest = null, pending = null, handlers = null, typed = '';

export function submitName(value) {
  typed = value;
  pending = { username: value.trim(), named: true };
  const h = handlers;
  page.nameLogin = null;
  h?.ready();
}

export function cancelName() {
  const h = handlers;
  pending = null;
  ui.stopLogin();
  h?.cancel();
}

// "Online as <name> · Change name" under Start, once the player has set a name.
export const showOnlineName = () => { page.onlineName = guest.named ? guest.username : ''; };
export function changeName() {
  delete guest.named;
  saveGuest(guest);
  showOnlineName();
  focusOn('start');
}

// What the SNAP client (web/snap.js) calls for the login screen.
const ui = {
  startLogin(ready, cancelled) {
    handlers = { ready, cancel: cancelled };
    typed = guest.username;
    if (guest.named) { ready(); return; }
    page.nameLogin = { value: guest.username };
  },
  stopLogin() { page.nameLogin = null; handlers = null; },
  visible: () => page.nameLogin !== null,
  attempting() {},
  accepted() { if (pending) { guest = pending; saveGuest(guest); pending = null; } },
  rejected() { pending = null; },
  credentials: () => ({ username: typed.trim(), password: '' }),
  name: () => guest.named ? guest.username : '',
  forget() { delete guest.named; saveGuest(guest); },
};

export function createNameLogin() {
  guest = guestIdentity();
  return ui;
}
