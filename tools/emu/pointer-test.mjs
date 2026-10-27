// Pointer play (docs/adr/0039, docs/re/re_battle_input.md) against the engine: npm run test:pointer   (needs RG_GAME; about a minute)
// Plays wide-test's Arcade battle (tools/emu/wide-test.mjs) on the Full board and on Classic through shared/emu/pointer.js, as the page
// does: it reads each state, points at the middle of a cell on the engine's screen, turns cellAt's cell into arrow presses or a jump,
// and commits with Select. The orders the engine sends must be for the cells pointed at: the tile piece moved by arrows and dropped,
// the hero moved along a trail and by a jump, an attack on the enemy hero next to it, and both cannons aimed by jumps. In another
// player's turn the cursor goes onto enemy heroes by a jump and along a trail, the engine shows each one's reach area, and nothing
// is sent.
import assert from 'assert';
import { loadGame } from '../../shared/game.mjs';
import { GameHost, VK, UNLOCKS, WIDTH, HEIGHT, REPLAY_WIDTH, REPLAY_HEIGHT } from '../../shared/emu/host.js';
import { battlePointer, cellAt } from '../../shared/emu/pointer.js';

// wide-test's keys into its 4-player Arcade battle (720), up to its last menu key (900).
const INTO = new Map([[100, 'ESCAPE'], [150, 'CONTROL'], [190, 'DOWN'], [220, 'DOWN'], [250, 'CONTROL'], [320, 'CONTROL'], [380, 'CONTROL'],
  [440, 'CONTROL'], [500, 'CONTROL'], [560, 'CONTROL'], [600, 'UP'], [640, 'CONTROL'], [720, 'CONTROL'], [780, 'CONTROL'], [840, 'CONTROL'], [900, 'CONTROL']]);
const SEAT = 1; // the local player's seat in this battle
const HOLD = 600; // ms of engine time Select is held to drop a piece, as the page holds it
const WAIT = 6000; // ticks the next state of ours may take: others' turns and a phase's time limit are shorter
const ARROW = { '1,0': 'RIGHT', '-1,0': 'LEFT', '0,1': 'DOWN', '0,-1': 'UP' };
// Where the cannons are aimed, the first two a pointer can be over at the time.
const CANNON_AIMS = [{ x: 7, y: 4 }, { x: 3, y: 6 }, { x: 5, y: 5 }, { x: 4, y: 3 }, { x: 6, y: 7 }, { x: 2, y: 5 }];
const files = await loadGame();

function play(fullBoard) {
  const view = fullBoard ? 'the Full board' : 'Classic';
  const game = new GameHost(files, { patches: UNLOCKS, board: true, log: () => {}, warn: m => { throw new Error(m); } });
  game.boot();
  game.fullBoard = fullBoard;
  const cpu = game.m.cpu, rd = a => cpu.rd32(a) >>> 0, ri = a => cpu.rd32(a) | 0, app = rd(game.m.addr(0x101b828c));
  let pulled = 0;
  const tick = () => { game.tick(); while (pulled * 64 < game.time) { game.pullSound(); pulled++; } };
  for (let t = 1; t <= 900; t++) { const k = INTO.get(t); if (k) { game.key(true, VK[k]); tick(); game.key(false, VK[k]); } tick(); }
  const pointer = battlePointer(game);
  assert.ok(pointer, `${view}: this engine copy has no pointer play`);

  // What our seat sends, decoded as FUN_1000bb40 sends it (docs/re/re_battle_input.md "The hero turn"), and how many messages it sent.
  const sent = [];
  let outgoing = 0;
  game.watch(0x1000bb40, c => {
    const m = rd((c.r[4] >>> 0) + 4), type = ri(m + 0x18);
    if (ri(m + 0x1c) !== SEAT) return;
    outgoing++;
    if (type === 5) sent.push({ order: 'PlaceTile', x: ri(m + 0x44), y: ri(m + 0x48) });
    else if (type === 3) { const n = ri(m + 0x54), at = rd(m + 0x4c); sent.push({ order: 'MoveUnit', unit: ri(m + 0x44), path: Array.from({ length: n }, (_, i) => [ri(at + i * 8), ri(at + i * 8 + 4)].join()), attack: cpu.m8[m + 0x68] }); }
    else if (type === 6) sent.push({ order: 'Attack', attacker: ri(m + 0x44), target: ri(m + 0x48) });
    else if (type === 4) sent.push({ order: 'FireCannon', x: ri(m + 0x44), y: ri(m + 0x48) });
  });
  // The battle's Game: its phase at +0x94 (4, the player turns) and the acting seat at +0x98 (docs/re/re_rules.md "Fields").
  const battleGame = () => rd(rd(app + 0x114) + 0x14);
  const theirTurn = () => ri(battleGame() + 0x94) === 4 && ri(battleGame() + 0x98) !== SEAT;
  // The battle's units, to choose targets: a cell's unit is at +0x54 of the map's cells (0x7c bytes each, from [game+0xc]).
  const unitAt = (x, y) => { const g = battleGame(); return x < 0 || y < 0 || x >= ri(g + 0x20) || y >= ri(g + 0x24) ? 0 : rd(rd(g + 0xc) + (y * ri(g + 0x20) + x) * 0x7c + 0x54); };
  const enemyHero = u => u && ri(u + 0x34) === 0 && ri(u + 0xe4) === 0 && ri(u + 0x30) !== SEAT;
  // The enemy heroes on the game's unit list ([game+0x6c], the next node at +4 and the unit at +8), with their cells and seats.
  const enemies = () => {
    const out = [];
    for (let node = rd(battleGame() + 0x6c); node; node = rd(node + 4)) { const u = rd(node + 8); if (enemyHero(u)) out.push({ cell: { x: ri(u + 0x38), y: ri(u + 0x3c) }, seat: ri(u + 0x30) }); }
    return out;
  };
  const uiState = () => rd(rd(rd(rd(app + 0x8c) + 0x84) + 0x20) + 4);
  // The local player's highlight slot 1 ([[S+0x18]+0x70], 0x24 bytes a slot): on at +0x21, and its cells at +0x18, one dword a cell
  // by rows of +4 columns, the seat whose reach area it holds or 0; [player+0x78] is the slot shown (docs/re/re_battle_input.md
  // "What the engine shows for the cell under the cursor").
  const reachArea = () => {
    const player = rd(uiState() + 0x18), slot = rd(player + 0x70) + 0x24, cols = ri(slot + 4), cells = rd(slot + 0x18), seats = new Map();
    for (let i = 0; i < cols * ri(slot + 8); i++) { const seat = ri(cells + i * 4); if (seat) seats.set(`${i % cols},${Math.floor(i / cols)}`, seat); }
    return { on: cpu.m8[slot + 0x21], seats, shown: ri(player + 0x78) };
  };
  // The hero turn's reach area (MoveUnit's S+0x84): whether the hero can get to (x, y) this turn.
  const reaches = (x, y) => {
    const s = uiState(), grid = rd(s + 0x84), w = ri(grid), h = ri(grid + 4), gx = x - ri(grid + 8), gy = y - ri(grid + 0xc);
    return gx >= 0 && gy >= 0 && gx < w && gy < h && ri(rd(grid + 0x14) + (gy * w + gx) * 4) !== 0;
  };

  const next = states => {
    for (let i = 0; i < WAIT; i++) { tick(); const r = pointer.read(); if (r && states.includes(r.state) && (r.state !== 'watch' || theirTurn())) return r; }
    assert.fail(`${view}: no ${states.join(' or ')} came`);
  };
  const same = (a, b) => a.x === b.x && a.y === b.y;
  const read = () => { const r = pointer.read(); assert.ok(r, `${view}: read() went null`); return r; };
  // The middle of cell c on the engine's screen now, and whether a pointer can be there: on the screen and off the corner panels.
  const middle = (r, c) => ({ px: c.x * r.tile.w + (r.tile.w >> 1) - r.camera.x, py: c.y * r.tile.h + (r.tile.h >> 1) + 4 - r.camera.y });
  const pointable = (r, c) => {
    const { px, py } = middle(r, c);
    return px >= 0 && py >= 0 && px < r.screen.w && py < r.screen.h && !r.panels.some(p => px >= p.x && py >= p.y && px < p.x + p.w && py < p.y + p.h);
  };
  // The cell cellAt gives for a pointer over the middle of cell c, which must be c.
  const point = (r, c) => {
    assert.ok(pointable(r, c), `${view}: a pointer can't be over cell ${c.x},${c.y}`);
    const { px, py } = middle(r, c), at = cellAt(px, py, r);
    assert.deepStrictEqual(at, c, `${view}: the pixel ${px},${py} isn't cell ${c.x},${c.y}`);
    return at;
  };
  const tap = k => { game.key(true, VK[k]); game.key(false, VK[k]); };
  const select = () => { game.key(true, VK.CONTROL); tick(); game.key(false, VK.CONTROL); tick(); };
  const hold = () => { const t0 = game.time; game.key(true, VK.CONTROL); while (game.time - t0 < HOLD) tick(); game.key(false, VK.CONTROL); tick(); };
  // The orders sent since `from`, once `count` of them have come or `ticks` have passed (FireCannon goes out a few ticks after the
  // last Select).
  const orders = (from, count, ticks = 200) => { for (let i = 0; i < ticks && sent.length - from < count; i++) tick(); return sent.slice(from); };

  const checkView = r => {
    assert.deepStrictEqual(r.screen, fullBoard ? { w: REPLAY_WIDTH, h: REPLAY_HEIGHT } : { w: WIDTH, h: HEIGHT }, `${view}: ${r.state} on a ${r.screen.w} x ${r.screen.h} screen`);
    assert.deepStrictEqual([r.tile, r.map], [{ w: 30, h: 27 }, { cols: 11, rows: 11 }], `${view}: the tile or the map isn't the Arcade map's`);
    assert.strictEqual(r.panels.length, 4, `${view}: ${r.panels.length} corner panels drawn`);
  };

  // A tile placement: the piece is moved by arrows, all queued in one tick, to an anchor that keeps it on the map, and dropped; a
  // blocked spot sends nothing and the next is tried.
  function place(r) {
    assert.ok(r.piece.length > 0 && r.hero === null && r.targets === 'free', `${view}: tile placement reads ${JSON.stringify(r)}`);
    const from = sent.length;
    for (const [x, y] of [[0, 0], [3, 3], [5, 5], [7, 7], [0, 8], [8, 0], [4, 6], [6, 4], [2, 8], [8, 2]]) {
      const now = read();
      if (!now.piece.every(o => x + o.x >= 0 && y + o.y >= 0 && x + o.x < now.map.cols && y + o.y < now.map.rows) || !pointable(now, { x, y })) continue;
      const target = point(now, { x, y }), dx = target.x - now.cell.x, dy = target.y - now.cell.y;
      for (let i = 0; i < Math.abs(dx); i++) tap(dx < 0 ? 'LEFT' : 'RIGHT');
      for (let i = 0; i < Math.abs(dy); i++) tap(dy < 0 ? 'UP' : 'DOWN');
      tick(); tick();
      assert.deepStrictEqual(read().cell, target, `${view}: the piece didn't go to ${x},${y}`);
      hold();
      if (sent.length > from) {
        assert.deepStrictEqual(sent.slice(from), [{ order: 'PlaceTile', x, y }], `${view}: the drop at ${x},${y} sent other orders`);
        return;
      }
      assert.strictEqual(read().state, r.state, `${view}: a blocked drop at ${x},${y} left the tile placement`);
    }
    assert.fail(`${view}: the piece dropped nowhere`);
  }

  // A hero turn: the cursor starts on the hero. Along a trail the pointer crosses one cell at a time and each step is one arrow
  // press, as hover moves it on the Full board; a key is applied a tick after it is queued, so the cursor is read the tick after next.
  function trail(r, cells) {
    let at = r.cell;
    for (const c of cells) {
      const to = point(read(), c);
      tap(ARROW[`${to.x - at.x},${to.y - at.y}`]);
      tick(); tick();
      assert.deepStrictEqual(read().cell, to, `${view}: the cursor didn't follow the trail to ${to.x},${to.y}`);
      at = to;
    }
  }
  // Another player's turn: the cursor goes onto an enemy hero by a jump, then along a trail, from a free cell next to an enemy hero
  // onto it by one arrow, and each time the engine shows that hero's reach area: after the jump through the refresh jump() runs,
  // after the arrow by itself. Nothing is sent.
  function watch(r) {
    assert.ok(r.hero === null && r.targets === 'free' && r.piece === null, `${view}: another player's turn reads ${JSON.stringify(r)}`);
    const from = outgoing;
    const shows = ({ cell: { x, y }, seat }, how) => {
      const area = reachArea();
      assert.ok(area.on && area.seats.get(`${x},${y}`) === seat && [...area.seats.values()].every(s => s === seat),
        `${view}: ${how} the hero at ${x},${y} showed no reach area of seat ${seat}: ${JSON.stringify({ on: area.on, cells: [...area.seats] })}`);
    };
    // On Classic the camera follows the cursor: while no enemy hero is on screen, the pointer jumps the cursor as far toward the
    // nearest one as the screen shows, as a player would click, and the camera glides after it.
    const pointed = () => enemies().find(h => pointable(read(), h.cell));
    for (let i = 0; i < 3 && !pointed(); i++) {
      const now = read(), dist = c => Math.abs(c.x - now.cell.x) + Math.abs(c.y - now.cell.y);
      const goal = enemies().map(h => h.cell).sort((a, b) => dist(a) - dist(b))[0];
      let c = now.cell;
      for (let n; !same(c, goal) && pointable(now, n = { x: c.x + Math.sign(goal.x - c.x), y: c.y + Math.sign(goal.y - c.y) });) c = n;
      assert.ok(pointer.jump(c.x, c.y), `${view}: another player's turn refused a jump`);
      for (let t = 0; t < 40; t++) tick();
    }
    const hero = pointed();
    assert.ok(hero, `${view}: no enemy hero a pointer can be over`);
    const to = point(read(), hero.cell);
    assert.ok(pointer.jump(to.x, to.y), `${view}: another player's turn refused a jump`);
    assert.deepStrictEqual(read().cell, to, `${view}: the cursor didn't jump to ${to.x},${to.y}`);
    shows(hero, 'a jump onto');
    tick();
    assert.strictEqual(reachArea().shown, 1, `${view}: the battle view doesn't show the reach area of slot 1`);
    // A free cell next to an enemy hero, another one than the jump's where a pointer can be over one.
    const onMap = c => c.x >= 0 && c.y >= 0 && c.x < r.map.cols && c.y < r.map.rows;
    const beside = enemies().sort((a, b) => same(a.cell, hero.cell) - same(b.cell, hero.cell))
      .flatMap(h => [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ h, c: { x: h.cell.x + dx, y: h.cell.y + dy } })))
      .find(({ h, c }) => onMap(c) && !unitAt(c.x, c.y) && pointable(read(), c) && pointable(read(), h.cell));
    assert.ok(beside, `${view}: no free cell next to an enemy hero a pointer can be over`);
    const start = point(read(), beside.c);
    assert.ok(pointer.jump(start.x, start.y), `${view}: another player's turn refused a jump`);
    assert.strictEqual(reachArea().on, 0, `${view}: a jump onto the free cell ${start.x},${start.y} left a reach area on`);
    tick(); tick();
    trail(read(), [beside.h.cell]);
    shows(beside.h, 'an arrow onto');
    assert.strictEqual(outgoing, from, `${view}: another player's turn sent ${outgoing - from} messages of ours`);
    assert.ok(theirTurn(), `${view}: the other player's turn ended during the checks`);
    return [hero, beside.h].map(h => `${h.cell.x},${h.cell.y}`);
  }
  const heroId = r => ri(unitAt(r.hero.x, r.hero.y) + 0x28);
  const done = { trail: false, attack: false, jump: false, cannons: false, watched: null, drops: 0 };
  const moves = [];
  while (!(done.trail && done.attack && done.jump && done.cannons && done.watched)) {
    const r = next(done.watched ? ['tile', 'move', 'cannon'] : ['tile', 'move', 'cannon', 'watch']);
    checkView(r);
    if (r.state === 'watch') { done.watched = watch(r); continue; }
    if (r.state === 'tile') { place(r); done.drops++; continue; }
    if (r.state === 'cannon') {
      assert.strictEqual(r.hero, null, `${view}: the cannons read a hero`);
      const from = sent.length, aims = [];
      for (let shot = 0; shot < 2; shot++) {
        const now = pointer.read();
        if (!now) break;
        const c = CANNON_AIMS.find(c => pointable(now, c) && !aims.some(a => same(a, c)));
        assert.ok(c, `${view}: no cannon aim a pointer can be over`);
        const to = point(now, c);
        assert.ok(pointer.jump(to.x, to.y), `${view}: the cannons refused a jump`);
        tick();
        assert.deepStrictEqual(read().cell, to, `${view}: the cannon's aim didn't jump to ${to.x},${to.y}`);
        select();
        aims.push({ order: 'FireCannon', ...to });
      }
      assert.strictEqual(aims.length, 2, `${view}: the cannons took ${aims.length} shots`);
      assert.strictEqual(pointer.read(), null, `${view}: the cannons still read after their last shot`);
      assert.deepStrictEqual(orders(from, 2), aims, `${view}: the cannons fired elsewhere`);
      done.cannons = true;
      continue;
    }
    assert.ok(r.hero && same(r.cell, r.hero) && r.targets === 'free', `${view}: a hero turn reads ${JSON.stringify(r)}`);
    const id = heroId(r), from = sent.length;
    const enemy = [[1, 0], [-1, 0], [0, 1], [0, -1]].map(([dx, dy]) => ({ x: r.hero.x + dx, y: r.hero.y + dy })).find(c => enemyHero(unitAt(c.x, c.y)));
    if (!done.trail) {
      // Three cells right, the first move of wide-test's fight keys, which brings red's hero next to ours.
      const cells = [1, 2, 3].map(d => ({ x: r.hero.x + d, y: r.hero.y }));
      trail(r, cells);
      select();
      assert.deepStrictEqual(orders(from, 1)[0], { order: 'MoveUnit', unit: id, path: [r.hero, ...cells].map(c => `${c.x},${c.y}`), attack: 0 }, `${view}: the hero didn't walk the trail`);
      done.trail = true; moves.push('trail');
    } else if (enemy && !done.attack) {
      const target = ri(unitAt(enemy.x, enemy.y) + 0x28);
      trail(r, [enemy]);
      select();
      assert.deepStrictEqual(orders(from, 2).slice(0, 2), [{ order: 'MoveUnit', unit: id, path: [`${r.hero.x},${r.hero.y}`], attack: 1 }, { order: 'Attack', attacker: id, target }],
        `${view}: the hero didn't attack the enemy hero at ${enemy.x},${enemy.y}`);
      done.attack = true; moves.push('attack');
    } else if (!done.jump) {
      // Free cells of the reach area two steps from the hero, then next to it, so that the engine plans the route itself. Select on a
      // cell the hero can't stop on sends nothing (on Classic, the hero at (0,2) on its third turn couldn't stop on (1,1)), and the
      // next is tried.
      const cells = [];
      for (const d of [2, 1]) for (let dy = -d; dy <= d; dy++) for (const dx of new Set([d - Math.abs(dy), Math.abs(dy) - d])) cells.push({ x: r.hero.x + dx, y: r.hero.y + dy });
      let move = null;
      for (const c of cells.filter(c => reaches(c.x, c.y) && !unitAt(c.x, c.y))) {
        const now = read();
        if (!pointable(now, c)) continue;
        const to = point(now, c);
        assert.ok(pointer.jump(to.x, to.y), `${view}: the hero turn refused a jump`);
        tick();
        assert.deepStrictEqual(read().cell, to, `${view}: the cursor didn't jump to ${to.x},${to.y}`);
        select();
        [move] = orders(from, 1, 30);
        if (!move) continue;
        assert.ok(move.order === 'MoveUnit' && move.unit === id && move.attack === 0 && move.path[0] === `${r.hero.x},${r.hero.y}` && move.path.at(-1) === `${to.x},${to.y}`,
          `${view}: the jump to ${to.x},${to.y} sent ${JSON.stringify(move)}`);
        break;
      }
      assert.ok(move, `${view}: no jump from the hero at ${r.hero.x},${r.hero.y} moved it`);
      done.jump = true; moves.push('jump');
    } else {
      assert.ok(moves.length < 6, `${view}: no enemy hero came next to ours in ${moves.length} hero turns`);
      select(); // stay
      moves.push('stay');
    }
  }
  return { drops: done.drops, moves, watched: done.watched };
}

for (const fullBoard of [true, false]) {
  const { drops, moves, watched } = play(fullBoard);
  console.log(`pointer play ok on ${fullBoard ? 'the Full board' : 'Classic'}: ${drops} pieces dropped, hero turns ${moves.join(', ')}, both cannons aimed by jumps, `
    + `in another player's turn the reach areas of the enemy heroes at ${watched.join(' (a jump) and ')} (a trail)`);
}
