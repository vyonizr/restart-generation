// Prints the top 30 functions by self time from the .cpuprofile in <dir>.
// Usage: node --cpu-prof --cpu-prof-dir=<dir> web/tools/run.mjs ..., then node web/tools/prof.cjs <dir>
const fs = require('fs');
const dir = process.argv[2];
const f = fs.readdirSync(dir).find(x => x.endsWith('.cpuprofile'));
const p = JSON.parse(fs.readFileSync(dir + '/' + f));
const byId = new Map(p.nodes.map(n => [n.id, n]));
const self = new Map();
p.samples.forEach((s, i) => {
  const n = byId.get(s), k = `${n.callFrame.functionName || '(anon)'} ${n.callFrame.url.split('/').pop()}:${n.callFrame.lineNumber + 1}`;
  self.set(k, (self.get(k) || 0) + (p.timeDeltas[i] || 0));
});
const tot = [...self.values()].reduce((a, b) => a + b, 0);
[...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 30).forEach(([k, t]) => console.log((t / tot * 100).toFixed(1).padStart(5) + '% ' + k));
