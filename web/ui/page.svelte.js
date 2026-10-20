// What the components draw. Plain code (the account, the game loop) changes these fields and the components draw them.
export const page = $state({
  status: 'Loading game files…', // the overlay's line: what the page is doing
  overlay: true,    // the overlay covers the game screen until Start, and again after a failure
  pick: false,      // asking the player for their game files
  start: false,     // the Start button is ready
  recover: false,   // a failure: offer Reload
  forgettable: false, // and, if the stored copy may be at fault, a different copy
  playing: false,   // the game is running
  ownCopy: false,   // the player brings their own game files (the footer says so)
  slow: null,       // text of the slow-device notice, once shown
  server: null,     // GET /status, or null on a static host
  online: null,     // players online, or null when there is no server to ask
  who: null,        // { name, member, level } once the account is open
  notice: null,     // { text, actions: [{ label, run, secondary }] }: the line under the screen
  nameDialog: null, // { value, error }: the member's name, after Discord sends them back
  confirm: null,    // { title, text, yes, no }: a yes/no question over the game screen
  nameLogin: null,  // { value }: the Arena login dialog, on a server without accounts
  bots: null,       // { alone, focus }: the CPU question at a friendly Start; focus is 'none', 'cpu' or 'expert'
  onlineName: '',   // "Online as <name>" under Start, once the player has set a name
  dialogs: 0,       // dialogs open; the game screen can't be reached while one is
});

// What the touch pad drives once the game runs: { game, input, audio }. Raw, so the emulator and its input queue are
// never wrapped in reactive proxies.
class Slot { current = $state.raw(null); }
export const padSession = new Slot();
