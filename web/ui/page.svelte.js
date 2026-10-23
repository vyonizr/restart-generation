// What the components draw. Plain code (the account, the game loop) changes these fields and the components draw them.
import { DEFAULT_KEYS } from './keys.js';

export const page = $state({
  status: 'Loading game files…', // the overlay's line: what the page is doing
  overlay: true,    // the overlay covers the game screen until Start, and again after a failure
  pick: false,      // asking the player for their game files
  start: false,     // the Start button is ready
  recover: false,   // a failure: offer Reload
  forgettable: false, // and, if the stored copy may be at fault, a different copy
  unsent: false,    // Quit couldn't upload a member's latest saved game: offer Try again or Quit anyway
  playing: false,   // the game is running
  ownCopy: false,   // the player brings their own game files (the footer says so)
  slow: null,       // text of the slow-device notice, once shown
  slowClassic: false, // it came up during a Full board battle, so it offers Classic
  server: null,     // GET /status, or null on a static host
  online: null,     // players online, or null when there is no server to ask
  who: null,        // { name, member } once the account is open
  notice: null,     // { text, actions: [{ label, run, secondary }] }: the line under the screen
  nameDialog: null, // { value, error }: the member's name, after Discord sends them back
  confirm: null,    // { title, text, yes, no }: a yes/no question over the game screen
  nameLogin: null,  // { value }: the Arena login dialog, on a server without accounts
  notices: false,   // the Notices dialog is open (opened from the footer)
  replays: '',      // the name whose replays the Replays dialog lists, while it is open (docs/adr/0024)
  bots: null,       // { alone, focus }: the CPU question at a friendly Start; focus is 'none', 'cpu' or 'expert'
  onlineName: '',   // "Online as <name>" under Start, once the player has set a name
  dialogs: 0,       // dialogs open; the game screen can't be reached while one is
  finish: 'soft',   // how the game screen is shown, 'soft' or 'sharp' (the Screen finish, finish.js)
  keys: { ...DEFAULT_KEYS }, // the player's custom keys, from the saved game's settings.cfg (keys.js)
  input: 'keys',    // what the key legend shows: 'keys', or 'gamepad' after a press on the pad in use (gamepad.js)
  board: 'full',    // the Board view the player chose, 'full' or 'classic' (board.js)
  battle: null,     // the Board view of the battle on now, or null outside a battle
  boardable: true,  // this copy of the engine can show the Full board (until booting it says otherwise)
});

// What the touch pad and the gamepad drive once the game runs: { game, input, audio, presses }. Raw, so the emulator and its
// input queue are never wrapped in reactive proxies.
class Slot { current = $state.raw(null); }
export const padSession = new Slot();
