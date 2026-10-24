---
status: accepted
---

# A public server sends its copy only to a download code

This decision changes ADR 0001's exception, ADR 0018's "Serving the game" and ADR 0020's `RG_SEND_GAME`, and it is the record that `docs/LEGAL.md` requires for the change to its rules for a server that sends the game.

Until now, `RG_SEND_GAME=1` sent the server copy to every visitor of any server, and the page said so in its Notices dialog. The owner wants to let a few friends try the game without hunting for the standalone build, without sending it to strangers and without the page showing that the server sends it. A server on a private network should keep sending its copy to every device, with nothing to set.

`RG_SEND_GAME` is gone. Who gets the server copy (`RG_GAME`) depends on the kind of server:

- **A server that isn't `--public`** (this PC only, or `--lan`) sends it to every visitor, and the page says so, as `RG_SEND_GAME=1` did.
- **A `--public` server** sends it only to a visitor who comes with its **download code** (CONTEXT.md), in a link (`?code=`, on any page of the site, the replay page included). Making a code (`npm run download-code -- --new`) is the admin's choice to send; ending it is the way to stop at once. Without a code it sends the copy to nobody.

On a public server:

- **One code at a time.** Six characters from an alphabet without the look-alikes 0, O, 1, I and L, in any case. Anyone who knows it can use it. Making a new code ends the old one. A code ends when the admin ends it, after its lifetime (30 days unless the admin sets another), or after 20 downloads.
- **Nothing on the page reveals it.** No field asks for a code, and `/status` says `servesGame: false` on every public server. A wrong, ended or used-up code, a server without a code, and a server over its limits all answer the same 404, and the page falls back to "Bring your own copy" without a word. The page removes the code from the address bar as it loads.
- **Only a browser that received the copy is told.** Its Notices dialog says the server sent it a copy and gives `RG_CONTACT` for removal requests. Everyone else sees the page of a server that sends nothing. A rights holder reaches the admin through `RG_CONTACT` on the Terms and the Privacy policy, which every public server publishes (ADR 0021). The Privacy policy says only that the IP address limits some requests from a network, which is true of guests as well.
- **Limits on the cost.** Each network (one IPv4 address, or one IPv6 /64, as for guests) gets 2 downloads a day. The server stops sending for the day (UTC) at `RG_GAME_MB_PER_DAY` MiB, 700 by default, about 30 downloads. After 10 wrong codes from one network, or 100 from all of them, within an hour, it takes no code until that hour has passed. A download counts when it starts. The networks stay in memory for a day at most; the log counts downloads and holds no address.

On every server, the game goes out as one **game bundle**: the 12 files the engine runs from (`web/bundle.js`), whatever else the server copy holds, compressed whole. The page stores it in IndexedDB. Before, a copy the server sent was never stored, so every visit downloaded it again, file by file and uncompressed.

## Considered options

- **Keep sending to every visitor of a public server.** Rejected: the owner wants friends to try it, not strangers, and every visitor sets the cost.
- **A code on a server that isn't public too.** Rejected by the owner: on a private network the visitors are the admin's own devices and people, and a code would only get in their way. That makes `RG_GAME` alone send the copy there, which ADR 0020 had rejected for every server: a server the internet reaches is meant to be `--public`, and `docs/LEGAL.md` says so.
- **A code field on the page.** Rejected: it would be public proof that the server sends the game.
- **One code per person, or codes members can make.** Rejected: the owner hands one code to a few friends himself, so the server needs no record of who got it.
- **Telling everyone, as `docs/LEGAL.md` required.** Rejected by the owner, knowing the risks: the public repository shows that the feature exists, and hiding the sending can be read as knowing infringement if a notice arrives. Telling the browsers that received the copy, and keeping `RG_CONTACT` on the Terms and the Privacy policy, is the compromise.
- **A short-lived download ticket between the code and the download, good for a resumed download.** Rejected as more than the limits need: one request takes the code and sends the bundle, and a broken download costs the visitor one of their two for the day.

## Consequences

- **A breaking change.** An admin who set `RG_SEND_GAME=1` on a public server makes a code instead; on any other server the setting goes, and the copy is sent anyway. The release is a `feat!` with a `BREAKING CHANGE:` footer.
- **Bandwidth, measured on one copy of the standalone build.** The 12 files are 31.5 MiB, which is what went out before, on every visit: Caddy's `encode` skips `application/octet-stream`. The `.pak` files are already deflated entry by entry (7.6 to 8.0 bits per byte), so compressing them again gains little: 25.6 MiB with brotli at its best. The bundle carries each pak with its deflated entries stored, using the pak's own flag, and lists them; compressed whole, that is about 23 MiB with brotli (28% under the files as they are) and about 28 MiB with gzip. The page deflates those entries again before it stores the files, so they read the same and take about what the originals do. The engine played every end-to-end engine test (`npm run e2e`) on paks deflated again this way.
- **Brotli is slow.** At its best setting it takes about three minutes for the bundle, so only a public server makes it, in the background, and keeps it in `data/` between starts; it sends gzip until then. A browser that doesn't ask for brotli, such as any browser on a plain-HTTP LAN page, gets gzip.
- **The Privacy policy changes** with this: the IP address limits some requests, kept in memory for a day at most.
- **`data/` holds the code** (`download-code.json`) and the brotli bundle, which joins the templates in what is never published.
