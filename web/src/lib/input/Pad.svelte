<!-- The touch pad under the game screen (DESIGN.md "Touch pad", .scratch/touch-controls/spec.md): a round D-pad cut into four wedges
     with a dead centre where the thumb rests; a big round Select and a smaller round Back right of it; and under both, the rarely
     pressed tools as a labeled bar: Keyboard, Soft screen, Full board, Fullscreen, and the Guide when the copy has one
     (docs/adr/0033). Shown on touch devices only. pad.js does the pointer handling once the game is running. The hidden typing field
     raises the system keyboard; the hidden video keeps the screen on (wake.js). -->
<script>
  import { page, padSession } from '../page.svelte.js';
  import { bindPad, canFullscreen, toggleFullscreen } from './pad.js';
  import { openGuide } from '../game/game.js';
  import { toggleFinish } from '../game/finish.js';
  import { toggleBoard } from '../game/board.js';
  import { wakeVideo } from '../game/wake.js';

  // Each wedge's arrow, drawn on a 12-unit square.
  const ARROWS = [
    ['up', 'Up', 'M6 10V2M2.5 5 6 1.5 9.5 5'], ['right', 'Right', 'M2 6h8M7 2.5 10.5 6 7 9.5'],
    ['down', 'Down', 'M6 2v8M2.5 7 6 10.5 9.5 7'], ['left', 'Left', 'M10 6H2M5 2.5 1.5 6 5 9.5'],
  ];
  let pad = $state(), typing = $state(), typeButton = $state();

  $effect(() => {
    const session = padSession.current;
    if (session) return bindPad({ pad, typing, typeButton, ...session });
  });
</script>

{#snippet tool(d)}<svg viewBox="0 0 24 24" aria-hidden="true"><path {d}/></svg>{/snippet}

<div class="pad" bind:this={pad}>
  <div class="disc">
    {#each ARROWS as [key, name, d] (key)}
      <button data-key={key} class="wedge {key}" aria-label={name}><svg viewBox="0 0 12 12" aria-hidden="true"><path {d}/></svg></button>
    {/each}
    <!-- Where the thumb rests: it presses nothing, so a thumb back in the middle lets go of its arrow. -->
    <span class="rest" aria-hidden="true"></span>
  </div>
  <div class="buttons">
    <button data-key="back" class="back">Back</button>
    <button data-key="select" class="select">Select</button>
  </div>
  <div class="tools">
    <button id="type" bind:this={typeButton}>{@render tool('M3 6h18v12H3zM6.5 9.5h1M10.5 9.5h1M14.5 9.5h1M17.5 9.5h.5M6.5 12.5h1M10.5 12.5h1M14.5 12.5h1M17.5 12.5h.5M8 15.5h8')}Keyboard</button>
    <button id="finish" aria-pressed={page.finish === 'soft'} onclick={toggleFinish}>{@render tool('M4 4h16v16H4zM9.33 4v16M14.67 4v16M4 9.33h16M4 14.67h16')}Soft screen</button>
    <!-- The Full board: the board's frame with the four corner panels a battle has on it. -->
    {#if page.boardable}<button id="board" aria-pressed={page.board === 'full'} onclick={toggleBoard}>{@render tool('M3 5h18v14H3zM3 5h4v3H3zM17 5h4v3h-4zM3 16h4v3H3zM17 16h4v3h-4z')}Full board</button>{/if}
    <button id="fullscreen" hidden={!canFullscreen() || !padSession.current} onclick={toggleFullscreen}>{@render tool('M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5')}Fullscreen</button>
    <!-- The Guide: an open book. -->
    {#if page.guidable}<button id="guide-book" onclick={openGuide}>{@render tool('M3 5h6.5A2.5 2.5 0 0 1 12 7.5V20a2 2 0 0 0-2-2H3zM21 5h-6.5A2.5 2.5 0 0 0 12 7.5V20a2 2 0 0 1 2-2h7z')}Guide</button>{/if}
  </div>
</div>
<input id="typing" class="typing" aria-label="Type into the game" autocapitalize="off" autocomplete="off" spellcheck="false" value=" " bind:this={typing}>
<video id="wake" class="wake" src="wake.mp4" playsinline preload="none" aria-hidden="true" use:wakeVideo></video>
