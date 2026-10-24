<!-- The replay as a sports broadcast's replay: a title band over the battle view (the crimson REPLAY tag, the day and the kind of
     match, Share and Download replay), the seats as a lower third under it (seat in its color, name, hero; a defeated seat's square
     hollow, and once the replay ends a crown on each winner's), then the control strip. -->
<script>
  import ReplayScreen from './ReplayScreen.svelte';
  import ReplayControls from './ReplayControls.svelte';
  import Share from './Share.svelte';
  import ExportFootage from './ExportFootage.svelte';
  import { replay } from './replay.svelte.js';
  import { heroName, shortDay } from '../replay-text.js';

  const meta = $derived(replay.meta);
  const crowned = $derived(replay.ended ? meta?.result?.winners ?? [] : []);
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
        <li data-defeated={replay.defeated.includes(p.seat) ? '' : null}>
          <span class="seat seat-{p.seat}" aria-label="Seat {p.seat}">{p.seat}
            {#if crowned.includes(p.seat)}<svg class="crown" viewBox="0 0 22 14" aria-hidden="true"><path d="M1 13V3l5.5 4.5L11 1l4.5 6.5L21 3v10z"/></svg>{/if}
          </span>
          <span class="who-played"><b>{p.name}{p.bot ? ' (CPU)' : ''}</b><span>{heroName(p.hero)}</span></span>
          {#if crowned.includes(p.seat)}<span class="vh">, won</span>{:else if replay.defeated.includes(p.seat)}<span class="vh">, defeated</span>{/if}
        </li>
      {/each}
    </ol>
  {/if}
  {#if !replay.gone}<ReplayControls />{/if}
</div>
