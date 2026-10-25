<!-- How many players are online: "3 online" on a desktop, and on a touch device a small two-person icon with the number. -->
<script>
  import { page } from '../page.svelte.js';

  let { icon = false } = $props();
</script>

{#if icon}
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17.5 14.5c2.2 0 3.5 1.6 3.5 4"/></svg>
  <span>{page.online}</span><span class="vh"> players online</span>
{:else}
  {page.online} online
{/if}
