// The made-up players of the showcase (docs/adr/0036): none of them is a seed account (server/seed.json), a test's name, or a name the
// gateway keeps for its bots (CPU_n), so a showcase picture never shows a name a developer knows from elsewhere. Every name is a valid
// online name (shared/snap-ids.js VALID_NAME).

// Whose screen every page shot is: signed in as this member, in the middle of the rankings.
export const HERO = 'NeonBadger';

// 18 members, so the Rankings screen's three lists (the top 10, you, and the 5 around you, server/casino.js) don't repeat each other.
// Fame is 10 a ranked win, as the server counts it, and nothing takes it away. The fame level is one a 100 fame, up to the client's
// 14 badges (server/casino.js fameLevel), so the top 10 here climb one badge a place, from the highest down. `hero` is the
// favourite hero, in the engine's order (shared/heroes.js), shown on Your Stats.
export const PLAYERS = [
  { name: 'Kestrel_77', wins: 146, matches: 251, rescues: 274, hero: 7 },  // level 14
  { name: 'MossTitan', wins: 127, matches: 233, rescues: 236, hero: 2 },   // 13
  { name: 'Marisol', wins: 118, matches: 204, rescues: 221, hero: 4 },     // 12
  { name: 'PixelWren', wins: 105, matches: 197, rescues: 190, hero: 5 },   // 11
  { name: 'QuietRiot_9', wins: 94, matches: 181, rescues: 170, hero: 9 },  // 10
  { name: 'SableFox', wins: 86, matches: 172, rescues: 151, hero: 0 },     // 9
  { name: 'Halvard', wins: 72, matches: 150, rescues: 131, hero: 6 },      // 8
  { name: 'VoltJuniper', wins: 65, matches: 139, rescues: 118, hero: 8 },  // 7
  { name: 'Okonkwo', wins: 56, matches: 124, rescues: 99, hero: 3 },       // 6
  { name: 'TurboLark', wins: 47, matches: 108, rescues: 84, hero: 1 },     // 5
  { name: 'Ingrid_K', wins: 42, matches: 96, rescues: 77, hero: 6 },       // 5
  { name: 'GlitchHeron', wins: 35, matches: 83, rescues: 61, hero: 2 },    // 4
  { name: 'Tamsin', wins: 32, matches: 75, rescues: 58, hero: 4 },         // 4
  { name: HERO, wins: 27, matches: 64, rescues: 49, hero: 7 },             // 3
  { name: 'OrbitCrow', wins: 21, matches: 55, rescues: 37, hero: 9 },      // 3
  { name: 'Bastion_42', wins: 14, matches: 39, rescues: 24, hero: 5 },     // 2
  { name: 'Lumi', wins: 9, matches: 26, rescues: 15, hero: 1 },            // 1
  { name: 'Wexford', wins: 3, matches: 11, rescues: 5, hero: 0 },          // 1
];

// Friends of the hero, 'both' ways (a friendly room is open to friends only, server/casino.js), and one request still waiting.
export const FRIENDS = [
  [HERO, 'Kestrel_77', 'both'],
  [HERO, 'PixelWren', 'both'],
  [HERO, 'Marisol', 'both'],
  ['Tamsin', HERO, 'to'],
];

// The battles Bots play as these players (server/seed.js play()), each with the hero in it, newest last. `hero` is how many steps
// right of Plumber the Bot picks on the hero screen (server/bot.mjs), so the four battles show all ten heroes.
export const BATTLES = [
  { id: 'showcase-4p', created: '-3d2h', players: [{ name: HERO, hero: 0 }, { name: 'Kestrel_77', hero: 1 }, { name: 'MossTitan', hero: 2 }, { name: 'PixelWren', hero: 3 }] },
  { id: 'showcase-3p', created: '-1d5h', players: [{ name: HERO, hero: 4 }, { name: 'SableFox', hero: 5 }, { name: 'Marisol', hero: 6 }] },
  { id: 'showcase-2p-a', created: '-7h', players: [{ name: HERO, hero: 7 }, { name: 'VoltJuniper', hero: 8 }] },
  { id: 'showcase-2p-b', created: '-40m', players: [{ name: HERO, hero: 9 }, { name: 'GlitchHeron', hero: 3 }] },
];
