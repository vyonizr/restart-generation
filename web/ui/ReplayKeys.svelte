<!-- The replay's controls under its screen on a desktop (replay.svelte.js): keys, or the gamepad's buttons after a press on it. -->
<script>
  import { page } from './page.svelte.js';

  const LEFT = 'M10 6H2M5 2.5 1.5 6 5 9.5', RIGHT = 'M2 6h8M7 2.5 10.5 6 7 9.5';
  const DPAD_SIDES = 'M5.5 1.5h5v4h4v5h-4v4h-5v-4h-4v-5h4z';
  const FACE = [['top', 8, 3], ['left', 3, 8], ['right', 13, 8], ['bottom', 8, 13]];
</script>

{#snippet arrow(d, name)}<kbd><svg viewBox="0 0 12 12" aria-hidden="true"><path {d}/></svg><span class="vh">{name}</span></kbd>{/snippet}

<dl class="keys" aria-label="Replay controls">
  {#if page.input === 'gamepad'}
    <div><dt><kbd class="gamepad"><svg viewBox="0 0 16 16" aria-hidden="true">{#each FACE as [at, cx, cy] (at)}<circle {cx} {cy} r="2" class={{ on: at === 'bottom' }}/>{/each}</svg><span class="vh">Bottom button (A on Xbox, Cross on PlayStation, B on Nintendo)</span></kbd></dt><dd>Play or pause</dd></div>
    <div><dt><kbd class="gamepad"><svg viewBox="0 0 16 16" aria-hidden="true"><path d={DPAD_SIDES}/></svg><span class="vh">D-pad left or right</span></kbd></dt><dd>Back or on 5 s</dd></div>
  {:else}
    <div><dt><kbd>Space</kbd></dt><dd>Play or pause</dd></div>
    <div><dt>{@render arrow(LEFT, 'Left')}{@render arrow(RIGHT, 'Right')}</dt><dd>Back or on 5 s</dd></div>
    <div><dt><kbd>F</kbd></dt><dd>Double speed</dd></div>
    <div><dt><kbd>M</kbd></dt><dd>Mute</dd></div>
  {/if}
</dl>
