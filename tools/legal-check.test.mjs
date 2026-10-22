// Self-check for tools/legal-check.mjs: node tools/legal-check.test.mjs
import assert from 'node:assert';
import { checkPath, checkText } from './legal-check.mjs';

// What may be committed.
for (const ok of ['web/emu/host.js', 'server/casino.js', 'docs/re/re_match.md', 'web/fonts/anton.woff2', 'web/public/favicon.svg', '.env.example', 'tools/re/ghidra/DecompileAll.java']) {
  assert.strictEqual(checkPath(ok), null, ok);
}
// What may not: the game's own files and platform packages, local material, secrets files, unlisted media.
for (const bad of ['ResetGeneration-Win32-Web.dll', 'lib/rg-signed.jar', 'data/templates/duel.snap', 'x/menus.pak', 'a/b.gfx', 'ResetGeneration-Standalone.zip', 'game.sisx',
  'analysis/rg_decomp2.c', 'tmp/shot.png', 'data/accounts.db', 'web/dist/index.html', '.env', '.env.local', 'web/public/screenshot.png', 'docs/title.webp', 'sounds/a.ogg']) {
  assert.ok(checkPath(bad), bad);
}
assert.ok(checkPath('src/blob.js', 300 * 1024)); // large
assert.strictEqual(checkPath('package-lock.json', 300 * 1024), null); // listed

// Notes that cite the decompiler's names are fine; its pseudocode is not.
assert.strictEqual(checkText('docs/re/x.md', 'FUN_100f94a0 reads the display description at +0x18; see 0x1017b130 (DAT_101b828c holds the game).'), null);
assert.ok(checkText('docs/re/x.md', 'undefined4 FUN_10003190(void *this, int param_1)\n{\n  int iVar1;\n  local_4 = 0;\n}'));
assert.ok(checkText('x.c', '// ==== FUN_10003190 @ 10003190\nvoid f(void) {}'));
assert.ok(checkText('x.txt', '1000a1b0:  8b 4c 24 04        mov ecx,[esp+4]'));
// Local paths and secrets.
assert.ok(checkText('x.md', 'copy it from C:\\Users\\someone\\Documents'));
assert.ok(checkText('x.md', 'RG_DISCORD_CLIENT_SECRET=abcdefghijklmnop1234'));
assert.strictEqual(checkText('x.md', 'RG_DISCORD_CLIENT_SECRET=\nRG_ADMIN_TOKEN=<a long random string>'), null);
// Long hex strings are refused, except in a listed file or when labeled as a checksum.
const hex = 'A'.repeat(64);
assert.ok(checkText('web/other.js', `const k = '${hex}';`));
assert.strictEqual(checkText('server/snap.js', `const k = '${hex}';`), null);
assert.strictEqual(checkText('x.md', `target_fingerprint: "sha256:${hex.toLowerCase()}"`), null);
console.log('legal check ok');
