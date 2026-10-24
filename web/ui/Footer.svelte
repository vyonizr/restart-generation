<!-- The footer: the short non-affiliation line, the credit, and the Notices button that opens the rest (NoticesDialog, docs/LEGAL.md).
     "Bring your own copy of the game" appears only where the player brings the files: never on a server that sends them to every
     visitor, nor in a browser that received them for the download code (gamefiles.js, docs/adr/0031).
     A public server, which names its admin (RG_ADMIN_NAME), links its Terms and Privacy policy (docs/adr/0021). -->
<script>
  import { page } from './page.svelte.js';
</script>

<footer>
  <p class="disclaimer">Unofficial fan revival of Reset Generation © 2008 RedLynx; not affiliated with RedLynx, Ubisoft or Nokia.{#if page.ownCopy}{' Bring your own copy of the game.'}{/if}<br>Made by vyonizr.{#if page.server?.invite}{' · '}<a href={page.server.invite} target="_blank" rel="noopener">Join the Discord</a>{/if}{#if page.server?.adminName}{' · '}<a href="terms/" target="_blank" rel="noopener">Terms</a>{' · '}<a href="privacy/" target="_blank" rel="noopener">Privacy policy</a>{/if}</p>
  <div class="notes"><button type="button" class="secondary" id="notices-open" onclick={() => { if (!page.dialogs) page.notices = true; }}>Notices</button></div>
</footer>
