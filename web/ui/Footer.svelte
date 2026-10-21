<!-- The notices (docs/LEGAL.md). "Bring your own copy of the game" and the note about the files appear only where the player brings them:
     never on a server that sends the game files itself (RG_GAME set), whatever this browser has stored. That server says instead that it
     sends a copy, and where a rights holder can ask for its removal (RG_CONTACT). A server with accounts says what it keeps. -->
<script>
  import { page } from './page.svelte.js';

  // An email address becomes a mailto link; the server only passes an email address or an https address (auth.js CONTACT).
  const contactHref = c => (c.startsWith('https://') ? c : `mailto:${c}`);
  // Where this page's source is (the GPL asks that whoever gets the page's code can get its source).
  const SOURCE = 'https://github.com/vyonizr/restart-generation';
</script>

<footer>
  <p class="disclaimer"><strong>Restart Generation</strong> is an unofficial fan revival of Reset Generation © 2008 RedLynx. It is not affiliated with or endorsed by RedLynx, Ubisoft or Nokia, and their names and trademarks belong to their owners.{#if page.ownCopy}{' Bring your own copy of the game.'}{/if}<br>Made by vyonizr.{#if page.server?.invite}{' · '}<a href={page.server.invite} target="_blank" rel="noopener">Join the Discord</a>{/if}</p>
  <div class="notes">
    {#if page.ownCopy}<p>Windows standalone build only. Your files stay in this browser.</p>{:else}<p>This server sends a copy of Reset Generation to its visitors.{#if page.server?.contact}{' A rights holder who wants it removed can write to '}<a href={contactHref(page.server.contact)}>{page.server.contact}</a>.{/if}</p>{/if}
    {#if page.server?.accounts}<p>This server keeps your Discord ID and in-game name, and no email address. <strong>Delete my account</strong> removes them.</p>{/if}
    <p>Free software under the GNU GPL, version 3, with no warranty. <a href="licenses.txt">Licences</a> · <a href={SOURCE} target="_blank" rel="noopener">Source</a></p>
  </div>
</footer>
