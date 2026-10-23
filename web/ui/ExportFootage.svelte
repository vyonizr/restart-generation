<!-- Export footage (CONTEXT.md "Footage"): renders the replay to an MP4 file and saves it (replay.svelte.js). It works once the engine
     has built the battle, in a browser that can encode the file; it says "Footage saved" for 2.5 s after a save, and takes focus
     back when the screen's progress or failure goes away. -->
<script>
  import { tick } from 'svelte';
  import { replay, exportFootage } from './replay.svelte.js';

  let button, label = $state('Export footage'), timer;
  const f = replay.footage;
  const off = $derived(f.status !== 'ready' || !replay.loaded || replay.unplayable);

  async function press() {
    const saved = await exportFootage();
    if (f.status === 'failed') return; // the screen's Back to the replay has focus
    await tick(); // enabled again
    button?.focus();
    if (!saved) return;
    label = 'Footage saved';
    clearTimeout(timer);
    timer = setTimeout(() => { label = 'Export footage'; }, 2500);
  }
  // Back from Couldn't export footage's button, which is gone once pressed.
  let was = f.status;
  $effect(() => { if (was === 'failed' && f.status === 'ready') button?.focus(); was = f.status; });
</script>

<button type="button" class="secondary export-footage" bind:this={button} disabled={off} onclick={press}
  aria-describedby={f.status === 'unsupported' || f.status === 'insecure' ? 'footage-note' : null}>
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/></svg>
  <span class="label" aria-live="polite">{label}</span>
</button>
