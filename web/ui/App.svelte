<script>
  import { onMount } from 'svelte';
  import { page } from './page.svelte.js';
  import { startGame } from './game.js';
  import { touch } from './device.js';
  import { focusTarget } from './focus.js';
  import Pad from './Pad.svelte';
  import Overlay from './Overlay.svelte';
  import Keys from './Keys.svelte';
  import Footer from './Footer.svelte';
  import Who from './Who.svelte';
  import Strip from './Strip.svelte';
  import MemberDialog from './MemberDialog.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import NameDialog from './NameDialog.svelte';
  import BotsDialog from './BotsDialog.svelte';

  let canvas;
  onMount(() => startGame(canvas));
</script>

<div class="page">
  <header><h1 class="name">Restart Generation</h1><div class="who" id="who" hidden={!page.who}><Who /></div></header>
  <span class="ghost" aria-hidden="true">Restart<br>Generation</span>
  <main>
    <div class="screen">
      <canvas id="screen" width="240" height="320" tabindex={page.playing ? 0 : -1} aria-label="Game screen" inert={page.dialogs > 0} bind:this={canvas} use:focusTarget={'screen'}></canvas>
      <Overlay />
      {#if page.nameLogin}<NameDialog />{/if}
      <BotsDialog />
      {#if page.nameDialog}<MemberDialog />{/if}
      {#if page.confirm}<ConfirmDialog />{/if}
    </div>
    {#if touch}<Pad />{/if}
    <p class="slow" id="slow" role="status" hidden={!page.slow}><span id="slow-text">{page.slow}</span><button id="slow-close" class="secondary" onclick={() => { page.slow = null; }}>Dismiss</button></p>
    <p class="nudge" id="nudge" role="status" hidden={!page.notice}><span id="nudge-text">{page.notice?.text}</span><span class="nudge-actions" id="nudge-actions">{#if page.notice}{#each page.notice.actions as action}<button type="button" class={action.secondary ? 'secondary' : ''} onclick={() => { page.notice = null; action.run?.(); }}>{action.label}</button>{/each}{/if}</span></p>
    <p class="sub" hidden={Boolean(page.notice)}>The original 2008 game, right in your browser (again){#if page.server}<Strip />{/if}</p>
    <Keys />
  </main>
  <Footer />
</div>
