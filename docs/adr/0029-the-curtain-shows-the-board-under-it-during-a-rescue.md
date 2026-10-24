# The curtain shows the board under it during a rescue

When a princess is rescued on the **Full board** or in a **replay** (CONTEXT.md), the engine puts up its **curtain** around a 240 × 320 hole, and plays the rescue's art there over a picture of the screen taken as the rescue starts. The engine draws that picture from its top-left corner, which on a 240 × 320 phone screen is the whole picture. On a 420 × 378 screen it is not: the hole showed the top-left corner of the battlefield, moved 90 pixels right and 29 down from where it lies, so the board jumped to the corner for the rescue and back after it (`docs/re/re_screen.md` "The rescue's backdrop").

The engine does this by itself. Its replay player, which the original website ran at 420 × 378, shows the same corner [INFERENCE]. We change it anyway: the browser client draws the picture where the hole lies over it, so the hole is a window onto the board the player was just looking at. It is the 420 × 378 equivalent of what a phone shows, where the art plays over what was on screen.

## Considered options

- **Keep the engine's corner, as the original showed it.** Rejected. The Full board is our own addition (ADR 0017), and a board that jumps for the length of a rescue looks broken; being faithful to a 2008 replay player isn't worth that.
- **Center the picture on the rescued princess's castle.** Rejected. The phone doesn't do that either: its camera follows the local player. The castle's place isn't among what the rescue starts with, as far as the engine was read, and the hole would no longer line up with the board around it.
- **Draw the board under the hole.** Chosen. A hook moves the picture by (−90, −29), the offscreen's place on the screen negated, only when a 420 × 378 picture is drawn into the battle view's 240 × 320 offscreen.

## Consequences

- The replay player gets its first hook. Like the Full board's (ADR 0017), the hook site's bytes are checked before the engine runs; if they differ, the engine plays the replay unchanged, with the corner, and warns.
- Footage (ADR 0028) is made on the same engine, so it shows the board under the hole too, which the original website's player didn't [INFERENCE].
- A rescue that starts while a phone-only screen has narrowed the screen takes a 240 × 320 picture, which already fits the hole; the hook leaves it alone. Classic has no offscreen and is untouched.
- The hook changes where a picture is drawn, not the rescue's state or its fades: phases and turns change on the same frames, and `npm run test:wide` still checks it. It also checks that the hole shows the board under it during a rescue, on the Full board and in the seed's played replays.
- A fight draws its picture the same way (static). It is left alone until a fight has been seen with and without the hook: no battle we ran had one.
