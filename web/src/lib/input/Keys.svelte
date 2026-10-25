<!-- The controls, under the game screen on a desktop. They show the player's custom keys (CONTEXT.md), which the engine keeps in the
     saved game's settings.cfg; game.js reads them into page.keys. After a press on the gamepad they show its buttons instead,
     until the next key press (gamepad.js). -->
<script>
  import { page } from '../page.svelte.js';
  import { KEPT } from './keys.js';
  import { VK } from '../../../../shared/emu/host.js';

  const ARROWS = {
    [VK.LEFT]: ['Left', 'M10 6H2M5 2.5 1.5 6 5 9.5'], [VK.RIGHT]: ['Right', 'M2 6h8M7 2.5 10.5 6 7 9.5'],
    [VK.UP]: ['Up', 'M6 10V2M2.5 5 6 1.5 9.5 5'], [VK.DOWN]: ['Down', 'M6 2v8M2.5 7 6 10.5 9.5 7'],
  };
  const NAMES = { [VK.CONTROL]: 'Ctrl', [VK.SHIFT]: 'Shift', [VK.ENTER]: 'Enter', [VK.SPACE]: 'Space', [VK.ESCAPE]: 'Esc', [VK.BACK_SPACE]: 'Backspace' };
  const MOVES = [['left', 'Left'], ['right', 'Right'], ['up', 'Up'], ['down', 'Down']];
  const ARROW_OF = { left: VK.LEFT, right: VK.RIGHT, up: VK.UP, down: VK.DOWN };
  // The gamepad's buttons by position, so one drawing fits every brand: the face buttons' diamond with the one to press filled.
  const CROSS = 'M5.5 1.5h5v4h4v5h-4v4h-5v-4h-4v-5h4z', MENU = 'M3 4h10M3 8h10M3 12h10';
  const FACE = [['top', 8, 3], ['left', 3, 8], ['right', 13, 8], ['bottom', 8, 13]];
</script>

<!-- One key: an arrow key as its arrow, any other by name. `what` names the direction for a screen reader when the key isn't that
     direction's own arrow. An action with no keyboard key shows a dash. -->
{#snippet key(code, what)}
  <kbd>{#if ARROWS[code]}<svg viewBox="0 0 12 12" aria-hidden="true"><path d={ARROWS[code][1]}/></svg><span class="vh">{ARROWS[code][0]}</span>{:else if code == null}<span aria-hidden="true">–</span><span class="vh">No key</span>{:else}{NAMES[code] ?? String.fromCharCode(code)}{/if}{#if what}<span class="vh"> for {what}</span>{/if}</kbd>
{/snippet}

<!-- One gamepad control, drawn as a path or as the face buttons with `face` filled, and named for a screen reader. -->
{#snippet control(name, d, face)}
  <kbd class="gamepad"><svg viewBox="0 0 16 16" aria-hidden="true">{#if d}<path {d}/>{:else}{#each FACE as [at, cx, cy] (at)}<circle {cx} {cy} r="2" class={{ on: at === face }}/>{/each}{/if}</svg><span class="vh">{name}</span></kbd>
{/snippet}

<dl class="keys" aria-label="Controls">
  {#if page.input === 'gamepad'}
    <div><dt>{@render control('D-pad or left stick', CROSS)}</dt><dd>Move</dd></div>
    <div><dt>{@render control('Bottom button (A on Xbox, Cross on PlayStation, B on Nintendo)', null, 'bottom')}</dt><dd>Select</dd></div>
    <div><dt>{@render control('Right button (B on Xbox, Circle on PlayStation, A on Nintendo)', null, 'right')}</dt><dd>Back</dd></div>
    <div><dt>{@render control('Menu button (Menu on Xbox, Options on PlayStation, + on Nintendo)', MENU)}</dt><dd>Menu</dd></div>
  {:else}
    <div><dt>
      {#each MOVES as [dir, name] (dir)}{@render key(page.keys[dir], page.keys[dir] === ARROW_OF[dir] ? null : name)}{/each}
    </dt><dd>Move</dd></div>
    <div><dt>
      {@render key(page.keys.select)}
      {#if page.keys.select !== KEPT.select}<span class="or">or</span>{@render key(KEPT.select)}{/if}
    </dt><dd>Select</dd></div>
    <div><dt>{@render key(page.keys.back)}</dt><dd>Back</dd></div>
    <div><dt>{@render key(KEPT.back)}</dt><dd>Menu</dd></div>
  {/if}
  <div><dt>{@render key(page.keys.chat)}</dt><dd>Chat</dd></div>
</dl>
