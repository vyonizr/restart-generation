<script>
  import { onMount } from 'svelte';
  import { page } from './page.svelte.js';
  import { startGame } from './game.js';
  import { touch } from './device.js';
  import { focusTarget, focusOn } from './focus.js';
  import { toggleFinish, GRID_MIN_PITCH } from './finish.js';
  import Pad from './Pad.svelte';
  import Overlay from './Overlay.svelte';
  import Keys from './Keys.svelte';
  import Footer from './Footer.svelte';
  import Who from './Who.svelte';
  import Online from './Online.svelte';
  import MemberDialog from './MemberDialog.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import NameDialog from './NameDialog.svelte';
  import BotsDialog from './BotsDialog.svelte';
  import NoticesDialog from './NoticesDialog.svelte';

  let canvas, screen, pitch = $state(0);
  onMount(() => {
    startGame(canvas);
    // Device pixels per game pixel: the grid stays clean only where this is wide enough (GRID_MIN_PITCH).
    const watch = new ResizeObserver(([e]) => { pitch = e.contentRect.width * devicePixelRatio / 240; });
    watch.observe(screen);
    return () => watch.disconnect();
  });
</script>

<div class="page">
  <header><h1 class="name">Restart Generation</h1><div class="who" id="who" hidden={!page.who}><Who /></div></header>
  <span class="ghost" aria-hidden="true">Restart<br>Generation</span>
  <main>
    <div class="screen" bind:this={screen} data-finish={page.finish} data-grid={pitch >= GRID_MIN_PITCH ? '' : null}>
      <canvas id="screen" width="240" height="320" tabindex={page.playing ? 0 : -1} aria-label="Game screen" inert={page.dialogs > 0} bind:this={canvas} use:focusTarget={'screen'}></canvas>
      <Overlay />
      {#if page.nameLogin}<NameDialog />{/if}
      <BotsDialog />
      {#if page.nameDialog}<MemberDialog />{/if}
      {#if page.confirm}<ConfirmDialog />{/if}
    </div>
    {#if touch}<Pad />{/if}
    <p class="slow" id="slow" role="status" hidden={!page.slow}><span id="slow-text">{page.slow}</span><button id="slow-close" class="secondary" onclick={() => { page.slow = null; }}>Dismiss</button></p>
    <p class="nudge" id="nudge" role="status" hidden={!page.notice}><span id="nudge-text">{page.notice?.text}</span><span class="nudge-actions" id="nudge-actions">{#if page.notice}{#each page.notice.actions as action}{#if action.href}<a class="button" href={action.href} target="_blank" rel="noopener">{action.label}</a>{:else}<button type="button" class={action.secondary ? 'secondary' : ''} onclick={() => { if (!action.keep) page.notice = null; action.run?.(); }}>{action.label}</button>{/if}{/each}{/if}</span></p>
    <div class="sub">
      <span class="sub-online" hidden={page.online === null || Boolean(page.notice)}><Online /></span>
      <button type="button" class="secondary finish" aria-pressed={page.finish === 'soft'} onclick={() => { toggleFinish(); focusOn('screen'); }}>Soft screen</button>
    </div>
    <Keys />
  </main>
  <Footer />
  {#if page.notices}<NoticesDialog />{/if}
</div>
