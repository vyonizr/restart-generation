<!-- "Fill the empty seats with CPU players?" at a friendly Start (see bots.svelte.js). Always mounted, so it can catch keys. -->
<script>
  import Dialog from './Dialog.svelte';
  import { page } from './page.svelte.js';
  import { answerBots, botsKey } from './bots.svelte.js';

  // The highlighted button has focus.
  $effect(() => { if (page.bots) document.getElementById(`bots-${page.bots.focus}`)?.focus(); });
</script>

<svelte:window onkeydowncapture={botsKey} />

{#if page.bots}
  <Dialog id="bots-ask" titleId="bots-title" focus="#bots-cpu">
    <h2 class="bar" id="bots-title">{page.bots.alone ? 'Choose the CPU level' : 'Fill the empty seats with CPU players?'}</h2>
    <p>Expert CPU players choose from the strongest heroes.</p>
    <div class="row">
      {#if !page.bots.alone}<button type="button" class="secondary" id="bots-none" onclick={() => answerBots('none')} onfocus={() => { page.bots.focus = 'none'; }}>No</button>{/if}
      <button type="button" id="bots-cpu" onclick={() => answerBots('cpu')} onfocus={() => { page.bots.focus = 'cpu'; }}>CPU</button>
      <button type="button" id="bots-expert" onclick={() => answerBots('expert')} onfocus={() => { page.bots.focus = 'expert'; }}>Expert</button>
    </div>
  </Dialog>
{/if}
