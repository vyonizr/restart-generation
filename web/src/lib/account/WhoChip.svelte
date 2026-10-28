<!-- Who you are on a touch device (DESIGN.md "Who chip"): the player's name as a chip at the left of the line at the top of the page,
     which stays while the game runs, so the account and Replays can be reached during play as they can from a desktop's header. It
     opens a menu over the screen: a guest's Replays and Sign in with Discord; a member's Replays, Download my data, Sign out and Delete
     my account; on a server without accounts, Set name or Change name, and Replays once a name is set. -->
<script>
  import { page } from '../page.svelte.js';
  import { actions } from './accounts.js';
  import { changeName } from './login.js';

  let open = $state(false), anchor = $state(), chip = $state();
  // The account on a server with Discord sign-in, else the "Online as" name.
  const kind = $derived(page.who ? (page.who.member ? 'member' : 'guest') : page.onlineName ? 'local' : null);
  const name = $derived(page.who?.name ?? page.onlineName);
  const replays = $derived(Boolean(page.server?.replays) && (kind !== 'local' || page.onlineNamed));
  const LINE = {
    guest: 'Guest. Your progress stays in this browser.',
    member: 'Signed in with Discord.',
    local: 'Your name online, with no password.',
  };

  // An item closes the menu and gives the chip focus, so a dialog it opens gives focus back to the chip when it closes.
  const run = fn => () => { open = false; chip.focus(); fn(); };
  const items = $derived([
    ...(kind === 'local' ? [{ label: page.onlineNamed ? 'Change name' : 'Set name', run: changeName, off: Boolean(page.nameLogin) }] : []),
    ...(replays ? [{ label: 'Replays', run: () => { page.replays = name; } }] : []),
    ...(kind === 'guest' ? [{ label: 'Sign in with Discord', run: actions.signin, tone: 'primary' }] : []),
    ...(kind === 'member' ? [
      { label: 'Download my data', run: actions.download },
      { label: 'Sign out', run: actions.signout },
      { label: 'Delete my account', run: actions.delete, tone: 'quiet' },
    ] : []),
  ]);
  const PERSON = 'M12 11.5a3.75 3.75 0 1 0 0-7.5 3.75 3.75 0 0 0 0 7.5zM4.5 20.5c0-4 3.4-6.5 7.5-6.5s7.5 2.5 7.5 6.5';
</script>

<!-- The menu closes on a tap anywhere else, or on Escape, which gives the chip its focus back. -->
<svelte:document onclick={e => { if (open && !anchor?.contains(e.target)) open = false; }} />
<svelte:window onkeydown={e => { if (e.key === 'Escape' && open) { open = false; chip.focus(); } }} />

{#if kind}
  <div class="who-anchor" bind:this={anchor}>
    <button type="button" class="who-chip" bind:this={chip} aria-expanded={open} aria-controls="who-menu" onclick={() => { open = !open; }}>
      <svg class="who-person" viewBox="0 0 24 24" aria-hidden="true"><path d={PERSON}/></svg>
      <span class="who-name">{name}</span><span class="vh">, account</span>
      <svg class="who-caret" viewBox="0 0 12 12" aria-hidden="true"><path d="M3 4.5 6 7.5 9 4.5"/></svg>
    </button>
    <div class="who-menu" id="who-menu" hidden={!open}>
      <p class="who-kind">{LINE[kind]}{#if kind === 'local' && page.playing}{' A new name takes effect the next time you go online.'}{/if}</p>
      {#each items as item (item.label)}
        <button type="button" class="who-item {item.tone ?? ''}" disabled={item.off} onclick={run(item.run)}>{item.label}</button>
      {/each}
    </div>
  </div>
{/if}
