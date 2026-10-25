<!-- The replays listed under the player's name (docs/adr/0024), the last 25 battles they keep (docs/adr/0034), newest first, opened
     from Replays in the Account menu, beside Sign in with Discord, or on the Online as line. One line each: when, the kind of match,
     the environment and the hero the listed player played, whether they won, and Watch and Copy link. -->
<script>
  import Dialog from './Dialog.svelte';
  import EnvironmentSketch from './EnvironmentSketch.svelte';
  import { page } from './page.svelte.js';
  import { copyLinkFeedback } from './clipboard.js';
  import { heroName, ENVIRONMENTS } from '../replay-text.js';

  const name = page.replays;
  const guest = page.who ? !page.who.member : false;
  let status = $state('loading'), replays = $state([]), labels = $state({});
  const close = () => { page.replays = ''; };

  async function load() {
    status = 'loading';
    try {
      const r = await fetch(`replays?name=${encodeURIComponent(name)}`, { cache: 'no-store' });
      if (!r.ok) throw new Error(`replays: ${r.status}`);
      replays = (await r.json()).replays;
      status = 'ready';
    } catch {
      status = 'failed';
    }
  }
  load();

  const WHEN = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
  const link = id => new URL(`replay/${encodeURIComponent(id)}`, location.href).href;
  const environment = n => { const e = ENVIRONMENTS[n] ?? 'unknown environment'; return e[0].toUpperCase() + e.slice(1); };
  const kind = r => (r.ranked ? 'Ranked match' : 'Friendly match');
  // The listed player in the replay, by the seat the server keeps for them; null when it doesn't know it.
  const own = r => (r.seat == null ? null : r.players.find(p => p.seat === r.seat) ?? null);
  // Won when the player's seat is among the winners, a team's included; a guessed result counts as one.
  const outcome = r => (!r.result ? 'none' : !own(r) ? null : r.result.winners.includes(r.seat) ? 'won' : 'lost');
  const OUTCOME = { won: 'Won', lost: 'Lost', none: 'No result' };
  const copiers = {};
  const copy = id => (copiers[id] ??= copyLinkFeedback(label => { labels[id] = label; }))(link(id));
</script>

<Dialog id="replays" titleId="replays-title" focus="#replays-close" oncancel={close}>
  <h2 class="bar" id="replays-title">Replays</h2>
  <p class="replays-note">The last 25 battles.{#if guest}{' Guests lose them a day after their last game. Sign in with Discord to keep them.'}{/if}</p>
  {#if status === 'loading'}
    <p class="replays-state" role="status">Loading replays…</p>
  {:else if status === 'failed'}
    <div class="replays-state" role="alert">
      <p>Couldn't load replays.</p>
      <button type="button" class="secondary" onclick={load}>Try again</button>
    </div>
  {:else if !replays.length}
    <p class="replays-state" role="status">No replays yet.</p>
  {:else}
    <ol class="replay-list">
      {#each replays as r (r.id)}
        <li class="replay-item">
          <time datetime={new Date(r.created).toISOString()}>{WHEN.format(r.created)}</time>
          <span class="replay-kind" title={kind(r)}>
            {#if r.ranked}
              <!-- A bar between two wings, after the game's fame badges (docs/re/re_looks.md) -->
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9.5 8.5h5v7h-5zM9.5 8.5h-7L4 11h5.5M9.5 11.5H5L6.5 14h3M14.5 8.5h7L20 11h-5.5M14.5 11.5H19L17.5 14h-3" /></svg>
            {:else}
              <!-- Two players side by side -->
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="8.5" cy="8" r="3" /><path d="M3 20c0-3.3 2.5-6 5.5-6s5.5 2.7 5.5 6" /><circle cx="16.5" cy="9" r="2.5" /><path d="M15.5 14.2c3 .2 5.5 2.6 5.5 5.8" /></svg>
            {/if}
            <span class="vh">{kind(r)}</span>
          </span>
          <span class="replay-played">
            <span class="replay-environment" title="Environment: {environment(r.environment)}"><EnvironmentSketch environment={r.environment} /></span>
            <span class="vh">{environment(r.environment)}{own(r) ? ', as ' : ''}</span>
            {#if own(r)}<b>{heroName(own(r).hero)}</b>{/if}
          </span>
          <span class="replay-outcome {outcome(r) ?? ''}">{OUTCOME[outcome(r)] ?? ''}</span>
          <span class="replay-actions">
            <a class="button secondary" href={link(r.id)} target="_blank" rel="noopener" title="Watch this replay in a new tab">Watch ▸</a>
            <button type="button" class="secondary replay-copy" onclick={() => copy(r.id)} aria-label={labels[r.id] ?? 'Copy link'} title="Copy this replay's link">
              {#if labels[r.id]}{labels[r.id]}{:else}<!-- Two overlapping sheets --><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 8h11v12H8zM5 16V4h11" /></svg>{/if}
            </button>
          </span>
        </li>
      {/each}
    </ol>
  {/if}
  <div class="row"><button type="button" id="replays-close" onclick={close}>Close</button></div>
</Dialog>
