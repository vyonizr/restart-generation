# Guests and members with Discord sign-in

When the operator configures a Discord application, every player is a guest or a member. A guest is created on a first visit, holds a secret token that the browser keeps, and is wiped 24 hours after its last activity, together with its fame, stats and friend links. A member signs in with Discord (`identify` scope only), picks an in-game name once, and keeps the account until they delete it. A guest plays everything a member does, including ranked matches, but only members appear in the global rankings. A guest who signs in keeps what they earned: the guest account becomes the member account, unless that Discord ID already belongs to a member, in which case the member wins and the guest's progress is dropped after a confirmation.

This replaces ADR 0009 on such servers: a name alone no longer identifies anyone, because a stranger could otherwise take a member's name and drop their session mid-battle. Without a Discord application, or with `--lan` whatever the settings say (a sign-in return address can't work from another device), ADR 0009 still holds, and there are no guests and no wipe. `--public` is the flag for a server on the internet.

## Considered options

- **Guests can't play ranked** (Lichess). Rejected because the first match is the point of the page; Pokémon Showdown's choice to let unregistered names play the ladder and offer registration after a win fits better.
- **Name and password, or an email link.** Rejected for the first version: a password needs recovery, which needs email, and Discord asks players for nothing they don't already have. The cost is that members need a Discord account.
- **Open guest names** (no token). Rejected because anyone could kick a guest out of a ranked match for the price of typing their name.
- **A fixed daily wipe** (for example 00:00 UTC). Rejected because it can delete a guest in the middle of a battle.
- **Merge a guest into an existing member.** Rejected because a merge is hard to undo and easy to abuse.

## Consequences

- Members need a Discord account. Add another sign-in method only if players ask.
- The server stores a Discord ID, which is personal data. It stores no email and no avatar, and **Delete my account** removes the record by the same path as the wipe.
- A member's in-game name is permanent in the first version, because friend links and rankings use it. It must match `^[A-Za-z0-9_]{1,15}$`, and `Guest<digits>` and `CPU_<n>` are reserved.
- The Java client can't send a token, so a Discord-enabled server refuses its TCP login. It keeps working on LAN servers.
- A guest who clears browser storage loses the account. That is acceptable for a temporary account.
- A member's saved game (story progress, settings, achievements) is kept on the server too (ADR 0014); a guest's stays in the browser.
- The guest-creation limit per IP address depends on the real client address, so behind a proxy the operator must turn on trust of `X-Forwarded-For`.
