// The witness (CONTEXT.md "Witness", docs/adr/0020): one engine from the server copy, in a worker thread (server/witness.mjs),
// that follows every battle from the relay's own messages (table.history) and tells the server each defeat and the ranks.
// It starts with the server, only when RG_GAME is set, whether or not the server is public. Without it every result is guessed.
const path = require('path');
const { Worker } = require('worker_threads');

// ponytail: fixed limits. The engine frees nothing, so the worker keeps about 4 MB of every battle (docs/re/re_witness.md
// "Cost"); a restart costs a 2 s boot and each running table's catch-up from its history.
const RESTART_AFTER = 50;                // battles followed to the end
const RESTART_GROWN = 250 * 1024 * 1024; // bytes the worker grew since its boot
const BOOT_RETRIES = 5;                  // a replacement worker that fails to boot is tried this many more times,
const RETRY_MS = 10000;                  // this long apart
let log = null, file = null, retryMs = RETRY_MS, worker = null, ready = false, everReady = false, failedBoots = 0;
let broken = null, ended = 0, nextId = 1;
const followed = new Map(); // table -> { id, onDefeat, result: Promise, outcome, settle }
const tables = new Map();   // id -> table

const available = () => log !== null;

// The worker starts each table from its Game blob and pre-join snapshot, then catches up on every message the table has had.
function begin(table, f) {
  worker.postMessage({ start: { table: f.id, game: table.game, snap: table.snap } });
  for (const raw of table.history) worker.postMessage({ feed: { table: f.id, raw } });
}

function spawn() {
  const w = worker = new Worker(file);
  const since = Date.now();
  let error = null;
  ready = false; ended = 0;
  w.on('message', m => {
    if (w !== worker) return; // a worker being replaced
    if (m.ready) {
      ready = true; everReady = true; failedBoots = 0;
      log(`witness ready in ${((Date.now() - since) / 1000).toFixed(1)} s`);
      for (const [table, f] of followed) if (!f.outcome) begin(table, f);
      return;
    }
    if (m.grown !== undefined) {
      if (m.grown > RESTART_GROWN) restart(`it grew by ${Math.round(m.grown / 2 ** 20)} MB`);
      return;
    }
    // Anything else isn't the witness's: under `node --watch` (npm run dev) Node posts { 'watch:import': [...] } from the worker.
    const body = m.defeat ?? m.ranks ?? m.failed;
    if (!body) return;
    const table = tables.get(body.table), f = followed.get(table);
    if (!f || f.outcome) return;
    if (m.defeat) f.onDefeat(m.defeat.seat);
    else if (m.ranks) {
      log(`battle ${table.seed}: the witness ranks ${Object.entries(m.ranks.ranks).map(([seat, rank]) => `seat ${seat} ${rank}`).join(', ')}`);
      f.settle({ ranks: m.ranks.ranks });
    } else f.settle({ failed: m.failed.cause });
  });
  w.on('error', e => { error = e; });
  w.on('exit', code => {
    if (w !== worker) return;
    worker = null;
    const cause = error ? error.message : `the worker exited with code ${code}`;
    if (ready) {
      log(`witness stopped: ${error?.stack ?? cause}`);
      // Tables it was following can't be trusted to have seen every message in order, so they aren't fed again.
      for (const f of followed.values()) f.settle({ failed: cause });
      return spawn();
    }
    // A replacement that fails to boot is tried again; the tables it should follow wait, and catch up from their history once
    // one boots. A first boot that fails, or a replacement that keeps failing, would fail the same way every time.
    if (everReady && ++failedBoots <= BOOT_RETRIES) {
      log(`witness failed to boot (${cause}): trying again in ${retryMs / 1000} s`);
      return setTimeout(spawn, retryMs);
    }
    broken = cause;
    log(`witness failed to start: ${error?.stack ?? cause}. Battle results will be guessed.`);
    for (const f of followed.values()) f.settle({ failed: cause });
  });
}

function restart(why) {
  log(`witness restarts: ${why}`);
  const old = worker;
  spawn();
  old.terminate();
}

// Starts the worker; the server calls it once, at startup, and only with a server copy. Tests replace the worker's file and the
// pause between boot attempts.
function start(logFn, options = {}) {
  log = logFn;
  file = options.file ?? path.join(__dirname, 'witness.mjs');
  retryMs = options.retryMs ?? RETRY_MS;
  spawn();
}

// Follows a new table; onDefeat(seat) runs for each seat the witness sees defeated, possibly again after a restart.
function follow(table, onDefeat) {
  if (!available()) return;
  const f = { id: nextId++, onDefeat };
  f.result = new Promise(resolve => { f.settle = outcome => { if (!f.outcome) { f.outcome = outcome; resolve(outcome); } }; });
  followed.set(table, f); tables.set(f.id, table);
  if (broken) f.settle({ failed: broken });
  else if (ready) begin(table, f);
}

// One message the table just added to its history.
function feed(table, raw) {
  const f = followed.get(table);
  if (f && !f.outcome && ready) worker.postMessage({ feed: { table: f.id, raw } });
}

// Resolves with { ranks: { seat: rank } } once the battle is over in the witness, or { failed: cause } if the witness failed.
const result = table => followed.get(table)?.result ?? Promise.resolve({ failed: 'not followed' });

// The table is done: the witness drops it.
function forget(table) {
  const f = followed.get(table);
  if (!f) return;
  followed.delete(table); tables.delete(f.id);
  if (!ready) return;
  worker.postMessage({ end: { table: f.id } });
  if (++ended >= RESTART_AFTER) restart(`${ended} battles followed`);
}

module.exports = { start, available, follow, feed, result, forget };
