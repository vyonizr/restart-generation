// Keeps things out of the repository that raise the legal risk of publishing it (docs/LEGAL.md).
//   node tools/legal-check.mjs                 every tracked file, and every file that git would add
//   node tools/legal-check.mjs --staged        only what is staged (the pre-commit hook)
//   node tools/legal-check.mjs --history [rev] every file of every commit that rev reaches (default HEAD)
//   node tools/legal-check.mjs --install-hook  make git run this before each commit here (core.hooksPath = .githooks)
//   (rev may be a range, a..b: tools/publish.mjs checks only the commits it is about to push)
// Exit code 1 if anything is refused. It cannot recognise a screenshot or a recording of the game; docs/LEGAL.md says what a
// contributor must not add, and an exception goes in tools/legal-allow.json with its provenance.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const allow = JSON.parse(fs.readFileSync(path.join(root, 'tools', 'legal-allow.json'), 'utf8'));

// Files of the game and of the platform it ran on, whatever their folder.
const GAME_FILE = /\.(dll|dylib|jar|class|pak|gfx|spc|pal|ass|lng|snap|game|exe|sis|sisx|jad|apk|ndl|zip|7z|rar)$/i;
// Folders that hold what is derived from the game or from a player's machine. They are in .gitignore; this is the backstop.
const FORBIDDEN_DIR = /^(analysis|data|tmp|node_modules|web\/dist)\//;
// Anything that is not text must be listed in legal-allow.json.
const MEDIA = /\.(png|jpe?g|gif|webp|avif|bmp|svg|ico|mp4|webm|mov|mp3|ogg|wav|flac|woff2?|ttf|otf)$/i;
// Output of a decompiler or a disassembler, as opposed to a note about it. Ghidra's own names for functions and addresses (FUN_100f94a0)
// may be cited to locate something; its pseudocode may not be pasted.
const DECOMPILED = [/\bundefined[1248]?\b/, /\b(?:param|local|in|unaff)_[0-9A-Za-z]+\b/, /\b[iuc]Var\d+\b/, /\bLAB_[0-9a-f]{8}\b/, /\bDAT_[0-9a-f]{8}\b/, /\bpcVar\d+\b/, /\bExceptionList\b/];
const DISASSEMBLY = /^\s*(?:0x)?[0-9A-Fa-f]{6,8}:?\s+(?:[0-9A-Fa-f]{2}\s+){2,}(?:mov|push|pop|call|jmp|lea|cmp|xor|add|sub|ret)\b/m;
const GHIDRA_DUMP = /^\/\/ ==== \S+ @ [0-9a-f]{6,8}\s*$/m;
const HEX_BLOB = /\b[0-9A-Fa-f]{64,}\b/;
const SECRET = [/-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\b(?:RG_DISCORD_CLIENT_SECRET|RG_ADMIN_TOKEN)=[A-Za-z0-9_./+-]{12,}/, /\bghp_[A-Za-z0-9]{30,}\b/, /\bxox[bap]-[A-Za-z0-9-]{10,}/];
const LOCAL_PATH = /\b[A-Z]:\\Users\\[^\\\s]+|\/home\/[a-z][a-z0-9_-]{2,}\//;
const LARGE = 200 * 1024;

// What is wrong with a path alone, or null.
export function checkPath(file, size = 0) {
  if (FORBIDDEN_DIR.test(file)) return 'is in a folder that holds game-derived or local material';
  if (file === '.env' || /^\.env\.(?!example$)/.test(file)) return 'is a local settings file with secrets';
  if (GAME_FILE.test(file)) return 'is a game or platform file type';
  if (MEDIA.test(file) && !allow.media[file]) return 'is media that is not listed in tools/legal-allow.json with where it comes from';
  if (size > LARGE && !allow.large[file]) return `is ${Math.round(size / 1024)} KB; large files need an entry in tools/legal-allow.json`;
  return null;
}

// What is wrong with a text file's content, or null.
export function checkText(file, text) {
  if (allow.samples?.[file]) return null;
  if (SECRET.some(r => r.test(text))) return 'contains something that looks like a secret';
  if (LOCAL_PATH.test(text)) return 'contains a path on someone\'s own machine';
  if (GHIDRA_DUMP.test(text)) return 'is a dump of decompiled functions';
  const hits = DECOMPILED.filter(r => r.test(text)).length;
  if (hits >= 3) return 'looks like decompiler output (Ghidra pseudocode names)';
  if (DISASSEMBLY.test(text)) return 'looks like a disassembly listing';
  // A digest that is labelled as one (sha256:…) is a checksum, not data.
  if (HEX_BLOB.test(text.replace(/\bsha(?:1|256|384|512)[:=\s"]+[0-9A-Fa-f]+/gi, '')) && !allow.hex[file]) return 'contains a long hex string; if it is a protocol constant, list the file in tools/legal-allow.json';
  return null;
}

const git = (...args) => { const r = spawnSync('git', args, { cwd: root, encoding: 'buffer', maxBuffer: 1 << 28 }); if (r.status !== 0) throw new Error(`git ${args.join(' ')}: ${r.stderr.toString()}`); return r.stdout; };
const lines = buf => buf.toString('utf8').split('\n').filter(Boolean);
const isText = buf => !buf.subarray(0, 8000).includes(0);

// Checks one file's name, size and, if it is text, content. `read` gives its bytes.
function checkFile(file, read, size) {
  const bad = checkPath(file, size);
  if (bad) return bad;
  if (MEDIA.test(file)) return null; // allowlisted media is not text
  const buf = read();
  if (!isText(buf)) return 'is a binary file that is not listed in tools/legal-allow.json';
  return checkText(file, buf.toString('utf8'));
}

function run(argv) {
  if (argv.includes('--install-hook')) {
    const r = spawnSync('git', ['config', 'core.hooksPath', '.githooks'], { cwd: root });
    console.log(r.status === 0 ? 'git will run tools/legal-check.mjs --staged before each commit.' : 'not a git checkout: nothing installed.');
    return r.status === 0 ? 0 : 1;
  }
  const problems = [];
  if (argv.includes('--history')) {
    const rev = argv[argv.indexOf('--history') + 1]?.startsWith('--') ? 'HEAD' : argv[argv.indexOf('--history') + 1] || 'HEAD';
    const commits = lines(git('rev-list', rev));
    const seen = new Set(); // path@blob, so that a file that never changes is read once
    for (const c of commits) {
      for (const row of git('ls-tree', '-r', '-l', '-z', c).toString('utf8').split('\0').filter(Boolean)) {
        const m = /^\d+ blob ([0-9a-f]+)\s+(\d+|-)\t(.*)$/.exec(row);
        if (!m) continue;
        const [, blob, size, file] = m, key = `${file}@${blob}`;
        if (seen.has(key)) continue;
        seen.add(key);
        const bad = checkFile(file, () => git('cat-file', 'blob', blob), Number(size));
        if (bad) problems.push(`${file} (in ${c.slice(0, 8)}) ${bad}`);
      }
    }
    console.log(`checked ${seen.size} file versions in ${commits.length} commits`);
  } else {
    const staged = argv.includes('--staged');
    const files = staged
      ? lines(git('diff', '--cached', '--name-only', '--diff-filter=ACMR'))
      : [...new Set([...lines(git('ls-files')), ...lines(git('ls-files', '--others', '--exclude-standard'))])];
    for (const file of files) {
      const full = path.join(root, file);
      if (!fs.existsSync(full)) continue;
      const read = () => (staged ? git('show', `:${file}`) : fs.readFileSync(full));
      const bad = checkFile(file, read, fs.statSync(full).size);
      if (bad) problems.push(`${file} ${bad}`);
    }
    console.log(`checked ${files.length} files${staged ? ' (staged)' : ''}`);
  }
  for (const p of problems) console.error(`  refused: ${p}`);
  if (problems.length) console.error(`\n${problems.length} problem(s). Read docs/LEGAL.md; an exception goes in tools/legal-allow.json with where the file comes from.`);
  return problems.length ? 1 : 0;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) process.exit(run(process.argv.slice(2)));
