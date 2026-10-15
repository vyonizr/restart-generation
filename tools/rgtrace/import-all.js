// Imports every new level from an rgtrace session as a battle template.
// Usage: node tools/rgtrace/import-all.js <trace.log> <capture dir>
// For each "ServerBattleLogic init" in the log it pairs the next Game::write capture with the next
// snapshot, and skips levels already in data/templates (same mission and block layout).
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const g = require('../../server/gameblob');

const [log, dir] = process.argv.slice(2);
if (!dir) { console.error('usage: import-all <trace.log> <capture dir>'); process.exit(1); }
const out = path.join(__dirname, '..', '..', 'data', 'templates');
fs.mkdirSync(out, { recursive: true });

const mission = game => game.ints.find(e => e.name === 'MissionID')?.value;
const levelKey = game => `${mission(game)}_` + crypto.createHash('sha1')
  .update(JSON.stringify([game.mapWidth, game.mapHeight, game.blocks, game.castles.map(c => [c.x, c.y])]))
  .digest('hex').slice(0, 8);

const known = new Set(fs.readdirSync(out).filter(f => f.endsWith('.game'))
  .map(f => levelKey(g.parseGame(fs.readFileSync(path.join(out, f))))));

let afterInit = false, game = null, added = 0;
for (const line of fs.readFileSync(log, 'utf8').split(/\r?\n/)) {
  if (line.includes('ServerBattleLogic init')) { afterInit = true; game = null; continue; }
  const file = line.match(/wrote .*[\\/]([^\\/]+\.bin)/)?.[1];
  if (!afterInit || !file) continue;
  if (file.endsWith('_game.bin')) { game = file; continue; }
  if (!game) continue;
  afterInit = false;
  const gm = g.parseGame(fs.readFileSync(path.join(dir, game)));
  const key = levelKey(gm);
  if (known.has(key)) continue;
  known.add(key);
  const snap = g.parseSnapshot(fs.readFileSync(path.join(dir, file)));
  const name = `m${key}_${gm.castles.length}p`;
  fs.writeFileSync(path.join(out, `${name}.game`), g.writeGame(gm));
  fs.writeFileSync(path.join(out, `${name}.snap`), g.writeSnapshot(snap));
  console.log(`added ${name} (${gm.mapWidth}x${gm.mapHeight}, ${gm.castles.length} castles)`);
  added++;
}
console.log(`${added} new levels, ${known.size} total`);
