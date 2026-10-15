// rg::Game blob (Game::write FUN_1003c4a0, Game::read FUN_1003e440) and the BattleLogic snapshot
// (save FUN_10006a80, load FUN_10006b10). All ints little-endian.
// One codec function per type runs in both directions, so parse and write can't drift apart.
// Field names come from the XML loaders: mission FUN_1003fd50, level FUN_1003f7c0, rules FUN_1003de20.

// Stream in read mode (buf given) or write mode. Each method reads into o[k] or writes o[k].
function stream(buf) {
  const R = !!buf;
  let pos = 0;
  const out = [];
  const num = (size, rd, wr) => (o, k) => {
    if (R) { o[k] = buf[rd](pos); pos += size; } else { const b = Buffer.alloc(size); b[wr](o[k]); out.push(b); }
    return o[k];
  };
  const s = {
    R, i32: num(4, 'readInt32LE', 'writeInt32LE'), u32: num(4, 'readUInt32LE', 'writeUInt32LE'),
    u8: num(1, 'readUInt8', 'writeUInt8'),
    bytes(o, k, n) {
      if (R) { o[k] = Buffer.from(buf.subarray(pos, pos + n)); pos += n; } else out.push(o[k]);
    },
    // mt::String (write FUN_100efee0, read FUN_100f0000): u32 hdr, u32 len, u32 count, count * width bytes.
    // hdr bits 28..30 = encoding (0 8-bit, 2 UTF-16LE); the rest is refcount/static flag, ignored by the
    // reader. It is kept in o[k + 'Hdr'] only for byte-exact round-trips.
    str(o, k) {
      const t = { h: o[k + 'Hdr'] ?? (/[^\x00-\xff]/.test(o[k]) ? 0x20000001 : 1) };
      s.u32(t, 'h');
      const wide = (t.h >>> 28 & 7) === 2, enc = wide ? 'utf16le' : 'latin1';
      if (R) {
        s.u32(t, 'len'); s.u32(t, 'n');
        if (t.len !== t.n) throw new Error(`string len ${t.len} != count ${t.n} at ${pos}`);
        s.bytes(t, 'b', t.n * (wide ? 2 : 1));
        o[k] = t.b.toString(enc); o[k + 'Hdr'] = t.h;
      } else {
        t.len = t.n = o[k].length;
        s.u32(t, 'len'); s.u32(t, 'n'); out.push(Buffer.from(o[k], enc));
      }
    },
    // n objects; n is coded with cnt (default s32) unless given. fn(item) codes one object.
    list(o, k, fn, cnt = s.i32, n) {
      if (n === undefined) n = cnt({ n: R ? 0 : o[k].length }, 'n');
      if (R) o[k] = [];
      for (let i = 0; i < n; i++) { const it = R ? {} : o[k][i]; fn(it); if (R) o[k].push(it); }
    },
    // s32 count + count x s32, or exactly n x s32 when n is given.
    ints(o, k, n) {
      if (n === undefined) n = s.i32({ n: R ? 0 : o[k].length }, 'n');
      if (R) o[k] = [];
      for (let i = 0; i < n; i++) s.i32(o[k], i);
    },
    obj(o, k, fn) { if (R) o[k] = {}; fn(o[k]); },
    get pos() { return pos; },
    done: () => Buffer.concat(out),
  };
  return s;
}

// Setting keys are djb2 hashes of the XML names (FUN_100f2010 -> FUN_100efda0).
const hash = name => { let h = 5381; for (const c of Buffer.from(name, 'latin1')) h = (Math.imul(h, 33) + c) | 0; return h; };
const NAMES = new Map(`KnockOutRange BulletBalletDamage NumMonsterBonanzaMonsters SpecialPowerPerTurn
NumberOfCannonsInCastle TimeForEachBubbleLetter ProbabilityToSummonMegaMonster DefenseBoostDuration MaxSpecialPowerAmount
HyperactMovementPenalty BattleStartWaitTime AdditionalTimeWhenUsingSpecialPower TimeForEachBubbleBase
AdditionalTimeAfterUsingTeleport MissionID LevelHeight CriticalHitProbability EggDamage LoserKickRange CastleHeight
HeroNameDisplaySpeed SpecialPowerUIActiveTimeLimit LevelWidth CriticalHitMovementPenalty TimeBetweenBubbles
RepelEffectivity CastleWidth CannonDamage ProbabilityToLayEgg SpeedBoostDuration BombDamage RepelRadius SpeedModifier
ProbabilityToSummonUltimateFoe ComboLengthRequirement BetterAreaLoserFactorAdder RocketJumpDamage BadAreaLoserFactorAdder
AttackBoostDuration InvisibilityDuration GoodAreaLoserFactorAdder LoserKickDamage ItemLivingTime HealingModifier
LaserEruptorDamage NumComboBlocksRequiredForFullSpecialPower BombRadius LoserFactorLimitToKick HealthAfterSecondDeath
FirstItemGenerationRound KnockOutDamage MaximumAmountOfChickens LoserFactorLimitToGrr AttackBaseDamage
CounterAttackBaseDamage LaserCannonDamage TubeMovementCost HeroNameDisplayDelay SpeedBoostWhenPlacingTileToCastle
SpecialPowerUIPassiveTimeLimit HealthAfterFirstDeath NukeDefaultDamage CriticalHitMultiplier ProbabilityToSummonChicken
NumWootLootItems NumberOfChickensRequiredForZombieConversion CannonBallsBounceAtCastles InstantBlockConverting
AllowNotRescuedAnimation TakeMeMode KickLoserMode DestructibleCombos AllowBlocksOverOwnedNormalBlocks
PrincessesAvoidCannonBalls HeroesDestroyBlocks AllowBlocksOverEnemyNormalBlocks AllowZeroCannons InstantPrincessRescue
PlayPlayerRescueVO UnitsCanAttackWalls ShowVictoryAnimation GenerateWallsIfStackedNormalBlocks
AllowBlocksOverOwnedComboBlocks AllowBlockPlacingOnCastles IsNumCannonsEqualToNumPrincesses CannonBallsDestroyWalls
CompletelyDestroyStackedBlocksWhenAttacked RewardPlayersForCapturingPrincesses AllowBlockConverting
GenerateWallsIfStackedComboBlocks BombMask WizardDamageMask NukeConversionMask FrogJumpMask BoostedFrogJumpMask
NukeDamageMask CannonBlastMask HandDamageMatrix RingOfFireMask RocketJumpDamageMask JumpMask BulletBalletMask TubeSuckMask
ConversionMask Tile0 Tile1 Tile2 Tile3 Tile4 Tile5 Tile6 HeavyTile ComboBuilderTile WallTile MissionNameStringID
MissionDescriptionStringID`.split(/\s+/).map(n => [hash(n), n]));

// Mask FUN_1000f900 (read FUN_100112b0): w, h, two ints, w*h ints.
function grid(s, o) {
  s.i32(o, 'w'); s.i32(o, 'h'); s.i32(o, 'f8'); s.i32(o, 'fc');
  s.ints(o, 'cells', o.w * o.h);
}

// Tile shape FUN_1006dce0 (read FUN_1006e130): w, h (each < 9), then count x {x, y} filled cells.
function tile(s, o) {
  s.i32(o, 'w'); s.i32(o, 'h');
  s.list(o, 'cells', c => { s.i32(c, 'x'); s.i32(c, 'y'); });
}

// rg::Hero FUN_1005c940 (read FUN_1005c9f0; XML FUN_10039110, FUN_1003b7a0). type is matched by
// FUN_10038940 to HERO_IDS. Values look like fixed point x100 (movement) and x256 (attack).
function hero(s, o) {
  s.str(o, 'type'); s.str(o, 'nameId');
  s.i32(o, 'movement'); s.i32(o, 'movementWithPrincess'); s.i32(o, 'f10'); s.i32(o, 'attack');
  s.i32(o, 'health'); s.i32(o, 'f1c');
  s.ints(o, 'f20');
  s.i32(o, 'specialSkill'); s.u8(o, 'f30'); s.i32(o, 'numberOfTurns');
}

// JoinInfo FUN_1005cbe0 (read FUN_1005cb00; mission "Player" node FUN_10039e70).
// type 0 = PLAYER (human), 2 = AI. slot = player index ("Number"; Game::read stores it there).
function joinInfo(s, o) {
  s.i32(o, 'type'); s.i32(o, 'slot'); s.i32(o, 'aiType'); s.i32(o, 'color');
  s.str(o, 'name'); s.u8(o, 'random');
  s.obj(o, 'hero', h => hero(s, h));
}

// The writer emits only the non-null entries of pointer arrays, so slot counts and entries are separate.
function game(s, o) {
  s.str(o, 'version');                                    // "Reset Generation v. 1.1.3" (FUN_10038a30)
  s.i32(o, 'randomSeed');                                 // +0x118 "Random_Seed" or timeGetTime()
  s.i32(o, 'mapWidth'); s.i32(o, 'mapHeight');            // +0x138, +0x13c
  // 5 settings maps (+0x00 ints, +0x24 bools, +0x48 masks, +0x6c tiles, +0x90 strings): sizes, then
  // entries {key, value} in hash-table order (FUN_10039c20). name is filled in when the key is known.
  const maps = [['ints', e => s.i32(e, 'value')], ['bools', e => s.u8(e, 'value')],
    ['masks', e => s.obj(e, 'value', v => grid(s, v))], ['tiles', e => s.obj(e, 'value', v => tile(s, v))],
    ['strings', e => s.str(e, 'value')]];
  const n = maps.map(([k]) => s.u32({ n: s.R ? 0 : o[k].length }, 'n'));
  maps.forEach(([k, fn], i) => s.list(o, k, e => {
    if (!s.R) e.key ??= hash(e.name);
    s.i32(e, 'key');
    if (s.R && NAMES.has(e.key)) e.name = NAMES.get(e.key);
    fn(e);
  }, null, n[i]));
  // +0x140 castles (FUN_1005c600, XML FUN_1003a680), at most 5, stored at index = owner.
  s.list(o, 'castles', e => {
    for (const k of ['owner', 'x', 'y', 'width', 'height', 'cannons']) s.i32(e, k);
    s.u8(e, 'princess');
  });
  s.obj(o, 'blocks', v => grid(s, v));                     // +0x14c "Blocks" layer, mapWidth x mapHeight
  s.obj(o, 'items', v => grid(s, v));                      // +0x168 "Items" layer
  // +0x190 level objects (FUN_1005c6e0, XML FUN_1003c130): owner, x, y, object type, unit type, color.
  s.list(o, 'objects', e => { for (const k of ['owner', 'x', 'y', 'objType', 'unitType', 'color']) s.i32(e, k); }, s.u32);
  s.i32(o, 'playerSlots');                                 // +0x1a8 array size; Game::read rejects > 5
  s.list(o, 'players', e => joinInfo(s, e));               // non-null JoinInfos
  s.i32(o, 'heroSlots');                                   // +0x19c array size; Game::read rejects > 256
  s.list(o, 'slotHeroes', e => { s.i32(e, 'slot'); s.obj(e, 'hero', h => hero(s, h)); });
  s.ints(o, 'movementCosts', 6);                           // +0xb8 "MovementCosts"
  s.ints(o, 'timeLimit');                                  // +0xc0 "TimeLimit" (FUN_1003a270), < 10
  s.list(o, 'heroes', e => hero(s, e), s.u32);             // +0x204 heroes.xml; FUN_1003a120 looks up picks here
  s.list(o, 'monsters', e => hero(s, e));                  // +0x214 monsters.xml (non-null of 9)
  s.obj(o, 'princess', h => hero(s, h));                   // +0x21c
  s.ints(o, 'itemsOnMatchStart'); s.ints(o, 'itemsOnMatchStartPerPlayers'); // +0xd8, +0xf0 (FUN_1003aa80)
  s.ints(o, 'itemGeneration'); s.ints(o, 'itemGenerationPerPlayers');       // +0xcc, +0xe4 (FUN_1003acc0)
  s.i32(o, 'environment');                                 // +0x120 "Environment" 0..4
  // +0x188: 4 arrays sized w, h, w, h by FUN_1003f7c0, but both writer and reader use mapWidth for all 4.
  if (s.R) o.f188 = [];
  for (let i = 0; i < 4; i++) s.ints(o.f188, i, o.mapWidth);
  s.bytes(o, 'triggers', s.u32({ n: s.R ? 0 : o.triggers.length }, 'n')); // +0x1c0 "Triggers" data, < 50000
  // RNG FUN_100f31a0 (read FUN_100f3230 requires the 11): i, j, 11, 11 x u32 lagged-Fibonacci state.
  s.obj(o, 'rng', r => {
    s.i32(r, 'i'); s.i32(r, 'j');
    if (s.i32({ n: 11 }, 'n') !== 11) throw new Error('bad rng size');
    if (s.R) r.state = [];
    for (let i = 0; i < 11; i++) s.u32(r.state, i);
  });
  return o;
}

const HERO_IDS = { HEDGEHOG: 0, PLUMBER: 1, CYBORG: 2, LEVEL_50_ELF: 3, BABE_GUNNER: 4, MONSTER_TRAINER: 5,
  SCIFI_KNIGHT: 6, NINJA: 7, DR_LOVEBOMBER: 8, AGGRESSOR: 9 };

// RNG draw FUN_100f2ff0: s[i] = rotl(s[i] + s[j], 13); i, j step down mod 11.
function rngNext(r) {
  const v = (r.state[r.i] + r.state[r.j]) >>> 0;
  r.state[r.i] = ((v << 13) | (v >>> 19)) >>> 0;
  const out = r.state[r.i];
  r.i = (r.i + 10) % 11; r.j = (r.j + 10) % 11;
  return out;
}
// RNG seed FUN_100f30a0: xorshift fill, i = 0, j = 7, then 9 draws.
function seedRng(seed) {
  let x = seed >>> 0 || 0xffffffff;
  const r = { i: 0, j: 7, state: [] };
  for (let k = 0; k < 11; k++) { x ^= x << 13; x >>>= 0; x ^= x >>> 17; x ^= x << 5; x >>>= 0; r.state.push(x); }
  for (let k = 0; k < 9; k++) rngNext(r);
  return r;
}

// Returns the Game object; .size = bytes consumed (buf may hold trailing junk).
function parseGame(buf) {
  const s = stream(buf);
  const o = game(s, {});
  o.size = s.pos;
  return o;
}
function writeGame(o) { const s = stream(); game(s, o); return s.done(); }

// Snapshot FUN_10006a80: u32 0xDEADBEEF, then 3 sized sections, u8 +0x28, u8 +0x29, s32 +0x30.
// battlefield = +0x14 (FUN_1001aae0), players = +0x18 (FUN_10024170), third = +0x1c units (FUN_100275a0).
function snapshot(s, o) {
  if (s.u32(o, 'magic') !== 0xdeadbeef) throw new Error('bad snapshot magic');
  for (const k of ['battlefield', 'players', 'third']) s.bytes(o, k, s.i32(o, k + 'Size'));
  s.u8(o, 'b28'); s.u8(o, 'b29'); s.i32(o, 'i30');
  return o;
}
function parseSnapshot(buf) {
  const s = stream(buf);
  const o = snapshot(s, {});
  o.size = s.pos;
  return o;
}
function writeSnapshot(o) {
  const s = stream();
  snapshot(s, { ...o, magic: 0xdeadbeef, battlefieldSize: o.battlefield.length, playersSize: o.players.length,
    thirdSize: o.third.length });
  return s.done();
}

const parseJoinInfo = buf => { const o = {}; joinInfo(stream(buf), o); return o; };
const writeHero = o => { const s = stream(); hero(s, o); return s.done(); };
const writeJoinInfo = o => { const s = stream(); joinInfo(s, o); return s.done(); };
// mt::String as written by the client (hdr 1 = 8-bit, refcount 1).
const writeString = v => { const s = stream(); s.str({ v }, 'v'); return s.done(); };

module.exports = { parseGame, writeGame, parseSnapshot, writeSnapshot, parseJoinInfo, writeJoinInfo, writeHero, writeString,
  HERO_IDS, hash, seedRng, rngNext };
