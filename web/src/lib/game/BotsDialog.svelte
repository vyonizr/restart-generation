<!-- "Fill the empty seats with CPU players?" at a friendly Start (see bots.js). Always mounted, so it can catch keys. -->
<script>
  import Dialog from '../components/Dialog.svelte';
  import { page } from '../page.svelte.js';
  import { answerBots, botsKey } from './bots.js';

  let no = $state(), yes = $state();

  // The highlighted button has focus.
  $effect(() => { if (page.bots) (page.bots.yes ? yes : no)?.focus(); });
</script>

<svelte:window onkeydowncapture={botsKey} />

{#if page.bots}
  <Dialog id="bots-ask" titleId="bots-title" focus="#bots-yes">
    <h2 class="bar" id="bots-title">Fill the empty seats with CPU players?</h2>
    <div class="row">
      <button type="button" class="secondary" id="bots-no" bind:this={no} onclick={() => answerBots(false)} onfocus={() => { page.bots.yes = false; }}>No</button>
      <button type="button" id="bots-yes" bind:this={yes} onclick={() => answerBots(true)} onfocus={() => { page.bots.yes = true; }}>Yes</button>
    </div>
  </Dialog>
{/if}
