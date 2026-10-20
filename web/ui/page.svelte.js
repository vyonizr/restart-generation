// What the components draw. Plain code (the account, the game loop) changes these fields; the components never fetch or decide.
export const page = $state({
  server: null,     // GET /status, or null on a static host
  who: null,        // { name, member, level } once the account is open
  notice: null,     // { text, actions: [{ label, run, secondary }] }: the line under the screen
  nameDialog: null, // { value, error }: the member's name, after Discord sends them back
  confirm: null,    // { title, text, yes, no }: a yes/no question over the game screen
  nameLogin: null,  // { value }: the Arena login dialog, on a server without accounts
  bots: null,       // { alone, focus }: the CPU question at a friendly Start; focus is 'none', 'cpu' or 'expert'
  onlineName: '',   // "Online as <name>" under Start, once the player has set a name
  dialogs: 0,       // dialogs open; the game screen can't be reached while one is
});
