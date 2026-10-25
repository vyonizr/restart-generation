// The replay page's head as a chat app reads it when a player shares the link: chat apps don't run the page, so the server writes
// the players, heroes, kind of match, environment and day into the built page (web/replay/index.html). Text only: the only
// picture a replay has is the game's (docs/LEGAL.md).
const { replayTitle, replayDescription } = require('../shared/replay-text.js');

const ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escape = s => String(s).replace(/[&<>"']/g, c => ENTITIES[c]);

// `html` with the preview of the replay described by `meta`, or unchanged for a replay that is gone (meta null). The replacements are
// functions, so a `$` in a name or hero is never read as a replacement pattern.
function replayPage(html, meta) {
  if (!meta) return html;
  const title = escape(replayTitle(meta)), description = escape(replayDescription(meta));
  return html.replace(/<title>[^<]*<\/title>/, () => `<title>${title}</title>`).replace('</head>', () => [
    `<meta name="description" content="${description}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:site_name" content="Restart Generation">`,
    `<meta property="og:title" content="${title}">`,
    `<meta property="og:description" content="${description}">`,
    '</head>'].join(''));
}

module.exports = { replayPage };
