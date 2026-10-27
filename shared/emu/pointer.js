// Pointer play (CONTEXT.md "Pointer play", docs/adr/0039): what the local player's battle input is now, read from the engine between
// two ticks, and the engine's own cursor moved to a cell without arrow presses. The engine has no pointer input, so a page turns a
// click into arrow presses and Select from what read() says; everything the engine sends is what keys would have produced. The engine
// facts are in docs/re/re_battle_input.md.

const APP = 0x101b828c; // the engine's app object: +0x8c the UI, +0x9c the battle view while a battle is on
const SETTER = 0x10073ea0; // FUN_10073ea0: sets the cursor's cell, clamped to the map
// What the player sees is drawn about 4 px lower than the engine's grid (docs/re/re_battle_input.md "Pixel to cell").
const DRAW_OFFSET = 4;

// The battle UI states pointer play applies to, by their vtable, with the first entry of it and the input vtable at S+8 whose second
// entry handles the state's keys (docs/re/re_battle_input.md "The states").
const STATES = [
  { state: 'tile', vtable: 0x10186860, first: 0x100b2bb0, input: 0x10186858, keys: 0x100d5410 },
  { state: 'tileItem', vtable: 0x10188ea0, first: 0x100e2ae0, input: 0x10188e98, keys: 0x100d5410 },
  { state: 'move', vtable: 0x101868b4, first: 0x100b5180, input: 0x101868ac, keys: 0x100b5df0 },
  { state: 'cannon', vtable: 0x10186964, first: 0x100b7d40, input: 0x1018695c, keys: 0x100b76f0 },
  { state: 'item', vtable: 0x10186914, first: 0x100b71c0, input: 0x1018690c, keys: 0x100b6710 },
  { state: 'skill', vtable: 0x101892e0, first: 0x100ea150, input: 0x101892d8, keys: 0x100e9e60 },
];
// The code whose fields and rules read() and jump() rely on, checked as ADR 0017 checks its hooks: the setter whole, since jump()
// runs it, and the start of each other function.
const SITES = [
  { va: 0x10073ea0, bytes: '8b4424048b108951248b40048a54240889412833c03ad0742b' }, // FUN_10073ea0, the cursor's cell setter
  { va: 0x10073eb9, bytes: '3941247d038941243941287d038941288b41048b5020395124' },
  { va: 0x10073ed2, bytes: '7c044a8951248b40243941287c0448894128c20800' },
  { va: 0x10073fd0, bytes: '568bf18a465b84c00f84' }, // FUN_10073fd0: an arrow moves the cursor, while its "active" byte is set
  { va: 0x100d51e0, bytes: '56578bf1e8d7f6ffff8b' }, // FUN_100d51e0: an arrow moves the tile piece
  { va: 0x100d48c0, bytes: '83ec105355568bf18b46' }, // FUN_100d48c0: the piece's anchor is clamped by its shape
  { va: 0x100b6710, bytes: '64a1000000006aff68a6' }, // FUN_100b6710: the item state's keys
  { va: 0x100b6fc0, bytes: '83ec0c568bf1e8f56dfd' }, // FUN_100b6fc0: the item state's start, by the item's kind
  { va: 0x100e9920, bytes: '83ec18568bf18a869c00' }, // FUN_100e9920: the special skill state's arrows
  { va: 0x100ea2a0, bytes: '6aff64a10000000068c0' }, // FUN_100ea2a0: the special skill state's start, by the skill's kind
  { va: 0x100251a0, bytes: '5156578d4424085083c1' }, // FUN_100251a0: a seat's hero, whose corner panel is drawn
  { va: 0x1000cf60, bytes: '8b4130c3' },             // FUN_1000cf60: a hero's seat
  { va: 0x1008a500, bytes: '8b442408538b5c240856' }, // FUN_1008a500: a corner panel's place
];
// Item kinds (the item's +0x54) and special skill kinds (the hero's skill, [hero+0x58]+0x2c) whose arrows move the cursor freely or
// pick a direction, as checked in a battle (docs/re/re_battle_input.md "Items" and "Special skills"). Any other kind reads as null.
const ITEM_FREE = new Set([0, 8, 0x11, 0x15]), ITEM_DIRECTION = new Set([9]);
const SKILL_FREE = new Set([1, 2, 5, 10]), SKILL_DIRECTION = new Set([0, 3]);
// The bomb's blast mask follows the cursor only on a key event: after a jump it would stay where it was.
const ITEM_NO_JUMP = new Set([8]);

// Which engine screen pixel (px, py) is which cell, given read()'s camera and tile.
export function cellAt(px, py, { camera, tile }) {
  return { x: Math.floor((px + camera.x) / tile.w), y: Math.floor((py - DRAW_OFFSET + camera.y) / tile.h) };
}

// Arms pointer play on a booted GameHost. Returns null when this copy lacks the bytes the reads and writes rely on, or the engine
// plays a replay; the page then offers no pointer play.
export function battlePointer(game) {
  const m = game.m;
  if (game.replay !== null || !m) return null;
  const cpu = m.cpu, m8 = cpu.m8, rd = a => cpu.rd32(a) >>> 0, ri = a => cpu.rd32(a) | 0, addr = va => m.addr(va) >>> 0;
  const bytesAt = (va, n) => [...m8.subarray(addr(va), addr(va) + n)].map(b => b.toString(16).padStart(2, '0')).join('');
  if (!SITES.every(s => bytesAt(s.va, s.bytes.length / 2) === s.bytes)) return null;
  if (!STATES.every(s => rd(addr(s.vtable)) === addr(s.first) && rd(addr(s.input) + 4) === addr(s.keys))) return null;
  const states = new Map(STATES.map(s => [addr(s.vtable), s.state]));
  const cell = a => ({ x: ri(a), y: ri(a + 4) });

  // The state now and what read() needs of it, or null.
  function now() {
    const app = rd(addr(APP)), bv = app && rd(app + 0x9c);
    if (!bv) return null;
    // A curtain animation (the intro, a phase banner, a rescue, a fight) covers the battlefield; on the Full board it shows the
    // 240 x 320 inset (docs/re/re_screen.md).
    if (m8[rd(bv + 0x2a4) + 0x50] || rd(rd(bv + 0x2a0) + 8) !== 0 || rd(rd(bv + 0x29c) + 0x14) === 1) return null;
    const S = rd(rd(rd(rd(app + 0x8c) + 0x84) + 0x20) + 4), state = S && states.get(rd(S));
    if (!state) return null;
    const cursor = rd(S + 0x28);
    if (!cursor || !m8[cursor + 0x5b]) return null; // battle input is dropped while the cursor isn't active
    let targets = 'free', hero = 0, jump = true, piece = null, choices = null;
    if (state === 'tile' || state === 'tileItem') {
      if (m8[S + 0xb8]) return null; // dropped
      jump = false;
      const n = ri(S + 0xb0), at = rd(S + 0x94);
      piece = Array.from({ length: n }, (_, i) => cell(at + i * 8));
    } else if (state === 'move') {
      hero = rd(S + 0x80);
    } else if (state === 'cannon') {
      if (ri(S + 0x80) >= ri(S + 0x84)) return null; // every shot is taken
    } else if (state === 'item') {
      if (m8[S + 0x88] || m8[S + 0x94]) return null; // used, or an item that needs no target
      hero = rd(S + 0x80);
      const kind = ri(rd(S + 0x8c) + 0x54);
      targets = m8[S + 0x9c] ? 'cycle' : ITEM_DIRECTION.has(kind) ? 'direction' : ITEM_FREE.has(kind) ? 'free' : null;
      jump = targets === 'free' && !ITEM_NO_JUMP.has(kind);
    } else {
      if (m8[S + 0x84] || m8[S + 0x74]) return null; // confirmed, or no target to choose
      hero = rd(S + 0x88);
      const kind = ri(rd(hero + 0x58) + 0x2c);
      targets = m8[S + 0x9c] ? 'cycle' : SKILL_DIRECTION.has(kind) ? 'direction' : SKILL_FREE.has(kind) ? 'free' : null;
      jump = targets === 'free';
    }
    if (!targets) return null;
    if (targets === 'cycle') {
      // The candidates, in the order Down and Right go through them (docs/re/re_battle_input.md "Target lists").
      choices = [];
      for (let node = rd(S + 0xa0), i = ri(S + 0xa8); node && i > 0; node = rd(node + 4), i--) choices.push(cell(node + 8));
    }
    return { S, bv, cursor, state, targets, hero, jump, piece, choices };
  }

  // The corner panels drawn now, in screen pixels: a seat's panel is drawn while the seat has a hero (FUN_1008ac90).
  function panels(bv) {
    const out = [], game = rd(bv + 4), at = rd(rd(bv + 0x1b8) + 8);
    for (let i = 0; i < 4; i++) {
      const p = at + i * 0x6c, image = rd(p), seat = ri(p + 8);
      if (!image || !seatHero(game, seat)) continue;
      out.push({ x: ri(p + 0x3c), y: ri(p + 0x40), w: ri(image + 0x18), h: ri(image + 0x1c) });
    }
    return out;
  }
  // FUN_100251a0: the first unit in the game's list (+0x6c) that is a hero (+0x34 is 0), not a princess (+0xe4 is 0), of the seat.
  function seatHero(game, seat) {
    for (let node = rd(game + 0x6c); node; node = rd(node + 4)) {
      const u = rd(node + 8);
      if (u && ri(u + 0x34) === 0 && ri(u + 0xe4) === 0 && ri(u + 0x30) === seat) return true;
    }
    return false;
  }

  return {
    read() {
      const s = now();
      if (!s) return null;
      const view = rd(s.bv + 8);
      return {
        state: s.state,
        cell: s.piece ? cell(s.S + 0x84) : cell(s.cursor + 0x24),
        hero: s.hero ? cell(s.hero + 0x38) : null,
        camera: { x: ri(s.bv + 0x2b0) >> 16, y: ri(s.bv + 0x2b4) >> 16 },
        tile: { w: ri(view + 0x20), h: ri(view + 0x24) },
        map: { cols: ri(view + 8), rows: ri(view + 0xc) },
        screen: { w: game.width, h: game.height },
        targets: s.targets,
        piece: s.piece,
        choices: s.choices,
        panels: panels(s.bv),
      };
    },
    // Moves the cursor to the cell (x, y) through FUN_10073ea0, a thiscall on the cursor with a pointer to the cell and a "clamp"
    // byte, which pops both. Only where read() would say so and the state keeps nothing of its own that follows the cursor.
    jump(x, y) {
      const s = now();
      if (!s || !s.jump) return false;
      const esp = cpu.r[4], ecx = cpu.r[1];
      cpu.r[4] = (esp - 64) | 0;
      const p = (cpu.r[4] >>> 0) + 16;
      cpu.wr32(p, x | 0); cpu.wr32(p + 4, y | 0);
      cpu.r[1] = s.cursor;
      try { cpu.call(addr(SETTER), [p, 1]); } finally { cpu.r[1] = ecx; cpu.r[4] = esp; }
      return true;
    },
  };
}
