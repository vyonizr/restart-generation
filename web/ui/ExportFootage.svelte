<!-- Download replay: saves the replay as footage (CONTEXT.md "Footage"), an MP4 file it renders (replay.svelte.js). It works as soon
     as Watch does, in a browser that can encode the file, and says why where it never will; it says "Downloaded" for 2.5 s after a
     save, and takes focus back when the screen's progress or failure goes away. -->
<script>
  import { tick } from 'svelte';
  import { replay, exportFootage } from './replay.svelte.js';

  let button, label = $state('Download replay'), timer;
  const f = replay.footage;
  const off = $derived(f.status !== 'ready' || !replay.booted || replay.unplayable);

  async function press() {
    const saved = await exportFootage();
    if (f.status === 'failed') return; // the screen's Back to the replay has focus
    await tick(); // enabled again
    button?.focus();
    if (!saved) return;
    label = 'Downloaded';
    clearTimeout(timer);
    timer = setTimeout(() => { label = 'Download replay'; }, 2500);
  }
  // Back from the failure's Back to the replay, which is gone once pressed.
  let was = f.status;
  $effect(() => { if (was === 'failed' && f.status === 'ready') button?.focus(); was = f.status; });
</script>

<button type="button" class="secondary export-footage" bind:this={button} disabled={off} onclick={press}
  aria-describedby={f.status === 'unsupported' || f.status === 'insecure' ? 'footage-note' : null}>
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/></svg>
  <span class="label" aria-live="polite">{label}</span>
</button>
