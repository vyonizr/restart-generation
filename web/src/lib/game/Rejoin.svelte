<!-- A held seat (docs/adr/0038) over the game screen, drawn from page.rejoin (rejoin.js). Before Start, the card that asks "Rejoin?":
     the kind of match, the seats as their castles stand with the player's own outlined, and the time left as a meter and a clock,
     with Rejoin and, under it, Leave. While the page drives the menus, the steps as they pass; when the drive gives up, a strip at
     the screen's foot to do it by hand; "Back in" once the engine has landed; "Dropped out" when the window ran out. The card shows
     rather than tells: the full sentence goes to screen readers only. -->
<script>
  import { page } from '../page.svelte.js';
  import { rejoinStart } from './game.js';
  import { leaveSeat, dismissDropped, clock, WINDOW_S } from './rejoin.js';
  import { STEPS } from './rejoin-drive.js';

  let rejoinButton = $state(), okButton = $state();
  const r = $derived(page.rejoin);
  const kind = $derived(r?.ranked ? 'Ranked match' : 'Friendly match');
  const others = $derived(r ? new Intl.ListFormat('en', { type: 'conjunction' }).format(r.seats.filter(s => s.seat !== r.seat).map(s => s.name)) : '');
  const share = $derived(r ? Math.min(1, r.left / WINDOW_S) : 0);

  // What the page asks the player to press has focus, as Start does.
  $effect(() => { if (r?.stage === 'offer') rejoinButton?.focus(); });
  $effect(() => { if (r?.stage === 'dropped') okButton?.focus(); });
</script>

{#snippet seats(hollow)}
  <ol class="rejoin-seats" aria-hidden="true" data-seats={r.seats.length}>
    {#each r.seats as s (s.seat)}
      <li class="seat-{s.seat}" data-you={s.seat === r.seat ? '' : null} data-hollow={hollow && s.seat === r.seat ? '' : null} title={s.name}><span>{s.seat}</span><b>{s.name}</b></li>
    {/each}
  </ol>
{/snippet}

{#snippet meter()}
  <div class="rejoin-meter" aria-hidden="true"><span style:width="{share * 100}%"></span></div>
{/snippet}

{#if r?.stage === 'offer'}
  <div class="rejoin rejoin-card" role="dialog" aria-labelledby="rejoin-title" aria-describedby="rejoin-say" inert={page.dialogs > 0}>
    <p class="rejoin-kind">{kind}</p>
    <h2 class="bar" id="rejoin-title">Rejoin?</h2>
    {@render seats(false)}
    <div class="rejoin-time" aria-hidden="true">{@render meter()}<b>{clock(r.left)}</b></div>
    <p class="vh" id="rejoin-say">Your {kind.toLowerCase()} with {others} is still running. Your seat is held for {clock(r.left)}. Leaving counts as a defeat.</p>
    <div class="rejoin-actions">
      <button id="rejoin-go" bind:this={rejoinButton} onclick={rejoinStart}>Rejoin</button>
      <button id="rejoin-leave" class="secondary" onclick={leaveSeat}>Leave</button>
    </div>
  </div>
{:else if r?.stage === 'drive'}
  <div class="rejoin rejoin-card" role="status" inert={page.dialogs > 0}>
    <h2 class="bar">Rejoining</h2>
    <ol class="rejoin-steps">
      {#each STEPS as label, i (label)}
        <li data-state={i < r.step ? 'done' : i === r.step ? 'now' : 'next'}>{label}</li>
      {/each}
    </ol>
    <div class="rejoin-time" aria-hidden="true">{@render meter()}<b>{clock(r.left)}</b></div>
  </div>
{:else if r?.stage === 'manual'}
  <div class="rejoin rejoin-strip" inert={page.dialogs > 0}>
    <p role="status"><kbd>Arena</kbd>→<kbd>Quick Match</kbd>→<kbd>Hero</kbd><span class="vh">: go there to rejoin your battle. Any hero will do.</span></p>
    <b class="rejoin-clock"><span class="vh">Time left: </span>{clock(r.left)}</b>
    <button id="rejoin-strip-leave" class="secondary" onclick={leaveSeat}>Leave</button>
    {@render meter()}
  </div>
{:else if r?.stage === 'back'}
  <div class="rejoin rejoin-flash" role="status">Back in</div>
{:else if r?.stage === 'dropped'}
  <div class="rejoin rejoin-card" role="dialog" aria-labelledby="rejoin-title" aria-describedby="rejoin-say" inert={page.dialogs > 0}>
    <p class="rejoin-kind">{kind}</p>
    <h2 class="bar" id="rejoin-title">Dropped out</h2>
    {@render seats(true)}
    <p class="vh" id="rejoin-say">Your seat was held for two minutes. The battle went on without you and counts as a defeat.</p>
    <button id="rejoin-ok" bind:this={okButton} onclick={dismissDropped}>OK</button>
  </div>
{/if}
