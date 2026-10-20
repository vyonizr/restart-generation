<!-- Who you are: the header on a desktop, the line under Start on a touch device (App places it in both). -->
<script>
  import { page } from './page.svelte.js';
  import { actions } from './accounts.js';

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
        <button type="button" class="secondary" onclick={actions.signout}>Sign out</button>
        <button type="button" class="secondary" onclick={actions.delete}>Delete my account</button>
      </div>
    </details>
  {:else}
    <button type="button" class="secondary" onclick={actions.signin}><span>Sign in</span><span class="long">{' with Discord'}</span></button>
  {/if}
{/if}
