<!-- The Privacy policy (docs/adr/0021): what this server keeps about a player, why, for how long, and how to have it removed. It
     describes what the code does, so a change to what the server keeps, logs or backs up changes this page in the same commit. -->
<script>
  import DocPage from './DocPage.svelte';

  let { server } = $props();
  const admin = $derived(server?.adminName || 'the admin'), Admin = $derived(server?.adminName || 'The admin');
  const storedBy = $derived(server?.hosting || 'The hosting provider');
  const discord = $derived(Boolean(server?.accounts)); // guests and members with Discord sign-in, rather than a name alone
  const replays = $derived(server?.replays !== false); // kept unless the admin turned them off (RG_REPLAYS=0)
  const toc = $derived([
    ['who', 'Who answers for your data'], ['keeps', 'What the server keeps'], ...(replays ? [['replays', 'Replays']] : []),
    ['passes', 'What it passes on and forgets'], ['sees', 'What other players see'], ['logs', 'Logs and backups'], ['browser', 'Your browser'],
    ['why', 'Why'], ['rights', 'Your choices'], ['children', 'Children'], ['changes', 'Changes'],
  ]);
</script>

<DocPage title="Privacy policy" ghost="Privacy" changed="23 October 2026" {toc} {server}>
  <p class="lede">This page says what this Restart Generation server keeps about you when you play online, why, for how long, and how to have it removed. It keeps only what online play needs. It sells nothing, shows no ads, and runs no analytics.</p>

  <section id="who">
    <h2>Who answers for your data</h2>
    <p>{Admin} runs this server and decides what happens to the data it keeps. {storedBy} stores the server and its data for {admin}, and does nothing else with it. Nobody else receives your data.</p>
  </section>

  <section id="keeps">
    <h2>What the server keeps</h2>
    {#if discord}
      <p>For a member, someone who signed in with Discord:</p>
      <ul>
        <li>your Discord user ID, which ties your account to your Discord sign-in. Not your Discord username, email address or avatar;</li>
        <li>your player name;</li>
        <li>your fame, matches, wins, rescues, highest fame and favorite hero, and your achievements;</li>
        <li>your friends and the friend requests you sent or got;</li>
        <li>your saved game: story progress, settings and custom keys, and achievements, so it follows you to other browsers;</li>
        <li>when you made the account and when you last played;</li>
        <li>a fingerprint of each sign-in token, which can't be turned back into the token. Your browser keeps the token itself.</li>
      </ul>
      <p>For a guest, the same, without the Discord user ID and without the saved game, which stays in your browser.</p>
      <p>When you sign in, Discord sends the server your Discord profile. The server keeps only your Discord user ID. It uses your Discord username to suggest a player name and forgets it within 15 minutes, and it gives up its access to your Discord account straight away. Discord's own <a href="https://discord.com/privacy" target="_blank" rel="noopener">privacy policy</a> covers what happens on Discord.</p>
    {:else}
      <p>Your player name, your fame, matches, wins, rescues, highest fame, favorite hero and achievements, your friends and friend requests, and when you made the account and last played. This server has no sign-in and no passwords, so it knows nothing else about you.</p>
    {/if}
  </section>

  {#if replays}
    <section id="replays">
      <h2>Replays</h2>
      <p>The server keeps every online battle that began as a replay, so its players and anyone they share its link with can watch it again. A replay holds the players' names as they were in that battle, their heroes and seats, every move, and the chat sent during the battle, with when each arrived. It is kept for 30 days and then deleted. Anyone who has a replay's link can watch it.</p>
      <p>Each replay is also listed under every player's name for its 30 days, so anyone who knows your name can watch your battles.{#if discord} A wiped guest's replays leave its list but stay watchable by link. A guest who signs in to an existing member moves its replays to the member.{/if}</p>
      <p>A replay is kept for its 30 days even after a guest account in it is deleted. {#if discord}When a member deletes their account{:else}When {admin} deletes an account{/if}, the replays of every battle it played are deleted with it.</p>
    </section>
  {/if}

  <section id="passes">
    <h2>What it passes on and forgets</h2>
    <ul>
      <li>{#if replays}Chat in a battle goes to the other players, and stays in the battle's replay for 30 days. {:else}Chat in a battle goes to the players it's for. The server doesn't store it. {/if}The message with a friend request goes to the player it's for, and the server doesn't store it.</li>
      <li>Room names are shown to everyone in the lobby while the room is open.</li>
      {#if discord}<li>Your IP address limits how many guest accounts one network can make. The server keeps it in memory for at most an hour, and never writes it down.</li>{/if}
    </ul>
  </section>

  <section id="sees">
    <h2>What other players see</h2>
    <p>Your name, your fame level, your rooms and your chat. Anyone online can search player names.{#if discord} The rankings show every member's name, fame and stats; guests aren't ranked.{:else} The rankings show every player's name, fame and stats.{/if} Your friends see when you're online.</p>
  </section>

  <section id="logs">
    <h2>Logs and backups</h2>
    <p>The game server's logs record what players do by name, such as signing in, joining rooms and finishing matches, so that {admin} can find faults. They can also hold the content of a message the server doesn't recognize. They hold no IP address, and the newest 50 MB of them are kept. The web server in front of the game server keeps no access log, but its error log can hold the IP address of a request that failed, such as one made while the game server restarts; its newest 30 MB are kept. Older lines are deleted as new ones arrive.</p>
    <p>{Admin} backs up the accounts every night. The server keeps the seven newest backups, and {admin} keeps a copy of the newest one off the server. A deleted account leaves the backups as they're replaced: within a week on the server, and when the copy off the server is next replaced.</p>
  </section>

  <section id="browser">
    <h2>Your browser</h2>
    <p>The page sets no cookies. It keeps these in your browser's storage, where only this page can read them:</p>
    <ul>
      {#if discord}<li>your player name and sign-in token;</li>{:else}<li>your player name;</li>{/if}
      <li>your saved game, your screen finish and your board view;</li>
      {#if discord}<li>when the page last offered you the Discord sign-in;</li>{/if}
      <li>your copy of the game, if you chose your own files. It never leaves your browser.</li>
    </ul>
    <p>The page talks only to this server{#if discord}, and sends you to Discord when you sign in{/if}.</p>
  </section>

  <section id="why">
    <h2>Why</h2>
    <p>The server keeps your account, stats and friends{#if discord}, and a member's saved game,{/if} because you play online and they're what online play is.{#if replays} It keeps replays so that players can watch their battles again and share them.{/if} It keeps logs and backups to run the server and to recover it{#if discord}, and limits guest accounts to protect it from abuse{/if}.</p>
  </section>

  <section id="rights">
    <h2>Your choices</h2>
    {#if discord}
      <ul>
        <li><strong>Download my data</strong>, in a member's Account menu, saves everything the server keeps about your account in one file{#if replays}, with links to the replays of your battles{/if}.</li>
        <li><strong>Delete my account</strong>, in the same menu, removes it for good: your name, stats, friends and saved game{#if replays}, and the replays of your battles{/if}.</li>
        <li>A guest account is deleted 24 hours after you last play, with everything the server keeps about it{#if replays} except the replays of its battles, which stay for their 30 days{/if}. A sign-in token stops working 90 days after you last use it.</li>
      </ul>
      <p>A member's account stays until you or {admin} delete it. For anything else, such as a correction or a question, write to {admin} at the address at the top of this page. If that address is a public page, don't post anything there that you want kept private. You can also complain to the data protection authority where you live.</p>
    {:else}
      <p>Your account stays until {admin} deletes it. To see it, have it corrected or have it deleted, write to {admin} at the address at the top of this page. If that address is a public page, don't post anything there that you want kept private. You can also complain to the data protection authority where you live.</p>
    {/if}
  </section>

  <section id="children">
    <h2>Children</h2>
    <p>The <a href="../terms/">Terms</a> ask players to be 13 or older, and players under 18 to have a parent's or guardian's permission. The page doesn't ask anyone's age. A parent or guardian who wants a child's account removed can write to {admin}.</p>
  </section>

  <section id="changes">
    <h2>Changes</h2>
    <p>When this page changes, the date at the top changes with it.</p>
  </section>
</DocPage>
