// The visitor statistics (CONTEXT.md, docs/adr/0043) of a server that counts them, read from their file while the server runs:
//   npm run stats [-- --days N] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--tz ±H] [--dev | --db FILE]
// By default the last 30 days, ending today. Days are UTC; --tz shifts only the hourly chart to your clock, such as --tz +7.
// In Docker: docker compose exec rg npm run stats
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { open, dayOf, PAGES, DEVICES } from './stats.js';
import { modeFrom, dataFiles } from './auth.js';

const DAY = 24 * 3600e3;
const TOP = 10;   // referring sites and countries listed by name
const WIDTH = 40; // the longest bar
const USAGE = 'Usage: npm run stats [-- --days N] [--from YYYY-MM-DD] [--to YYYY-MM-DD] [--tz ±H] [--dev | --db FILE]';

const num = n => n.toLocaleString('en-US');
const bar = (n, max) => (n > 0 ? '█'.repeat(Math.max(1, Math.round((n / max) * WIDTH))) : '');
const share = (n, total) => `${total ? ((100 * n) / total).toFixed(1) : '0.0'}%`;
const isDay = text => /^\d{4}-\d{2}-\d{2}$/.test(text) && !Number.isNaN(Date.parse(text)) && dayOf(Date.parse(text)) === text;
let regions = null;
try { regions = new Intl.DisplayNames(['en'], { type: 'region' }); } catch { /* a Node without ICU data shows the codes alone */ }
const country = code => { try { return `${code}  ${regions?.of(code) ?? ''}`.trim(); } catch { return code; } };

// Rows of [label, opens] as lines with the opens and their share of `total`, under a heading.
function table(heading, rows, total) {
  const labels = Math.max(heading.length - 2, ...rows.map(([label]) => label.length)), counts = Math.max(10, ...rows.map(([, n]) => num(n).length));
  return [`${heading.padEnd(labels + 2)}  ${'Page opens'.padStart(counts)}  ${'Share'.padStart(6)}`,
    ...rows.map(([label, n]) => `  ${label.padEnd(labels)}  ${num(n).padStart(counts)}  ${share(n, total).padStart(6)}`)];
}

// The largest TOP values by name, then the rest as "other", then the empty value (no referring site, or no known country).
function largest(tallies, empty, label = v => v) {
  const named = tallies.filter(t => t.value !== ''), none = tallies.find(t => t.value === '')?.opens ?? 0;
  const rest = named.slice(TOP).reduce((sum, t) => sum + t.opens, 0);
  return [...named.slice(0, TOP).map(t => [label(t.value), t.opens]), ...(rest ? [['other', rest]] : []), ...(none ? [[empty, none]] : [])];
}

// The report on the days from `from` to `to` (YYYY-MM-DD, inclusive) of an open statistics file (server/stats.js), as lines.
// `tz` is the hours added to UTC for the hourly chart; `file` names the file in what it prints.
export function report(store, { from, to, tz = 0, file = 'the statistics file' }) {
  if (!store.any()) return [`No visitor statistics in ${file} yet: a --public server counts them when RG_STATS=1 is set (docs/HOSTING.md "Visitor statistics").`];
  const { days, hours, tallies } = store.summary(from, to);
  const kept = new Map(days.map(d => [d.day, d]));
  const all = [];
  for (let t = Date.parse(from); t <= Date.parse(to); t += DAY) all.push(kept.get(dayOf(t)) ?? { day: dayOf(t), opens: 0, uniques: 0, started: false });
  const opens = all.reduce((sum, d) => sum + d.opens, 0), uniques = all.reduce((sum, d) => sum + d.uniques, 0);
  const widest = Math.max(...all.map(d => d.opens));
  const weekday = day => new Date(`${day}T00:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', timeZone: 'UTC' });

  const out = [`Visitor statistics from ${file}, ${from} to ${to} (UTC days)`, ''];
  const w1 = Math.max(10, num(widest).length), w2 = Math.max(15, ...all.map(d => num(d.uniques).length));
  out.push(`${'Day'.padEnd(16)}  ${'Page opens'.padStart(w1)}  ${'Unique visitors'.padStart(w2)}`);
  for (const d of all) out.push(`${d.day} ${weekday(d.day)} ${d.started ? '*' : ' '}  ${num(d.opens).padStart(w1)}  ${num(d.uniques).padStart(w2)}  ${bar(d.opens, widest)}`.trimEnd());
  if (all.some(d => d.started)) out.push('* The server started that day: a visitor it had already counted that day may have counted again.');

  out.push('', `Page opens: ${num(opens)}`, `Unique visitors, summed over the days: ${num(uniques)} (a visitor on two days counts twice)`);
  const of = (dimension, values) => values.map(v => [v, tallies[dimension].find(t => t.value === v)?.opens ?? 0]).sort((a, b) => b[1] - a[1]);
  out.push('', ...table('Pages', of('page', PAGES), opens));
  out.push('', ...table('Devices', of('device', DEVICES), opens));
  out.push('', ...table('Referring sites', largest(tallies.referrer, 'none'), opens));
  out.push('', ...table('Countries', largest(tallies.country, 'unknown', country), opens));

  const local = Array(24).fill(0);
  hours.forEach((n, h) => { local[(((h + tz) % 24) + 24) % 24] += n; });
  const busiest = Math.max(...local), w3 = num(busiest).length;
  out.push('', `Page opens by hour (UTC${tz ? `${tz > 0 ? '+' : ''}${tz}` : ''})`);
  local.forEach((n, h) => out.push(`  ${String(h).padStart(2, '0')}  ${num(n).padStart(w3)}  ${bar(n, busiest)}`.trimEnd()));
  return out;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2), o = { days: 30, from: '', to: '', tz: 0, dev: false, db: '' };
  let bad = false, daysGiven = false;
  for (let i = 0; i < args.length && !bad; i++) {
    const a = args[i], next = args[i + 1] ?? '';
    if (a === '--days' && /^[1-9]\d*$/.test(next)) { o.days = Number(args[++i]); daysGiven = true; }
    else if ((a === '--from' || a === '--to') && isDay(next)) o[a.slice(2)] = args[++i];
    else if (a === '--tz' && /^[+-]?\d{1,2}$/.test(next) && Math.abs(Number(next)) <= 14) o.tz = Number(args[++i]);
    else if (a === '--dev') o.dev = true;
    else if (a === '--db' && next) o.db = args[++i];
    else { console.error(`Unexpected ${JSON.stringify(a)}${['--days', '--from', '--to', '--tz', '--db'].includes(a) ? ` ${JSON.stringify(next)}` : ''}.\n${USAGE}`); bad = true; }
  }
  // --to, else the last of --days from --from, else today; --from, else --days before --to.
  const to = o.to || (o.from && daysGiven ? dayOf(Date.parse(o.from) + (o.days - 1) * DAY) : dayOf(Date.now()));
  const from = o.from || dayOf(Date.parse(to) - (o.days - 1) * DAY);
  const dataDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'data');
  const file = o.db ? path.resolve(o.db) : o.dev ? dataFiles(modeFrom(['--dev'], process.env), dataDir).stats : process.env.RG_STATS_DB || dataFiles(modeFrom([], process.env), dataDir).stats;
  if (bad) process.exitCode = 2;
  else if (from > to) { console.error(`--from ${from} is after --to ${to}.`); process.exitCode = 2; }
  else if (!fs.existsSync(file)) {
    console.error(`No visitor statistics file at ${file}. A --public server makes it once RG_STATS=1 is set (docs/HOSTING.md "Visitor statistics"). In Docker, run this inside the container:\n  docker compose exec rg npm run stats`);
    process.exitCode = 1;
  } else {
    let store = null;
    try {
      store = open(file, { readOnly: true });
      console.log(report(store, { from, to, tz: o.tz, file: path.relative(process.cwd(), file) || file }).join('\n'));
    } catch (e) {
      console.error(`${file} can't be read as visitor statistics: ${e.message}`);
      process.exitCode = 1;
    } finally {
      store?.close();
    }
  }
}
