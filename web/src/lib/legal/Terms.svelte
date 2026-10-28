<!-- The Terms (docs/adr/0021): the rules a player accepts by playing online on this server. What they say was decided in the ADR;
     change them there first. -->
<script>
  import DocPage from './DocPage.svelte';

  let { server } = $props();
  const admin = $derived(server?.adminName || 'the admin'), Admin = $derived(server?.adminName || 'The admin');
  const toc = [
    ['who', 'Who can play'], ['unofficial', 'An unofficial revival'], ['behave', 'How to behave'], ['account', 'Your account'],
    ['free', 'Free, with no payments'], ['warranty', 'No warranty'], ['privacy', 'Your data'], ['changes', 'Changes'],
  ];
</script>

<DocPage title="Terms" ghost="Terms" changed="28 October 2026" {toc} {server}>
  <p class="lede">These are the rules for playing online on this Restart Generation server. By playing online here, you accept them. If you don't, play offline, or don't play here.</p>

  <section id="who">
    <h2>Who can play</h2>
    <p>You must be 13 or older to play online here. If you're under 18, you need the permission of a parent or guardian, who accepts these Terms for you. The page doesn't ask your age.</p>
  </section>

  <section id="unofficial">
    <h2>An unofficial revival</h2>
    <p>Restart Generation is an unofficial fan revival of Reset Generation © 2008 RedLynx / Nokia. It isn't affiliated with or endorsed by RedLynx, Ubisoft or Nokia, and their names and trademarks belong to their owners.</p>
    <p>Nothing on this server makes a copy of the game licensed or official.</p>
  </section>

  <section id="behave">
    <h2>How to behave</h2>
    <p>Other players see your name, your room names, your chat in battles, and your friend requests. Nobody reads them as they happen, and the server can't stop a message, so these rules are yours to keep:</p>
    <ul>
      <li>Choose a name and room names that don't insult, threaten or pretend to be anyone, and that hold nobody's personal details.</li>
      <li>In chat and in friend requests, don't harass, threaten or abuse other players, don't post sexual content, and don't spam.</li>
      <li>Don't cheat, don't use bugs to spoil other players' battles, and don't try to break, overload or get around the server or its limits.</li>
    </ul>
    <p>To report a player, write to {admin} at the address at the top of this page.</p>
  </section>

  <section id="account">
    <h2>Your account</h2>
    {#if server?.accounts}
      <p>The first time you play online, you get a guest account. It's deleted 24 hours after you last play. When you sign in with Discord, you become a member and choose a name, which you can't change later. A member's account stays until you delete it.</p>
    {:else}
      <p>When you first play online, you choose a name, and the server makes an account for it. There's no password: anyone who types a name plays as that name.</p>
    {/if}
    <p>{Admin} can delete any account at any time, without notice, for example one that breaks these rules.</p>
  </section>

  <section id="free">
    <h2>Free, with no payments</h2>
    <p>Playing here is free. This server sells nothing, shows no ads, and takes no payments or donations of any kind.</p>
  </section>

  <section id="warranty">
    <h2>No warranty</h2>
    <p>The server and the page come as they are, with no warranty. The server can stop at any time, for a while or for good, and without notice, for example when a rights holder asks for it. Your account, fame and saved game can be lost when it does.</p>
  </section>

  <section id="privacy">
    <h2>Your data</h2>
    <p>The <a href="../privacy/">Privacy policy</a> says what the server keeps about you, for how long, and how to have it removed.</p>
  </section>

  <section id="changes">
    <h2>Changes</h2>
    <p>{Admin} can change these Terms. The date at the top says when they last changed. If you play online after a change, you accept the new Terms.</p>
  </section>
</DocPage>
