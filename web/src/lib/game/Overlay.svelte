<!-- Over the game screen until the game starts, and again when it fails or the player quits: what the page is doing, the file
     picker, Start, and the way out of an error. -->
<script>
  import { page } from '../page.svelte.js';
  import Who from '../account/Who.svelte';
  import Online from '../account/Online.svelte';
  import { changeName } from '../account/login.js';
  import { chooseZip, chooseFolder } from './game-files.js';
  import { pressStart, reload, useDifferentCopy, retryQuit } from './game.js';
  import { focusTarget } from '../focus.js';

  let zipInput, folderInput, zipButton, startButton, reloadButton, retryButton;

  // Whatever the page now asks the player to press has focus.
  $effect(() => { if (page.start) startButton?.focus(); });
  $effect(() => { if (page.pick) zipButton?.focus(); });
  $effect(() => { if (page.recover) reloadButton?.focus(); });
  $effect(() => { if (page.unsent) retryButton?.focus(); });
</script>

<div id="overlay" hidden={!page.overlay} inert={page.dialogs > 0}>
  <h2 class="bar">Restart<br>Generation</h2>
  <p id="status" role="status">{page.status}</p>
  <div id="pick" hidden={!page.pick}>
    <button id="pick-zip" bind:this={zipButton} onclick={() => zipInput.click()}>Choose .zip file</button>
    <button id="pick-folder" class="secondary" onclick={() => folderInput.click()}>Choose folder</button>
    <p class="hint"><span class="desktop-only">Windows standalone build only.</span><span class="touch-only">The Windows standalone build's .zip only.</span> Your files stay in this browser.</p>
  </div>
  <input id="pick-zip-input" type="file" accept=".zip,application/zip" hidden bind:this={zipInput}
    onchange={() => { const file = zipInput.files[0]; zipInput.value = ''; chooseZip(file); }}>
  <input id="pick-input" type="file" webkitdirectory multiple hidden bind:this={folderInput}
    onchange={() => { const files = [...folderInput.files]; folderInput.value = ''; chooseFolder(files); }}>
  <button id="start" hidden={!page.start} bind:this={startButton} use:focusTarget={'start'} onclick={pressStart}>Start</button>
  <p class="hint" id="accept" hidden={!page.start || !page.server?.adminName}>By playing online you accept the <a href="terms/" target="_blank" rel="noopener">Terms</a> and the <a href="privacy/" target="_blank" rel="noopener">Privacy policy</a>.</p>
  <p class="hint" id="online-as" hidden={!page.onlineName}>Online as <b id="online-name">{page.onlineName}</b> · <button id="change-name" class="secondary" onclick={changeName}>{page.onlineNamed ? 'Change name' : 'Set name'}</button>{#if page.server?.replays && page.onlineNamed}{' · '}<button id="online-replays" class="secondary" onclick={() => { page.replays = page.onlineName; }}>Replays</button>{/if}</p>
  <p class="hint touch-only who" id="who-touch" hidden={!page.who}><Who /></p>
  <p class="online-line touch-only" hidden={page.online === null}><Online icon /></p>
  <div id="recover" hidden={!page.recover}>
    <button id="reload" bind:this={reloadButton} onclick={reload}>Reload</button>
    <button id="forget" class="secondary" hidden={!page.forgettable} onclick={useDifferentCopy}>Use a different copy</button>
  </div>
  <div id="unsent" hidden={!page.unsent}>
    <button id="retry-quit" bind:this={retryButton} onclick={retryQuit}>Try again</button>
    <button id="quit-anyway" class="secondary" onclick={reload}>Quit anyway</button>
  </div>
</div>
