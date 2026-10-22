// The link for the server's RG_CONTACT: an email address becomes a mailto link. The server only passes an email address or an
// https address (server/auth.js CONTACT), so nothing else needs handling.
export const contactHref = c => (c.startsWith('https://') ? c : `mailto:${c}`);
