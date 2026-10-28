<script>
  import { onMount } from 'svelte';
  import { page } from './lib/page.svelte.js';
  import { startGame, openGuide } from './lib/game/game.js';
  import { touch } from './lib/device.js';
  import { focusTarget, focusOn } from './lib/focus.js';
  import { toggleFinish, GRID_MIN_PITCH } from './lib/game/finish.js';
  import { frameView, FRAMES, setBoard, toggleBoard } from './lib/game/board.js';
  import Pad from './lib/input/Pad.svelte';
  import Overlay from './lib/game/Overlay.svelte';
  import Rejoin from './lib/game/Rejoin.svelte';
  import Keys from './lib/input/Keys.svelte';
  import Footer from './lib/legal/Footer.svelte';
  import Who from './lib/account/Who.svelte';
  import WhoChip from './lib/account/WhoChip.svelte';
  import Online from './lib/account/Online.svelte';
  import MemberDialog from './lib/account/MemberDialog.svelte';
  import ConfirmDialog from './lib/components/ConfirmDialog.svelte';
  import NameDialog from './lib/account/NameDialog.svelte';
  import BotsDialog from './lib/game/BotsDialog.svelte';
  import NoticesDialog from './lib/legal/NoticesDialog.svelte';
  import ReplaysDialog from './lib/replay/ReplaysDialog.svelte';
  import GuideDialog from './lib/guide/GuideDialog.svelte';

  // The view the game screen is framed for (board.js): the frame's shape follows it.
  const frame = $derived(frameView());
  let canvas, screen, cssWidth = $state(0), softWidth = $state(0);
  // Device pixels per game pixel: the grid stays clean only where this is wide enough (GRID_MIN_PITCH).
  const pitch = $derived(cssWidth * devicePixelRatio / FRAMES[frame].width);
  onMount(() => {
    startGame(canvas);
    const watch = new ResizeObserver(([e]) => { cssWidth = e.contentRect.width; });
    watch.observe(screen);
    return () => watch.disconnect();
  });
  const useClassic = () => { page.slow = null; setBoard('classic'); };
</script>

<div class="page" data-frame={frame}>
  <header><h1 class="name">Restart Generation</h1><Online where="online-head" /><div class="who" id="who" hidden={!page.who}><Who /></div></header>
  <span class="ghost" aria-hidden="true">Restart<br>Generation</span>
  <main>
    <!-- Touch devices have no header: the line at the top of the page holds the who chip and the online count, and stays while the
         game runs. -->
    {#if touch}<div class="top-line" hidden={!page.who && !page.onlineName && page.online === null}><WhoChip /><Online where="online-top" /></div>{/if}
    <div class="screen" bind:this={screen} data-finish={page.finish} data-grid={pitch >= GRID_MIN_PITCH ? '' : null}>
      <canvas id="screen" width="420" height="378" tabindex={page.playing ? 0 : -1} aria-label="Game screen" inert={page.dialogs > 0} bind:this={canvas} use:focusTarget={'screen'}></canvas>
      <Overlay />
      <Rejoin />
      {#if page.nameLogin}<NameDialog />{/if}
      <BotsDialog />
      {#if page.nameDialog}<MemberDialog />{/if}
      {#if page.confirm}<ConfirmDialog />{/if}
    </div>
    {#if touch}<Pad />{/if}
    <p class="slow" id="slow" role="status" hidden={!page.slow}><span id="slow-text">{page.slow}</span>{#if page.slowClassic && page.board === 'full'}<button class="secondary" onclick={useClassic}>Use Classic</button>{/if}<button id="slow-close" class="secondary" onclick={() => { page.slow = null; }}>Dismiss</button></p>
    <p class="nudge" id="nudge" role="status" hidden={!page.notice}><span id="nudge-text">{page.notice?.text}</span><span class="nudge-actions" id="nudge-actions">{#if page.notice}{#each page.notice.actions as action}{#if action.href}<a class="button" href={action.href} target="_blank" rel="noopener">{action.label}</a>{:else}<button type="button" class={action.secondary ? 'secondary' : ''} onclick={() => { if (!action.keep) page.notice = null; action.run?.(); }}>{action.label}</button>{/if}{/each}{/if}</span></p>
    <!-- Guide at the left end, as wide as Soft screen, and the two toggles at the right end. -->
    <div class="sub">
      {#if page.guidable}<span class="sub-start"><button type="button" class="secondary guide-open" style:width={softWidth ? `${softWidth}px` : null} onclick={openGuide}>Guide</button></span>{/if}
      <span class="sub-end">
        {#if page.boardable}<button type="button" class="secondary finish board" aria-pressed={page.board === 'full'} onclick={() => { toggleBoard(); focusOn('screen'); }}>Full board</button>{/if}
        <button type="button" class="secondary finish" bind:offsetWidth={softWidth} aria-pressed={page.finish === 'soft'} onclick={() => { toggleFinish(); focusOn('screen'); }}>Soft screen</button>
      </span>
    </div>
    <Keys />
  </main>
  <Footer />
  {#if page.notices}<NoticesDialog />{/if}
  {#if page.replays}<ReplaysDialog />{/if}
  {#if page.guide}<GuideDialog />{/if}
</div>
