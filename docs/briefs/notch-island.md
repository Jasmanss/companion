# The Island: Steward in the notch, like the iPhone's Dynamic Island

Status: designed

## Ask (front door)
The user's words, 2026-10-22: "Hey I think we should redesign the notch. Make it more like the dynamic island. Create up some mark ups and put them into the file with all of the current steward features." The file with all the features is `design/showcase.html`. Earlier the user said the Wings "is not really good" and picked Chin as the resting look.
Design only. Nothing is built until the user picks a direction and says go.

## Design (Roadmap & design)
Where to look: `design/showcase.html`, section 7 "The Island" (eight directions A to H, eight states, opening and closing) and section 8 "Added since" (short cards for the features built after the first showcase). Linked from `design/index.html`. Live, with the page's Reduced motion switch.

### The idea
One black island that merges with the hardware notch and changes size and shape with spring motion, instead of separate Chin or Wings pieces. Steward's lit eyes and moods stay: the eyes are the Pill's, and "thinking" still shows its dots. The notch has no pixels (measured 185 by 32 pt, menu bar 33 pt), so content only goes beside the notch or below it. Anything wider than the notch starts under the menu bar line, joined to the notch by curved fillets, as the built Chin and the alert under the notch (3b) already do.

### The three directions (the same eight states in each)
- **A, Chin island.** Rests as the chin. Grows out of it, below the menu bar line only. Never covers a menu bar item.
- **B, Side island.** Rests as black wings, one eye each side. Status sits beside the notch like the phone's compact island (a spinner, a check). Cards drop out of it. The wings cover menu bar items while out (28 to 58 pt each side); the page's menu bar is busy on purpose, so it shows.
- **C, Bubbles.** The chin stays as Steward. Things come out as separate floating black bubbles under it, stacking for two projects. No seams to match, but less "one island".

### Second round: five more directions (D to H), added 2026-10-23
The user looked at A to C and said "Think of more designs." Five more, really different, in the same section with the same eight states and buttons. Each says what it covers in the menu bar.
- **D, Halo.** A thin lit ring hugs the notch (and its lip when awake). The color and motion are the state: a dim steady ring at rest, a light orbiting it while Claude works, green when finished, amber breathing for "needs you", violet and blue for a review, two orbiting lights for two projects, off when quiet. Eyes come out on a small lip only when there is news; the card states grow like A's. Covers a 3 pt strip beside the notch.
- **E, Peek.** Steward hides behind the notch and only peeks out: a small head, eyes half showing. It leans out for news (swaying while it works), wears a small tag with a few words, and for an approval or a review hangs a sign that swings in like a pendulum. Two projects are two heads peeking at different heights. Covers nothing.
- **F, Drip.** Liquid black, drawn with an SVG goo filter over black shapes (no WebGL). A drop swells under the notch, stretches into a capsule or a card, splits into a second drop for a second project (the neck stretches and snaps), sends a droplet off when finished, and drips back up into the notch for quiet mode. The join to the notch is organic, so there is no corner radius to match. Covers nothing.
- **G, One-sided.** Only the right of the notch grows, like the phone's compact leading view: eyes and a few words in the menu bar band, a card hanging from it for approvals and reviews, a second pill under it for a second project. The left stays clear. Covers the right-hand menu extras (clock, Wi-Fi, battery sit there): 40 to about 240 pt while out.
- **H, Shelf.** Rests as the chin. Resting the cursor drops a wide shelf (460 pt) with tabs for Projects, Tray and Reviews, like the Mac notch shelf apps; "needs you" opens a Now tab with the approval, a review opens the Reviews tab, two projects list on the Projects tab. Working and finished stay a compact capsule. Covers nothing.

### Ranking, best first (with why)
1. **A, Chin island.** Keeps the chin the user likes, nearly the pieces already built, safest to build.
2. **F, Drip.** The most Dynamic Island thing here; organic join; the risk is the goo filter staying smooth in the real notch window.
3. **H, Shelf.** Less a look than a feature: projects, tray and reviews one hover away. The best idea from the Mac notch apps.
4. **E, Peek.** Charming and tiny, good for quiet mode; weak at status, and the sign is more whimsical than useful.
5. **D, Halo.** Lowest footprint, and the ring is a good state signal; it cannot stand alone because there is no face at rest.
6. **C, Bubbles.** Easy, but loses "one island".
7. **G, One-sided.** Covers real menu extras; the left is where app menus are, so one side is cheaper than B but still costly.
8. **B, Side island.** Closest to the phone, covers the most.

**What combines well:** **A with H** is the strongest pair: A's chin and compact status, and H's shelf when the cursor rests on it, with approvals and reviews opening the shelf on their tab. **A with F's motion:** draw A's shapes with Drip's liquid growth if it holds a steady frame rate on the real window. **A with D:** use the Halo's ring only as a signal when the chin is asleep in quiet mode (an amber hairline for "needs you"). The progress line seed is not drawn as a direction: a hairline that fills while Claude works fits as the Working state of A or H.

**Recommended build order if A is picked:** A first (the phases below), then H's shelf as its own step (it is mostly new content: projects, tray, reviews), then F's liquid motion as polish if it is smooth.

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
- **Recommendation (still): A, the Chin island**, with H's shelf next. Second-round ranking above. The user said the chin's eyes look fine and the wings do not. A keeps the chin and gets the Dynamic Island feel from motion and from what it holds (status next to the eyes, a card for approvals and reviews, a second small shape). It never covers a menu bar item, which matters because a Mac's menu bar is full where the phone's top is empty. B is closest to the phone but pays with the menu bar. C is the easiest to build but loses "one island".
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

**Needs the user:** which direction or combination (A, then H's shelf, recommended), and whether Wings stays as a setting. Not blocking: 3e waits until then.

### How to test (if built)
Unit: the state sizes, the island staying inside the work area, the moved-panel rule. Smoke: the notch window captured in each state (hidden mode). By hand: every state on the real notch, a light and a dark wallpaper, a busy menu bar, Reduce Motion, a moved panel, two projects.

## Result (Main building)
- What was built, files changed, check results
- Branch / worktree
- Anything unfinished or uncertain
