<!-- The replay's control bar (replay.svelte.js): play or pause, the time slider with the time and the replay's marks, skip idle time,
     double speed, and the volume. With marks (CONTEXT.md), Previous and Next sit on each side of play. It works once the engine has
     built the battle, except while footage is rendered on it. -->
<script>
  import { replay, togglePlay, scrub, step, holdSlider, releaseSlider, setSkipEmpty, setDoubleSpeed, setVolume, toggleMute, jumpMark, toMark } from './replay.svelte.js';
  import { clock, markLabel } from '../../../../shared/replay-text.js';
  import { markTarget } from './replay-flow.js';

  const off = $derived(!replay.loaded || replay.footage.status === 'rendering');
  const marks = $derived(replay.meta?.marks ?? []);
  const SEEK_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
  // Where a mark's tick sits on the track: the slider's thumb is 14px wide, so its centre runs from 7px to the width less 7px.
  const share = at => Math.min(1, at / replay.length);
  // The thumb follows the engine's clock between whole seconds, so it glides and lands on a mark's tick. A click or a drag goes to
  // the exact second under the pointer (replay-flow.js `scrub`, which seeks at most once a frame).
  // With a mouse, the second under the pointer shows above the track before a click, as video players show it.
  let hover = $state(null); // { left: px from the track's left, seconds }
  function point(e) {
    if (e.pointerType !== 'mouse' || off) { hover = null; return; }
    const r = e.currentTarget.getBoundingClientRect(), f = Math.max(0, Math.min(1, (e.clientX - r.left - 7) / (r.width - 14)));
    hover = { left: 7 + f * (r.width - 14), seconds: Math.round(f * replay.length) };
  }
  // The arrows step 5 s on the slider too (Left and Right through the page's keys, replay.svelte.js), not the browser's 1 s.
  function key(e) {
    if (!SEEK_KEYS.has(e.key) || e.shiftKey) return;
    holdSlider();
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') { e.preventDefault(); step(e.key === 'ArrowUp' ? 1 : -1); }
  }
</script>

{#snippet jump(direction)}
  <button type="button" class="ctl jump" disabled={off || markTarget(marks, replay.time, direction) === null} onclick={() => jumpMark(direction)}
    aria-label={direction < 0 ? 'Previous moment' : 'Next moment'}>
    <svg viewBox="0 0 24 24" aria-hidden="true">{#if direction < 0}<path d="M6 5v14M18 5.5 8.5 12l9.5 6.5z"/>{:else}<path d="M18 5v14M6 5.5l9.5 6.5L6 18.5z"/>{/if}</svg>
  </button>
{/snippet}

<div class="controls" role="group" aria-label="Replay controls">
  {#if marks.length}{@render jump(-1)}{/if}
  <button type="button" class="ctl play" disabled={off} onclick={togglePlay} aria-label={replay.playing ? 'Pause' : replay.ended ? 'Watch again' : 'Play'}>
    <svg viewBox="0 0 24 24" aria-hidden="true">{#if replay.playing}<path d="M8 5v14M16 5v14"/>{:else}<path d="M7 4.5v15L19 12z"/>{/if}</svg>
  </button>
  {#if marks.length}{@render jump(1)}{/if}
  <div class="timeline">
    <input class="time" type="range" min="0" max={replay.length} step="any" value={replay.position} disabled={off} aria-label="Time"
      aria-valuetext="{clock(replay.time)} of {clock(replay.length)}"
      onpointerdown={holdSlider} onpointerup={releaseSlider} onpointercancel={releaseSlider} onblur={releaseSlider}
      onpointermove={point} onpointerleave={() => { hover = null; }}
      onkeydown={key} onkeyup={e => { if (SEEK_KEYS.has(e.key)) releaseSlider(); }}
      oninput={e => scrub(+e.currentTarget.value)}>
    {#if hover}<span class="scrub-tip" style:--x="{hover.left}px" aria-hidden="true">{clock(hover.seconds)}</span>{/if}
    {#if replay.length > 0}
      {#each marks as mark (mark.at)}
        {@const label = markLabel(replay.meta, mark)}
        <button type="button" class={['mark', mark.moments.some(m => m.kind === 'rescue') ? 'rescue' : 'knockout',
            share(mark.at) < 0.25 && 'start', share(mark.at) > 0.75 && 'end']}
          style:--at={share(mark.at)} disabled={off} aria-label={label} onclick={() => toMark(mark.at)}>
          <span class="tip" aria-hidden="true">{label}</span>
        </button>
      {/each}
    {/if}
  </div>
  <span class="clock" aria-hidden="true">{clock(replay.time)} / {clock(replay.length)}</span>
  <button type="button" class="ctl toggle" disabled={off} aria-pressed={replay.skipEmpty} onclick={() => setSkipEmpty(!replay.skipEmpty)}
    title="Jump over the waits between moves">Skip idle</button>
  <button type="button" class="ctl toggle" disabled={off} aria-pressed={replay.doubleSpeed} onclick={() => setDoubleSpeed(!replay.doubleSpeed)}
    aria-label="Double speed">2×</button>
  <span class="volume">
    <button type="button" class="ctl mute" aria-pressed={replay.muted} onclick={toggleMute} aria-label="Mute">
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9.5h4l5-4v13l-5-4H4z"/>{#if replay.muted}<path d="m16 9.5 5 5M21 9.5l-5 5"/>{:else}<path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a7.5 7.5 0 0 1 0 11"/>{/if}</svg>
    </button>
    <input type="range" min="0" max="1" step="0.05" value={replay.muted ? 0 : replay.volume} aria-label="Volume" oninput={e => setVolume(+e.currentTarget.value)}>
  </span>
</div>
