<!-- The touch pad under the game screen: the D-pad, then Select and Back side by side to its right and level with Up, and the quiet
     Keyboard and Fullscreen icons (DESIGN.md, "One thumb"). Shown on touch devices only. pad.js does the pointer handling once the
     game is running. The hidden typing field raises the system keyboard; the hidden video keeps the screen on (wake.js). -->
<script>
  import { page, padSession } from './page.svelte.js';
  import { bindPad, canFullscreen, toggleFullscreen } from './pad.js';
  import { toggleFinish } from './finish.js';
  import { wakeVideo } from './wake.js';

  let pad = $state(), typing = $state(), typeButton = $state();

  $effect(() => {
    const session = padSession.current;
    if (session) return bindPad({ pad, typing, typeButton, ...session });
  });
</script>

<div class="pad" bind:this={pad}>
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
    <button id="fullscreen" class="small" aria-label="Fullscreen" hidden={!canFullscreen() || !padSession.current} onclick={toggleFullscreen}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg></button>
  </div>
</div>
<input id="typing" class="typing" aria-label="Type into the game" autocapitalize="off" autocomplete="off" spellcheck="false" value=" " bind:this={typing}>
<video id="wake" class="wake" src="wake.mp4" playsinline preload="none" aria-hidden="true" use:wakeVideo></video>
