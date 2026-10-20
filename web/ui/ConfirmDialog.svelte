<!-- A yes/no question over the game screen. Cancel has focus, so Enter never confirms by accident. -->
<script>
  import Dialog from './Dialog.svelte';
  import { page } from './page.svelte.js';
  import { answerConfirm } from './accounts.js';
</script>

<Dialog id="confirm" titleId="confirm-title" focus="#confirm-no" oncancel={() => answerConfirm(false)}>
  <h2 class="bar" id="confirm-title">{page.confirm.title}</h2>
  <p id="confirm-text">{page.confirm.text}</p>
  <div class="row"><button type="button" class="secondary" id="confirm-no" onclick={() => answerConfirm(false)}>{page.confirm.no}</button><button type="button" id="confirm-yes" onclick={() => answerConfirm(true)}>{page.confirm.yes}</button></div>
</Dialog>
