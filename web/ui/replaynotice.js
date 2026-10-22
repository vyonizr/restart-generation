// The line under the screen after an online battle: its replay (CONTEXT.md) is kept, with a way to watch it in a new tab and to copy
// its link. It stays until the player dismisses it or the next battle starts.
import { page } from './page.svelte.js';
import { copyLinkFeedback } from './clipboard.js';

// The server kept the battle just played as replay `id` (web/snap.js).
export function replaySaved(id) {
  const url = new URL(`replay/${encodeURIComponent(id)}`, location.href).href;
  const copy = copyLinkFeedback(label => { if (page.notice?.replay === url) page.notice.actions[1].label = label; });
  page.notice = {
    replay: url,
    text: 'This battle is saved as a replay. Find it later under Replays.',
    actions: [
      { label: 'Watch replay', href: url },
      { label: 'Copy link', secondary: true, keep: true, run: () => copy(url) },
      { label: 'Dismiss', secondary: true },
    ],
  };
}

// The player joined their next battle: the last one's replay notice goes.
export function battleJoined() {
  if (page.notice?.replay) page.notice = null;
}
