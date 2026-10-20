<!-- A dialog over the game screen: the rest of the page can't be reached while one is open. It takes focus when it opens, gives it
     back when it closes, and no key reaches the game while it is open. Escape calls `oncancel`. `focus` is a selector inside it. A form dialog's `onsubmit` gets the form. -->
<script>
  import { onMount, tick } from 'svelte';
  import { page } from './page.svelte.js';

  let { tag = 'div', id, titleId, focus, oncancel, onsubmit, children } = $props();
  let box;

  onMount(() => {
    const returnTo = document.activeElement;
    page.dialogs++;
    box.querySelector(focus)?.focus();
    return () => {
      page.dialogs--;
      // Once the game screen is reachable again (it is inert while a dialog is open).
      tick().then(() => {
        if (returnTo && returnTo !== document.body && returnTo.isConnected && !returnTo.closest('[hidden]')) returnTo.focus();
        else document.getElementById(document.getElementById('overlay').hidden ? 'screen' : 'start').focus();
      });
    };
  });
</script>

<svelte:element this={tag} bind:this={box} class="login" {id} role="dialog" aria-modal="true" aria-labelledby={titleId} tabindex="-1"
  onsubmit={onsubmit && (e => { e.preventDefault(); onsubmit(box); })}
  onkeydown={e => { if (e.key === 'Escape') oncancel?.(); e.stopPropagation(); }}>
  {@render children()}
</svelte:element>
