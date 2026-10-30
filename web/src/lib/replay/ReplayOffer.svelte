<!-- The offer to watch the online battle just played as a replay (DESIGN.md "Replay offer"), chosen from a prototype of three places
     (branch prototype/replay-offer). A card outside the page's flow, so it never moves the game screen: on a desktop under the
     header's right end (App.svelte); `docked` on a touch device, over the touch pad's tool bar (Pad.svelte), the one band there that
     is neither the screen nor a thumb control. It reads as a small copy of the replay page's title band. -->
<script>
  import { page } from '../page.svelte.js';
  import { copyLinkFeedback } from '../clipboard.js';

  let { docked = false } = $props();
  let copied = $state('');
  const copy = copyLinkFeedback(label => { copied = label === 'Copy link' ? '' : label; });
</script>

{#if page.replayOffer}
  <aside class="replay-offer" class:docked aria-label="Replay saved">
    <span class="offer-tag">
      {#if docked}
        <!-- Replay: an arrow turning back round a play triangle -->
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.26 4.48A8 8 0 1 1 4.48 9.26M10.8 1.2 9.26 4.48l3.33 1.55" /><path class="offer-play" d="M10 8.8v6.4l5-3.2z" /></svg>
        <span class="vh">Replay</span>
      {:else}Replay{/if}
    </span>
    <p class="offer-text" class:vh={docked} role="status">Match replay saved.</p>
    <span class="offer-actions">
      <a class="button" class:secondary={!docked} href={page.replayOffer} target="_blank" rel="noopener" title="Watch this replay in a new tab">{docked ? 'Watch replay' : 'Watch'}</a>
      <button type="button" class="secondary offer-icon" onclick={() => copy(page.replayOffer)} aria-label={copied || 'Copy link'} title="Copy this replay's link">
        {#if copied}{copied}{:else}<!-- Two overlapping sheets --><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8h11v12H8zM5 16V4h11" /></svg>{/if}
      </button>
      <button type="button" class="secondary offer-icon" onclick={() => { page.replayOffer = null; }} aria-label="Dismiss" title="Dismiss">
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6l12 12M18 6 6 18" /></svg>
      </button>
    </span>
  </aside>
{/if}
