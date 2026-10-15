// Writes "<file> <valid length>" for each capture listed in rgtrace's log.
const fs = require('fs');
const lines = fs.readFileSync(process.argv[2], 'utf8').split(/\r?\n/);
let n = 0; const out = [];
for (const l of lines) {
  const m = l.match(/returned:.* ([0-9a-f]+)\s*$/); if (m) n = parseInt(m[1], 16);
  const w = l.match(/wrote .*[\\/]([^\\/]+\.bin)/); if (w) out.push(`${w[1]} ${n}`);
}
fs.writeFileSync(process.argv[3], out.join('\n') + '\n');
console.log(out.join('\n'));
