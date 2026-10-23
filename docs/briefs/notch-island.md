# The Island: Steward in the notch, like the iPhone's Dynamic Island

Status: designed

## Ask (front door)
The user's words, 2026-10-22: "Hey I think we should redesign the notch. Make it more like the dynamic island. Create up some mark ups and put them into the file with all of the current steward features." The file with all the features is `design/showcase.html`. Earlier the user said the Wings "is not really good" and picked Chin as the resting look.
Design only. Nothing is built until the user picks a direction and says go.

## Design (Roadmap & design)
Where to look: `design/showcase.html`, section 7 "The Island" (three directions, eight states, opening and closing) and section 8 "Added since" (short cards for the features built after the first showcase). Linked from `design/index.html`. Live, with the page's Reduced motion switch.

### The idea
One black island that merges with the hardware notch and changes size and shape with spring motion, instead of separate Chin or Wings pieces. Steward's lit eyes and moods stay: the eyes are the Pill's, and "thinking" still shows its dots. The notch has no pixels (measured 185 by 32 pt, menu bar 33 pt), so content only goes beside the notch or below it. Anything wider than the notch starts under the menu bar line, joined to the notch by curved fillets, as the built Chin and the alert under the notch (3b) already do.

### The three directions (the same eight states in each)
- **A, Chin island.** Rests as the chin. Grows out of it, below the menu bar line only. Never covers a menu bar item.
- **B, Side island.** Rests as black wings, one eye each side. Status sits beside the notch like the phone's compact island (a spinner, a check). Cards drop out of it. The wings cover menu bar items while out (28 to 58 pt each side); the page's menu bar is busy on purpose, so it shows.
- **C, Bubbles.** The chin stays as Steward. Things come out as separate floating black bubbles under it, stacking for two projects. No seams to match, but less "one island".

### The states
| State | A, Chin island | B, Side island | C, Bubbles |
|---|---|---|---|
| At rest | the chin, eyes in it | wings, an eye each side | the chin |
| Hover | the chin swells 4 pt, eyes brighten | wings widen 8 pt | the chin swells |
| Working | a capsule 270 by 34 under the bar: eyes (thinking dots), "haven · Editing page.tsx" | wings widen to 58 each: eyes left, a spinner right | a floating capsule with a live dot and the text |
| Finished | the capsule says "finished · 3 files changed" | a check in the right wing | the same in a bubble |
| Needs you | a card 340 by 104: title, the command, Allow and Deny | the same card, wings retract | the same card as a bubble |
| Review ready | a card 352 by 156: the page changed, a before and after thumbnail, "Claude says: ...", Open big and Looks good | the same | the same |
| Two projects | the main capsule plus a small circle split off to its right with its own eyes | wings for the main one, a small circle below | two bubbles stacked |
| Quiet mode | asleep: only the notch (the chin has gone). "Needs you" still comes out | the same | the same |

Quiet mode keeps its rules: Needs me, Everything or Nothing decides what comes out, and what stays in goes to the menu bar dot.

### Opening and closing
- **Under the notch (the default):** the black grows (spring) into the panel's size and the glass takes over, the eyes slide to the header's Pill. Closing is the reverse, the black shrinking back into the notch. The app draws the island in the notch window and the panel in the main window, so the grow is a crossfade between two windows (the optional 3d morph); a flicker means falling back to today's drop.
- **A panel the user dragged elsewhere (movable panel, built):** the island does not grow into it. It squashes once (7 pt, 150 ms) and the panel pops in where it was left (fade and small grow), closing in place. This keeps the movable panel's rules.
- Reduce Motion: the island fades out, changes, fades back in. No springs.

### What it replaces, and 3e
- **Recommendation: A, the Chin island.** The user said the chin's eyes look fine and the wings do not. A keeps the chin and gets the Dynamic Island feel from motion and from what it holds (status next to the eyes, a card for approvals and reviews, a second small shape). It never covers a menu bar item, which matters because a Mac's menu bar is full where the phone's top is empty. B is closest to the phone but pays with the menu bar. C is the easiest to build but loses "one island".
- **Replaces:** the Wings look and notch 3e (the Wings hand-off). Chin becomes the island's resting shape. The setting "In the notch: Chin | Wings" becomes the island alone, or the island plus Wings kept for anyone who likes it (the user's call).
- **3e should wait.** If A is picked it is not needed. If the user keeps Wings as a setting, 3e is a small job after the island.
- The alert under the notch (3b) is the island's card state already, drawn in the main window. It would move into the notch window.

### How it would be built (if picked)
- The notch window grows from 360 by 96 to about 420 by 240 to draw the compact and card states itself. Today the main window draws the nudge under the notch.
- Motion: a small spring loop in the notch page that sets only transforms and opacity (the Showcase's `island.js` is the working model, measured at a steady 60 fps in headless Chrome with all four islands playing). Reduce Motion skips the springs.
- New pure shape function (like `notchShape` in `src/shared/notch.ts`) for the state targets, with tests for each state's size and for staying inside the work area.
- Shared files, small and additive: `src/shared/types.ts` (the island state), `src/shared/notch.ts`, `src/main/notch-window.ts`, `src/renderer/src/Notch.tsx` and `notch.css`.
- Phases (the user's go between each): 1) the shape and spring motion for rest, hover and quiet; 2) working, finished and the second shape; 3) needs you and Visual Review as cards, moving 3b's alert in; 4) opening and closing, with the moved-panel rule; 5) hardening and docs.

### Risks and open questions
1. **The curved fillets and the notch's corner radius.** No API reports the radius (10 is a match by eye), so the join needs the hand test on the real Mac. A hides nothing if it is a point off; C has no seams at all.
2. **Menu bar items under B.** Real menu bars vary; B would need a rule for how far the wings may go.
3. **The crossfade between two windows** can flicker or drift (notch 3d's risk). The fallback is today's drop.
4. **Motion is hand-tested only on the real Mac.** CI cannot measure it.
5. **Text on black is small** (12.5 pt). The card states have room; the compact capsule is one line.

**Needs the user:** which direction (A recommended), and whether Wings stays as a setting. Not blocking: 3e waits until then.

### How to test (if built)
Unit: the state sizes, the island staying inside the work area, the moved-panel rule. Smoke: the notch window captured in each state (hidden mode). By hand: every state on the real notch, a light and a dark wallpaper, a busy menu bar, Reduce Motion, a moved panel, two projects.

## Result (Main building)
- What was built, files changed, check results
- Branch / worktree
- Anything unfinished or uncertain
