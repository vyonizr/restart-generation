<!-- The frame of the Terms and the Privacy policy (docs/adr/0021): the header with the way back to the game, the title, who answers
     for this server, a list of the sections beside the text on a wide screen, and the footer's non-affiliation line. -->
<script>
  import { contactHref } from './contact.js';

  let { title, ghost, changed, toc, server, children } = $props();
</script>

<div class="doc">
  <header>
    <a class="name" href="../">Restart Generation</a>
    <a class="back" href="../">Back to the game</a>
  </header>
  <span class="doc-ghost" aria-hidden="true">{ghost}</span>
  <main>
    <nav class="toc" aria-label="Sections">
      <ol>{#each toc as [id, label]}<li><a href="#{id}">{label}</a></li>{/each}</ol>
    </nav>
    <article>
      <h1 class="bar">{title}</h1>
      <p class="changed">Last changed {changed}</p>
      {#if server?.adminName}
        <dl class="facts">
          <div><dt>Run by</dt><dd>{server.adminName}</dd></div>
          <div><dt>Data stored by</dt><dd>{server.hosting}</dd></div>
          <div><dt>Write to</dt><dd><a href={contactHref(server.contact)} target="_blank" rel="noopener">{server.contact.replace(/^https:\/\//, '')}</a></dd></div>
        </dl>
      {:else}
        <p class="facts lone">This page wasn't sent by a public server, so it names no admin. A public server fills in who runs it, who stores its data, and where to write.</p>
      {/if}
      {@render children()}
    </article>
  </main>
  <footer>
    <p class="disclaimer">Unofficial fan revival of Reset Generation © 2008 RedLynx; not affiliated with RedLynx, Ubisoft or Nokia.<br>Made by vyonizr. · <a href="../terms/">Terms</a> · <a href="../privacy/">Privacy policy</a></p>
  </footer>
</div>
