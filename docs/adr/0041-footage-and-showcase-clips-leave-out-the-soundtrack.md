---
status: accepted
---

# Footage and showcase clips leave out the soundtrack

**Footage** (CONTEXT.md, ADR 0028) and the showcase's replay clips (ADR 0036) carried the engine's whole sound, and with it the game's **soundtrack** (CONTEXT.md). ADR 0028 relied on Ubisoft's [Video Policy](https://www.ubisoft.com/legal/documents/VideoPolicy/en-INTL) for what players do with footage, and ADR 0036 relied on it for the clips. That policy doesn't cover the soundtrack:

- The policy "applies solely to Ubisoft footage". Music owned by third parties, "including the popular music in our games", needs its owner's permission.
- The soundtrack is by 8 Bit Weapon, who call it "the original soundtrack we did for the critically acclaimed Nokia & Redlynx MMO action strategy game" and publish it [on Bandcamp](https://8bitweapon.bandcamp.com/album/reset-generation-ost) under CC BY-NC-ND 4.0. Section 1(a) of that license counts music synced with a moving image as adapted material in every case, and NoDerivatives forbids sharing adapted material. The license therefore doesn't allow footage either.
- Nokia published the game. A fan reports that RedLynx told him Nokia has all rights to it ([XDA](https://xdaforums.com/t/reset-generation-game-for-android.2167297/)). If that is so, the game isn't Ubisoft's, and nothing in its sound or picture is covered by Ubisoft's policy. We found no video policy of Nokia's.

Footage and showcase clips therefore boot their engine with the music volume at 0. The engine mixes music and effects into one stream, so they can't be separated afterwards, but `settings.cfg` sets the volume of each, and the second of its numbers is the music's ([re_settings.md](../re/re_settings.md#sound)). `GameHost` takes `soundtrack: false` and boots with a copy of the player's file that has that number at 0 and everything else as the player left it (`shared/settings.js`). Footage and clips keep the sound effects. Watching a replay on its page is unchanged: it makes no copy, as playing the game makes none.

The soundtrack returns to footage only with Nokia's written permission, recorded in `THIRD_PARTY_NOTICES.md`. We don't ask for it. Nokia also owned N-Gage Arena, the service this project revives, and a request puts the project in front of the rights holder most likely to object, while a refusal would leave us worse off than not asking.

Footage stays, without the soundtrack. No rights holder's policy is known to cover what remains in it, and we accept that risk: footage is made on the player's machine from their copy or one the server sends, the same as an operating system's screen recorder makes, and `RG_REPLAYS=0` stops it. The documents that named Ubisoft as the game's owner (`docs/LEGAL.md`, the README) now say that RedLynx made it, Nokia published it and is reported to hold its rights, and RedLynx is now Ubisoft's. The page's copyright line reads "© 2008 RedLynx / Nokia".

This changes ADR 0028, which relied on Ubisoft's policy and exported the soundtrack, and ADR 0036, whose clips relied on that policy and played the soundtrack.

## Considered options

- **No sound at all.** Rejected. The effects are a large part of what a battle sounds like, and the policy question for them is the same as for the picture, which footage keeps anyway.
- **A toggle for the player.** Rejected. The page would still make the synced file; the toggle only hands the choice to the player.
- **Patch the engine in memory to skip the music (ADR 0007).** Rejected. The settings file already sets the music volume, and the engine reads it as it reads the player's own file.
- **Keep the soundtrack and rely on the policy.** Rejected. The policy excludes music it doesn't own, and the soundtrack's own license forbids putting it to video.

## Consequences

- After footage, the page's engine boots once more with the soundtrack, so that the replay plays on as before (`web/src/lib/replay/footage.js`). That costs one more engine start after each export.
- A player who turned all sound off in their copy's settings still gets footage with no sound, as before.
- Footage saved before this change has the soundtrack and can't be recalled. Showcase clips made before it must not be posted.
- `docs/LEGAL.md` rule 2 still keeps every recording out of the repository. This decision is about what the page and the showcase make, not what the repository holds.
- This is not legal advice. If a notice names footage, the answer is still to turn replays off (ADR 0028).
