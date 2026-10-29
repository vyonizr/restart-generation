# The Full board is a battle-only view

ADR 0017 kept the frame at 420 × 378 on every screen of a Full board player, and the page drew the curtain around the menus, the lobby and the results. The **Full board** toggle therefore changed the menus too, and showed on every screen. We make the **board view** (CONTEXT.md) a battle's view only: outside a battle every screen is the phone's 240 × 320, with no curtain, and the toggle, on the desktop's toggle row and in the touch pad's tool bar, shows only during a battle, for any kind of battle: story, Arcade against bots, ranked or friendly. The toggle shows only where it changes something, and the menus look exactly as they do on the phone.

## Considered options

- **Hide the toggle outside battles, but keep the menus in the chosen view.** Rejected: a desktop player would see the menus in the curtain and could only change that from inside a battle, so a hidden control would still be changing what's on screen.
- **Show the toggle only in online matches.** Rejected: the Full board works the same in every battle, and offline players would lose the choice.
- **Hide the toggle while the battle menu or a story dialog narrows the screen.** Rejected: the player is still in the battle, and may want to switch before going back to the board.
- **Ease the frame's size at a battle's start and end.** Rejected: the engine changes size between two ticks, and a canvas that eases would stretch the game's pixels through the soft finish's grid. The frame snaps, as it already does on a switch during a battle.

## Consequences

- With the Full board chosen, the frame snaps from 3 / 4 to 420 / 378 when the battle starts and back when it ends, twice a battle. Online, it widens as the lobby still says "Game starting", where ADR 0017 already narrows that tick into the curtain.
- The results after a Full board battle are 240 × 320 and bare, as on the phone, instead of sitting in the curtain.
- The page still reads the curtain from the player's `gameplay.pak`: during a Full board battle it draws it around the battle menu and story dialogs, which the hooks narrow to 240 × 320.
- On the touch pad, **Keyboard** hides in a battle and **Full board** shows only then. They sit next to each other in the tool bar, so the other tools keep their places.
- A first-time player can't choose a view before their first battle. They start on the default for their device and can switch from the battle's first frame.
- The replay page doesn't change: it is always 420 × 378 and has no toggle.
