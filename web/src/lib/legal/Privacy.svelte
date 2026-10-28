<!-- The Privacy policy (docs/adr/0021): what this server keeps about a player, why, for how long, and how to have it removed. It
     describes what the code does, so a change to what the server keeps, logs or backs up changes this page in the same commit. -->
<script>
  import DocPage from './DocPage.svelte';
  import { notCounted, setNotCounted } from '../visit.js';

  let { server } = $props();
  const admin = $derived(server?.adminName || 'the admin'), Admin = $derived(server?.adminName || 'The admin');
  const storedBy = $derived(server?.hosting || 'The hosting provider');
  const discord = $derived(Boolean(server?.accounts)); // guests and members with Discord sign-in, rather than a name alone
  const replays = $derived(server?.replays !== false); // kept unless the admin turned them off (RG_REPLAYS=0)
  const stats = $derived(server?.stats === true); // visitor statistics, counted only when the admin turned them on (docs/adr/0043)
  // "Don't count my visits": the choice as this browser stores it, so where storage is blocked the button doesn't claim it was kept.
  let uncounted = $state(notCounted());
  const toc = $derived([
    ['who', 'Who answers for your data'], ['keeps', 'What the server keeps'], ...(replays ? [['replays', 'Replays']] : []),
    ...(stats ? [['stats', 'Visitor statistics']] : []),
    ['passes', 'What it passes on and forgets'], ['sees', 'What other players see'], ['logs', 'Logs and backups'], ['browser', 'Your browser'],
    ['why', 'Why'], ['rights', 'Your choices'], ['children', 'Children'], ['changes', 'Changes'],
  ]);
</script>

<DocPage title="Privacy policy" ghost="Privacy" changed="28 October 2026" {toc} {server}>
  <p class="lede">This page says what this Restart Generation server keeps about you when you play online, why, for how long, and how to have it removed. {#if stats}It keeps what online play needs, and daily counts of its visitors that single out no one. It sells nothing and shows no ads.{:else}It keeps only what online play needs. It sells nothing, shows no ads, and runs no analytics.{/if}</p>

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
      <p>The server keeps every online battle that began as a replay, so its players and anyone they share its link with can watch it again. A replay holds the players' names as they were in that battle, their heroes and seats, every move, and the chat sent during the battle, with when each arrived. Each player keeps the replays of their last 25 battles: when a player's new battle makes 26, their oldest leaves their list. A replay is deleted once it is in the last 25 battles of none of its players, so its link works until then. Anyone who has a replay's link can watch it.</p>
      <p>Each replay is also listed under the name of every player who keeps it, so anyone who knows your name can watch your last 25 battles.{#if discord} A guest who signs in to an existing member moves its replays to the member.{/if}</p>
      <p>{#if discord}When a guest account is deleted, its battles leave its list and are deleted unless another player in them still keeps them. When a member deletes their account{:else}When {admin} deletes an account{/if}, the replays of every battle it played are deleted with it.</p>
      <p>Anyone who can watch a replay can also save it from its page as footage: an MP4 file, made in their own browser, of the battle as the replay plays it, players' names included. The server sends nothing more for it and never sees the file. Once saved, footage is out of the server's reach: deleting a replay, deleting an account, and turning replays off don't remove it.</p>
    </section>
  {/if}

  {#if stats}
    <section id="stats">
      <h2>Visitor statistics</h2>
      <p>{Admin} has turned on visitor statistics. Each time you open the game, a replay, the Terms or this Privacy policy, the page tells the server which of these it is, the site you came from, by its domain alone, such as reddit.com, and whether your device is a touch device. For each day, the server counts:</p>
      <ul>
        <li>how many pages of each kind were opened;</li>
        <li>how many were opened from each site visitors came from, and how many from none;</li>
        <li>how many were opened from each country;</li>
        <li>how many were opened on a desktop and how many on a touch device;</li>
        <li>how many different visitors opened a page that day, and how many pages were opened in each hour.</li>
      </ul>
      <p>Each count stands on its own. None combines them, such as the countries of the visitors who came from one site, so no count picks out one visitor. Days are counted in UTC.</p>
      <p>Your IP address is used in memory to find your country and to count you once a day, and is never written down. For the country, the server looks your address up in its own copy of DB-IP's country database, so the address goes nowhere else. To count you once, it mixes your address and your browser's name with a secret it makes at the start of each day, and keeps the result, with how many pages it opened, in memory until the day ends or the server restarts. The secret is never written down either.</p>
      <p>The counts are kept for each day for 25 months, then deleted. Only {admin} sees them, on the server. A browser that sends the Global Privacy Control signal is never counted.</p>
      <p><a href="https://db-ip.com" target="_blank" rel="noopener">IP geolocation by DB-IP</a>.</p>
      <button class="secondary" type="button" onclick={() => (uncounted = setNotCounted(!uncounted))}>{uncounted ? 'Count my visits again' : "Don't count my visits"}</button>
      <p class="choice" aria-live="polite">{#if uncounted}This browser isn't counted. It remembers that until you press the button again or clear this site's data.{/if}</p>
    </section>
  {/if}

  <section id="passes">
    <h2>What it passes on and forgets</h2>
    <ul>
      <li>{#if replays}Chat in a battle goes to the other players, and stays in the battle's replay for as long as the replay is kept. {:else}Chat in a battle goes to the players it's for. The server doesn't store it. {/if}The message with a friend request goes to the player it's for, and the server doesn't store it.</li>
      <li>Room names are shown to everyone in the lobby while the room is open.</li>
      <li>Your IP address limits how often one network can make some requests{#if discord}, such as creating guest accounts{/if}. The server keeps it in memory for at most a day, and never writes it down.</li>
      <li>When your page loses a running battle, the server holds your seat for two minutes so you can rejoin. If the two minutes run out, it remembers in memory that your seat dropped out, so your page can tell you, and forgets it once it has, or when the server restarts. It never writes it down.</li>
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
      {#if stats}<li>whether you chose not to have your visits counted;</li>{/if}
      <li>your copy of the game. It never leaves your browser.</li>
    </ul>
    <p>The page talks only to this server{#if discord}, and sends you to Discord when you sign in{/if}.</p>
  </section>

  <section id="why">
    <h2>Why</h2>
    <p>The server keeps your account, stats and friends{#if discord}, and a member's saved game,{/if} because you play online and they're what online play is.{#if replays} It keeps replays so that players can watch their battles again and share them.{/if}{#if stats} It counts its visitors so that {admin} can see how many people come, from where, and when.{/if} It keeps logs and backups to run the server and to recover it, and limits some requests from each network to protect it from abuse.</p>
  </section>

  <section id="rights">
    <h2>Your choices</h2>
    {#if discord}
      <ul>
        <li><strong>Download my data</strong>, in a member's Account menu, saves everything the server keeps about your account in one file{#if replays}, with links to the replays of your battles{/if}.</li>
        <li><strong>Delete my account</strong>, in the same menu, removes it for good: your name, stats, friends and saved game{#if replays}, and the replays of your battles{/if}.</li>
        <li>A guest account is deleted 24 hours after you last play, with everything the server keeps about it{#if replays}, and its replays except those another player in them still keeps{/if}. A sign-in token stops working 90 days after you last use it.</li>
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
