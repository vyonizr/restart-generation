// Visitor statistics (docs/adr/0043): each of the four pages reports its own open to the gateway, once, with its kind, the referring
// site and the kind of device. The gateway adds the country and decides whether the visitor is new today. Only a public server with
// RG_STATS=1 counts, and says so as `stats: true` in GET /status; a static host has no server, so the page sends nothing there.
import { touch } from './device.js';

// The return from Discord sign-in lands on the game page as `/#signin=…` (or `#signin-error=…`) with discord.com as its referrer,
// which isn't a referring site. accounts.js takes the hash out of the address when the account starts, so it is read here, while this
// module loads: the pages import it statically, and a module runs before any code of the modules that import it.
const signinReturn = location.hash.startsWith('#signin');

// The Privacy policy's "Don't count my visits" (Privacy.svelte): remembered in this browser, as the page's other choices are.
const KEY = 'rg:nostats';
export const notCounted = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
// Returns the choice as stored: where storage is blocked there is nowhere to keep it, so it stays as it was.
export function setNotCounted(on) {
  try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* storage blocked */ }
  return notCounted();
}

// The other site the visitor came from, by its domain alone (CONTEXT.md "Referring site"); none for a move between this site's own
// pages, an address typed or opened from an app (no referrer), and the return from Discord sign-in. The server checks it again.
function referringSite() {
  if (signinReturn || !document.referrer) return '';
  const domain = host => host.toLowerCase().replace(/^www\./, '');
  let site;
  try { site = domain(new URL(document.referrer).hostname); } catch { return ''; }
  return site === domain(location.hostname) ? '' : site;
}

// `kind` is 'game', 'replay', 'terms' or 'privacy'; `server` is GET /status's answer, or null. A browser that opted out, or that
// sends the Global Privacy Control signal, sends nothing (the gateway also ignores a request with `Sec-GPC: 1`).
export function countVisit(kind, server) {
  if (server?.stats !== true || notCounted() || navigator.globalPrivacyControl === true) return;
  // POST /visit at the site's root, beside GET /status: the game page is the root, the replay page's <base href="../"> makes it the
  // root for relative addresses, and the Terms and the Privacy policy sit one folder below it with no base, as doc.js's '../status'.
  const url = kind === 'terms' || kind === 'privacy' ? '../visit' : 'visit';
  // A beacon outlives the page if the visitor leaves at once, and sends its string as text/plain, which the gateway accepts.
  try { navigator.sendBeacon(url, JSON.stringify({ page: kind, referrer: referringSite(), touch })); } catch { /* no beacon: not counted */ }
}
