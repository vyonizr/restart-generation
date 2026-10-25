// Keeps the screen on: a Wake Lock where the browser has one (secure contexts only), else a hidden video.
// Chrome and Safari hold the screen only for a video that can make sound, and Safari not for a looping one,
// so the video has a silent audio track, plays unmuted, and jumps back before it ends.
let video = null;

// The page's hidden <video>, as a Svelte action: use:wakeVideo
export function wakeVideo(el) {
  video = el;
  const loop = () => { if (el.currentTime > 0.5) el.currentTime = 0; };
  el.addEventListener('timeupdate', loop);
  return { destroy() { el.removeEventListener('timeupdate', loop); video = null; } };
}

export const needsVideo = () => !navigator.wakeLock && video?.paused;

export function stayAwake() {
  if (navigator.wakeLock) return navigator.wakeLock.request('screen').catch(() => {});
  if (navigator.audioSession) navigator.audioSession.type = 'ambient'; // mixes with the player's music instead of stopping it
  video?.play().catch(() => {});
}
