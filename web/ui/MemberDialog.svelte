<!-- The member's in-game name, asked once after Discord sends the player back (ADR 0011). -->
<script>
  import Dialog from './Dialog.svelte';
  import { page } from './page.svelte.js';
  import { answerName } from './accounts.js';

  let input = $state();
  // Each call to ask again (with an error) puts a new object in page.nameDialog: select the text so typing replaces it.
  $effect(() => { page.nameDialog; input?.select(); });
</script>

<Dialog tag="form" id="member" titleId="member-title" focus="#member-name" oncancel={() => answerName(null)} onsubmit={form => answerName(form.elements.username.value.trim())}>
  <h2 class="bar" id="member-title">Choose your name</h2>
  <label>Player name <input id="member-name" name="username" autocomplete="off" maxlength="15" pattern={'[A-Za-z0-9_]{1,15}'} title="Letters, numbers and _, up to 15" required bind:this={input} value={page.nameDialog.value}></label>
  <p class="error" id="member-error" role="alert" hidden={!page.nameDialog.error}>{page.nameDialog.error}</p>
  <p>This is the name other players see. You can't change it later.{#if page.server?.adminName} By saving it, you accept the <a href="terms/" target="_blank" rel="noopener">Terms</a> and the <a href="privacy/" target="_blank" rel="noopener">Privacy policy</a>.{/if}</p>
  <div class="row"><button type="button" class="secondary" id="member-cancel" onclick={() => answerName(null)}>Cancel</button><button type="submit">Save</button></div>
</Dialog>
