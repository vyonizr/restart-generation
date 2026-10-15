// Loads the game files for the server and the dev tools from RG_GAME: the ResetGeneration folder,
// or the standalone build's .zip.
import fs from 'fs';
import path from 'path';
import { gameFromZip } from '../zip.js';

export async function loadGame(source = process.env.RG_GAME) {
  if (!source) throw new Error('set RG_GAME to the ResetGeneration folder or the ResetGeneration-Standalone .zip');
  if (fs.statSync(source).isFile()) return gameFromZip(new Uint8Array(fs.readFileSync(source)));
  const files = {};
  for (const f of fs.readdirSync(source)) files[f] = new Uint8Array(fs.readFileSync(path.join(source, f)));
  return files;
}
