// Self-check for the Docker image: node server/dockerfile.test.js
// The final stage copies server/ and shared/ but only web/dist, so every module outside server/ that the server reaches, through its
// own imports and theirs, must be in one of its COPY lines; a missing one only fails on the deployed server, when the server first
// imports it. A server file that imports page code from web/ (ADR 0035) fails here too.
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const rel = p => path.relative(root, p).split(path.sep).join('/');

// What the final stage copies from the build context: files, and folders with everything under them.
const stages = fs.readFileSync(path.join(root, 'Dockerfile'), 'utf8').split(/^FROM /m);
const copied = stages[stages.length - 1].split('\n')
  .filter(l => /^COPY /.test(l) && !/--from=/.test(l))
  .flatMap(l => l.trim().split(/\s+/).slice(1, -1));
const inImage = file => copied.some(c => file === c || file.startsWith(`${c.replace(/\/$/, '')}/`));

// Relative module paths in a source file: require('…'), import … from '…', import('…'), export … from '…'.
const SPEC = /(?:require\(|import\(|from\s+)\s*['"](\.{1,2}\/[^'"]+)['"]/g;
const specs = file => [...fs.readFileSync(file, 'utf8').matchAll(SPEC)].map(m => m[1]);
const resolve = (from, spec) => {
  const p = path.resolve(path.dirname(from), spec);
  for (const c of [p, `${p}.js`, `${p}.mjs`, path.join(p, 'index.js')]) if (fs.existsSync(c) && fs.statSync(c).isFile()) return c;
  return null;
};

// Every module outside server/ reachable from the server's files, which the image takes whole.
const serverFiles = fs.readdirSync(path.join(root, 'server')).filter(f => /\.(c?js|mjs)$/.test(f) && !/\.test\./.test(f)).map(f => path.join(root, 'server', f));
const seen = new Set(), queue = [...serverFiles], missing = [];
while (queue.length) {
  const file = queue.pop();
  for (const spec of specs(file)) {
    const target = resolve(file, spec);
    if (!target || seen.has(target) || rel(target).startsWith('server/')) continue;
    seen.add(target);
    if (!inImage(rel(target))) missing.push(`${rel(target)} (imported by ${rel(file)})`);
    queue.push(target);
  }
}
assert.ok(seen.size > 0, 'found no shared module the server imports: the import pattern no longer matches');
assert.deepStrictEqual(missing, [], 'add these to the Dockerfile\'s final stage, or move them to shared/ (ADR 0035)');
console.log(`dockerfile ok (${seen.size} shared modules)`);
