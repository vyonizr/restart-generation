<!-- The replay's control bar (replay.svelte.js): play or pause, the time slider with the time, skip idle time, double speed, and the
     volume. It works once the engine has built the battle. -->
<script>
  import { replay, togglePlay, seek, holdSlider, releaseSlider, setSkipEmpty, setDoubleSpeed, setVolume, toggleMute } from './replay.svelte.js';
  import { clock } from '../replay-text.js';
  import { STEP_S } from './replayflow.js';

  const off = $derived(!replay.loaded);
  const SEEK_KEYS = new Set(['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown']);
</script>

<div class="controls" role="group" aria-label="Replay controls">
  <button type="button" class="ctl play" disabled={off} onclick={togglePlay} aria-label={replay.playing ? 'Pause' : replay.ended ? 'Watch again' : 'Play'}>
    <svg viewBox="0 0 24 24" aria-hidden="true">{#if replay.playing}<path d="M8 5v14M16 5v14"/>{:else}<path d="M7 4.5v15L19 12z"/>{/if}</svg>
  </button>
  <input class="time" type="range" min="0" max={replay.length} step={STEP_S} value={replay.time} disabled={off} aria-label="Time"
    aria-valuetext="{clock(replay.time)} of {clock(replay.length)}"
    onpointerdown={holdSlider} onpointerup={releaseSlider} onpointercancel={releaseSlider} onblur={releaseSlider}
    onkeydown={e => { if (SEEK_KEYS.has(e.key)) holdSlider(); }} onkeyup={e => { if (SEEK_KEYS.has(e.key)) releaseSlider(); }}
    oninput={e => seek(+e.currentTarget.value)}>
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
