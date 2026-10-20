<!-- "3 players online · 1 waiting for a match · Join the Discord", from GET /status. -->
<script>
  import { page } from './page.svelte.js';

  const STRIP_MS = 30000; // how often the line refreshes
  let text = $state(''), shown = $state(false);

  const line = ({ online, waiting }) => {
    const parts = [online === 0 ? 'No one is online right now' : `${online} ${online === 1 ? 'player' : 'players'} online`];
    if (waiting > 0) parts.push(`${waiting} waiting for a match`);
    return parts.join(' · ');
  };
  const refresh = async () => {
    try {
      const r = await fetch('status', { cache: 'no-store' });
      if (r.ok) { text = line(await r.json()); shown = true; }
    } catch { shown = false; }
  };

  $effect(() => {
    refresh();
    const timer = setInterval(() => { if (!document.hidden) refresh(); }, STRIP_MS);
    return () => clearInterval(timer);
  });
</script>

<span class="strip" id="strip" hidden={!shown}>{' · '}<span>{text}</span>{#if page.server.invite}{' · '}<a href={page.server.invite} target="_blank" rel="noopener">Join the Discord</a>{/if}</span>
