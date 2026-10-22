<!-- The replay's screen: the engine's 420 × 378 battle view, the overlay until the visitor presses Watch (the game files, as on the
     game page), and the end screen with the result and Watch again. -->
<script>
  import { onMount } from 'svelte';
  import { page } from './page.svelte.js';
  import { replay, startReplay, pressWatch, watchAgain } from './replay.svelte.js';
  import { chooseZip, chooseFolder, forgetCopy } from './gamefiles.js';
  import { resultOf, ordinal } from '../replay-text.js';
  import { GRID_MIN_PITCH } from './finish.js';
  import { REPLAY_WIDTH, REPLAY_HEIGHT } from '../emu/host.js';

  let canvas, screen, zipInput, folderInput, zipButton, watchButton, pitch = $state(0);
  let againButton = $state(); // inside the end screen, which comes and goes
  const result = $derived(replay.meta && resultOf(replay.meta));

  onMount(() => {
    startReplay(canvas);
    const watch = new ResizeObserver(([e]) => { pitch = e.contentRect.width * devicePixelRatio / REPLAY_WIDTH; });
    watch.observe(screen);
    return () => watch.disconnect();
  });
  $effect(() => { if (page.start) watchButton?.focus(); });
  $effect(() => { if (page.pick) zipButton?.focus(); });
  $effect(() => { if (replay.ended) againButton?.focus(); });
</script>

<div class="screen replay-screen" bind:this={screen} data-finish={page.finish} data-grid={pitch >= GRID_MIN_PITCH ? '' : null}>
  <canvas width={REPLAY_WIDTH} height={REPLAY_HEIGHT} aria-label="The battle, played back by the game" bind:this={canvas}></canvas>
  <div id="overlay" hidden={!page.overlay}>
    <h2 class="bar">{replay.gone ? 'Replay gone' : 'Replay'}</h2>
    <p id="status" role="status">{page.status}</p>
    <div id="pick" hidden={!page.pick}>
      <button id="pick-zip" bind:this={zipButton} onclick={() => zipInput.click()}>Choose .zip file</button>
      <button id="pick-folder" class="secondary" onclick={() => folderInput.click()}>Choose folder</button>
      <p class="hint">The replay plays in the game itself, so it needs your copy of the Windows standalone build. Your files stay in this browser.</p>
    </div>
    <input type="file" accept=".zip,application/zip" hidden bind:this={zipInput}
      onchange={() => { const file = zipInput.files[0]; zipInput.value = ''; chooseZip(file); }}>
    <input type="file" webkitdirectory multiple hidden bind:this={folderInput}
      onchange={() => { const files = [...folderInput.files]; folderInput.value = ''; chooseFolder(files); }}>
    <button id="start" hidden={!page.start} bind:this={watchButton} onclick={pressWatch}>Watch</button>
    <div id="recover" hidden={!page.recover}>
      <button onclick={() => location.reload()}>Reload</button>
      <button class="secondary" hidden={!page.forgettable} onclick={() => forgetCopy().finally(() => location.reload())}>Use a different copy</button>
    </div>
    {#if replay.gone}<a class="button" href="./">Play Restart Generation</a>{/if}
  </div>
  {#if replay.ended && result}
    <div class="ending" role="status">
      <p class="ending-headline">{result.headline}</p>
      {#if result.places.length}
        <ol class="places">{#each result.places as p (p.name)}<li><span class="place">{ordinal(p.place)}</span> {p.name}</li>{/each}</ol>
      {/if}
      {#if result.guessed}<p class="hint">The server had no copy of the game to follow this battle, so it guessed the result.</p>{/if}
      <button bind:this={againButton} onclick={watchAgain}>Watch again</button>
    </div>
  {/if}
</div>
