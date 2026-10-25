<!-- A 24 × 24 sketch of a battle's environment (CONTEXT.md), as the Replays dialog shows it: each one's floor colour and the one thing
     that tells it apart, drawn in flat shapes from the words of docs/re/re_looks.md, not from the game's art. `environment` is the
     Game blob's 0 to 4 (ENVIRONMENTS in replay-text.js); any other value is a plain square. -->
<script>
  let { environment } = $props();
  // An n × n checker of s-sized tiles from (o, o): [x, y, whether it's the second shade].
  const tiles = (o, s, n) => Array.from({ length: n * n }, (_, i) => [o + (i % n) * s, o + Math.floor(i / n) * s, (i % n + Math.floor(i / n)) % 2]);
  const KERBS = [[4, 4, 1, 1], [20, 4, -1, 1], [4, 20, 1, -1], [20, 20, -1, -1]];
  const TYRES = [[8, 1.6], [12.5, 1.6], [16, 1.6], [1.6, 9], [1.6, 14.5], [22.4, 8], [22.4, 13], [22.4, 16.5], [7.5, 22.4], [14, 22.4]];
</script>

<svg class="environment" viewBox="0 0 24 24" aria-hidden="true">
  {#if environment === 0}
    <!-- Space: navy tiles floating on a starry black -->
    <rect width="24" height="24" fill="#05060d" />
    {#each [[1, 2, '#fff'], [21, 1, '#9cc4ff'], [22, 12, '#fff'], [1, 15, '#9cc4ff'], [3, 22, '#fff'], [19, 22, '#9cc4ff'], [11, 1, '#9cc4ff']] as [x, y, c]}<rect {x} {y} width="1" height="1" fill={c} />{/each}
    {#each tiles(4, 4, 4) as [x, y, alt]}<rect {x} {y} width="4" height="4" fill={alt ? '#1d3a8f' : '#16307a'} />{/each}
    {#each [8, 12, 16] as a}{#each [8, 12, 16] as b}<rect x={a - 0.5} y={b - 0.5} width="1" height="1" fill="#5d9cff" />{/each}{/each}
  {:else if environment === 1}
    <!-- Clouds and grass: checkered grass with a hazard-stripe edge and a rotor at each corner, in a blue sky with clouds -->
    <rect width="24" height="24" fill="#4f93e0" />
    <rect x="0" y="19" width="6" height="3" fill="#fff" /><rect x="1" y="18" width="3" height="1" fill="#fff" />
    <rect x="17" y="1" width="7" height="2" fill="#fff" /><rect x="19" y="0" width="3" height="1" fill="#fff" />
    <rect x="4" y="4" width="16" height="16" fill="#f2c230" />
    <rect x="4.5" y="4.5" width="15" height="15" fill="none" stroke="#1a1a1a" stroke-width="1" stroke-dasharray="1.5 1.5" />
    {#each tiles(5, 3.5, 4) as [x, y, alt]}<rect {x} {y} width="3.5" height="3.5" fill={alt ? '#4fae3f' : '#43993a'} />{/each}
    {#each [[4, 4], [20, 4], [4, 20], [20, 20]] as [cx, cy]}<circle {cx} {cy} r="1.8" fill="#c9ced6" /><circle {cx} {cy} r="0.7" fill="#5b616b" />{/each}
  {:else if environment === 2}
    <!-- Speedball: a violet metal arena, its darker wall with a gate on each side, an orange dashed line and a thin orange cross -->
    <rect width="24" height="24" fill="#5f5a8c" />
    {#each tiles(3, 4.5, 4) as [x, y, alt]}<rect {x} {y} width="4.5" height="4.5" fill={alt ? '#9f9bc6' : '#aeaad2'} />{/each}
    <rect x="10" y="0" width="4" height="2" fill="#3e3a66" /><rect x="10" y="22" width="4" height="2" fill="#3e3a66" />
    <rect x="0" y="10" width="2" height="4" fill="#3e3a66" /><rect x="22" y="10" width="2" height="4" fill="#3e3a66" />
    <rect x="4.5" y="4.5" width="15" height="15" fill="none" stroke="#e8743f" stroke-width="0.8" stroke-dasharray="1 1" />
    <rect x="11.7" y="5" width="0.6" height="14" fill="#d9654a" /><rect x="5" y="11.7" width="14" height="0.6" fill="#d9654a" />
    <rect x="10.3" y="10.3" width="3.4" height="3.4" fill="#aeaad2" stroke="#d9654a" stroke-width="0.6" />
  {:else if environment === 3}
    <!-- Soccer: a striped pitch with its white lines and corner flags, ringed by an orange crowd -->
    <rect width="24" height="24" fill="#3f8f3a" />
    {#each [0, 8, 16] as y}<rect x="0" {y} width="24" height="4" fill="#4aa043" />{/each}
    {#each [3, 6, 9, 12, 15, 18, 21] as a}<circle cx={a} cy="1" r="0.8" fill="#e39a4a" /><circle cx={a} cy="23" r="0.8" fill="#e39a4a" /><circle cx="1" cy={a} r="0.8" fill="#e39a4a" /><circle cx="23" cy={a} r="0.8" fill="#e39a4a" />{/each}
    <rect x="3.5" y="3.5" width="17" height="17" fill="none" stroke="#fff" stroke-width="0.8" />
    <circle cx="12" cy="12" r="3.2" fill="none" stroke="#fff" stroke-width="0.8" /><circle cx="12" cy="12" r="0.7" fill="#fff" />
    {#each [[3, 2], [20, 2], [3, 20], [20, 20]] as [x, y]}<rect {x} {y} width="1" height="2" fill="#e0453a" />{/each}
  {:else if environment === 4}
    <!-- Racetrack: grey asphalt in a two-grey checker with a skid mark, red-and-white kerbs at the corners, black tyres round the edge -->
    {#each tiles(0, 4, 6) as [x, y, alt]}<rect {x} {y} width="4" height="4" fill={alt ? '#7c7e81' : '#8b8d90'} />{/each}
    <rect x="10" y="12" width="3" height="1" fill="#5d5f62" /><rect x="12" y="11" width="2" height="1" fill="#5d5f62" />
    {#each KERBS as [x, y, dx, dy]}
      {#each [0, 1, 2, 3] as i}
        <rect x={dx > 0 ? x + i : x - i - 1} y={dy > 0 ? y - 1 : y} width="1" height="1" fill={i % 2 ? '#fff' : '#e0453a'} />
        <rect x={dx > 0 ? x - 1 : x} y={dy > 0 ? y + i : y - i - 1} width="1" height="1" fill={i % 2 ? '#fff' : '#e0453a'} />
      {/each}
    {/each}
    {#each TYRES as [cx, cy]}<circle {cx} {cy} r="1.5" fill="#1b1b1d" /><circle {cx} {cy} r="0.6" fill="#4a4a4e" />{/each}
  {:else}
    <rect width="24" height="24" fill="var(--ink-3)" />
  {/if}
</svg>
