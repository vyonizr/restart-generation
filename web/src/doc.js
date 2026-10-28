// The Terms and the Privacy policy (docs/adr/0021): one entry for both pages, which says which one it is in <body data-doc>. Each
// fills in the server's admin, hosting provider and contact from GET /status before it draws, so the text never changes under the
// reader; on a static host, which has no server, it draws without them. Then it reports its open (visit.js, docs/adr/0043).
import './styles/doc.css';
import { mount } from 'svelte';
import Terms from './lib/legal/Terms.svelte';
import Privacy from './lib/legal/Privacy.svelte';
import { countVisit } from './lib/visit.js';

const kind = document.body.dataset.doc === 'privacy' ? 'privacy' : 'terms';
fetch('../status', { cache: 'no-store' })
  .then(r => (r.ok ? r.json() : null))
  .catch(() => null)
  .then(server => {
    mount(kind === 'privacy' ? Privacy : Terms, { target: document.body, props: { server } });
    countVisit(kind, server);
  });
