<!-- How many players are online: two people, the number, and "online". On a desktop it stands in the header's right end, before
     the who chip; on a touch device, which has no header, at the right end of the line at the top of the page, across from the who
     chip. Both hide when there is no server to ask. -->
<script>
  import { page } from '../page.svelte.js';

  let { where } = $props();
</script>

<p class="online {where}" hidden={page.online === null}>
  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="9" cy="8" r="3"/><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6"/><circle cx="17.5" cy="9" r="2.5"/><path d="M17.5 14.5c2.2 0 3.5 1.6 3.5 4"/></svg>
  <b>{page.online}</b><span class="online-word" aria-hidden="true">online</span><span class="vh"> players online</span>
</p>
