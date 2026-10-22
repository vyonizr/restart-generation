// Self-check for restarting the witness (server/witness.js): node server/witness.test.js
// A made-up worker stands in for server/witness.mjs; plan.json says what each boot does: 'grow' (ready, then reports enough growth
// to be replaced), 'rank' (ready, and ranks seat 1 first for each table it starts) or 'fail' (throws before it's ready).
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const FAKE = `import { parentPort } from 'worker_threads';
import fs from 'fs';
const counter = new URL('./count', import.meta.url);
const n = (fs.existsSync(counter) ? +fs.readFileSync(counter, 'utf8') : 0) + 1;
fs.writeFileSync(counter, String(n));
const plan = JSON.parse(fs.readFileSync(new URL('./plan.json', import.meta.url), 'utf8'))[n - 1] ?? 'fail';
if (plan === 'fail') throw new Error('boot ' + n + ' failed');
parentPort.postMessage({ 'watch:import': [import.meta.url] }); // what node --watch posts from every worker
parentPort.on('message', m => {
  if (m.start && plan === 'grow') parentPort.postMessage({ grown: 1e12 });
  if (m.start && plan === 'rank') parentPort.postMessage({ ranks: { table: m.start.table, ranks: { 1: 1 } } });
});
parentPort.postMessage({ ready: true });
`;

// A fresh witness manager whose worker boots as `plan` says. Returns it with its log.
function witnessWith(plan) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'witness-'));
  fs.writeFileSync(path.join(dir, 'fake.mjs'), FAKE);
  fs.writeFileSync(path.join(dir, 'plan.json'), JSON.stringify(plan));
  delete require.cache[require.resolve('./witness')];
  const witness = require('./witness'), lines = [];
  witness.start(line => lines.push(line), { file: path.join(dir, 'fake.mjs'), retryMs: 20 });
  return { witness, lines, dir };
}
const table = () => ({ seed: 1, game: Buffer.alloc(4), snap: Buffer.alloc(4), history: [] });
const within = (promise, ms) => Promise.race([promise, new Promise(resolve => setTimeout(resolve, ms, 'timed out'))]);

(async () => {
  // A replacement that fails to boot is tried again, and the battles it was following catch up in the next one.
  let w = witnessWith(['grow', 'fail', 'fail', 'rank']);
  let t = table();
  w.witness.follow(t, () => {});
  assert.deepStrictEqual(await within(w.witness.result(t), 5000), { ranks: { 1: 1 } });
  assert(!w.lines.some(l => /failed to start/.test(l)), w.lines.join('\n'));
  fs.rmSync(w.dir, { recursive: true, force: true });

  // A replacement that never boots is given up after a few tries: the battles it was following are guessed.
  w = witnessWith(['grow']);
  t = table();
  w.witness.follow(t, () => {});
  const outcome = await within(w.witness.result(t), 5000);
  assert.match(outcome.failed ?? '', /boot \d+ failed/);
  assert(w.lines.some(l => /Battle results will be guessed/.test(l)), w.lines.join('\n'));
  fs.rmSync(w.dir, { recursive: true, force: true });

  // A first boot that fails isn't tried again.
  w = witnessWith([]);
  t = table();
  w.witness.follow(t, () => {});
  assert.match((await within(w.witness.result(t), 5000)).failed ?? '', /boot 1 failed/);
  await new Promise(resolve => setTimeout(resolve, 200));
  assert.strictEqual(fs.readFileSync(path.join(w.dir, 'count'), 'utf8'), '1');
  fs.rmSync(w.dir, { recursive: true, force: true });
  console.log('witness restarts ok');
  process.exit(0);
})().catch(e => { console.error(e); process.exit(1); });
