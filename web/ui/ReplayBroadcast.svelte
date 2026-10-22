<!-- The replay as a sports broadcast's replay: a crimson REPLAY tag on the corner of the battle view, the seats as a lower third
     under it (seat, name, hero, and each player's place once the replay ends), then the control strip. -->
<script>
  import ReplayScreen from './ReplayScreen.svelte';
  import ReplayControls from './ReplayControls.svelte';
  import { replay } from './replay.svelte.js';
  import { heroName, resultOf, ordinal } from '../replay-text.js';

  const meta = $derived(replay.meta);
  const places = $derived(replay.ended && meta ? new Map(resultOf(meta).places.map(p => [p.name, p.place])) : new Map());
</script>

<div class="broadcast">
  <span class="replay-tag" aria-hidden="true">Replay</span>
  <ReplayScreen />
  {#if meta}
    <ol class="lower-third" aria-label="Players by seat">
      {#each meta.players as p (p.seat)}
        <li>
          <span class="seat" aria-label="Seat {p.seat}">{p.seat}</span>
          <span class="who-played"><b>{p.name}{p.bot ? ' (CPU)' : ''}</b><span>{heroName(p.hero)}</span></span>
          {#if places.has(p.name)}<span class="place">{ordinal(places.get(p.name))}</span>{/if}
        </li>
      {/each}
    </ol>
  {/if}
  {#if !replay.gone}<ReplayControls />{/if}
</div>
