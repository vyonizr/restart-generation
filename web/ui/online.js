// The count of players online ("3 online"), from GET /status. It starts from the answer the page already has, then refreshes every
// 30 s while the page is visible. page.online is null on a static host with no server, and again if the server stops answering.
import { page } from './page.svelte.js';

const REFRESH_MS = 30000;

// What the server says about itself (GET /status): whether it has accounts, and who is online. Null on a static host with no server.
export const serverStatus = () => fetch('status', { cache: 'no-store' }).then(r => (r.ok ? r.json() : null)).then(s => (typeof s?.accounts === 'boolean' ? s : null), () => null);
const count = status => (Number.isInteger(status?.online) && status.online >= 0 ? status.online : null);

async function refresh() {
  try {
    const r = await fetch('status', { cache: 'no-store' });
    if (r.ok) page.online = count(await r.json());
  } catch { page.online = null; }
}

export function startOnlineCount(first) {
  page.online = count({ online: first });
  setInterval(() => { if (!document.hidden) refresh(); }, REFRESH_MS);
}
