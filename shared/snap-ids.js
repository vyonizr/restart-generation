// SNAP Mobile ids and sizes as this server speaks the protocol (docs/protocol.md), shared by the page's client (shared/snap.js),
// the engine host (shared/emu/host.js) and the server (gateway.js, auth.js, mt.js). Commands and events are separate tables:
// 307 is accept as a command and presence as an event.

// Commands (the C= of a request).
export const CMD = {
  INIT: 0,
  EXTENDED_LOGIN: 1,
  UNIFIED_LOGOUT: 2,
  RETRIEVE_ALL_EVENTS: 3, // the event long-poll
  JOIN_LOBBY: 109,
  CREATE_GAME_ROOM: 116,
  JOIN_GAME_ROOM: 117,
  LEAVE_GAME_ROOM: 118,
  GET_GAME_ROOMS: 125,
  GET_LOBBIES: 126,
  USERS_IN_GAME_ROOM: 127,
  USERS_IN_LOBBY: 128,
  FIND_USERS: 129,
  SEND_GAME_PACKET: 132,
  SEND_GAME_PACKET_TO_GAME_SERVER: 133,
  GET_BUDDY_LIST: 302,
  SET_PRESENCE: 305,
  REQUEST_BUDDY: 306,
  ACCEPT_BUDDY: 307,
  DECLINE_BUDDY: 308,
  REMOVE_BUDDY: 309,
  // Not SNAP Mobile commands: this server's own.
  FILL_BOTS: 900,  // P1 1 (CPU), 2 (Expert) or 0 (no bots), P2 room id: fill the empty seats when this player starts that room
  BOT_CHOICE: 901, // P1 room id; replies ask, level, go or gone for a Start in that room
};

// Events (the first field of each line of a long-poll reply).
export const EVENT = {
  GAME_PACKET_TARGET: 117, // game data from the room; the only game-data event the client reads
  FRIEND_PRESENCE: 307,
  FRIEND_REQUEST_RECEIVED: 308,
  FRIEND_REQUEST_ANSWERED: 309,
  FRIEND_REMOVED: 311, // the client also reads 310 as a removal
  // Not a SNAP Mobile event: this server's own, sent only to the browser client, which reads it in shared/snap.js.
  REPLAY_SAVED: 902, // P1 replay id: the battle this player just played is kept as a replay (CONTEXT.md)
};

// Reply codes (the number on a reply's status line).
export const REPLY = {
  OK: 200,
  INVALID_SESSION: 702,
  GAME_ROOM_NOT_FOUND: 706,
  GAME_ROOM_FULL: 707,
  AUTHENTICATION_FAILED: 965,
  NETWORK_INTERRUPTED: 998, // made by the client itself when the request fails to reach the server
};

export const GAME_CLASS = 42713;           // extendedLogin P5, and the game class in presence events
export const PRESENCE_PREFIX = 'SM2.0.1,'; // starts every presence string the client sends
export const VALID_NAME = /^[A-Za-z0-9_]{1,15}$/; // player names (SMArenaValidator)
export const ROOM_MAX_USERS = 4;          // createGameRoom P3: the most users a game room takes
// getLoginScreenStatus: the login screen says the client could not connect.
export const LOGIN_COULD_NOT_CONNECT = 7;

// The engine's game packet buffer, a direct ByteBuffer that send and onDataReceived share.
export const NET_BUFFER_SIZE = 2048;
export const MTU = 876; // the engine's stack MTU: each frame is a 2-byte header and at most MTU - 2 bytes (docs/re/re_transport.md)
