// The player's online identity on a server without accounts, kept in this browser: a name, with no password (ADR 0009).
// The name is a random GuestNNNNNN until the player sets one, which sets `named`. The server registers it on its first login.
// The name dialog sets the name: from Set name or Change name under Start, or at the first online login if it isn't set by then.
import { page } from '../page.svelte.js';

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

// "Online as <name>" under Start: the name set, or the GuestNNNNNN one until then, with Set name or Change name beside it.
export const showOnlineName = () => { page.onlineName = guest.username; page.onlineNamed = Boolean(guest.named); };
// Set name or Change name under Start opens the name dialog before the game logs in, so the next login uses the name typed.
// The line stays, so the dialog gives focus back to the button.
export const changeName = () => { page.nameLogin = { value: guest.username, rename: true }; };
export function renameTo(value) {
  guest = { username: value.trim(), named: true };
  saveGuest(guest);
  page.nameLogin = null;
  showOnlineName();
}
export const cancelRename = () => { page.nameLogin = null; };

// What the SNAP client (shared/snap.js) calls for the login screen.
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
