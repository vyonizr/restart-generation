<!-- The touch pad under the game screen: the D-pad, then Select and Back side by side to its right and level with Up, and the quiet
     Keyboard, Soft screen, Full board and Fullscreen icons (DESIGN.md, "One thumb"), with the Guide's book under Full board when the
     copy has a guide (docs/adr/0033). Shown on touch devices only. pad.js does the pointer handling once the game is running. The
     hidden typing field raises the system keyboard; the hidden video keeps the screen on (wake.js). -->
<script>
  import { page, padSession } from './page.svelte.js';
  import { bindPad, canFullscreen, toggleFullscreen } from './pad.js';
  import { openGuide } from './game.js';
  import { toggleFinish } from './finish.js';
  import { toggleBoard } from './board.js';
  import { wakeVideo } from './wake.js';

  let pad = $state(), typing = $state(), typeButton = $state();

  $effect(() => {
    const session = padSession.current;
    if (session) return bindPad({ pad, typing, typeButton, ...session });
  });
</script>

<div class="pad" class:guide={page.guidable} bind:this={pad}>
  <div class="cross">
    <button data-key="up" aria-label="Up"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10V2M2.5 5 6 1.5 9.5 5"/></svg></button>
    <button data-key="left" aria-label="Left"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M10 6H2M5 2.5 1.5 6 5 9.5"/></svg></button>
    <button data-key="right" aria-label="Right"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8M7 2.5 10.5 6 7 9.5"/></svg></button>
    <button data-key="down" aria-label="Down"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8M2.5 7 6 10.5 9.5 7"/></svg></button>
  </div>
  <div class="side-r">
    <button data-key="select" class="select" aria-label="Select">Select</button>
    <button data-key="back" class="back" aria-label="Back">Back</button>
    <button id="type" class="small" aria-label="Keyboard" bind:this={typeButton}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v12H3zM6.5 9.5h1M10.5 9.5h1M14.5 9.5h1M17.5 9.5h.5M6.5 12.5h1M10.5 12.5h1M14.5 12.5h1M17.5 12.5h.5M8 15.5h8"/></svg></button>
    <button id="finish" class="small finish" aria-label="Soft screen" aria-pressed={page.finish === 'soft'} onclick={toggleFinish}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 4h16v16H4zM9.33 4v16M14.67 4v16M4 9.33h16M4 14.67h16"/></svg></button>
    <!-- The Full board: the board's frame with the four corner panels a battle has on it. -->
    {#if page.boardable}<button id="board" class="small board" aria-label="Full board" aria-pressed={page.board === 'full'} onclick={toggleBoard}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h18v14H3zM3 5h4v3H3zM17 5h4v3h-4zM3 16h4v3H3zM17 16h4v3h-4z"/></svg></button>{/if}
    <button id="fullscreen" class="small" aria-label="Fullscreen" hidden={!canFullscreen() || !padSession.current} onclick={toggleFullscreen}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg></button>
    <!-- The Guide: an open book. -->
    {#if page.guidable}<button id="guide-book" class="small" aria-label="Guide" onclick={openGuide}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 5h6.5A2.5 2.5 0 0 1 12 7.5V20a2 2 0 0 0-2-2H3zM21 5h-6.5A2.5 2.5 0 0 0 12 7.5V20a2 2 0 0 1 2-2h7z"/></svg></button>{/if}
  </div>
</div>
<input id="typing" class="typing" aria-label="Type into the game" autocapitalize="off" autocomplete="off" spellcheck="false" value=" " bind:this={typing}>
<video id="wake" class="wake" src="wake.mp4" playsinline preload="none" aria-hidden="true" use:wakeVideo></video>
