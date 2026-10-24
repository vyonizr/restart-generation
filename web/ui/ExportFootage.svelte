<!-- Download replay: opens a menu of the two kinds of footage (CONTEXT.md "Footage", "Broadcast footage"), With Details first and
     Battle Only, and saves the one picked as an MP4 file it renders (replay.svelte.js). Nothing is remembered: With Details takes
     focus each time, so Enter downloads it. It works as soon as Watch does, in a browser that can encode the file, and says why
     where it never will; it says "Downloaded" for 2.5 s after a save, and takes focus back when the screen's progress or failure
     goes away. -->
<script>
  import { tick } from 'svelte';
  import { replay, exportFootage } from './replay.svelte.js';

  let root, button, open = $state(false), label = $state('Download replay'), timer;
  const f = replay.footage;
  const off = $derived(f.status !== 'ready' || !replay.booted || replay.unplayable);
  const items = () => [...root.querySelectorAll('[role=menuitem]')];

  async function toggle() {
    open = !open;
    if (!open) return;
    await tick();
    items()[0].focus();
  }
  function close() {
    open = false;
    button.focus();
  }
  async function pick(details) {
    open = false;
    const saved = await exportFootage(details);
    if (f.status === 'failed') return; // the screen's Back to the replay has focus
    await tick(); // enabled again
    button?.focus();
    if (!saved) return;
    label = 'Downloaded';
    clearTimeout(timer);
    timer = setTimeout(() => { label = 'Download replay'; }, 2500);
  }
  // The menu's keys, as a menu's: the arrows, Home and End move between its options, and Escape closes it.
  function onkey(e) {
    if (!open) return;
    const all = items(), at = all.indexOf(document.activeElement);
    const to = { ArrowDown: at + 1, ArrowUp: at - 1, Home: 0, End: all.length - 1 }[e.key];
    if (e.key === 'Escape') close();
    else if (to !== undefined) all[(to + all.length) % all.length].focus();
    else return;
    e.preventDefault();
  }
  // Back from the failure's Back to the replay, which is gone once pressed.
  let was = f.status;
  $effect(() => { if (was === 'failed' && f.status === 'ready') button?.focus(); was = f.status; });
  $effect(() => { if (off) open = false; });
</script>

<svelte:window onpointerdown={e => { if (open && !root.contains(e.target)) open = false; }} />
<!-- svelte-ignore a11y_no_static_element_interactions: the keys belong to the menu inside -->
<span class="download" bind:this={root} onkeydown={onkey}
  onfocusout={e => { if (open && e.relatedTarget && !root.contains(e.relatedTarget)) open = false; }}>
  <button type="button" class="secondary export-footage" bind:this={button} disabled={off} onclick={toggle}
    aria-haspopup="menu" aria-expanded={open} aria-controls={open ? 'download-menu' : null}
    aria-describedby={f.status === 'unsupported' || f.status === 'insecure' ? 'footage-note' : null}>
    <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 4v11M7 10.5l5 5 5-5M5 19.5h14"/></svg>
    <span class="label" aria-live="polite">{label}</span>
    <svg class="chev" viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10l5 5 5-5"/></svg>
  </button>
  {#if open}
    <div class="download-menu" id="download-menu" role="menu" aria-label="Download replay">
      <!-- Sketches of each file's shape: the battle with the title band over it and the lower third under it, or the battle alone -->
      <button type="button" role="menuitem" tabindex="-1" onclick={() => pick(true)}>
        <svg viewBox="0 0 42 47" aria-hidden="true">
          <rect width="42" height="4" style:fill="var(--ink-3)" /><rect width="7" height="4" style:fill="var(--red)" />
          <rect y="4" width="42" height="38" style:fill="var(--ink-0)" />
          <rect y="42" width="42" height="5" style:fill="var(--ink-3)" />
          {#each [1, 2, 3, 4] as seat}<rect x={1 + (seat - 1) * 10.5} y="43" width="3" height="3" style:fill="var(--seat-{seat})" />{/each}
        </svg>
        With Details
      </button>
      <button type="button" role="menuitem" tabindex="-1" onclick={() => pick(false)}>
        <svg viewBox="0 0 42 38" aria-hidden="true"><rect width="42" height="38" style:fill="var(--ink-0)" /></svg>
        Battle Only
      </button>
    </div>
  {/if}
</span>
