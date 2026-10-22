# Public servers publish Terms and a Privacy policy

A public server keeps personal data: a member's Discord ID, name, stats, achievements, friend links and saved game; a guest's for 24 hours; and player names in its logs and its backups. Discord's Developer Terms require an app that uses Discord sign-in to publish a privacy policy that follows the law, and to link to it from the app. Players also see each other's chat, names and room names, which no one moderates, and an admin can delete any account or switch the server off when a notice arrives (`docs/LEGAL.md`). The one sentence about privacy in the Notices dialog (ADR 0018) leaves most of this out. So the repository ships a **Terms** page and a **Privacy policy** page, and every public server serves them with its own admin's details filled in.

- **Who answers.** The admin who runs the server is the controller of its data, and the pages name them. Three settings, all required by a `--public` server, which won't start without them: `RG_ADMIN_NAME` (the admin's legal name), `RG_HOSTING` (the hosting provider and region, named as the company that stores the data for the admin) and `RG_CONTACT`, which still takes an email address or an https address and serves both data requests and takedown requests. How private that contact is stays the admin's choice: a page with no private channel, such as a GitHub profile, keeps strangers out of the admin's inbox, but a request then arrives in public or through whatever the page links to. So the Privacy policy sends players to their Account menu first and to the contact only for anything else.
- **Where they live.** Two static pages, `/terms` and `/privacy`, which open without starting the engine, so that an admin can enter their addresses in the Discord Developer Portal. The footer and the Notices dialog link to both; the Notices dialog's own sentence about privacy is removed, and the README's Privacy section becomes a summary that points to the page.
- **How a player agrees.** No checkbox and no gate. A line under **Start** and in the name dialog of a new member says that playing online accepts the Terms and the Privacy policy. The legal basis for keeping the data is the service the player asked for, not their consent.
- **What the Terms say.** How to behave in names, chat and room names; that the admin may delete any account without notice; that the server comes with no warranty and may stop at any time; that nothing on it makes the copy of the game licensed or official; that it takes no payments of any kind; and that players are 13 or older, with permission from a parent or guardian under 18. The Site doesn't check age. The game was never rated, so 13 follows Discord, and the permission follows Indonesia's personal data law (UU 27/2022, Article 25).
- **What the Privacy policy says.** Every kind of data the server keeps, where it is kept and for how long: guests until they are wiped, members until they or the admin delete the account, logs and backups for their rotation periods. The page sets no cookies and keeps its own data in the browser's storage only.
- **Less to disclose.** The server stops writing visitors' IP addresses in its connect and disconnect log lines.
- **Fewer requests.** The Account menu gets **Download my data** beside **Delete my account**: one file with the member's account, stats, friends and saved game. With both, a player handles their own data without writing to anyone.

## Considered options

- **A policy only for the author's own server, kept outside the repository.** Rejected: what the server keeps follows from the code, so the text belongs with it and stays true for every admin.
- **Sections in the Notices dialog instead of pages.** Rejected: the dialog never opens by itself (`PRODUCT.md`), and Discord can't link to it.
- **A checkbox before the guest is made.** Rejected: it breaks the first visit of ADR 0011 and adds nothing, because the legal basis isn't consent.
- **A setting for the governing law.** Rejected: it would print words that a lawyer should write, and leaving them out removes none of the admin's duties.
- **Bahasa Indonesia beside English.** Deferred. Indonesia's Law 24/2009, Article 31, asks for Indonesian in agreements that involve Indonesian parties, so an English-only Terms page carries that risk for an Indonesian admin.
- **Delete members after two years without signing in.** Deferred until the server has inactive members; deletion on request is stated plainly meanwhile.

## Consequences

- Requiring `RG_ADMIN_NAME` and `RG_HOSTING`, and `RG_CONTACT` on every public server and not only one that sends the game, is a breaking change: every admin of a public server sets them during the update.
- The Privacy policy is only as true as the code. A change to what the server keeps, logs or backs up must change the page in the same commit.
- The Privacy policy also states how the server is run: `compose.yaml`'s log limits (50 MB for the game server with `data/capture.log`, and 30 MB for Caddy, whose error lines can hold a client's address), nightly backups with the seven newest kept, and one copy off the server. An admin who runs it otherwise makes the page untrue.
- `docs/LEGAL.md` gains "Rules for every public server", and the rule of no ads, donations or payments moves there from the rules for a server that sends the game, because the Terms promise it on every public server. This ADR is the record that `docs/LEGAL.md` requires for that change.
- Registering as an electronic system operator in Indonesia (Permenkominfo 5/2020) is outside this decision and isn't covered by these pages.
- A contact that is hard to reach has a cost: a rights holder who gets no answer writes to the hosting provider or to GitHub instead, which can take the server or the repository down without giving the admin the chance to comply first.
- This is not legal advice.
