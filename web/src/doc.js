// The Terms and the Privacy policy (docs/adr/0021): one entry for both pages, which says which one it is in <body data-doc>. Each
// fills in the server's admin, hosting provider and contact from GET /status before it draws, so the text never changes under the
// reader; on a static host, which has no server, it draws without them.
import './styles/doc.css';
import { mount } from 'svelte';
import Terms from './lib/legal/Terms.svelte';
import Privacy from './lib/legal/Privacy.svelte';

fetch('../status', { cache: 'no-store' })
  .then(r => (r.ok ? r.json() : null))
  .catch(() => null)
  .then(server => mount(document.body.dataset.doc === 'privacy' ? Privacy : Terms, { target: document.body, props: { server } }));
