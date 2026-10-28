---
status: accepted
---

# Visitor statistics are counted by the gateway itself

An admin wants to know where **visitors** (CONTEXT.md) come from and when. The gateway counts them itself, in a SQLite file beside the accounts and replays, rather than through an analytics service. The comparison of the alternatives is in `.scratch/visitor-analytics/research/prior-art.md`.

- **Off by default, and only on a public server.** An admin turns it on with a setting, as `RG_REPLAYS` turns replays off, and the Privacy policy describes it only while it's on. A server that isn't public has no Privacy policy to say so, and never counts. It is part of the project, not of one admin's deployment, because the page is the same on every server (`PRODUCT.md`) and the Privacy policy must say what the code does (ADR 0021).
- **The Privacy policy's promises stand.** The page sets no cookies, no IP address is written anywhere, and the web server keeps no access log. An IP address is used in memory, for the visitor's country and for counting each visitor once a day, and is never written down.
- **What is counted.** Opens of the four kinds of page (the game, a replay, the Terms, the Privacy policy), with every replay as one kind; how many different visitors opened them each day; the referring site, as its domain only; the visitor's country; and whether the device is a desktop or a touch device.
- **No campaign tags.** `utm_*` parameters are not read. The French regulator's criteria for audience measurement without consent ([CNIL, 2025](https://www.cnil.fr/fr/cookies-solutions-pour-les-outils-de-mesure-daudience)) exclude them, and the referring site's domain answers most of the same question.
- **The page reports its own visit.** Once loaded, each of the four pages sends one small request to the gateway with its kind of page, the referring site's domain, and whether it runs on a touch device, as `device.js` decides. Bots and link previews, such as Discord unfurling a replay link, run no script and so mostly aren't counted, with no list of bots to keep. A visitor with scripts off isn't counted either. The gateway adds the country, from the request's IP address and DB-IP's Country Lite database, and decides whether the visitor is new today from a hash of the address and the browser's name with a salt that lives only in memory and changes every day.
- **Separate tallies.** Each day keeps one count per kind of page, per referring site, per country, and per kind of device, each on its own, plus that day's unique visitors and the page opens of each hour. No combination is stored, so no row can single out a visitor, and the counts are kept exact rather than rounded to ten as the CNIL suggests. Days older than 25 months, the CNIL's recommended limit, are deleted.
- **Opting out.** The Privacy policy gets a **Don't count my visits** button, remembered in the browser, and a browser that sends the Global Privacy Control signal is never counted.
- **The country database.** The server downloads DB-IP's Country Lite CSV (CC BY 4.0) into `data/` when it starts and every month, and reads it without a library. It is never committed. Without it, the country is unknown. The Privacy policy links to DB-IP, as its licence asks.
- **Only the admin sees them,** with `npm run stats` on the server (`docker compose exec rg npm run stats` in Docker), as the admin's other commands run: by default the last 30 days, each day's page opens and unique visitors, the ten largest referring sites and countries, the split of devices and of pages, and the page opens of each hour. Nothing is public, and nothing new is exposed to the internet.
- **Days are UTC.** Every server counts in UTC days; `npm run stats -- --tz +7` shifts the hours of the hourly chart to the admin's clock, and the days stay UTC.
- **A restart counts some visitors twice.** The day's salt and its set of visitors live only in memory, so after a restart a visitor already counted that day counts again. Keeping either on disk would write down something made from IP addresses. The report marks the days the server started.
- **Not every referrer is a referring site.** A move between the site's own pages, and the return from Discord sign-in, which arrives from `discord.com`, count with no referring site.
- **The setting is `RG_STATS=1`.** Empty or `0` leaves it off.

## Considered options

- **GoatCounter, Liwan, or another self-hosted tool.** Rejected. Each is one more service to run, upgrade and back up, and GoatCounter bundles a MaxMind database whose licence asks for deletion within 30 days of each new release. GoatCounter is the fallback if the counter outgrows itself.
- **Plausible, Umami, Matomo, Swetrix, Rybbit, OpenPanel.** Rejected. They need Postgres, MySQL or ClickHouse and up to 4 GB of memory, or set cookies, or keep the IP address by default.
- **Caddy's access log read by GoAccess.** Rejected. The Privacy policy says the web server keeps no access log, and without the IP address the log can't count visitors or tell their country.
- **A tracking script added only on one admin's server.** Rejected. That server's Privacy policy would no longer describe it.
- **Count on the server as each page loads.** Rejected. It needs no script and no ad-blocker can stop it, but it counts every link preview and crawler unless we keep a list of bots, and it can only guess the kind of device from the browser's name.
- **One row per combination of day, page, referring site, country and device.** Rejected. It answers "which countries came from Reddit", but on a small server a row with a count of 1 is one visitor.
- **A dashboard at `/admin/stats`.** Not yet. It can read the same tables later, behind an SSH tunnel, since Caddy already refuses `/admin` from the internet.

## Consequences

- We write and keep the counter, its report, and the country database's monthly download.
- A browser that blocks requests to our own server, or runs no script, isn't counted, so the counts are a floor.
- This is not legal advice. A visitor's IP address is personal data under the GDPR and under Indonesia's Law 27/2022, even when it is only held in memory.
