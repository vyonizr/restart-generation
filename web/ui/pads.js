// Which gamepads the pages read (CONTEXT.md "Gamepad"), and which buttons, shared by the game page (gamepad.js) and the replay page
// (replay.svelte.js).

// The buttons the pages read, by their position in the standard mapping: bottom, right, Start, and the D-pad. No other button
// does anything.
export const BUTTONS = { select: 0, back: 1, menu: 9, up: 12, down: 13, left: 14, right: 15 };

// Android Chrome puts the buttons of a pad it has no mapping for in the standard order anyway, but reports its mapping as ''.
// Elsewhere such a pad's buttons are in an order of its own, so it is ignored.
const android = navigator.userAgentData ? navigator.userAgentData.platform === 'Android' : /Android/.test(navigator.userAgent);
export const usable = pad => Boolean(pad?.connected) && (pad.mapping === 'standard' || (android && pad.mapping === ''));
