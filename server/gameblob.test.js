// Self-check for the Game blob and snapshot codec against captured client data: node server/gameblob.test.js
// RG_CAPTURES = folder with NN_game.bin / NN_snapshot.bin and lengths.txt ("file validLength" per line).
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const g = require('./gameblob');

const dir = process.env.RG_CAPTURES;
if (!dir) { console.log('set RG_CAPTURES to a folder of captures (see tools/rgtrace)'); process.exit(1); }
const lengths = {};
try {
  for (const [f, n] of fs.readFileSync(path.join(dir, 'lengths.txt'), 'utf8').split(/\r?\n/).map(l => l.trim().split(/\s+/)))
    if (n) lengths[f] = +n;
} catch { /* no lengths.txt: only the round-trip is checked */ }

if (!fs.existsSync(dir)) { console.log(`no captures in ${dir}; set RG_CAPTURES (see tools/rgtrace)`); process.exit(0); }
const files = fs.readdirSync(dir).filter(f => /_(game|snapshot)\.bin$/.test(f)).sort();
assert(files.length, `no captures in ${dir}`);
for (const f of files) {
  const buf = fs.readFileSync(path.join(dir, f));
  const isGame = f.endsWith('_game.bin');
  const o = isGame ? g.parseGame(buf) : g.parseSnapshot(buf);
  if (f in lengths) assert.equal(o.size, lengths[f], `${f}: consumed ${o.size}, valid ${lengths[f]}`);
  assert((isGame ? g.writeGame(o) : g.writeSnapshot(o)).equals(buf.subarray(0, o.size)), `${f}: round-trip differs`);
  if (isGame) {
    // The RNG is the seed from FUN_100f30a0 plus one draw.
    const r = g.seedRng(o.randomSeed);
    g.rngNext(r);
    assert.deepEqual(r, o.rng, `${f}: rng is not seed + 1 draw`);
    assert.deepEqual(o.heroes.map(h => h.type).sort(), Object.keys(g.HERO_IDS).sort());
  }
  console.log(`ok ${f} ${o.size}${f in lengths ? '' : ' (length not listed)'}`);
}

// An online-table template: no JoinInfos, edited seed. It must still parse and re-emit identically.
const game = g.parseGame(fs.readFileSync(path.join(dir, files.find(f => f.endsWith('_game.bin')))));
Object.assign(game, { playerSlots: 3, players: [], randomSeed: 12345, rng: g.seedRng(12345) });
const out = g.writeGame(game);
const back = g.parseGame(out);
assert.equal(back.size, out.length);
assert.deepEqual(back.players, []);
assert(g.writeGame(back).equals(out));
assert.equal(game.ints.find(e => e.name === 'MissionID').key, g.hash('MissionID'));
console.log('ok template');
