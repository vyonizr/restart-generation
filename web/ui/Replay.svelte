<!-- The replay page (CONTEXT.md "Replay"), /replay/<id>: the battle played back in the game's own replay player. -->
<script>
  import { page } from './page.svelte.js';
  import { replay } from './replay.svelte.js';
  import { toggleFinish } from './finish.js';
  import { touch } from './device.js';
  import { ENVIRONMENTS } from '../replay-text.js';
  import Footer from './Footer.svelte';
  import NoticesDialog from './NoticesDialog.svelte';
  import CopyLink from './CopyLink.svelte';
  import ExportFootage from './ExportFootage.svelte';
  import ReplayBroadcast from './ReplayBroadcast.svelte';
  import ReplayKeys from './ReplayKeys.svelte';

  const day = meta => new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(meta.created);
</script>

<div class="page replay-page">
  <header><a class="name" href="./">Restart Generation</a>{#if !replay.gone}<span class="share"><ExportFootage /><CopyLink /></span>{/if}</header>
  <span class="ghost" aria-hidden="true">Restart<br>Generation</span>
  <main>
    <ReplayBroadcast />
    {#if !replay.gone}
      <div class="sub">
        {#if replay.meta}<p class="facts">{replay.meta.ranked ? 'Ranked' : 'Friendly'} match on {ENVIRONMENTS[replay.meta.environment] ?? 'an unknown environment'}, {day(replay.meta)}</p>{/if}
        <button type="button" class="secondary finish" aria-pressed={page.finish === 'soft'} onclick={toggleFinish}>Soft screen</button>
        {#if replay.footage.status === 'unsupported'}<p class="footage-note" id="footage-note">Your browser can't export footage. Try Chrome or Edge.</p>{/if}
      </div>
      {#if !touch}<ReplayKeys />{/if}
    {/if}
  </main>
  <Footer />
  {#if page.notices}<NoticesDialog />{/if}
</div>
