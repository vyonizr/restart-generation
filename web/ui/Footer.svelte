<!-- The footer: the short non-affiliation line, the credit, and the Notices button that opens the rest (NoticesDialog, docs/LEGAL.md).
     "Bring your own copy of the game" appears only where the player brings the files, never on a server that sends them (RG_SEND_GAME=1). -->
<script>
  import { page } from './page.svelte.js';
</script>

<footer>
  <p class="disclaimer">Unofficial fan revival of Reset Generation © 2008 RedLynx; not affiliated with RedLynx, Ubisoft or Nokia.{#if page.ownCopy}{' Bring your own copy of the game.'}{/if}<br>Made by vyonizr.{#if page.server?.invite}{' · '}<a href={page.server.invite} target="_blank" rel="noopener">Join the Discord</a>{/if}</p>
  <div class="notes"><button type="button" class="secondary" id="notices-open" onclick={() => { if (!page.dialogs) page.notices = true; }}>Notices</button></div>
</footer>
