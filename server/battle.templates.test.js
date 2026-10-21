// Self-check for loading battle templates from data/templates and data/battle-templates.zip: node server/battle.templates.test.js
// The templates are made up (battle.fixture.js) and the zips are built here.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const battle = require('./battle');
const { template } = require('./battle.fixture');
const g = require('./gameblob');

const filesOf = (seats, name) => { const t = template(seats, name); return { [`${name}.game`]: g.writeGame(t.game), [`${name}.snap`]: g.writeSnapshot(t.snapshot) }; };

// A zip as zip tools write it: a local header and data per entry, then the central directory and its end record.
function zip(entries, { deflate = true } = {}) {
  const locals = [], central = [];
  let offset = 0;
  for (const [name, bytes] of Object.entries(entries)) {
    const data = deflate ? zlib.deflateRawSync(bytes) : bytes, nameBuf = Buffer.from(name), crc = zlib.crc32(bytes);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(deflate ? 8 : 0, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(bytes.length, 22); local.writeUInt16LE(nameBuf.length, 26);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0); entry.writeUInt16LE(20, 4); entry.writeUInt16LE(20, 6); entry.writeUInt16LE(deflate ? 8 : 0, 10);
    entry.writeUInt32LE(crc, 16); entry.writeUInt32LE(data.length, 20); entry.writeUInt32LE(bytes.length, 24); entry.writeUInt16LE(nameBuf.length, 28);
    entry.writeUInt32LE(offset, 42);
    locals.push(local, nameBuf, data); central.push(entry, nameBuf);
    offset += local.length + nameBuf.length + data.length;
  }
  const dir = Buffer.concat(central), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(central.length / 2, 8); end.writeUInt16LE(central.length / 2, 10);
  end.writeUInt32LE(dir.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, dir, end]);
}

// A data folder holding the given zip and templates folder; returns what loadTemplates reads from it and what it warned.
function load({ zipBytes, folder }) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rg-templates-'));
  if (zipBytes) fs.writeFileSync(path.join(dir, 'battle-templates.zip'), zipBytes);
  if (folder) { fs.mkdirSync(path.join(dir, 'templates')); for (const [f, b] of Object.entries(folder)) fs.writeFileSync(path.join(dir, 'templates', f), b); }
  const warn = console.warn, warnings = [];
  console.warn = m => warnings.push(m);
  try { return { seats: Object.fromEntries(battle.loadTemplates(dir).map(t => [t.name, t.seats])), warnings }; }
  finally { console.warn = warn; fs.rmSync(dir, { recursive: true }); }
}

// A zip of the templates folder (entries under templates/, deflated), the same with the backslash paths Windows PowerShell's
// Compress-Archive writes, and a zip of its files (at the top, stored) all load, and nothing but .game and .snap pairs is
// taken from them.
const pairs = { ...filesOf(2, 'duel'), ...filesOf(4, 'four') };
const under = sep => Object.fromEntries(Object.entries(pairs).map(([f, b]) => [`templates${sep}${f}`, b]));
assert.deepEqual(load({ zipBytes: zip({ ...under('/'), 'templates/notes.txt': Buffer.from('x') }) }).seats, { duel: 2, four: 4 });
assert.deepEqual(load({ zipBytes: zip(under('\\')) }).seats, { duel: 2, four: 4 });
assert.deepEqual(load({ zipBytes: zip(pairs, { deflate: false }) }).seats, { duel: 2, four: 4 });
assert.deepEqual(load({ zipBytes: zip({ ...filesOf(3, 'three'), 'lonely.game': filesOf(2, 'lonely')['lonely.game'] }) }).seats, { three: 3 });

// The folder and the zip add up, and a name in both is taken from the folder, with a warning when the copies differ.
const both = load({ zipBytes: zip({ ...filesOf(2, 'duel'), ...filesOf(2, 'same') }), folder: { ...filesOf(3, 'trio'), ...filesOf(4, 'same') } });
assert.deepEqual(both.seats, { duel: 2, same: 4, trio: 3 });
assert.equal(both.warnings.length, 1);
// A zip made from the folder (the backup the docs describe) is the same templates again: nothing to warn about.
const backup = load({ zipBytes: zip(under('/')), folder: pairs });
assert.deepEqual([backup.seats, backup.warnings], [{ duel: 2, four: 4 }, []]);

// A zip that can't be read is skipped with a warning; the folder's templates still load.
for (const bad of [Buffer.from('not a zip at all'), zip(pairs).subarray(0, 200), zip(pairs).subarray(150)]) {
  const r = load({ zipBytes: bad, folder: filesOf(3, 'trio') });
  assert.deepEqual(r.seats, { trio: 3 });
  assert(r.warnings.length >= 1);
}

// Neither: no templates, and no error.
assert.deepEqual(load({}).seats, {});

console.log('battle templates ok');
