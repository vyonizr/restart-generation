// The heroes' engine identifiers in the engine's own order, which is each hero's ID (FUN_100941c0, docs/re/re_info.md "The heroes'
// rows"): the battle data names a hero by it (server/gameblob.js), and the info menu's portrait frames follow it (web/guide.js).
// No game data lists them in this order, so they are carried here as interoperability facts.
export const HERO_TYPES = ['HEDGEHOG', 'PLUMBER', 'CYBORG', 'LEVEL_50_ELF', 'BABE_GUNNER', 'MONSTER_TRAINER', 'SCIFI_KNIGHT', 'NINJA',
  'DR_LOVEBOMBER', 'AGGRESSOR'];
