// Turns one rgtrace capture pair into a battle template for the server.
// Usage: node tools/rgtrace/import-template.js <NN_game.bin> <NN_snapshot.bin> <name>
// Use the Game::write capture taken at ServerBattleLogic init and the first snapshot after it
// (the one whose players section is empty). Writes data/templates/<name>.game and .snap.
const fs = require('fs');
const path = require('path');
const g = require('../../server/gameblob');

const [gameFile, snapFile, name] = process.argv.slice(2);
if (!name) { console.error('usage: import-template <game.bin> <snapshot.bin> <name>'); process.exit(1); }

const game = g.parseGame(fs.readFileSync(gameFile));
const snap = g.parseSnapshot(fs.readFileSync(snapFile));
const out = path.join(__dirname, '..', '..', 'data', 'templates');
fs.mkdirSync(out, { recursive: true });
fs.writeFileSync(path.join(out, `${name}.game`), g.writeGame(game));
fs.writeFileSync(path.join(out, `${name}.snap`), g.writeSnapshot(snap));
const mission = game.ints.find(e => e.name === 'MissionID')?.value;
console.log(`${name}: mission ${mission}, ${game.castles.length} castles, ${game.players.length} join infos, snapshot ${snap.size} bytes`);
