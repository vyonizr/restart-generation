<!-- A dialog over the game screen: the game screen is inert and Tab stays inside the dialog while one is open. It takes focus when it
     opens, gives it back when it closes, and no key reaches the game. Escape calls `oncancel`. `focus` is a selector inside it. A form
     dialog's `onsubmit` gets the form. -->
<script>
  import { onMount, tick } from 'svelte';
  import { page } from './page.svelte.js';
  import { focusOn } from './focus.js';

  let { tag = 'div', id, titleId, focus, oncancel, onsubmit, children } = $props();
  let box;

  // Tab and Shift+Tab wrap around the dialog's controls; focus that is somewhere else comes back in.
  function trap(e) {
    if (e.key !== 'Tab') return;
    const items = [...box.querySelectorAll('button, input, a[href], [tabindex]:not([tabindex="-1"])')].filter(el => !el.disabled && !el.closest('[hidden]'));
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1], at = document.activeElement;
    if (!box.contains(at) || (e.shiftKey ? at === first : at === last)) { e.preventDefault(); (e.shiftKey && box.contains(at) ? last : first).focus(); }
  }

  onMount(() => {
    const returnTo = document.activeElement;
    page.dialogs++;
    box.querySelector(focus)?.focus();
    return () => {
      page.dialogs--;
      // Once the game screen is reachable again (it is inert while a dialog is open).
      tick().then(() => {
        if (returnTo && returnTo !== document.body && returnTo.isConnected && !returnTo.closest('[hidden]')) returnTo.focus();
        else focusOn(page.overlay ? 'start' : 'screen');
      });
    };
  });
</script>

<svelte:window onkeydowncapture={trap} />

<svelte:element this={tag} bind:this={box} class="login" {id} role="dialog" aria-modal="true" aria-labelledby={titleId} tabindex="-1"
  onsubmit={onsubmit && (e => { e.preventDefault(); onsubmit(box); })}
  onkeydown={e => { if (e.key === 'Escape') oncancel?.(); e.stopPropagation(); }}>
  {@render children()}
</svelte:element>
