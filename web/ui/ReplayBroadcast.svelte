<!-- The replay as a sports broadcast's replay: a title band over the battle view (the crimson REPLAY tag, the day and the kind of
     match, Share and Download replay), the seats as a lower third under it (seat in its color, name, hero, and each player's place
     once the replay ends), then the control strip. -->
<script>
  import ReplayScreen from './ReplayScreen.svelte';
  import ReplayControls from './ReplayControls.svelte';
  import Share from './Share.svelte';
  import ExportFootage from './ExportFootage.svelte';
  import { replay } from './replay.svelte.js';
  import { heroName, resultOf, ordinal, shortDay } from '../replay-text.js';

  const meta = $derived(replay.meta);
  const places = $derived(replay.ended && meta ? new Map(resultOf(meta).places.map(p => [p.name, p.place])) : new Map());
</script>

<div class="broadcast">
  <div class="title-band">
    <span class="band-tag" aria-hidden="true">Replay</span>
    {#if meta}<p class="facts">{shortDay(meta.created)} - {meta.ranked ? 'Ranked' : 'Friendly'} match</p>{/if}
    {#if !replay.gone}<span class="band-actions"><Share /><ExportFootage /></span>{/if}
  </div>
  <ReplayScreen />
  {#if meta}
    <ol class="lower-third" aria-label="Players by seat">
      {#each meta.players as p (p.seat)}
        <li>
          <span class="seat seat-{p.seat}" aria-label="Seat {p.seat}">{p.seat}</span>
          <span class="who-played"><b>{p.name}{p.bot ? ' (CPU)' : ''}</b><span>{heroName(p.hero)}</span></span>
          {#if places.has(p.name)}<span class="place">{ordinal(places.get(p.name))}</span>{/if}
        </li>
      {/each}
    </ol>
  {/if}
  {#if !replay.gone}<ReplayControls />{/if}
</div>
