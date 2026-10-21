<!-- The keyboard controls, under the game screen on a desktop. They show the player's custom keys (CONTEXT.md), which the engine
     keeps in the saved game's settings.cfg; game.js reads them into page.keys. -->
<script>
  import { page } from './page.svelte.js';
  import { KEPT } from './keys.js';
  import { VK } from '../emu/host.js';

  const ARROWS = {
    [VK.LEFT]: ['Left', 'M10 6H2M5 2.5 1.5 6 5 9.5'], [VK.RIGHT]: ['Right', 'M2 6h8M7 2.5 10.5 6 7 9.5'],
    [VK.UP]: ['Up', 'M6 10V2M2.5 5 6 1.5 9.5 5'], [VK.DOWN]: ['Down', 'M6 2v8M2.5 7 6 10.5 9.5 7'],
  };
  const NAMES = { [VK.CONTROL]: 'Ctrl', [VK.SHIFT]: 'Shift', [VK.ENTER]: 'Enter', [VK.SPACE]: 'Space', [VK.ESCAPE]: 'Esc', [VK.BACK_SPACE]: 'Backspace' };
  const MOVES = [['left', 'Left'], ['right', 'Right'], ['up', 'Up'], ['down', 'Down']];
  const ARROW_OF = { left: VK.LEFT, right: VK.RIGHT, up: VK.UP, down: VK.DOWN };
</script>

<!-- One key: an arrow key as its arrow, any other by name. `what` names the direction for a screen reader when the key isn't that
     direction's own arrow. An action with no keyboard key shows a dash. -->
{#snippet key(code, what)}
  <kbd>{#if ARROWS[code]}<svg viewBox="0 0 12 12" aria-hidden="true"><path d={ARROWS[code][1]}/></svg><span class="vh">{ARROWS[code][0]}</span>{:else if code == null}<span aria-hidden="true">–</span><span class="vh">No key</span>{:else}{NAMES[code] ?? String.fromCharCode(code)}{/if}{#if what}<span class="vh"> for {what}</span>{/if}</kbd>
{/snippet}

<dl class="keys" aria-label="Controls">
  <div><dt>
    {#each MOVES as [dir, name] (dir)}{@render key(page.keys[dir], page.keys[dir] === ARROW_OF[dir] ? null : name)}{/each}
  </dt><dd>Move</dd></div>
  <div><dt>
    {@render key(page.keys.select)}
    {#if page.keys.select !== KEPT.select}<span class="or">or</span>{@render key(KEPT.select)}{/if}
  </dt><dd>Select</dd></div>
  <div><dt>{@render key(page.keys.back)}</dt><dd>Back</dd></div>
  <div><dt>{@render key(KEPT.back)}</dt><dd>Menu</dd></div>
  <div><dt>{@render key(page.keys.chat)}</dt><dd>Chat</dd></div>
</dl>
