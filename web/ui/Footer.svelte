<!-- The disclaimer. "Bring your own copy of the game" and the note about the files appear only where the player brings them: never on a
     server that sends the game files itself (RG_GAME set), whatever this browser has stored. -->
<script>
  import { page } from './page.svelte.js';
</script>

<footer>
  <p class="disclaimer"><strong>Restart Generation</strong> is an unofficial fan revival of Reset Generation © 2008 RedLynx. It is not affiliated with or endorsed by RedLynx.{#if page.ownCopy}{' Bring your own copy of the game.'}{/if}<br>Made by vyonizr.</p>
  {#if page.ownCopy}<p class="notes">Windows standalone build only. Your files stay in this browser.</p>{/if}
</footer>
