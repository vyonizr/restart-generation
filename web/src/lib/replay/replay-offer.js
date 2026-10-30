// The offer to watch the online battle just played as a replay (CONTEXT.md): ReplayOffer.svelte shows it outside the page's flow, so
// it never moves the game screen. It stays until the player dismisses it or their next battle begins (game.js ends it then too).
import { page } from '../page.svelte.js';

// The server kept the battle just played as replay `id` (shared/snap.js).
export function replaySaved(id) {
  page.replayOffer = new URL(`replay/${encodeURIComponent(id)}`, location.href).href;
}

// The player joined their next online battle: the last one's replay offer goes.
export function battleJoined() {
  page.replayOffer = null;
}
