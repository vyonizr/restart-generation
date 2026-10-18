// The Bots' retuned AI profiles (CONTEXT.md "AI profile", docs/adr/0010). server/bot-ai.json lists changes as
// { profile, key, value, why }. They are applied to the AIS*.xml in the player's own gameplay.pak, and the changed
// pak exists only in memory, for a Bot's engine. The files on disk and people's engines are untouched.
const fs = require('fs');
const path = require('path');
const pak = require('./pak');

const PAK = 'gameplay.pak';
// AISMT (mind-tricked) and AISF (frogged) play badly or oddly on purpose and stay as the game made them.
const PROFILES = ['AISD', 'AISGTP', 'AISGH', 'AISROP'];
const file = profile => `data/gameplay/ai/${profile}.xml`;

function load(deltaFile = path.join(__dirname, 'bot-ai.json')) {
  const deltas = JSON.parse(fs.readFileSync(deltaFile, 'utf8'));
  for (const d of deltas) {
    if (!PROFILES.includes(d.profile)) throw new Error(`bot-ai.json: ${d.profile} isn't a profile Bots may change (${PROFILES.join(', ')})`);
    if (!/^\w+$/.test(d.key) || !Number.isInteger(d.value) || !d.why) throw new Error(`bot-ai.json: ${d.profile} ${d.key}: needs a key, an integer value and a why`);
  }
  return deltas;
}

// Sets `key` in one profile's XML. A property inside a comment doesn't count; one that the file repeats is set
// everywhere, since the engine keeps the last. Throws if the key isn't a live property.
function setProperty(xml, profile, key, value) {
  const re = new RegExp(`(<Property type="${key}">\\s*)-?\\d+(\\s*</Property>)`, 'g');
  let hits = 0;
  const out = xml.replace(re, (m, head, tail, at) => {
    if (xml.lastIndexOf('<!--', at) > xml.lastIndexOf('-->', at)) return m; // inside a comment
    hits++;
    return head + value + tail;
  });
  if (!hits) throw new Error(`bot-ai.json: ${profile} has no property ${key}`);
  return out;
}

// The game's files with `deltas` applied, or `game` itself when there are none. Throws if a key isn't in the game's XML.
function apply(game, deltas = load()) {
  if (!deltas.length) return game;
  if (!game[PAK]) throw new Error(`bot-ai.json: the game files have no ${PAK}`);
  let packed = game[PAK];
  for (const profile of new Set(deltas.map(d => d.profile))) {
    const raw = pak.read(packed, file(profile));
    if (!raw) throw new Error(`bot-ai.json: ${PAK} has no ${file(profile)}`);
    let xml = Buffer.from(raw).toString('utf8');
    for (const d of deltas.filter(d => d.profile === profile)) xml = setProperty(xml, profile, d.key, d.value);
    packed = pak.replace(packed, file(profile), Buffer.from(xml, 'utf8'));
  }
  return { ...game, [PAK]: packed };
}

module.exports = { load, apply, setProperty, PROFILES };
