<!-- The replay's screen: the engine's 420 × 378 battle view, the overlay until the visitor presses Watch (the game files, as on the
     game page), the end screen with the result and Watch again, and while footage is rendered its progress, or why it failed. -->
<script>
  import { onMount } from 'svelte';
  import { page } from '../page.svelte.js';
  import { replay, startReplay, pressWatch, watchAgain, cancelFootage, dismissFootage, togglePlay } from './replay.svelte.js';
  import { chooseZip, chooseFolder, forgetCopy } from '../game/game-files.js';
  import { resultOf, ordinal, remaining } from '../../../../shared/replay-text.js';
  import { GRID_MIN_PITCH } from '../game/finish.js';
  import { REPLAY_WIDTH, REPLAY_HEIGHT } from '../../../../shared/emu/host.js';

  let canvas, screen, zipInput, folderInput, zipButton, watchButton, pitch = $state(0);
  let againButton = $state(); // inside the end screen, which comes and goes
  let cancelButton = $state(), backButton = $state(); // inside the footage panel, likewise
  const result = $derived(replay.meta && resultOf(replay.meta));
  const f = replay.footage;
  const percent = $derived(Math.floor(f.progress * 100));

  onMount(() => {
    startReplay(canvas);
    const watch = new ResizeObserver(([e]) => { pitch = e.contentRect.width * devicePixelRatio / REPLAY_WIDTH; });
    watch.observe(screen);
    return () => watch.disconnect();
  });
  $effect(() => { if (page.start) watchButton?.focus(); });
  $effect(() => { if (page.pick) zipButton?.focus(); });
  $effect(() => { if (replay.ended) againButton?.focus(); });
  $effect(() => { cancelButton?.focus(); });
  $effect(() => { backButton?.focus(); });
</script>

<div class="screen replay-screen" bind:this={screen} data-finish={page.finish} data-grid={pitch >= GRID_MIN_PITCH ? '' : null}>
  <!-- A click or tap on the battle plays or pauses it, as the strip's play button does; Space does the same from the keyboard -->
  <canvas width={REPLAY_WIDTH} height={REPLAY_HEIGHT} aria-label="The battle, played back by the game" bind:this={canvas}
    class:clickable={replay.loaded && !page.overlay} onclick={() => { if (replay.loaded && !page.overlay) togglePlay(); }}></canvas>
  <div id="overlay" hidden={!page.overlay}>
    <h2 class="bar">{replay.gone ? 'Replay not found' : replay.unplayable ? "Can't play" : 'Replay'}</h2>
    <p id="status" role="status" hidden={!page.status}>{page.status}</p>
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
    {#if replay.gone || replay.unplayable}<a class="button" href="./">Play the game</a>{/if}
  </div>
  {#if replay.ended && result}
    <div class="ending" role="status">
      <p class="ending-headline">{result.headline}</p>
      {#if result.places.length}
        <ol class="places">{#each result.places as p (p.name)}<li><span class="place">{ordinal(p.place)}</span> {p.name}</li>{/each}</ol>
      {/if}
      {#if result.guessed}<p class="hint">The server had no copy of the game to follow this battle, so it guessed the result</p>{/if}
      <button bind:this={againButton} onclick={watchAgain}>Watch again</button>
    </div>
  {/if}
  {#if f.status === 'rendering'}
    <div class="footage">
      <h2 class="footage-headline">Preparing download</h2>
      <div class="meter" role="progressbar" aria-label="Download" aria-valuemin="0" aria-valuemax="100" aria-valuenow={percent}>
        <span style:transform="scaleX({f.progress})"></span>
      </div>
      <p class="footage-left"><span>{percent}%</span>{#if f.left !== null}<span>{remaining(f.left)}</span>{/if}</p>
      <button class="secondary" bind:this={cancelButton} onclick={cancelFootage}>Cancel</button>
    </div>
  {:else if f.status === 'failed'}
    <div class="footage">
      <h2 class="footage-headline">Couldn't download the replay</h2>
      <p class="hint" role="alert">{f.error}</p>
      <button bind:this={backButton} onclick={dismissFootage}>Back to the replay</button>
    </div>
  {/if}
</div>
