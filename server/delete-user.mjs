// Deletes one account through the running server (ADR 0016):
//   npm run delete-user -- --name Alice        or        --discord <Discord ID>      [--yes]
// In Docker: docker compose exec rg npm run delete-user -- --name Alice
import readline from 'node:readline/promises';

const USAGE = 'Usage: npm run delete-user -- (--name <name> | --discord <Discord ID>) [--yes]';
const fail = message => { console.error(message); process.exitCode = 1; return true; };

const args = process.argv.slice(2);
const want = {};
for (let i = 0; i < args.length; i++) {
  const a = args[i];
  if (a === '--yes' || a === '-y') want.yes = true;
  else if ((a === '--name' || a === '--discord') && args[i + 1] !== undefined) want[a.slice(2)] = args[++i];
  else { console.error(`Unexpected ${JSON.stringify(a)}.`); want.bad = true; break; }
}
if (want.bad || (want.name === undefined) === (want.discord === undefined)) {
  fail(`${want.bad ? '' : 'Give exactly one of --name and --discord.\n'}${USAGE}`);
} else await run();

async function run() {
  const token = process.env.RG_ADMIN_TOKEN;
  if (!token) return fail('RG_ADMIN_TOKEN is not set here. Put the value the server uses in .env (or the container\'s environment).');
  const base = `http://127.0.0.1:${process.env.HTTP_PORT || 8080}`;
  const query = new URLSearchParams(want.name !== undefined ? { name: want.name } : { discord: want.discord });
  const subject = want.name !== undefined ? `named ${want.name}` : `with Discord ID ${want.discord}`;

  const ask = async method => {
    try {
      const res = await fetch(`${base}/admin/account?${query}`, { method, headers: { Authorization: `Bearer ${token}` } });
      const text = await res.text();
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch { /* the switched-off endpoint answers plain text */ }
      return { code: res.status, body };
    } catch {
      return { code: 0 };
    }
  };
  // Says why a request failed and returns true, or returns false when it went through.
  const refused = ({ code, body }) => {
    const error = body?.error;
    if (code === 0) return fail(`No server answered at ${base}. Start it, or run this where it runs; in Docker:\n  docker compose exec rg npm run delete-user -- ${process.argv.slice(2).join(' ')}`);
    if (code === 401) return fail('The server refused the token: RG_ADMIN_TOKEN here is not the one the server runs with.');
    if (code === 404 && error === 'no_account') return fail(`No account ${subject}.`);
    if (code === 404) return fail('The server has no admin endpoint: set RG_ADMIN_TOKEN where it runs and restart it.');
    if (code === 422 && error === 'no_discord') return fail('This server has no Discord sign-in, so its accounts have no Discord ID. Use --name.');
    return code === 200 || code === 204 ? false : fail(`The server answered ${code}${error ? ` (${error})` : ''}.`);
  };

  const found = await ask('GET');
  if (refused(found)) return;
  const a = found.body;
  console.log(`${a.name} (${a.kind}): fame ${a.fame}, ${a.matches} matches, ${a.friends} friends, ${a.files} saved game files${a.online ? ', ONLINE now: their session ends' : ''}.`);
  console.log('Deleting removes all of it, and it cannot be undone.');
  if (!want.yes) {
    if (!process.stdin.isTTY) return fail('No terminal to confirm on. Add --yes to delete without asking.');
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    const answer = await rl.question(`Delete ${a.name}? [y/N] `);
    rl.close();
    if (!/^y(es)?$/i.test(answer.trim())) return void console.log('Nothing deleted.');
  }
  if (refused(await ask('DELETE'))) return;
  console.log(`Deleted ${a.name}.`);
}
