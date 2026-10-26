// The drive of a rejoin (docs/adr/0038): after Rejoin the page presses the menu keys itself, from the start screen to Quick Match and
// a hero, as server/bot.mjs does, while the player's input waits. The hero's MATCHMAKING is what the server answers with the held
// table, and the engine takes its table only from there (docs/re/re_rejoin.md). Plain logic with no page or engine in it, fed what
// the engine and the SNAP client show after each tick.

// The steps the rejoin card lists as they pass.
export const STEPS = ['Starting the game', 'Arena', 'Quick Match', 'Hero', 'Your battle'];
// server/bot.mjs's menu keys, in engine milliseconds since Rejoin: they skip the intro and open Quick Match from the main menu. Its
// Select starts the Arena login, after which the engine enters the ranked casino and shows the hero selection by itself.
const MENU = [[3000, 'back'], [6000, 'back'], [9000, 'back'], [13000, 'down'], [14000, 'down'], [15000, 'select']];
const ARENA = 3; // MENU's first Down
// Select takes the first hero this long, in engine time, after the engine has logged in and joined the CasinoSystem room; a bot,
// whose login takes well under a second, presses it 6 s after its menu's Select.
export const HERO_AFTER = 5000;
// Wall-clock time after Rejoin by which the engine must be back in its battle, or the player gets the strip and does it by hand.
// The drive should take about 23 s at real time (the menus' 15 s, the login, the hero's 5 s, then about 1 s to MATCHED_UP and the
// handshake, as measured at 4× speed), so this leaves room for a slow login or device and most of a full window for the player.
export const GIVE_UP = 45000;
const CASINO = /^casinosystem$/i;

export function createDrive() {
  let next = 0, casinoAt = null, hero = false;
  return {
    // time and wall: engine and wall-clock milliseconds since Rejoin. snap: the SNAP client's loggedIn, room and problem (0 until a
    // login fails); asking: whether the page is asking the player for a name for the login. Returns the actions to press now
    // ('back', 'down', 'select'), the step the card shows (an index into STEPS), and whether the drive has given up.
    step({ time, wall, loggedIn, room, problem, asking }) {
      const press = [];
      while (next < MENU.length && MENU[next][0] <= time) press.push(MENU[next++][1]);
      const menu = next === MENU.length;
      if (menu && casinoAt === null && loggedIn && CASINO.test(room)) casinoAt = time;
      if (!hero && casinoAt !== null && time - casinoAt >= HERO_AFTER) { press.push('select'); hero = true; }
      const step = hero ? 4 : casinoAt !== null ? 3 : menu ? 2 : next > ARENA ? 1 : 0;
      // The login failed, or wants a name typed: the player takes over at once.
      const failed = wall >= GIVE_UP || (menu && !loggedIn && (problem !== 0 || asking));
      return { press, step, failed };
    },
  };
}
