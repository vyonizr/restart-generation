# A name is the whole identity

A player logs in with a name only. The server ignores the password in SNAP `extendedLogin` (`C=1`, P2), so the browser client sends none and the Java client's `-password` has no effect. The first login with a name registers it, and every later login with that name, from any browser, gets the same account: stats, rankings, achievements and friends. A second login drops the name's first session (`ANOTHER_LOGIN`). Names matching `CPU_<n>` are refused for people, because bots log in under them (ADR 0008).

The browser client used to generate a password and keep it in local storage. A player in a new browser or an incognito window hit `InvalidPassword` for their own name and had to know a password they never saw.

## Considered options

- **Reject a name while it is online.** Rejected because a closed tab leaves its session for up to 45 s (`IDLE_MS`), so a refresh locks players out of their own name. IRC has the same ghost-session problem and needs a password-based `GHOST` command to solve it.
- **Keep the generated password and add a way to copy it.** Rejected because it keeps the step the player objected to.

## Consequences

- Anyone can log in as any name and drop that player's session, including mid-battle. Minecraft's offline mode has the same weakness. If it becomes a problem, add an optional password that a player sets on their own name, checked only for names that have one.
- Accounts in `data/accounts.json` keep their old `salt` and `hash` fields. The server ignores them.
