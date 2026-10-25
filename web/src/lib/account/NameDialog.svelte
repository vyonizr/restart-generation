<!-- The name dialog: sets the player's name on a server without accounts. From Set name or Change name under Start it saves the name
     for the next login (rename); at an online login without a name it logs in with it. -->
<script>
  import Dialog from '../components/Dialog.svelte';
  import { page } from '../page.svelte.js';
  import { submitName, cancelName, renameTo, cancelRename } from './login.js';

  const rename = page.nameLogin.rename;
  const cancel = rename ? cancelRename : cancelName;
</script>

<Dialog tag="form" id="login" titleId="login-title" focus="#username" oncancel={cancel} onsubmit={form => (rename ? renameTo : submitName)(form.elements.username.value)}>
  <h2 class="bar" id="login-title">Set your name</h2>
  <label>Player name <input id="username" name="username" autocomplete="username" maxlength="15" pattern={'[A-Za-z0-9_]{1,15}'} title="Letters, numbers and _, up to 15" required value={page.nameLogin.value}></label>
  <div class="row"><button type="button" class="secondary" id="login-cancel" onclick={cancel}>Cancel</button><button type="submit" id="login-ok">{rename ? 'Save' : 'Play online'}</button></div>
</Dialog>
