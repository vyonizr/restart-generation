// Rejoin (CONTEXT.md, docs/adr/0038) on the game page. Before Start, the page asks the server whether the player's account holds a
// seat in a running battle, with the credentials its login will use. If it does, the rejoin card (Rejoin.svelte) takes Start's place:
// Rejoin is the Start press, and then the page drives the menus back to the battle (rejoin-drive.js) while the engine replays it
// quietly (shared/emu/rejoin.js); Leave gives the seat up. What the card draws is page.rejoin:
//   stage: 'offer' (Rejoin or Leave), 'drive' (the page presses the keys), 'manual' (the strip: the player does it by hand),
//          'back' (landed: "Back in", fading) or 'dropped' (the window ran out: OK)
//   ranked, seat (the player's own), seats ([{ seat, name, bot }] by seat), left (seconds of the window), step (an index into STEPS)
import { page } from '../page.svelte.js';
import { padKey } from '../input/keys.js';
import { focusOn } from '../focus.js';
import { quietReplay } from '../../../../shared/emu/rejoin.js';
import { createDrive } from './rejoin-drive.js';

// The rejoin window (REJOIN_WINDOW_MS in server/battle.js), which the meter is a share of.
export const WINDOW_S = 120;
const TABLE = /^table_\d+$/; // a battle's SNAP room (server/casino.js)

let who = null;      // the credentials the server knows the account by: { name, token } on a Discord server, { name } elsewhere
let deadline = 0;    // performance.now() when the window runs out
let ticking = 0;     // the clock's interval
let leaving = false; // Leave was pressed and the server hasn't answered yet
let run = null;      // the rejoin under way once Rejoin started the engine (startRejoin)

export const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// POST /seat (docs/protocol.md): {}, { held } or { dropped } for these credentials, or null when the server couldn't be asked.
async function seat(body) {
  try {
    const r = await fetch('seat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body), cache: 'no-store',
      signal: AbortSignal.timeout?.(5000) });
    return r.ok ? await r.json() : null;
  } catch {
    return null;
  }
}

// Before Start: shows the card if the account holds a seat, or "Dropped out" if its seat ran out while the page was closed (the server
// says that once). True if the card shows, in place of Start. After a reload the old session may still sit in the battle until the
// engine's login ends it, and the window starts only then: the server says a full window, and the clock runs early until resync().
export async function askSeat(credentials) {
  if (!credentials.name) return false; // a name the login hasn't used yet holds nothing
  who = credentials;
  const { held, dropped } = await seat(credentials) ?? {};
  const at = held ?? dropped;
  if (!Array.isArray(at?.seats)) return false;
  page.rejoin = { stage: held ? 'offer' : 'dropped', ranked: Boolean(at.ranked), seat: at.seat, seats: at.seats, left: 0, step: 0 };
  if (held) setClock(held.leftMs);
  return true;
}

function setClock(leftMs) {
  stopClock();
  deadline = performance.now() + leftMs;
  countDown();
  ticking = setInterval(countDown, 250);
}

function countDown() {
  const r = page.rejoin;
  if (!r) return stopClock();
  r.left = Math.max(0, Math.ceil((deadline - performance.now()) / 1000));
  if (r.left === 0 && r.stage !== 'back' && r.stage !== 'dropped') drop();
}

function drop() {
  stopClock();
  page.rejoin.stage = 'dropped';
  run?.end();
}

const stopClock = () => { clearInterval(ticking); ticking = 0; };
const close = () => { stopClock(); page.rejoin = null; };

// Once the engine's login has ended the old session, the server's window has started: the clock takes its exact time left. A seat no
// longer held (its battle ended) ends the rejoin before the hero's Select could queue the player for a new match.
async function resync() {
  const answer = await seat(who), r = page.rejoin;
  if (!answer || !run || !r || r.stage === 'back' || r.stage === 'dropped') return;
  if (answer.held) setClock(answer.held.leftMs);
  else if (answer.dropped) drop();
  else { run.end(); close(); focusOn('screen'); }
}

// Leave, on the card or the strip: the server gives the seat up as a player leaving through the game's menus. The page goes on to Start
// only once it has, or a quick Start could still take the player back to the seat.
export async function leaveSeat() {
  if (leaving) return;
  leaving = true;
  run?.end();
  await seat({ ...who, leave: true });
  leaving = false;
  close();
  if (page.playing) focusOn('screen'); else page.start = true;
}

// OK on "Dropped out".
export function dismissDropped() {
  close();
  if (page.playing) focusOn('screen'); else page.start = true;
}

// Landed: "Back in" shows as long as its fade (app.css), and then the card is gone.
const BACK_IN_MS = 2400;
function backIn() {
  stopClock();
  page.rejoin.stage = 'back';
  setTimeout(() => { if (page.rejoin?.stage === 'back') page.rejoin = null; }, BACK_IN_MS);
}

// A gamepad on the card (gamepad.js): Up and Down move between its buttons and Select presses the one with focus, as Tab and Enter do.
// True when the card takes the press. While the page drives the menus, presses go on to the game, which holds them.
export function rejoinPad(control) {
  const stage = page.rejoin?.stage;
  if (stage !== 'offer' && stage !== 'dropped') return false;
  if (page.dialogs) return true;
  const buttons = [...document.querySelectorAll('.rejoin-card button')], at = buttons.indexOf(document.activeElement);
  if (control === 'select' || control === 'menu') (buttons[at] ?? buttons[0])?.click();
  else if (control === 'up' || control === 'down') buttons[(Math.max(at, 0) + (control === 'down' ? 1 : buttons.length - 1)) % buttons.length]?.focus();
  return true;
}

// Rejoin, once the engine runs (game.js): arms the quiet replay, holds the player's input and drives the menus. The game loop calls
// beforeTick() and afterTick() around every engine tick for as long as afterTick() returns true.
export function startRejoin({ game, snap, input, presses, login }) {
  const quiet = quietReplay(game);
  if (!quiet) console.warn('rejoin: the history replays with visuals on: unexpected engine bytes');
  const drive = createDrive(), wall0 = performance.now(), time0 = game.time;
  const queue = []; // the drive's keys still to press, one at a time, each held for one tick
  let down = null, driving = true, over = false, resynced = false;
  const release = () => { if (down === null) return; const code = down; down = null; input.push(() => game.key(false, code)); };
  const stopDriving = () => { if (!driving) return; driving = false; queue.length = 0; presses.hold(false); };
  const finish = () => { release(); run = null; return false; };
  presses.hold(true);
  page.rejoin.stage = 'drive';
  run = {
    // Leave, or the window ran out: the player's input is theirs again, and the quiet replay ends unless the engine is already in a
    // table's handshake, which may still be its seat's.
    end() { over = true; stopDriving(); },
    beforeTick() {
      if (down !== null) release();
      else if (queue.length) { const code = down = queue.shift(); input.push(() => game.key(true, code)); }
    },
    afterTick() {
      const joined = quiet?.joined, r = page.rejoin, table = snap.inRoom && TABLE.test(snap.room);
      if (driving) {
        const s = drive.step({ time: game.time - time0, wall: performance.now() - wall0, loggedIn: snap.loggedIn, room: snap.room, problem: snap.problem,
          asking: login.visible() });
        // The custom keys for the directions; Enter and Esc, which the engine keeps whatever the player chose, for Select and Back.
        for (const action of s.press) queue.push(padKey(action, page.keys));
        if (r.step !== s.step) r.step = s.step;
        if (s.failed) { stopDriving(); r.stage = 'manual'; }
      }
      if (!resynced && snap.loggedIn && !over) { resynced = true; resync(); }
      // In the battle, once the engine has joined with its visuals turned back on: "Back in", also over a "Dropped out" the page's
      // clock showed a moment early. Without the quiet replay, a battle room stands for the join.
      if ((quiet ? joined : table) && (game.inBattle || !game.board)) {
        stopDriving();
        if (r && r.stage !== 'back') backIn();
        return finish();
      }
      if (over && (joined || !table || !quiet)) { quiet?.disarm(); return finish(); }
      return true;
    },
  };
  return run;
}
