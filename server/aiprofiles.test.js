// Self-check for the Bots' AI profile changes: node server/aiprofiles.test.js
// Runs on a small pak built here, so it needs no game files.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const zlib = require('zlib');
const pak = require('./pak');
const ai = require('./aiprofiles');

const XML = `<AIProperties>
<!-- <Property type="OLD">  7</Property> -->
<Property type="A">\t\t4</Property>
<Property type="B">  -3 </Property>
<Property type="A">9</Property>
</AIProperties>`;

// A pak with one deflated entry per name (like the game's) and one stored entry.
function makePak(entries) {
  const rows = [], blobs = [];
  let offset = 8 + 17 * entries.length;
  for (const [name, text, deflated] of entries) {
    const raw = Buffer.from(text), data = deflated ? zlib.deflateSync(raw) : raw;
    const row = Buffer.alloc(17);
    row.writeUInt32LE(pak.hash(name), 0); row.writeUInt32LE(data.length, 4); row.writeUInt32LE(raw.length, 8);
    row[12] = deflated ? 1 : 0; row.writeUInt32LE(offset, 13);
    rows.push(row); blobs.push(data); offset += data.length;
  }
  const head = Buffer.alloc(8);
  head.writeUInt32LE(8 + 17 * entries.length, 0); head.writeUInt32LE(entries.length, 4);
  return new Uint8Array(Buffer.concat([head, ...rows, ...blobs]));
}
const names = ['AISD', 'AISGTP', 'AISMT'].map(p => `data/gameplay/ai/${p}.xml`);
const game = () => ({ 'gameplay.pak': makePak([[names[0], XML, true], [names[1], XML, false], [names[2], XML, true], ['data/other.xml', 'keep', true]]), 'x.pak': new Uint8Array([1]) });
const text = (g, name) => Buffer.from(pak.read(g['gameplay.pak'], name)).toString();

// A changed value keeps the file's own spacing, is set everywhere the key repeats, and skips commented-out keys.
assert.strictEqual(ai.setProperty(XML, 'AISD', 'A', 5), XML.replace('>\t\t4<', '>\t\t5<').replace('>9<', '>5<'));
assert.strictEqual(ai.setProperty(XML, 'AISD', 'B', 0).includes('>  0 <'), true);
assert.throws(() => ai.setProperty(XML, 'AISD', 'OLD', 1), /no property OLD/);
assert.throws(() => ai.setProperty(XML, 'AISD', 'NOPE', 1), /no property NOPE/);

// The rebuilt pak gives back the changed profiles, the other entries as they were, and leaves the original alone.
const g = game(), before = Buffer.from(g['gameplay.pak']);
const out = ai.apply(g, [{ profile: 'AISD', key: 'A', value: 11, why: 't' }, { profile: 'AISGTP', key: 'B', value: 2, why: 't' }]);
assert.strictEqual(text(out, names[0]), ai.setProperty(XML, 'AISD', 'A', 11));
assert.strictEqual(text(out, names[1]), ai.setProperty(XML, 'AISGTP', 'B', 2)); // a stored entry
assert.strictEqual(text(out, names[2]), XML);
assert.strictEqual(text(out, 'data/other.xml'), 'keep');
assert.strictEqual(out['x.pak'], g['x.pak']);
assert.ok(before.equals(Buffer.from(g['gameplay.pak'])));
// A second round of changes on the rebuilt pak still reads back correctly.
assert.strictEqual(text(ai.apply(out, [{ profile: 'AISD', key: 'B', value: 6, why: 't' }]), names[0]).includes('>  6 <'), true);

// No changes: the game's files come back untouched.
assert.strictEqual(ai.apply(g, []), g);

// Bad changes fail loudly: a key the XML lacks, a profile that must stay stock, a missing why.
assert.throws(() => ai.apply(game(), [{ profile: 'AISD', key: 'NOPE', value: 1, why: 't' }]), /AISD has no property NOPE/);
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'bot-ai-'));
const write = d => { const f = path.join(tmp, 'x.json'); fs.writeFileSync(f, JSON.stringify(d)); return f; };
assert.throws(() => ai.load(write([{ profile: 'AISF', key: 'A', value: 1, why: 't' }])), /AISF isn't a profile/);
assert.throws(() => ai.load(write([{ profile: 'AISD', key: 'A', value: 1 }])), /needs a key/);
assert.throws(() => ai.load(write([{ profile: 'AISD', key: 'A', value: 1.5, why: 't' }])), /needs a key/);
assert.deepStrictEqual(ai.load(), JSON.parse(fs.readFileSync(path.join(__dirname, 'bot-ai.json'), 'utf8'))); // the committed file is valid
fs.rmSync(tmp, { recursive: true });
console.log('bot ai profiles ok');
