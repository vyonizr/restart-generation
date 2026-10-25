// Rewrites wording that names the original client's classes, an example domain that holds the game's name, and the real names of the
// source's authors (docs/LEGAL.md, ADR 0018). tools/publish.mjs applies scrub() to every file of every published commit that
// scrubbable() accepts, and leaves the DROP folders out. Run it by hand in this checkout to see what it would change (then git diff).
// It only changes comments and prose. It never touches docs/re, which describes the original on purpose.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

// [pattern, replacement]. Every pattern is specific, so that it can't match anything else.
const EOL = '\\r?\\n';
export const RULES = [
  // shared/snap.js
  [new RegExp(`// Browser port of the Java SNAP Mobile client[^\\n]*${EOL}// com\\.nokia\\.sm\\.net\\.ServerComm\\)\\.[^\\n]*${EOL}// POST to the gateway\\.[^\\n]*${EOL}// NativeSNAPMobileEventListener callbacks between ticks, as the Java client did\\.`),
    "// The browser's SNAP Mobile client, as this server speaks the protocol (docs/protocol.md): every request is one HTTP POST, and\n// events arrive through the long-poll command. It implements the functions the engine's networking interface calls and runs the\n// engine's event callbacks between ticks."],
  [/\/\/ Password scrambling of ServerComm \(class i\): rotr\(b, k & 7\) \^ k with a key chosen by K\./, '// Password scrambling: rotr(b, k & 7) ^ k with a key chosen by K (server/snap.js).'],
  [/\/\/ Errors from the server \(SNAPMobileClient\.processServerError\)\./, '// What a failed reply means for the session.'],
  [/\/\/ ---- action queue \(the Java client's action thread\) ----/, '// ---- action queue ----'],
  [/\/\/ Event long-poll \(ServerComm's listener thread\)\./, '// The event long-poll, repeated while the session lasts.'],
  [/\/\/ As in LoginScreen\.login\(\): submitting only hides/, '// Submitting only hides'],
  [/ \/\/ LoginScreen\.isLoggingIn\(\) is "controls hidden"/, ' // the dialog is hidden: the engine is logging in'],
  [/ \(the Java client did this in tickRG\)/, ''],
  // server/snap.js and its test
  [new RegExp(`// SNAP Mobile 1\\.4\\.4 wire codec, recovered from lib/rg-signed\\.jar${EOL}// \\(classes ah, i, p, r, k\\)\\. See docs/protocol\\.md\\.`),
    '// SNAP Mobile 1.4.4 wire codec: what a client and a gateway send each other, as observed on the wire and written down in\n// docs/protocol.md.'],
  [/Per-command flags from class i:/, 'Per-command flags:'],
  [/Frame header \(class ah\):/, 'Frame header:'],
  [/Byte layout written by the client's ah\.a\(DataOutputStream\): a hello with seq 1\./, 'Byte layout of a hello frame with seq 1.'],
  [/(Login: P2 is scrambled with key K, then base64) \(client class i\)\./, '$1.'],
  // the page, the host and the docs
  [/ \(rg\.screens\.LoginScreen in the Java client\)/g, ''],
  [/, as the Java client's keyEventQueue was/, ''],
  [/ \(SNAPMobileClient\.netBuffer\)/, ''],
  [/the way the Java applet did \(rg\.ResetGeneration\.initRG \/ tickRG\)/, 'as the original Java client hosts it'],
  [/, but it's a port of the Java client's SNAP code, so the engine sees/, ' from docs/protocol.md, so the engine sees'],
  // an example domain that held the game's name
  [/\bresetgeneration\.[a-z0-9-]+\.[a-z]{2,}/g, 'play.example.com'],
  // The original client's password keys (64 uppercase hex digits in quotes, in older server/snap.js and shared/snap.js): each becomes a
  // digest of itself, so that old commits still unscramble what they scramble but no longer match an original client.
  [/'[0-9A-F]{64}'/g, m => `'${crypto.createHash('sha256').update(m.slice(1, -1)).digest('hex').toUpperCase()}'`],
  // design and branch wording that points at the rights holder's site
  [/The world is inspired by RedLynx: near-black/g, 'The palette is near-black'],
  [/RedLynx Crimson/g, 'Crimson'],
  [/OWN-WORLD: Inspired by RedLynx, dark only\./g, 'OWN-WORLD: A dark stage, dark only.'],
  [/ \(`\.scratch\/redlynx-ui\/issues\/[^`]*`\)/g, ''],
  [/ The prototype is on branch `prototype\/redlynx-direction`\./g, ''],
  [/Two of them \(`research\/redlynx-style`, `prototype\/redlynx-direction`\) hold screenshots of RedLynx's website and must never be\./g, 'Some of them hold reference screenshots of third-party websites and must never be.'],
  [/two of them hold screenshots of RedLynx's website\./g, 'some of them hold reference screenshots of third-party websites.'],
  [/two branches hold screenshots of RedLynx's website,/g, 'some branches hold reference screenshots of third-party websites,'],
];

// Folders that stay in the working checkout but not in the published history: a design critique that says the page's look is borrowed
// from the rights holder's site.
export const DROP = ['.impeccable/critique'];

export function scrub(text, names = [], to = '') {
  let out = text;
  for (const [pattern, replacement] of RULES) out = out.replace(pattern, replacement);
  for (const name of names) out = out.split(name).join(to);
  return out;
}

const TEXT = /\.(js|mjs|cjs|md|svelte|json|html|css|yml|yaml|c|java|sh|txt|svg|example)$|(^|\/)(Caddyfile|Dockerfile|pre-commit)$/i;

// Whether a file at this repository path gets scrubbed.
export const scrubbable = rel => TEXT.test(rel) && !rel.startsWith('docs/re/') && rel !== 'tools/scrub-tree.mjs' && rel !== 'tools/legal-check.test.mjs';

if (import.meta.url === new URL(`file:///${process.argv[1]?.replace(/\\/g, '/')}`).href) {
  // Only the files git has in this checkout's index, so that ignored folders (tmp/, other worktrees) are left alone.
  const listed = spawnSync('git', ['ls-files', '-z'], { cwd: process.cwd(), encoding: 'utf8', maxBuffer: 1 << 28 });
  if (listed.status !== 0) { console.error('scrub-tree: not a git checkout'); process.exit(1); }
  const root = process.cwd();
  let changed = 0;
  for (const rel of listed.stdout.split('\0').filter(Boolean)) {
    if (!scrubbable(rel)) continue;
    const file = path.join(root, rel);
    if (!fs.existsSync(file)) continue;
    const text = fs.readFileSync(file, 'utf8'), next = scrub(text);
    if (next !== text) { fs.writeFileSync(file, next); changed++; if (process.argv.includes('--verbose')) console.log('scrubbed', rel); }
  }
  console.log(`scrub-tree: ${changed} change(s)`);
}
