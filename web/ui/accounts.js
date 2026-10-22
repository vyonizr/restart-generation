// The page's side of guests and members (ADR 0011): signing in with Discord, the name and confirmation dialogs after Discord sends
// you back, who you are in the header, and the one-line notices under the screen. The components draw `page`; this changes it.
// It runs only on a server that has Discord sign-in (GET /status says `accounts`).
import { Account } from '../account.js';
import { page } from './page.svelte.js';
import { leave, discard } from './progress.js';

const POLL_MS = 20000;   // how often a playing page re-reads fame
const NAME_ERRORS = {
  invalid: 'Use letters, numbers and _, up to 15.',
  reserved: 'That name is kept for guests and CPU players.',
  taken: 'Someone already has that name.',
};
const today = () => new Date().toISOString().slice(0, 10);

let account = null;
let playing = false; // the engine is running, so leaving the page ends a game

// Asks for the member's name. Resolves with the name, or null if the player cancels. Call again to show an error.
let nameResolve = null;
function askName(value, error = '') {
  page.nameDialog = { value, error };
  return new Promise(resolve => { nameResolve = resolve; });
}
const closeName = () => { page.nameDialog = null; nameResolve = null; };
export const answerName = value => nameResolve?.(value);

// A yes/no question over the screen. Resolves true for the confirming button.
let askResolve = null;
function ask({ title, text, yes, no = 'Cancel' }) {
  page.confirm = { title, text, yes, no };
  return new Promise(resolve => { askResolve = resolve; }).finally(() => { page.confirm = null; askResolve = null; });
}
export const answerConfirm = yes => askResolve?.(yes);

// The line under the screen: notices, and the offer to sign in after a win. Each action is [label, run, secondary].
function notice(text, actions = []) {
  page.notice = { text, actions: actions.map(([label, run, secondary]) => ({ label, run, secondary })) };
}
const dismiss = [['Dismiss', null, true]];

const render = () => { page.who = { name: account.name, member: account.member }; };

export const actions = {
  async signin() {
    if (playing && !await ask({ title: 'Leave this page?', text: 'Signing in opens Discord and ends your current game.', yes: 'Sign in', no: 'Stay' })) return;
    try { location.assign(await account.discordUrl()); } catch { notice("Couldn't reach Discord sign-in. Try again in a moment.", dismiss); }
  },
  // Saves what the server keeps about the account as a JSON file, without leaving the page.
  async download() {
    try {
      const url = URL.createObjectURL(new Blob([JSON.stringify(await account.data(), null, 2)], { type: 'application/json' }));
      const a = Object.assign(document.createElement('a'), { href: url, download: `restart-generation-${account.name}.json` });
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch { notice("Couldn't download your data. Try again in a moment.", dismiss); }
  },
  async signout() {
    if (!await ask({ title: 'Sign out?', text: 'You play as a new guest until you sign in again. Your account and fame are kept.', yes: 'Sign out' })) return;
    try { await leave(); await account.signOut(); location.reload(); } catch { notice("Couldn't sign out. Try again in a moment.", dismiss); }
  },
  async delete() {
    if (!await ask({ title: 'Delete your account?', text: 'Your name, fame and friends are removed for good. You continue as a new guest.', yes: 'Delete', no: 'Keep it' })) return;
    try { await account.remove(); discard(); location.reload(); } catch { notice("Couldn't delete the account. Try again in a moment.", dismiss); }
  },
};

// The actions of a notice for a player the server made no guest for.
const offer = [['Sign in with Discord', actions.signin], ...dismiss];

// Coming back from Discord: the page address carries a one-time code. `refused` shows why the server made no guest, if it made none:
// canceling then leaves the player there, with the offer to sign in again.
async function finishSignIn(code, refused = null) {
  const canceled = () => (refused ? refused() : notice(`Sign-in canceled. You're still playing as ${account.name}.`, dismiss));
  try {
    const r = await account.exchange(code);
    if (r.status === 'name') {
      let name = r.suggested, error = '';
      for (;;) {
        name = await askName(name, error);
        if (name === null) { closeName(); canceled(); return; }
        try { await account.finish(code, { name }); break; } catch (e) {
          if (!NAME_ERRORS[e.code]) { closeName(); throw e; }
          error = NAME_ERRORS[e.code];
        }
      }
      closeName();
    } else if (r.status === 'confirm') {
      const yes = await ask({ title: `Sign in as ${r.name}?`, text: `That Discord account already has a player. Your guest progress (${r.guestFame} fame) and this browser's saved game are discarded.`, yes: 'Continue' });
      if (!yes) { canceled(); return; }
      await account.finish(code, { confirm: true });
    }
    await account.open();
    render();
    notice(`Signed in as ${account.name}.`, dismiss);
  } catch (e) {
    // A player without a guest can't play online until a sign-in works, so the offer stays.
    notice(e.code === 'expired' ? 'That sign-in expired. Try again.' : "Discord sign-in didn't work. Try again.", refused ? offer : dismiss);
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
    // A member counts against neither limit, and signing in with Discord needs no guest.
    const refused = () => notice(reason || "Couldn't reach the account server. Online play won't work until you reload.", reason ? offer : dismiss);
    if (reason && returned?.[1] === 'signin') await finishSignIn(returned[2], refused);
    else refused();
    return;
  }
  if (returned?.[1] === 'signin-error') notice(returned[2] === 'cancelled' ? `Sign-in canceled. You're still playing as ${account.name}.` : "Discord sign-in didn't work. Try again.", dismiss);
  else if (returned) await finishSignIn(returned[2]); // the account must be final before the saved game is settled
}

// While the engine runs: refresh the account, and after a guest earns fame offer them the account, once a day.
function watch() {
  playing = true;
  let seen = account.fame;
  setInterval(async () => {
    if (document.hidden || page.notice?.actions.length > 1) return;
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

export function createAccounts() {
  account = new Account();
  return { account, start, watch, rejected };
}
