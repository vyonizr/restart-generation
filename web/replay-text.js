// How a replay (CONTEXT.md) is named in words: on its page (web/ui/Replay.svelte) and in the link preview the server writes into
// that page's head (server/replaypage.js). `meta` is what the server keeps beside the replay text (server/battle.js replay()).

// A hero's engine identifier (server/gameblob.js HERO_IDS) as words: LEVEL_50_ELF is Level 50 Elf.
export const heroName = type => String(type ?? '').toLowerCase().split('_').filter(Boolean)
  .map(w => w[0].toUpperCase() + w.slice(1)).join(' ') || 'an unknown hero';

// The Game's environment field (CONTEXT.md "Environment").
export const ENVIRONMENTS = ['space', 'clouds and grass', 'speedball', 'soccer', 'racetrack'];

// a, a and b, a, b and c.
export const andList = items => items.length < 2 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`;

const DAY = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

// A day as 30 Oct 2026, in the reader's time zone.
const SHORT_DAY = new Intl.DateTimeFormat('en-US', { day: 'numeric', month: 'short', year: 'numeric' });
export const shortDay = time => {
  const part = Object.fromEntries(SHORT_DAY.formatToParts(time).map(p => [p.type, p.value]));
  return `${part.day} ${part.month} ${part.year}`;
};

export const replayTitle = meta => `${andList(meta.players.map(p => p.name))} · Replay · Restart Generation`;

export function replayDescription(meta) {
  const environment = ENVIRONMENTS[meta.environment] ?? 'an unknown environment';
  const who = andList(meta.players.map(p => `${p.name}${p.bot ? ' (CPU)' : ''} played ${heroName(p.hero)}`));
  return `A ${meta.ranked ? 'ranked' : 'friendly'} match on ${environment}, ${DAY.format(meta.created)}. ${who}.`;
}

// A playback time in whole seconds as m:ss.
export const clock = s => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

// Whole seconds still to go, as "2m 3s remaining" or "45s remaining".
export const remaining = s => `${s >= 60 ? `${Math.floor(s / 60)}m ` : ''}${s % 60}s remaining`;

// The file name of a replay's footage (CONTEXT.md "Footage"): restart-generation-2026-10-24-alice-vs-bob.mp4, the battle's date
// as its page gives it (the visitor's own) and the seats' names in seat order, lowercase, with anything but letters and digits as
// one dash.
export function footageName(meta) {
  const names = [...meta.players].sort((a, b) => a.seat - b.seat)
    .map(p => p.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '') || `seat-${p.seat}`);
  const d = new Date(meta.created), two = n => String(n).padStart(2, '0');
  return `restart-generation-${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}-${names.join('-vs-')}.mp4`;
}

const SUFFIX = ['th', 'st', 'nd', 'rd'];
export const ordinal = n => `${n}${(n % 100 >= 11 && n % 100 <= 13) ? 'th' : SUFFIX[n % 10] ?? 'th'}`;

// The battle's result as the end screen says it: a headline, and each player's place where the witness ranked them.
// { headline, places: [{ name, place }], guessed }
export function resultOf(meta) {
  const r = meta.result, name = seat => meta.players.find(p => p.seat === seat)?.name ?? `Seat ${seat}`;
  if (!r) return { headline: 'The battle ended without a result: every player left.', places: [], guessed: false };
  const winners = r.winners.map(name);
  const headline = winners.length ? `${andList(winners)} won.` : 'Nobody won.';
  const places = r.ranks ? meta.players.filter(p => r.ranks[p.seat] > 0).map(p => ({ name: p.name, place: r.ranks[p.seat] }))
    .sort((a, b) => a.place - b.place) : [];
  return { headline, places, guessed: r.guessed };
}

// What a mark (CONTEXT.md) says on the replay's slider: its time, then its moments in order, as "1:42 · Ada rescues Bo's princess"
// or "2:10 · Bo is knocked out". A knock-out names only whose hero it was: the witness can't always tell who did it.
export function markLabel(meta, mark) {
  const name = seat => meta.players.find(p => p.seat === seat)?.name ?? `Seat ${seat}`;
  const moment = m => m.kind === 'rescue' ? `${name(m.by)} rescues ${name(m.seat)}'s princess` : `${name(m.seat)} is knocked out`;
  return [clock(mark.at), ...mark.moments.map(moment)].join(' · ');
}
