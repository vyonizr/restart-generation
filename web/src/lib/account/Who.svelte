<!-- Who you are, in a desktop's header. A touch device, which has no header, has the who chip instead (WhoChip.svelte). -->
<script>
  import { page } from '../page.svelte.js';
  import { actions } from './accounts.js';
  import DiscordSymbol from './DiscordSymbol.svelte';

  let menu = $state();
</script>

<!-- A menu closes when you click anywhere else, or press Escape. -->
<svelte:document onclick={e => { if (menu && !menu.contains(e.target)) menu.open = false; }} />
<svelte:window onkeydown={e => { if (e.key === 'Escape' && menu) menu.open = false; }} />

{#if page.who}
  <b class="who-name">{page.who.name}</b>
  {#if page.who.member}
    <details class="menu" bind:this={menu}>
      <summary>Account</summary>
      <div class="menu-panel">
        {#if page.server?.replays}<button type="button" class="secondary" onclick={() => { menu.open = false; menu.querySelector('summary').focus(); page.replays = page.who.name; }}>Replays</button>{/if}
        <button type="button" class="secondary" onclick={() => { menu.open = false; actions.download(); }}>Download my data</button>
        <button type="button" class="secondary" onclick={actions.signout}>Sign out</button>
        <button type="button" class="secondary" onclick={actions.delete}>Delete my account</button>
      </div>
    </details>
  {:else}
    {#if page.server?.replays}<button type="button" class="secondary" onclick={() => { page.replays = page.who.name; }}>Replays</button>{/if}
    <button type="button" class="secondary" onclick={actions.signin}><DiscordSymbol /><span>Sign in</span><span class="long">{' with Discord'}</span></button>
  {/if}
{/if}
