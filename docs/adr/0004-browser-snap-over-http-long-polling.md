# Browser SNAP over HTTP long-polling

A browser can't open the raw TCP connection that the Java client uses for SNAP. The SNAP Mobile SDK also had an HTTP connector, so the browser client sends each SNAP request as one HTTP POST to `/snap`, and receives events through SNAP's own long-poll command, `retrieveAllEvents`, which the server holds for up to 15 seconds. Both transports feed one request handler in `server/gateway.js`, so the browser needs no new protocol and the server needs no second code path.

## Considered options

- **WebSockets.** Rejected because they need a SNAP framing of their own, a second path through the server, and WebSocket support from any proxy in front of it. Long-polling works through an ordinary HTTP proxy whose timeout exceeds the 15-second hold.

## Consequences

- Each battle message costs one HTTP request. Nothing measures that overhead.
- The server logs out a session that sends no request for 45 seconds, so a closed browser leaves its room and goes offline within that time.
