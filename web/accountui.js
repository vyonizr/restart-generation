// The page's side of guests and members (ADR 0011): who you are in the header, signing in with Discord, the name and
// confirmation dialogs after Discord sends you back, and the one-line notices under the screen.
// It runs only on a server that has Discord sign-in (GET /status says `accounts`).
import { Account } from './account.js';

const $ = id => document.getElementById(id);
const POLL_MS = 20000;   // how often a playing page re-reads fame
const STRIP_MS = 30000;  // how often the who-is-online line refreshes
const NAME_ERRORS = {
  invalid: 'Use letters, numbers and _, up to 15.',
  reserved: 'That name is kept for guests and CPU players.',
  taken: 'Someone already has that name.',
};
const today = () => new Date().toISOString().slice(0, 10);

function element(tag, className, text, attrs = {}) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}

export function createAccountUI({ canvas, overlay }) {
  const account = new Account();
  let playing = false; // the engine is running, so leaving the page ends a game

  // --- dialogs over the game screen: the rest of the page can't be reached while one is open ---
  let returnFocus = null;
  function openDialog(dialog, focus) {
    returnFocus = document.activeElement;
    canvas.inert = true; overlay.inert = true;
    dialog.hidden = false;
    focus.focus();
  }
  function closeDialog(dialog) {
    dialog.hidden = true;
    canvas.inert = false; overlay.inert = false;
    if (returnFocus?.isConnected && !returnFocus.closest('[hidden]')) returnFocus.focus(); else (overlay.hidden ? canvas : $('start')).focus();
  }

  const nameForm = $('member'), nameInput = $('member-name'), nameError = $('member-error');
  // Asks for the member's name. Resolves with the name, or null if the player cancels. Call again to show an error.
  let nameResolve = null;
  function askName(value, error = '') {
    nameInput.value = value; nameError.textContent = error; nameError.hidden = !error;
    if (nameForm.hidden) openDialog(nameForm, nameInput);
    nameInput.select();
    return new Promise(resolve => { nameResolve = resolve; });
  }
  nameForm.addEventListener('submit', e => { e.preventDefault(); nameResolve?.(nameInput.value.trim()); });
  $('member-cancel').addEventListener('click', () => nameResolve?.(null));
  nameForm.addEventListener('keydown', e => { if (e.key === 'Escape') $('member-cancel').click(); e.stopPropagation(); });

  const askBox = $('confirm');
  let askResolve = null;
  // A yes/no question over the screen. Resolves true for the confirming button.
  function ask({ title, text, yes, no = 'Cancel' }) {
    $('confirm-title').textContent = title; $('confirm-text').textContent = text;
    $('confirm-yes').textContent = yes; $('confirm-no').textContent = no;
    openDialog(askBox, $('confirm-no'));
    return new Promise(resolve => { askResolve = resolve; }).finally(() => closeDialog(askBox));
  }
  $('confirm-yes').addEventListener('click', () => askResolve?.(true));
  $('confirm-no').addEventListener('click', () => askResolve?.(false));
  askBox.addEventListener('keydown', e => { if (e.key === 'Escape') askResolve?.(false); e.stopPropagation(); });

  // --- the line under the screen: notices, and the offer to sign in after a win ---
  const note = $('nudge'), noteText = $('nudge-text'), noteActions = $('nudge-actions'), sub = document.querySelector('.sub');
  function notice(text, actions = []) {
    noteText.textContent = text;
    noteActions.replaceChildren(...actions.map(([label, run, secondary]) => {
      const b = element('button', secondary ? 'secondary' : '', label, { type: 'button' });
      b.addEventListener('click', () => { hideNotice(); run?.(); });
      return b;
    }));
    note.hidden = false; sub.hidden = true;
  }
  function hideNotice() { note.hidden = true; sub.hidden = false; }
  const dismiss = [['Dismiss', null, true]];

  // --- who you are: the header on a desktop, the line under Start on a touch device ---
  function render() {
    for (const host of [$('who'), $('who-touch')]) {
      host.replaceChildren(element('b', 'who-name', account.name));
      if (account.member) {
        const menu = element('details', 'menu');
        const panel = element('div', 'menu-panel');
        for (const [act, label] of [['signout', 'Sign out'], ['delete', 'Delete my account']]) panel.append(element('button', 'secondary', label, { type: 'button', 'data-act': act }));
        menu.append(element('summary', '', 'Account'), panel);
        host.append(element('span', 'who-level', `Level ${account.level}`), menu);
      } else {
        const b = element('button', 'secondary', '', { type: 'button', 'data-act': 'signin' });
        b.append(element('span', '', 'Sign in'), element('span', 'long', ' with Discord'));
        host.append(b);
      }
      host.hidden = false;
    }
  }
  document.addEventListener('click', e => {
    const act = e.target.closest?.('[data-act]')?.dataset.act;
    if (act) actions[act]?.();
    // A menu closes when you click anywhere else.
    for (const m of document.querySelectorAll('.menu[open]')) if (!m.contains(e.target)) m.open = false;
  });
  addEventListener('keydown', e => { if (e.key === 'Escape') for (const m of document.querySelectorAll('.menu[open]')) m.open = false; });

  const actions = {
    async signin() {
      if (playing && !await ask({ title: 'Leave this page?', text: 'Signing in opens Discord and ends your current game.', yes: 'Sign in', no: 'Stay' })) return;
      try { location.assign(await account.discordUrl()); } catch { notice("Couldn't reach Discord sign-in. Try again in a moment.", dismiss); }
    },
    async signout() {
      if (!await ask({ title: 'Sign out?', text: 'You play as a new guest until you sign in again. Your account and fame are kept.', yes: 'Sign out' })) return;
      try { await account.signOut(); location.reload(); } catch { notice("Couldn't sign out. Try again in a moment.", dismiss); }
    },
    async delete() {
      if (!await ask({ title: 'Delete your account?', text: 'Your name, fame and friends are removed for good. You continue as a new guest.', yes: 'Delete', no: 'Keep it' })) return;
      try { await account.remove(); location.reload(); } catch { notice("Couldn't delete the account. Try again in a moment.", dismiss); }
    },
  };

  // --- coming back from Discord: the page address carries a one-time code ---
  async function finishSignIn(code) {
    try {
      const r = await account.exchange(code);
      if (r.status === 'name') {
        let name = r.suggested, error = '';
        for (;;) {
          name = await askName(name, error);
          if (name === null) { closeDialog(nameForm); notice(`Sign-in cancelled. You're still playing as ${account.name}.`, dismiss); return; }
          try { await account.finish(code, { name }); break; } catch (e) {
            if (!NAME_ERRORS[e.code]) { closeDialog(nameForm); throw e; }
            error = NAME_ERRORS[e.code];
          }
        }
        closeDialog(nameForm);
      } else if (r.status === 'confirm') {
        const yes = await ask({ title: `Sign in as ${r.name}?`, text: `That Discord account already has a player. Your guest progress (${r.guestFame} fame) is discarded.`, yes: 'Continue' });
        if (!yes) { notice(`Sign-in cancelled. You're still playing as ${account.name}.`, dismiss); return; }
        await account.finish(code, { confirm: true });
      }
      await account.open();
      render();
      notice(`Signed in as ${account.name}.`, dismiss);
    } catch (e) {
      notice(e.code === 'expired' ? 'That sign-in expired. Try again.' : "Discord sign-in didn't work. Try again.", dismiss);
    }
  }

  // Opens the account and, if Discord just sent the player back, finishes the sign-in. Resolves when the account is usable.
  async function start() {
    const returned = /^#(signin|signin-error)=([\w-]+)$/.exec(location.hash);
    if (returned) history.replaceState(null, '', location.pathname + location.search);
    try {
      await account.open();
      render();
    } catch (e) {
      const reason = { too_many: 'This network has made too many guests in the last hour. Try again later, or sign in with Discord.', full: 'This server has no room for more guests right now.' }[e.code];
      notice(reason || "Couldn't reach the account server. Online play won't work until you reload.", dismiss);
      return;
    }
    if (returned?.[1] === 'signin-error') notice(returned[2] === 'cancelled' ? `Sign-in cancelled. You're still playing as ${account.name}.` : "Discord sign-in didn't work. Try again.", dismiss);
    else if (returned) finishSignIn(returned[2]);
  }

  // While the engine runs: keep the header's level current, and after a guest earns fame offer them the account, once a day.
  function watch() {
    playing = true;
    let seen = account.fame;
    setInterval(async () => {
      if (document.hidden || !note.hidden && noteActions.children.length > 1) return;
      if (!await account.refresh().catch(() => true)) return;
      const earned = account.fame - seen;
      seen = account.fame;
      render();
      let last = null; try { last = localStorage.getItem('rg:nudged'); } catch { /* blocked */ }
      if (earned > 0 && !account.member && last !== today()) {
        try { localStorage.setItem('rg:nudged', today()); } catch { /* blocked */ }
        notice(`You earned ${earned} fame. Sign in with Discord to keep it.`, [['Sign in with Discord', actions.signin], ['Not now', null, true]]);
      }
    }, POLL_MS);
  }

  // The login was refused: the server no longer knows this guest. Get a new one for the next try.
  async function rejected() {
    try { await account.open(); render(); notice('Your guest account had expired, so you have a new one. Choose Online in the menu to try again.', dismiss); } catch { /* the notice from start() already says why */ }
  }

  return { account, start, watch, rejected, notice };
}

// "3 players online · 1 waiting for a match · Join the Discord", from GET /status.
export function startStrip(server) {
  const strip = $('strip');
  const line = ({ online, waiting }) => {
    const parts = [online === 0 ? 'No one is online right now' : `${online} ${online === 1 ? 'player' : 'players'} online`];
    if (waiting > 0) parts.push(`${waiting} waiting for a match`);
    return parts.join(' · ');
  };
  const link = element('a', '', 'Join the Discord', { href: server.invite || '#', target: '_blank', rel: 'noopener' });
  const text = element('span');
  strip.append(' · ', text);
  if (server.invite) strip.append(' · ', link);
  const refresh = async () => {
    try {
      const r = await fetch('status', { cache: 'no-store' });
      if (r.ok) { text.textContent = line(await r.json()); strip.hidden = false; }
    } catch { strip.hidden = true; }
  };
  refresh();
  setInterval(() => { if (!document.hidden) refresh(); }, STRIP_MS);
}
