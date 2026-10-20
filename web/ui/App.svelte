<script>
  import { page } from './page.svelte.js';
  import Who from './Who.svelte';
  import Strip from './Strip.svelte';
  import MemberDialog from './MemberDialog.svelte';
  import ConfirmDialog from './ConfirmDialog.svelte';
</script>

<div class="page">
  <header><h1 class="name">Restart Generation</h1><div class="who" id="who" hidden={!page.who}><Who /></div></header>
  <span class="ghost" aria-hidden="true">Restart<br>Generation</span>
  <main>
    <div class="screen">
      <canvas id="screen" width="240" height="320" tabindex="-1" aria-label="Game screen" inert={page.dialogs > 0}></canvas>
      <div id="overlay" inert={page.dialogs > 0}>
        <h2 class="bar">Restart<br>Generation</h2>
        <p id="status" role="status">Loading game files…</p>
        <div id="pick" hidden>
          <button id="pick-zip">Choose .zip file</button>
          <button id="pick-folder" class="secondary">Choose folder</button>
          <p class="hint"><span class="desktop-only">Windows standalone build only.</span><span class="touch-only">The Windows standalone build's .zip only.</span> Your files stay in this browser.</p>
        </div>
        <input id="pick-zip-input" type="file" accept=".zip,application/zip" hidden>
        <input id="pick-input" type="file" webkitdirectory multiple hidden>
        <button id="start" hidden>Start</button>
        <p class="hint" id="online-as" hidden>Online as <b id="online-name"></b> · <button id="change-name" class="secondary">Change name</button></p>
        <p class="hint touch-only who" id="who-touch" hidden={!page.who}><Who /></p>
        <div id="recover" hidden>
          <button id="reload">Reload</button>
          <button id="forget" class="secondary" hidden>Use a different copy</button>
        </div>
      </div>
      <form class="login" id="login" role="dialog" aria-modal="true" aria-labelledby="login-title" hidden>
        <h2 class="bar" id="login-title">Set your name</h2>
        <label>Player name <input id="username" name="username" autocomplete="username" maxlength="15" pattern={'[A-Za-z0-9_]{1,15}'} title="Letters, numbers and _, up to 15" required></label>
        <div class="row"><button type="button" class="secondary" id="login-cancel">Cancel</button><button type="submit" id="login-ok">Play online</button></div>
      </form>
      <div class="login" id="bots-ask" role="dialog" aria-modal="true" aria-labelledby="bots-title" hidden>
        <h2 class="bar" id="bots-title">Fill the empty seats with CPU players?</h2>
        <p>Expert CPU players choose from the strongest heroes.</p>
        <div class="row"><button type="button" class="secondary" id="bots-no">No</button><button type="button" id="bots-cpu">CPU</button><button type="button" id="bots-expert">Expert</button></div>
      </div>
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
    <video id="wake" class="wake" src="wake.mp4" playsinline preload="none" aria-hidden="true"></video>
    <p class="slow" id="slow" role="status" hidden><span id="slow-text"></span><button id="slow-close" class="secondary">Dismiss</button></p>
    <p class="nudge" id="nudge" role="status" hidden={!page.notice}><span id="nudge-text">{page.notice?.text}</span><span class="nudge-actions" id="nudge-actions">{#if page.notice}{#each page.notice.actions as action}<button type="button" class={action.secondary ? 'secondary' : ''} onclick={() => { page.notice = null; action.run?.(); }}>{action.label}</button>{/each}{/if}</span></p>
    <p class="sub" hidden={Boolean(page.notice)}>The original 2009 game, right in your browser (again){#if page.server}<Strip />{/if}</p>
    <dl class="keys" aria-label="Controls">
      <div><dt>
        <kbd><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M10 6H2M5 2.5 1.5 6 5 9.5"/></svg><span class="vh">Left</span></kbd>
        <kbd><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M2 6h8M7 2.5 10.5 6 7 9.5"/></svg><span class="vh">Right</span></kbd>
        <kbd><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 10V2M2.5 5 6 1.5 9.5 5"/></svg><span class="vh">Up</span></kbd>
        <kbd><svg viewBox="0 0 12 12" aria-hidden="true"><path d="M6 2v8M2.5 7 6 10.5 9.5 7"/></svg><span class="vh">Down</span></kbd>
      </dt><dd>Move</dd></div>
      <div><dt><kbd>Ctrl</kbd><span class="or">or</span><kbd>Enter</kbd></dt><dd>Select; hold to drop a block</dd></div>
      <div><dt><kbd>Shift</kbd></dt><dd>Back</dd></div>
      <div><dt><kbd>Esc</kbd></dt><dd>Menu</dd></div>
    </dl>
  </main>
  <footer>
    <p class="disclaimer"><strong>Restart Generation</strong> is an unofficial fan revival of Reset Generation © 2009 RedLynx. It is not affiliated with or endorsed by RedLynx or Ubisoft. <span class="byo">Bring your own copy of the game.</span><br>Made by vyonizr.</p>
    <p class="notes byo">Windows standalone build only. Your files stay in this browser.</p>
  </footer>
</div>
