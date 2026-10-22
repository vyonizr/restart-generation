// Puts text on the clipboard. The clipboard API exists only in a secure context; a LAN address over plain HTTP falls back to the
// older copy command. Rejects when neither works.
export async function copyText(text) {
  if (navigator.clipboard) return navigator.clipboard.writeText(text);
  const field = Object.assign(document.createElement('textarea'), { value: text, readOnly: true });
  field.style.position = 'fixed'; field.style.opacity = '0';
  document.body.append(field);
  field.select();
  try { if (!document.execCommand('copy')) throw new Error('copy refused'); } finally { field.remove(); }
}

// A Copy link button's label: `show` gets "Link copied" or "Couldn't copy", then "Copy link" again 2.5 s after the last press.
export function copyLinkFeedback(show) {
  let timer;
  return async url => {
    let label = 'Link copied';
    try { await copyText(url); } catch { label = "Couldn't copy"; }
    show(label);
    clearTimeout(timer);
    timer = setTimeout(() => show('Copy link'), 2500);
  };
}
