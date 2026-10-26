// A rejoin's quiet replay (docs/adr/0038, docs/re/re_rejoin.md). Handshake step 4 hands a rejoining engine the whole battle so
// far, and a person's engine replays it with the battlefield's visuals on: it queues every replayed message's animations and stays
// busy for minutes. While a rejoin is pending, the replay runs with the visuals off instead, and they come back on with nothing
// queued before the engine marks itself joined, so it plays on from the battle's current state. The page arms it at Rejoin only, so
// a page that isn't rejoining runs the engine as it always did.

// State 4 of the join (FUN_100e17a0) turns the visuals back on before it replays the history, by pushing 0 for FUN_10016300 at
// 0x100e1896; pushing 1 keeps them off. The next instruction is matched too, as the in-memory patches match theirs (docs/adr/0007).
export const QUIET = { what: 'history replay without visuals', va: 0x100e1896, from: '6a00c6464000', to: '6a01c6464000' };
// After the replay, at 0x100e1988, state 4 loads the handshake object (logic+0x38, the logic in ESI) to set state 6. The visuals go
// back on there, inside the same engine frame: turned on after that frame instead, the page's engine reports that frame as its last
// (tick returns 0), which the page takes for Quit.
const REPLAYED = { va: 0x100e1988, bytes: '8b4e38c74104060000' };
const JOIN_MACHINE = [0x100e17a0, 0x100e1ad0]; // FUN_100e17a0, up to the next function
const VISUALS = 0x10016300; // thiscall on the battlefield: 1 turns its visuals off, 0 on with an empty visualizer
const BATTLEFIELD = 0x14;   // logic+0x14
const ESI = 6;

const hexAt = (cpu, at, n) => [...cpu.m8.subarray(at, at + n)].map(b => b.toString(16).padStart(2, '0')).join('');

// Arms the quiet replay in a booted engine (game: a GameHost) and returns its handle, or null for a copy without the original bytes.
export function quietReplay(game) {
  const m = game.m, cpu = m.cpu, at = m.addr(QUIET.va), size = QUIET.from.length / 2;
  if (hexAt(cpu, at, size) !== QUIET.from || hexAt(cpu, m.addr(REPLAYED.va), REPLAYED.bytes.length / 2) !== REPLAYED.bytes) return null;
  // The emulator caches decoded and compiled code, and a cached block may hold the old bytes or run past the watch. A block ends at
  // the first control transfer, so none starts outside the function: dropping what is cached for the whole function is enough.
  const write = bytes => {
    cpu.m8.set(bytes.match(/../g).map(h => parseInt(h, 16)), at);
    for (let a = m.addr(JOIN_MACHINE[0]); a < m.addr(JOIN_MACHINE[1]); a++) cpu.codeCache[a - cpu.codeBase] = undefined;
  };
  let armed = true, joined = false;
  const disarm = () => { if (armed) { write(QUIET.from); armed = false; } };
  write(QUIET.to);
  game.watch(REPLAYED.va, c => {
    if (!armed) return;
    // A call from inside the engine's own code: every register goes back as it was. The flags needn't, since the instruction
    // before is a call and nothing reads them before the function returns.
    const saved = cpu.r.slice();
    cpu.r[1] = cpu.rd32((c.r[ESI] + BATTLEFIELD) >>> 0) >>> 0;
    cpu.call(m.addr(VISUALS), [0]);
    cpu.r.set(saved);
    disarm(); // a later join runs as it always did
    joined = true;
  });
  return {
    // The history has been replayed quietly and the visuals are back on: the engine is joining its battle.
    get joined() { return joined; },
    // The rejoin ended without joining: the next join runs as it always did.
    disarm,
  };
}
