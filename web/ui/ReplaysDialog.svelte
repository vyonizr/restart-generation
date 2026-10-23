<!-- The replays listed under the player's name (docs/adr/0024), newest first, opened from Replays in the Account menu, beside Sign in
     with Discord, or on the Online as line. Each one opens its replay page in a new tab or copies its link. -->
<script>
  import Dialog from './Dialog.svelte';
  import { page } from './page.svelte.js';
  import { copyLinkFeedback } from './clipboard.js';
  import { heroName, ENVIRONMENTS, ordinal } from '../replay-text.js';

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
  const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' });
  const link = id => new URL(`replay/${encodeURIComponent(id)}`, location.href).href;
  const environment = n => { const e = ENVIRONMENTS[n] ?? 'unknown environment'; return e[0].toUpperCase() + e.slice(1); };
  const seats = r => [...r.players].sort((a, b) => a.seat - b.seat);
  const mine = p => !p.bot && p.name.toLowerCase() === name.toLowerCase();
  // Each player's place where the witness ranked them, else "Won" for the winners of a guessed result, else nothing.
  const mark = (r, p) => r.result?.ranks ? (r.result.ranks[p.seat] > 0 ? ordinal(r.result.ranks[p.seat]) : '') : r.result?.winners.includes(p.seat) ? 'Won' : '';
  const copiers = {};
  const copy = id => (copiers[id] ??= copyLinkFeedback(label => { labels[id] = label; }))(link(id));
</script>

<Dialog id="replays" titleId="replays-title" focus="#replays-close" oncancel={close}>
  <h2 class="bar" id="replays-title">Replays</h2>
  <p class="replays-note">Last 30 days.{#if guest}{' Guests lose them a day after their last game. Sign in with Discord to keep them.'}{/if}</p>
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
          <p class="replay-facts">
            <span><b>{r.ranked ? 'Ranked' : 'Friendly'}</b> · {environment(r.environment)}</span>
            <time datetime={new Date(r.created).toISOString()}>{WHEN.format(r.created)}</time>
          </p>
          <ol class="replay-seats">
            {#each seats(r) as p (p.seat)}
              <li class:me={mine(p)}>
                <span class="seat"><span class="vh">Seat </span>{p.seat}</span>
                <span class="player"><b>{p.bot ? 'CPU' : p.name}{#if mine(p)}<span class="vh"> (you)</span>{/if}</b><span>{heroName(p.hero)}</span></span>
                {#if mark(r, p)}<span class="place">{mark(r, p)}</span>{/if}
              </li>
            {/each}
          </ol>
          <div class="replay-actions">
            <a class="button" href={link(r.id)} target="_blank" rel="noopener">Watch</a>
            <button type="button" class="secondary" onclick={() => copy(r.id)}>{labels[r.id] ?? 'Copy link'}</button>
            <span class="replay-expires">{r.result ? '' : 'No result · '}Expires {DAY.format(r.expires)}</span>
          </div>
        </li>
      {/each}
    </ol>
  {/if}
  <div class="row"><button type="button" id="replays-close" onclick={close}>Close</button></div>
</Dialog>
