// The visitor's country for visitor statistics (CONTEXT.md, docs/adr/0043), from DB-IP's IP to Country Lite database
// (https://db-ip.com, CC BY 4.0; the Privacy policy credits it). DB-IP publishes a CSV each month that covers the whole address
// space, one range per line: `start,end,CC`, the IPv4 ranges in order, then the IPv6 ones, with ZZ for addresses no country holds.
// The server keeps the gzipped file in data/ and reads it without a library. Only a server that counts visitors loads it.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { promisify } = require('util');

const gunzip = promisify(zlib.gunzip);
const FILE = /^dbip-country-lite-(\d{4}-\d{2})\.csv\.gz$/;
const fileOf = month => `dbip-country-lite-${month}.csv.gz`;
const urlOf = month => `https://download.db-ip.com/free/${fileOf(month)}`;
const monthOf = t => new Date(t).toISOString().slice(0, 7);
const monthBefore = month => { const [y, m] = month.split('-').map(Number); return monthOf(Date.UTC(y, m - 2, 1)); };

// The two 32-bit words of each 64-bit half, written and read through a Uint32Array over the same memory, so that neither reading
// the file nor a lookup makes a BigInt. UP and DOWN are the indexes of a half's upper and lower word in that view.
const LITTLE_ENDIAN = new Uint8Array(new Uint16Array([1]).buffer)[0] === 1;
const UP = LITTLE_ENDIAN ? 1 : 0, DOWN = 1 - UP;

// Bytes from..to of buf as an IPv4 address -> the address as a number, else -1.
function bytes4(buf, from, to) {
  let value = 0, part = -1, dots = 0;
  for (let i = from; i < to; i++) {
    const c = buf[i];
    if (c >= 48 && c <= 57) { part = (part < 0 ? 0 : part) * 10 + c - 48; if (part > 255) return -1; }
    else if (c === 46 && part >= 0 && dots < 3) { value = value * 256 + part; part = -1; dots++; }
    else return -1;
  }
  return part < 0 || dots !== 3 ? -1 : value * 256 + part;
}

// Bytes from..to of buf as an IPv6 address in hex groups (no dotted tail) -> its eight 16-bit groups in g, and true; else false.
function bytes6(buf, from, to, g) {
  let n = 0, gap = -1, cur = -1, digits = 0;
  for (let i = from; i < to; i++) {
    const c = buf[i];
    const hex = c >= 48 && c <= 57 ? c - 48 : c >= 97 && c <= 102 ? c - 87 : c >= 65 && c <= 70 ? c - 55 : -1;
    if (hex >= 0) { if (++digits > 4) return false; cur = (cur < 0 ? 0 : cur) * 16 + hex; continue; }
    if (c !== 58) return false;
    if (buf[i + 1] === 58 && i + 1 < to) { // "::", the run of zero groups
      if (gap >= 0 || (cur >= 0 && n === 8)) return false;
      if (cur >= 0) g[n++] = cur;
      gap = n; cur = -1; digits = 0; i++;
      continue;
    }
    if (cur < 0 || n === 8) return false;
    g[n++] = cur; cur = -1; digits = 0;
  }
  if (cur >= 0) { if (n === 8) return false; g[n++] = cur; } else if (gap !== n) return false; // a lone ':' at the end
  if (gap < 0) return n === 8;
  if (n === 8) return false; // "::" stands for one group at least
  const moved = n - gap;
  for (let k = 1; k <= moved; k++) g[8 - k] = g[n - k];
  for (let k = gap; k < 8 - moved; k++) g[k] = 0;
  return true;
}

// The CSV (a Buffer, or text for tests) -> the lookup table: the start of every range, IPv4 in a Uint32Array and IPv6 as two
// BigUint64Arrays (high and low halves), each with a Uint16Array index into `names`, the list of country codes, where ZZ is ''.
// Only starts are kept: the ranges cover the whole address space, so an address is in the last range that starts at or below it.
// It reads bytes rather than strings, as the file has 700,000 lines. Throws on a line it can't read or a range out of order, so a
// damaged download is never used.
function parse(data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(String(data), 'latin1');
  const names = [], codes = new Int16Array(65536).fill(-1);
  // Two passes: the first counts each family's lines, so each array is made once at its size.
  let count4 = 0, count6 = 0;
  for (let at = 0; at < buf.length;) {
    let i = at, six = false;
    for (; i < buf.length && buf[i] !== 44 && buf[i] !== 10; i++) if (buf[i] === 58) six = true;
    if (buf[i] === 44) { if (six) count6++; else count4++; }
    const end = buf.indexOf(10, i);
    at = end < 0 ? buf.length : end + 1;
  }
  const v4 = { starts: new Uint32Array(count4), names: new Uint16Array(count4) };
  const v6 = { high: new BigUint64Array(count6), low: new BigUint64Array(count6), names: new Uint16Array(count6) };
  const high = new Uint32Array(v6.high.buffer), low = new Uint32Array(v6.low.buffer), g = new Uint16Array(8), w = new Uint32Array(4);
  const bad = (line, why) => new Error(`line ${line}: ${why}`);
  let n4 = 0, n6 = 0;
  for (let at = 0, line = 1; at < buf.length; line++) {
    const newline = buf.indexOf(10, at), from = at;
    let to = newline < 0 ? buf.length : newline;
    at = to + 1;
    while (to > from && (buf[to - 1] === 13 || buf[to - 1] === 32)) to--;
    if (to === from) continue;
    // start,end,CC: the start up to the first comma, and the country in the two capitals after the second.
    const comma = buf.indexOf(44, from), second = comma < 0 ? -1 : buf.indexOf(44, comma + 1);
    const a = buf[to - 2], b = buf[to - 1];
    if (comma < 0 || comma >= to || second !== to - 3 || !(a >= 65 && a <= 90 && b >= 65 && b <= 90)) throw bad(line, 'not start,end,CC');
    const key = a * 256 + b;
    if (codes[key] < 0) { codes[key] = names.length; names.push(key === 0x5a5a ? '' : String.fromCharCode(a, b)); } // ZZ: no country
    let six = false;
    for (let i = from; i < comma && !six; i++) six = buf[i] === 58;
    if (!six) {
      const start = bytes4(buf, from, comma);
      if (start < 0) throw bad(line, 'not an IPv4 address');
      if (n4 && start <= v4.starts[n4 - 1]) throw bad(line, 'out of order');
      v4.starts[n4] = start; v4.names[n4++] = codes[key];
    } else {
      if (!bytes6(buf, from, comma, g)) throw bad(line, 'not an IPv6 address');
      for (let k = 0; k < 4; k++) w[k] = g[2 * k] * 65536 + g[2 * k + 1];
      if (n6 && compare6(high, low, n6 - 1, w) <= 0) throw bad(line, 'out of order');
      high[2 * n6 + UP] = w[0]; high[2 * n6 + DOWN] = w[1]; low[2 * n6 + UP] = w[2]; low[2 * n6 + DOWN] = w[3];
      v6.names[n6++] = codes[key];
    }
  }
  if (!n4 || !n6) throw new Error('no IPv4 or no IPv6 ranges');
  return { names, v4, v6: { ...v6, high32: high, low32: low } };
}

// How the address in words w (four 32-bit words, highest first) compares with start k: positive when it is above it.
function compare6(high, low, k, w) {
  return (w[0] - high[2 * k + UP]) || (w[1] - high[2 * k + DOWN]) || (w[2] - low[2 * k + UP]) || (w[3] - low[2 * k + DOWN]);
}

// The index of the last start at or below the address, by binary search; -1 when it is below the first.
function lastAtOrBelow(count, above) {
  let lo = 0, hi = count - 1, found = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >>> 1;
    if (above(mid)) hi = mid - 1; else { found = mid; lo = mid + 1; }
  }
  return found;
}

// An address -> its country's ISO 3166 alpha-2 code, or '' when the table doesn't know it (ZZ, no table, not an address). An
// IPv4-mapped IPv6 address (::ffff:1.2.3.4, or ::ffff:102:304) is looked up as its IPv4 address.
function lookup(table, ip) {
  if (!table) return '';
  // An IPv6 zone (fe80::1%eth0) says nothing about the country.
  const buf = Buffer.from(String(ip).replace(/%.*$/, '').replace(/^::ffff:(?=\d+\.\d+\.\d+\.\d+$)/i, ''), 'latin1');
  let v4 = bytes4(buf, 0, buf.length);
  if (v4 < 0) {
    const g = new Uint16Array(8);
    if (!bytes6(buf, 0, buf.length, g)) return '';
    if (g[0] === 0 && g[1] === 0 && g[2] === 0 && g[3] === 0 && g[4] === 0 && g[5] === 0xffff) v4 = g[6] * 65536 + g[7];
    else {
      const w = [g[0] * 65536 + g[1], g[2] * 65536 + g[3], g[4] * 65536 + g[5], g[6] * 65536 + g[7]], t = table.v6;
      const i = lastAtOrBelow(t.names.length, k => compare6(t.high32, t.low32, k, w) < 0);
      return i < 0 ? '' : table.names[t.names[i]];
    }
  }
  const i = lastAtOrBelow(table.v4.starts.length, k => table.v4.starts[k] > v4);
  return i < 0 ? '' : table.names[table.v4.names[i]];
}

// The country table a server keeps up to date in `dir`: at start() it loads the newest file there, and if that isn't this UTC
// month's, downloads this month's, or last month's while this month's isn't out yet (DB-IP publishes during the month). check()
// does the same again; the server calls it every day. A failed download logs one line and keeps the table it has; without any,
// every country is ''. Older months' files are deleted once a newer one loads. Never logs an address.
// opts: dir, fetch, now, log.
function createCountries({ dir, fetch = globalThis.fetch, now = Date.now, log = () => {} }) {
  let table = null, month = '', busy = false;

  // Uses month m's table from now on, and deletes the files of older months.
  const use = (t, m, file, started) => {
    table = t; month = m;
    log(`country database ${file} loaded (${t.v4.starts.length + t.v6.high.length} ranges, ${Date.now() - started} ms)`);
    for (const f of fs.readdirSync(dir)) {
      const other = FILE.exec(f);
      if (other && other[1] < m) fs.rmSync(path.join(dir, f), { force: true });
    }
  };
  const read = async (file, m) => { const started = Date.now(); use(parse(await gunzip(fs.readFileSync(path.join(dir, file)))), m, file, started); };

  // Downloads month m's file into dir and loads it. Returns whether it did; a month DB-IP hasn't published yet answers 404.
  const download = async m => {
    const res = await fetch(urlOf(m), { signal: AbortSignal.timeout(5 * 60e3) });
    if (res.status === 404) return false;
    if (!res.ok) throw new Error(`${urlOf(m)} answered ${res.status}`);
    const data = Buffer.from(await res.arrayBuffer()), started = Date.now();
    const t = parse(await gunzip(data)); // a damaged file throws here, before it replaces anything
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, `${fileOf(m)}.tmp`), data);
    fs.renameSync(path.join(dir, `${fileOf(m)}.tmp`), path.join(dir, fileOf(m)));
    use(t, m, fileOf(m), started);
    return true;
  };

  const check = async () => {
    if (busy) return;
    busy = true;
    const want = monthOf(now()), before = monthBefore(want);
    try {
      if (month === want) return;
      if (await download(want)) return;
      if (month < before && await download(before)) return;
      if (month < before) throw new Error(`neither ${urlOf(want)} nor ${urlOf(before)} is published`);
    } catch (e) {
      log(`country database not downloaded, ${month ? `still using ${fileOf(month)}` : 'so countries are unknown'}: ${e.message}`);
    } finally {
      busy = false;
    }
  };

  const start = async () => {
    let files = [];
    try { files = fs.readdirSync(dir).map(f => FILE.exec(f)).filter(Boolean).sort((a, b) => (a[1] < b[1] ? 1 : -1)); } catch { /* no folder yet */ }
    for (const [file, m] of files) {
      try { await read(file, m); break; } catch (e) { log(`country database ${file} not loaded: ${e.message}`); }
    }
    await check();
  };

  return { start, check, lookup: ip => lookup(table, ip) };
}

module.exports = { parse, lookup, createCountries };
