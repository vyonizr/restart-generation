<!-- The guide (CONTEXT.md, docs/adr/0033): the info menu's instructions, heroes and items, read from the player's own copy
     (web/guide.js) in the game's language, over the page like the notices. The tabs take the menu's own labels; the pictures are the
     game's own pixels, twice their size. A tap on the shade closes it, so the touch pad under it can't press a key by mistake. -->
<script>
  import Dialog from './Dialog.svelte';
  import { page } from './page.svelte.js';

  const guide = page.guide;
  let tab = $state(0), panel = $state();
  const close = () => { page.guide = null; };

  // Left and Right, Home and End move between the tabs and select them, as the ARIA tabs pattern has it.
  function tabKey(e) {
    const last = guide.tabs.length - 1;
    const to = { ArrowRight: tab === last ? 0 : tab + 1, ArrowLeft: tab === 0 ? last : tab - 1, Home: 0, End: last }[e.key];
    if (to === undefined) return;
    e.preventDefault();
    select(to);
    e.currentTarget.querySelectorAll('[role=tab]')[to].focus();
  }
  function select(to) {
    tab = to;
    if (panel) panel.scrollTop = 0;
  }

  // A picture's pixels on a canvas the size of the picture; CSS draws it twice as large, square pixel by square pixel. A tab change can
  // hand a canvas another picture.
  function paint(canvas, picture) {
    const draw = p => {
      canvas.width = p.width;
      canvas.height = p.height;
      canvas.getContext('2d').putImageData(new ImageData(p.rgba, p.width, p.height), 0, 0);
    };
    draw(picture);
    return { update: draw };
  }

  // The items' icons are about 30 pixels wide, twice that on the page. A larger picture among them, such as a portrait, keeps its own
  // size, so that the column stays as wide as an icon's plate.
  const rowScale = (id, p) => id === 'items' && (p.width > 38 || p.height > 50) ? 1 : 2;
</script>

<!-- A picture at `scale` times its size. -->
{#snippet pic(picture, scale = 2)}
  <canvas class="guide-pic" style:width="{picture.width * scale}px" style:height="{picture.height * scale}px" aria-hidden="true" use:paint={picture}></canvas>
{/snippet}

<div class="guide-shade" aria-hidden="true" onclick={close}></div>
<Dialog id="guide" titleId="guide-title" focus="[role=tab][aria-selected=true]" oncancel={close}>
  <h2 class="bar" id="guide-title">Guide</h2>
  <div class="guide-tabs" role="tablist" aria-labelledby="guide-title" tabindex="-1" lang={guide.lang} onkeydown={tabKey}>
    {#each guide.tabs as t, i (t.id)}
      <button type="button" role="tab" id="guide-tab-{t.id}" aria-selected={tab === i} aria-controls="guide-panel" tabindex={tab === i ? 0 : -1}
        onclick={() => select(i)}>{t.label}</button>
    {/each}
  </div>
  <div class="guide-panel" id="guide-panel" role="tabpanel" aria-labelledby="guide-tab-{guide.tabs[tab].id}" tabindex="0" lang={guide.lang} bind:this={panel}>
    {#if guide.tabs[tab].blocks}
      <div class="guide-read">
        {#each guide.tabs[tab].blocks as block, i (i)}
          {#if block.heading}<h3>{block.heading}</h3>
          {:else if block.text}<p>{block.text}</p>
          {:else}<div class="guide-plate">{#each block.pictures as p, j (j)}{@render pic(p)}{/each}</div>{/if}
        {/each}
      </div>
    {:else}
      <ul class="guide-list" data-tab={guide.tabs[tab].id}>
        {#each guide.tabs[tab].entries as entry, i (i)}
          <li>
            <div class="guide-plate">{@render pic(entry.picture, rowScale(guide.tabs[tab].id, entry.picture))}</div>
            <div><h3>{entry.title}</h3><p>{entry.text}</p></div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
  <div class="row"><button type="button" onclick={close}>Close</button></div>
</Dialog>
