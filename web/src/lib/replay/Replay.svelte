<!-- The replay page (CONTEXT.md "Replay"), /replay/<id>: the battle played back in the game's own replay player. -->
<script>
  import { page } from '../page.svelte.js';
  import { replay } from './replay.svelte.js';
  import { toggleFinish } from '../game/finish.js';
  import { touch } from '../device.js';
  import Footer from '../legal/Footer.svelte';
  import NoticesDialog from '../legal/NoticesDialog.svelte';
  import ReplayBroadcast from './ReplayBroadcast.svelte';
  import ReplayKeys from './ReplayKeys.svelte';

  // Why Download replay is disabled where it can never work (replay.svelte.js)
  const FOOTAGE_NOTES = {
    insecure: 'Download replay needs a secure page: open this replay over HTTPS, or at localhost on the PC that runs the server.',
    unsupported: "Your browser can't download replays. Try Chrome or Edge.",
  };
</script>

<div class="page replay-page">
  <header><a class="name" href="./">Restart Generation</a></header>
  <span class="ghost" aria-hidden="true">Restart<br>Generation</span>
  <main>
    <ReplayBroadcast />
    {#if !replay.gone}
      <div class="sub">
        <button type="button" class="secondary finish" aria-pressed={page.finish === 'soft'} onclick={toggleFinish}>Soft screen</button>
        {#if FOOTAGE_NOTES[replay.footage.status]}<p class="footage-note" id="footage-note">{FOOTAGE_NOTES[replay.footage.status]}</p>{/if}
      </div>
      {#if !touch}<ReplayKeys />{/if}
    {/if}
  </main>
  <Footer />
  {#if page.notices}<NoticesDialog />{/if}
</div>
