<!-- The Arena login dialog: sets the player's name on a server without accounts, at the first online login. -->
<script>
  import Dialog from './Dialog.svelte';
  import { page } from './page.svelte.js';
  import { submitName, cancelName } from './login.svelte.js';
</script>

<Dialog tag="form" id="login" titleId="login-title" focus="#username" oncancel={cancelName} onsubmit={form => submitName(form.elements.username.value)}>
  <h2 class="bar" id="login-title">Set your name</h2>
  <label>Player name <input id="username" name="username" autocomplete="username" maxlength="15" pattern={'[A-Za-z0-9_]{1,15}'} title="Letters, numbers and _, up to 15" required value={page.nameLogin.value}></label>
  <div class="row"><button type="button" class="secondary" id="login-cancel" onclick={cancelName}>Cancel</button><button type="submit" id="login-ok">Play online</button></div>
</Dialog>
