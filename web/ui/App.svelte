<script>
  import { onMount } from 'svelte';
  import { page } from './page.svelte.js';
  import { startGame } from './game.js';
  import { wakeVideo } from './wake.js';
  import Overlay from './Overlay.svelte';
  import Keys from './Keys.svelte';
  import Footer from './Footer.svelte';
  import Who from './Who.svelte';
  import Strip from './Strip.svelte';
  import MemberDialog from './MemberDialog.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
  import NameDialog from './NameDialog.svelte';
  import BotsDialog from './BotsDialog.svelte';

  let canvas;
  onMount(() => startGame(canvas));
</script>

<div class="page">
  <header><h1 class="name">Restart Generation</h1><div class="who" id="who" hidden={!page.who}><Who /></div></header>
  <span class="ghost" aria-hidden="true">Restart<br>Generation</span>
  <main>
    <div class="screen">
      <canvas id="screen" width="240" height="320" tabindex={page.playing ? 0 : -1} aria-label="Game screen" inert={page.dialogs > 0} bind:this={canvas}></canvas>
      <Overlay />
      {#if page.nameLogin}<NameDialog />{/if}
      <BotsDialog />
      {#if page.nameDialog}<MemberDialog />{/if}
      {#if page.confirm}<ConfirmDialog />{/if}
    </div>
    <div class="pad">
      <div class="cross">
        <button data-key="up" aria-label="Up"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10V2M2.5 5 6 1.5 9.5 5"/></svg></button>
        <button data-key="left" aria-label="Left"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M10 6H2M5 2.5 1.5 6 5 9.5"/></svg></button>
        <button data-key="select" class="select" aria-label="Select, hold to drop">Select</button>
        <button data-key="right" aria-label="Right"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8M7 2.5 10.5 6 7 9.5"/></svg></button>
        <button data-key="down" aria-label="Down"><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8M2.5 7 6 10.5 9.5 7"/></svg></button>
      </div>
      <div class="side-r">
        <button data-key="back" class="back" aria-label="Back">Back</button>
        <button id="type" class="small" aria-label="Keyboard"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 6h18v12H3zM6.5 9.5h1M10.5 9.5h1M14.5 9.5h1M17.5 9.5h.5M6.5 12.5h1M10.5 12.5h1M14.5 12.5h1M17.5 12.5h.5M8 15.5h8"/></svg></button>
        <button id="fullscreen" class="small" aria-label="Fullscreen" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/></svg></button>
      </div>
      <p class="pad-hint">Hold Select to drop a block</p>
    </div>
    <input id="typing" class="typing" aria-label="Type into the game" autocapitalize="off" autocomplete="off" spellcheck="false" value=" ">
    <video id="wake" class="wake" src="wake.mp4" playsinline preload="none" aria-hidden="true" use:wakeVideo></video>
    <p class="slow" id="slow" role="status" hidden={!page.slow}><span id="slow-text">{page.slow}</span><button id="slow-close" class="secondary" onclick={() => { page.slow = null; }}>Dismiss</button></p>
    <p class="nudge" id="nudge" role="status" hidden={!page.notice}><span id="nudge-text">{page.notice?.text}</span><span class="nudge-actions" id="nudge-actions">{#if page.notice}{#each page.notice.actions as action}<button type="button" class={action.secondary ? 'secondary' : ''} onclick={() => { page.notice = null; action.run?.(); }}>{action.label}</button>{/each}{/if}</span></p>
    <p class="sub" hidden={Boolean(page.notice)}>The original 2009 game, right in your browser (again){#if page.server}<Strip />{/if}</p>
    <Keys />
  </main>
  <Footer />
</div>
