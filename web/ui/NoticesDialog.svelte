<!-- The notices (docs/LEGAL.md), opened from the footer's Notices button. "Bring your own copy" and the note about the files appear only
     where the player brings them: never on a server that sends the game files itself (RG_SEND_GAME=1), whatever this browser has stored.
     That server says instead that it sends a copy, and where a rights holder can ask for its removal (RG_CONTACT). A public server
     links its Terms and Privacy policy (docs/adr/0021), which say what it keeps. -->
<script>
  import Dialog from './Dialog.svelte';
  import { page } from './page.svelte.js';
  import { contactHref } from './contact.js';
  // Where this page's source is (the GPL asks that whoever gets the page's code can get its source).
  const SOURCE = 'https://github.com/vyonizr/restart-generation';
  const close = () => { page.notices = false; };
  // The server's version (CONTEXT.md "Version"), already SemVer; a server that knows no release reports something else, and shows none.
  const version = $derived(/^\d+\.\d+\.\d+/.test(page.server?.version ?? '') ? page.server.version : '');
</script>

<Dialog id="notices" titleId="notices-title" focus="#notices-close" oncancel={close}>
  <h2 class="bar" id="notices-title">Notices</h2>
  <p><strong>Restart Generation</strong> is an unofficial fan revival of Reset Generation © 2008 RedLynx. It is not affiliated with or endorsed by RedLynx, Ubisoft or Nokia, and their names and trademarks belong to their owners.</p>
  {#if page.ownCopy}
    <p>Windows standalone build only. Your files stay in this browser.</p>
  {:else}
    <p>This server sends a copy of Reset Generation to its visitors.{#if page.server?.contact}{' A rights holder who wants it removed can write to '}<a href={contactHref(page.server.contact)} target="_blank" rel="noopener">{page.server.contact}</a>.{/if}</p>
  {/if}
  {#if page.server?.adminName}<p>The <a href="terms/" target="_blank" rel="noopener">Terms</a> and the <a href="privacy/" target="_blank" rel="noopener">Privacy policy</a> say how to play on this server, what it keeps about you, and how to remove it.</p>{/if}
  <p>Free software under the GNU GPL, version 3, with no warranty. <a href="licenses.txt" target="_blank" rel="noopener">Licenses</a> · <a href={SOURCE} target="_blank" rel="noopener">Source</a>{#if version}{' · Version '}{version}{/if}</p>
  <div class="row"><button type="button" id="notices-close" onclick={close}>Close</button></div>
</Dialog>
