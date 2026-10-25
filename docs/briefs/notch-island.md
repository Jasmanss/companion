# The notch island: a small island in three sizes, with Steward in it

Status: ready

Set by the front door on the user's go, 2026-10-24: "Yes, covering the menu bar while the island is out is fine. Set the notch island brief to ready and give me the Phase 1 line for Main building." Main building builds it, one phase at a time, with the user's go typed into Main building for each phase. Notch 3e (the Wings hand-off) is replaced by this and is not built.

## Ask (front door)
The user's requests, in order.
- 2026-10-22: "Hey I think we should redesign the notch. Make it more like the dynamic island. Create up some mark ups and put them into the file with all of the current steward features." Answered with eight directions (A to H) after "Think of more designs".
- 2026-10-24, with a photo of a Mac notch shelf app: "Lets restart, lets do a similar design like this. This is good. But we should a couple of different variations." Answered with a wide shelf in four variations.
- 2026-10-24, after reviewing the shelf: "Couple of things. We need to make it smaller and it doesnt act as the main thing. This is what we do. The bigger island just for the message. Instead of the wings we do eyes on one side and the other side can be something else and when something happens then a smaller island shows up. Also as the main chat it doesnt feel right it being in the middle. We should keep it on the right and left. But I feel as if we are missing the mascot in the notch. How can we do that better?" **This is the current direction.** The shelf and the first eight are kept, folded under "Earlier tries" in the Showcase.
Design only. Nothing is built until the user picks and says go. Background: Wings was called "not really good" and Chin was the resting look; the Wings hand-off (3e) is designed but not built and stays on hold.
- 2026-10-24, after round 3: "Peeking is prolly the best one. But still one issue. Instead that where it says api starting. it needs to be connected with the actually notch. Like dynamic island. Not how it pops out like that. And when the full island comes out then steward becomes part of the island. And the island can have different sizes depending on how big the message is. Like if its running small island or if its bigger task like needing approval then it should become bigger." With a screenshot of the small line hanging as a separate pill under the notch, and an iPhone Dynamic Island reference (compact views with something left and right, expanded call and music views, every one a single continuous black shape). **This is the current direction (round 4).**

## Design (Roadmap & design)
Where to look: `design/showcase.html`, section 7 "The notch island": Peeking as one joined island (the size ladder, the eight states, the hand-off in slow motion, the right side, the side-panel hand-off, the build cost). Everything else is in a collapsed "Earlier tries": the other three mascots (round 3), the shelf (round 2) and the first eight islands (round 1). Everything is live and works at about 800 px wide.

### Decided so far
| Decision | What |
|---|---|
| Mascot | **Peeking**: at rest, half of Steward peeks out from behind the notch's left edge |
| The island | **One continuous black shape joined to the notch at every size**, flush with the top of the screen, growing out of the notch with springs. No gap, no floating pill |
| Sizes | The size follows the message (below) |
| Steward and the island | Steward steps into the island's left side for compact and a note, and **becomes part of the island** (an avatar spot with its eyes, like the caller's photo) for an approval or a review. When the island shrinks, Steward steps back out and peeks again |
| Right side | **Smart**: the project tile at rest, a spinner with the time while Claude works, a check when done, an amber mark for an approval, a thumbnail for a review, a spinner with a count for two projects. It stays at the island's right (top right when big), like the Dynamic Island's trailing view |
| Main chat | The **side panel**, on the left or right edge or where the user dragged it. Never centered under the notch. The island never replaces it |
| Eyes side | Steward on the left, status on the right (a setting could mirror it) |

### The size ladder (one shape, sized by the message)
| Step | Size | When | What it holds | Covers in the menu bar, each side of the notch |
|---|---|---|---|---|
| Rest | the notch itself | idle | no island; Steward peeks | about 34 pt on the left (Steward only) |
| **Compact** | 324 by 32 pt | Claude is running | Steward in the left side, spinner and time on the right (the call timer) | about 70 pt |
| **Note** | 380 by 60 pt | finished, a second project started | the same, plus one line under the notch: "haven: Claude finished" | about 97 pt |
| **Approval** | 420 by 124 pt | needs you | Steward joins as the avatar; the command; Deny (red) and Allow (green) like the call card | about 118 pt |
| **Review** | 440 by 172 pt | a review is ready | Steward joins; before and after; "Claude says: ..." ; Open big and Looks good, like the music player | about 128 pt |
The shape is one rounded rectangle, top flush with the screen, bottom corners 24 pt, so the join with the notch is just black meeting the hardware notch's edges. It grows with springs (a little overshoot), contents fade in after the shape. The notch has no pixels, so nothing is drawn inside it.

### Steward joins the island (the hero animation)
At rest Steward is the solid Pill (glass needs something to refract, so outside the black it uses the flat body), tilted, half behind the notch's left edge, looking around. When Claude runs, the compact island grows and Steward steps into its left side. For an approval or review the island grows big and Steward **slides into the avatar spot, its body melting into the black while the lit eyes carry on from the same place** (a crossfade between two views of the same character, with the avatar disc fading in). When the island shrinks, the eyes travel back and the body re-forms as Steward peeks out again. The page has a button that plays it, and a slow-motion switch (3 times slower) to watch the hand-off.

### The eight states
| State | What shows |
|---|---|
| At rest | Steward peeking, no island |
| Hover | Steward leans out and looks at the cursor; a click opens the side panel |
| Working | compact island, spinner and time |
| Finished | the note ("Claude finished · 3 files changed"), then settles to compact with a check after about 4.5 s (hover keeps it) |
| Needs you | the approval island, Steward joined; settles after about 9 s to compact with an amber mark (still waiting; a click brings it back) |
| Review ready | the review island, Steward joined; settles to compact with a thumbnail |
| Two projects | a note ("api started"), then compact with two spinners and a count |
| Quiet mode | asleep: Steward tucked fully behind the notch, no island; resting the cursor wakes it |

### Plan update, 2026-10-24 (from the user, via the front door)
The user: "no more chat for the notch it goes to the sides no more in the middl" (in the middle). And, asked for in the same round, the names of chats in the note and in alerts. The front door moved both into Phase 2, and Main building is building it now.
- **Phase 2 now covers:** the note and the settle; **chat names** in the note and in alerts, read from the `custom-title` line in the session's transcript (so an alert says which chat it is, not only the project); and **the panel opening on the side**. In notch mode the chat panel always opens at the left or right edge (or where the user dragged it), never under the notch. A new setting, **Panel opens on: Left | Right**, picks the side.
- **Phase 4 keeps the rest** of the hand-off: the island looking toward the panel, the moved-panel rule on close, and quiet mode.
- **What this replaces:** the line below that the panel "no longer drops from the notch" was a Phase 4 item; the drop under the notch goes away in Phase 2 instead.
- "Friendly names in alerts" (plain words for raw tool names) on the status page is folded into Phase 2.
- Not designed here: the exact look of a chat name in the note. Main building uses the note's existing layout (name before the message). Say if it needs a design page.

### Plan update 2, 2026-10-24: every alert opens as the island (from the user, via the front door)
The user, after a screenshot of the old under-notch alert pill (black starting under the menu bar, rounded top corners, concave ears beside the notch): "I just want to make sure that the island that was in the screenshot doesnt happen, its going to open like the island that we designed."

Main building's audit of Island mode after Phase 2 (PR #36): finished and two projects are now the note; approvals and reviews are Phase 3's sizes; four alerts had no island size. Designed now, live in the Showcase (`design/showcase.html`, section 7, the card "Every alert opens as the island", and six new states on the main figure: Steward asks, A session waits, Needs input, Build failed, Deployed or merged, First launch, Anything else).

**The rule (new, in Phase 3's definition of done): in Island mode, nothing uses the old under-notch pill once Phase 3 is in.** Every alert opens as one of the island's sizes, flush with the top, full width from the top edge, bottom corners only. An alert with no size of its own opens as a note with its title and one line, so a new kind of alert can never bring the old pill back. A Mac without a notch keeps the edge tab; this is only the island. A smoke check posts one alert of every kind (including an unknown key) in Island mode and fails if the old pill's window or style shows.

| Alert (key) | Size | Steward | When it settles | Stays | A click |
|---|---|---|---|---|---|
| Session needs input (`input:`) | the Approval size without Allow or Deny: the chat's name, Claude's question (two lines), **Open** and **Later**, amber `?` at the top right | confused | compact with an amber `?` until the session resumes | 9 s, kept while the cursor is on it | opens the panel on that session; **Open** the same; **Later** settles now |
| Session waits for an OK (`approval:`) | the same layout: what it wants to run, **Open** and **Later**, amber `!` | needs you | compact with an amber `!` until the session moves on | 9 s | as above |
| Build failed (`deploy-failed:`) | the Approval size card: "haven deploy failed", the error or commit on one line, **Want me to look?** and **Later**, red `!` | mad, then worried | compact with a **red** `!` until a deploy for that project works, or 30 minutes (today's worry rule) | 9 s | opens the panel; **Want me to look?** also opens it and asks Steward's agent to read the build log, as today; **Later** settles now |
| Deployed, PR merged (`deploy-ready:`, `pr-merged:`) | the Note size: "haven deployed · haven.vercel.app" or "haven: PR #12 merged", a spark on the right | celebrating | back to the notch (nothing waits) | 4.5 s; several in a moment join into one note, "and 2 more" | opens the panel (the page's screenshot is in the tray) |
| First launch (not an alert) | the Note size: "Rest the cursor on the notch or press your shortcut" | looks at where to rest the cursor | back to the notch | at least 10 s, longer while the cursor is on it; ends once it has left after touching it (today's rule) | opens the panel and counts as learned |
| Anything else | the Note size: title and one line | idle | back to the notch | 4.5 s | opens the panel |

**One finding about approvals (changes Phase 3's Approval size).** Steward cannot answer a Claude Code session: its hook commands are `curl -s -m 1` and the hook server answers `204` before it looks at the event. So a **session's** approval cannot have working **Allow** and **Deny**; it gets **Open** and **Later**, like input. **Allow and Deny are only for Steward's own requests** (`agent-approval:`), which it can answer. The earlier mock showed Allow and Deny on every approval; it now shows them only on "Steward asks".

**How each follows "Alerts that peek out".** The Notifications switches come first: a switched-off kind never reaches the island and lands in the history only (sessions needing me: approval and input; session finished; build failed; celebrations: deployed and merged). Then the choice:
- **Needs me:** sessions that wait or ask, Steward's own requests, and reviews come out big. The finished and started notes still show, because they are the island's own status. Good news waits in the menu bar dot. A failed build: see pick 1.
- **Everything:** all of them.
- **Nothing:** no notes and no big sizes. Only the compact island's own status stays (spinner and time, check, amber or red mark), so the island still tells you at a glance, and the menu bar shows its number and dot. (As built in Phase 2 the finished and started notes ignore this choice; this makes them follow it. See pick 2.)
- Hidden by hand or stepped aside: nothing comes out, as today. The first-launch note is not an alert: it ignores the choice and shows once ever, after stepping aside ends.
- A failed build and good news each get their own mark colors (red, spark) so the compact island tells them apart from an amber wait.

**Phase 3 now covers:** the approval and review sizes, **plus** the four sizes above, the red and spark marks, the "Later" settle, the catch-all note, the no-old-pill rule and its smoke check. Phase 2 and the other phases are unchanged.

**For the user to pick (defaults in bold; none blocks Phase 3):**
1. **A failed build under "Needs me":** should it come out? **Yes, it is an urgent alert (recommended)**, or wait in the menu bar dot as built today (only waiting-on-you things come out under Needs me).
2. **Under "Nothing":** **no notes and no big sizes, only the compact status (recommended)**, or let the finished and started notes keep showing as built in Phase 2.
3. **No Allow or Deny on a session's approval,** because Steward cannot answer a session (a limit, not a choice): confirm Open and Later.

### The hand-off to the side panel
A click on the island (or the hotkey) opens today's side panel on its edge, right or left, or where the user dragged it (the movable panel pops in place), with its usual entrance. The island goes back to Steward peeking, looking toward the panel. Closing is today's close. The panel in notch mode no longer drops from the notch; that special case goes away.

### What it replaces
The Chin and Wings looks and the "In the notch" setting's two choices; the alert under the notch (3b) becomes the approval and review sizes. The shelf, the other mascots and A to H are not built. **Notch 3e stays on hold and is not needed.**

### Menu bar cost (the honest trade-off)
Joining the notch flush with the top means every size wider than the notch sits over the menu bar: about 70 pt each side while compact, up to about 128 pt for a review. The earlier version hung the message under the menu bar line and covered nothing, but it read as a separate pill, which the user rejected. Mitigations: compact is slim; the big sizes only come for a message and settle after a few seconds; the island is click-through except over its shape; and "needs you" and a review are rare. If it bothers the user on the real Mac: shrink the compact side width, or mirror it, or settle faster.

### How hard to build (in the real notch window)
- **The joined shape: moderate.** It is one black rounded shape that grows from the notch (the black pieces the Wings and the alert under the notch already use), so the join itself is easy. The careful parts: matching the real notch's bottom corners (10 pt, not reported by macOS) at the very start of the growth, keeping the corners continuous while it springs, and growing the notch window from 360 by 96 to about 460 by 190 while staying click-through everywhere but the shape.
- **Steward's hand-off: moderate to hard.** Two views of the same character (the Pill's body and its lit eyes) crossfade while one slides; the Showcase does it on one frame loop and the app's notch window is one window, so it is the same trick. The risks: hiding the body exactly behind the notch's edge (needs the measured 185 by 32), the glass body (so Peeking uses the flat body), and keeping the crossfade smooth on the real machine.
- **Overall:** a few days of careful work, not a rewrite. Most pieces exist: the black shapes, the Pill views and eyes, the approval and review cards (3b and Visual Review), the session tracker.

### How it would be built (if picked)
- Pure shape function in `src/shared/notch.ts` (like `notchShape`) for each size and Steward's position, with tests for each state's size, staying inside the work area and the settle rules.
- A small spring loop on the notch page that sets only transforms, opacity and clip paths; the Showcase's `peeking.js` and `island-kit.js` are the working model (a steady 60 fps in headless Chrome). Reduce Motion fades.
- Content: the right side from the session tracker (`SessionView` state and detail), the turn start for the timer (Visual Review's `UserPromptSubmit` hook already tracks it), the Visual Review store for the thumbnail. The approval and review contents already exist.
- Shared files, small and additive: `src/shared/types.ts` (`NotchState` gains the size and the mascot position), `src/main/notch-window.ts`, `src/renderer/src/Notch.tsx` and `notch.css`, `src/main/index.ts` (the notch window's size; the panel no longer opening under the notch).
- Phases (the user's go between each): 1) the joined shape with compact, Steward peeking and stepping in, the right side, hover (built, PR #34); 2) the note, the settle, **chat names** and **the panel opening on the side** (see "Plan update, 2026-10-24"); 3) the approval and review sizes with Steward joining, **and the alert sizes in "Plan update 2"** (input, a session's approval, build failed, good news, first launch, the catch-all note, and the no-old-pill rule); 4) the rest of the hand-off to the side panel, the moved-panel rule, quiet mode; 5) hardening and docs.

### Risks and open questions
1. Matching the real notch's corners where the island starts, and hiding Steward exactly behind the notch's edge. Phase 1 checks both on the real Mac.
2. The menu bar cost above.
3. A settled approval must never be lost: the amber mark stays and a click brings it back.
4. Motion is hand-tested only on the real Mac; CI cannot measure it.

**Needs the user:** nothing blocking. The call to confirm: whether covering about 70 to 128 pt of menu bar while an island is out is acceptable on the real Mac (that is the price of one joined shape).

### How to test (if built)
Unit: each size and Steward's position per state, staying inside the work area, the settle timers (hover keeps it, an unanswered approval is never lost). Smoke (hidden mode): the notch window in each size. By hand on the real notch: Steward peeking, stepping in, joining and stepping back out, each size, the right side in each state, the settle, the hand-off to the right and left and a dragged panel, a light and a dark wallpaper, a busy menu bar, Reduce Motion.

## Earlier tries (kept for reference)
Four earlier rounds, all still in the Showcase under "Earlier tries": **round 3** (2026-10-24): three sizes and four mascots (Little Pill, Peeking, Hanging, Carrier); the user picked Peeking and asked for it to be one joined island, which is the design above. **Round 2**: a wide shelf in four variations (Dashboard, Chat-first, Projects board, Small and big); too big and the main surface, so the user asked for a smaller island. **Round 1**: eight Dynamic Island style directions, A to H (Chin island, Side island, Bubbles, Halo, Peek, Drip, One-sided, Shelf), ranked A, F, H, E, D, C, G, B. The detail of rounds 3 to 1 follows.

### Round 3: three sizes and four mascots
Where to look: `design/showcase.html`, section 7 "The notch island": three sizes, four mascot treatments, the other side's choices, the hand-off to the side panel, and a comparison. The earlier shelf (four variations) and the first eight islands are in a collapsed "Earlier tries" under it. Everything is live; the figures react to the real pointer and work at about 800 px wide.

#### The user's direction, in one picture
The island is **not the main surface**. The main chat stays in the side panel on the left or right edge (or where the user dragged it). The island has three sizes, like the iPhone's compact, small and expanded views, and the open question is how Steward itself lives in the notch.

#### The three sizes
| Size | When | What it is | Covers in the menu bar |
|---|---|---|---|
| **Compact** | At rest, and while Claude works | A slim island hugging the notch, only a little wider: Steward on the left, "something else" on the right | about 34 to 52 pt on the left (depends on the mascot), 36 to 62 pt on the right |
| **Small** | Something happens (finished, a second project starts) | One line under the menu bar line, about 290 by 34 pt, joined to the notch: "haven: Claude finished · 3 files". It settles back after about 4.5 s (hover keeps it) | nothing more (it hangs under the bar) |
| **Big** | Only for a message: an approval, a review | A card under the menu bar line, 340 by 104 (the command, Allow, Deny) or 352 by 156 (before and after, "Claude says", Looks good). It opens by itself, settles after about 9 s or on a click, to the compact island with an amber mark or a thumbnail. A settled one comes back on a click. It is about the size of the alert under the notch already built (3b) | nothing more |
The small and big islands never replace the panel. They only deliver a message.

#### Eyes on the left, something else on the right
**Steward goes on the left** (you read who, then what; the eyes glance right toward the status). **The right is "something else"**, because it is for things that come and go, and the menu extras there are less used than the app menus on the left. A setting can mirror it for people whose menus run long. Five choices for the right side (all on the page, switchable): **Status** (project tile at rest, spinner, check, amber mark, violet dot, two spinners), **Timer** (2:41 while working), **Count** (how many things wait), **Thumbnail** (a tiny review picture), and **Smart** (recommended): the tile at rest, a spinner with the time while working, a check when done, an amber mark for an approval, a thumbnail for a review, a spinner with a count for two projects.

#### Four ways to keep Steward in the notch (the mascot)
Steward's lit eyes alone read as "missing". Four treatments on the same three sizes, each with a **reacting** layer shared by all: the eyes glance toward the right-side status (or toward the panel when it is open), look at the cursor on hover, sleep (tuck away) in quiet mode, and a finished turn gets a happy bounce.
1. **Little Pill.** The whole Pill, shrunk (about 0.7), sits in a black left wing with its moods and blinks. The most Steward at every size, and the most literal. Covers about 52 pt on the left.
2. **Peeking.** Half of Steward peeks out from behind the notch's left edge, as if the notch is where it lives. It leans out and tilts for news (further for a message) and slides back behind the notch to sleep. Covers about 34 pt on the left at rest, up to about 40 pt more when leaning out. Outside the black the Pill uses its solid (flat) body, because glass needs something to refract.
3. **Hanging.** Steward hangs from the notch's bottom edge by its hands and sways a little. For news it drops lower, hanging from the small or big island instead. Covers nothing on the left. It may overlap a window's title bar below.
4. **Carrier.** At rest only the lit eyes show in a small left wing, as today. For a message Steward slides out of the wing and holds the corner of the island, then carries it back. The calmest at rest, but it does not fix "missing mascot": at rest it is still only eyes.

#### The states (the same eight)
| State | Compact | Small or big |
|---|---|---|
| At rest | Steward left, project tile right | none |
| Hover | the sides widen a little, Steward looks at the cursor | none; a click opens the side panel |
| Working | spinner and time on the right | none |
| Finished | a check on the right | small: "haven: Claude finished", then settles |
| Needs you | an amber mark on the right | **big**: the command, Allow and Deny; settles to the amber mark (still waiting) |
| Review ready | a thumbnail on the right | **big**: before and after, "Claude says", Looks good; settles to the thumbnail |
| Two projects | two spinners and a count | small: "api started", then settles |
| Quiet mode | nothing: Steward tucked away, only the notch | resting the cursor wakes it; only "needs you" comes out on its own |

#### The hand-off to the side panel and back
A click on the island (or the hotkey) opens today's side panel on its edge, right or left, or where the user dragged it (the movable panel pops in place), with its usual entrance. **Never centered under the notch.** The island stays as the notch character while the panel is open, and Steward looks toward the panel. Closing the panel is today's close (shrink and fade in place if moved, otherwise back to the edge). The panel in notch mode no longer drops from the notch; that special case goes away.

#### Recommendation
**2, Peeking, with the reacting behavior from all of them, and 4's carrying for the big island** (when a message needs you, Steward leans out and holds the card). It fixes the missing mascot in a way that belongs to the notch, covers the least of the treatments that show a body at rest, and keeps the right side a clean status. **3, Hanging,** is the most playful and covers nothing on the left; pick it if the user wants more character and does not mind something under the bar. **1, Little Pill,** is the safest and the most literal. **4 alone** does not fix the complaint.

#### What it replaces
The compact island replaces the built Chin and Wings looks (and the "In the notch" setting's two choices), and the big island is the alert under the notch (3b) grown a little. The shelf and the first eight tries are not built. **Notch 3e stays on hold and is not needed.** The panel stays as it is, except that it never opens centered under the notch.

#### How it would be built (if picked)
- The notch window grows from 360 by 96 pt to about 400 by 240 to draw the three sizes (the big island is about the size of the alert under the notch from 3b, so most of that is reused). The wings are black pieces like the Wings look; the small and big islands are the chin-and-card shape with curved fillets.
- Steward's body is the Pill's existing view (the same one in the panel header), scaled, drawn behind the real notch's edge so it can hide there. The motion is a small spring loop on the notch page that sets only transforms, opacity and clip paths; the Showcase's `mascot.js` and `island-kit.js` are the working model (a steady 60 fps in headless Chrome with all four playing). Reduce Motion fades.
- Content: the right side is computed from the session tracker (`SessionView`: state, detail), the turn's start (Visual Review's `UserPromptSubmit` hook already tracks it) for the timer, and the Visual Review store for the thumbnail. The big island's content already exists (the approval card and the review card).
- New pure shape function in `src/shared/notch.ts` (like `notchShape`) for each size and mascot, with tests for staying inside the work area and for the mirror setting.
- Shared files, small and additive: `src/shared/types.ts` (`NotchState` gains the size and the mascot), `src/main/notch-window.ts`, `src/renderer/src/Notch.tsx` and `notch.css`, `src/main/index.ts` (the notch window's size, and the panel no longer opening under the notch).
- Phases, for the recommended one (the user's go between each): 1) the compact island with Steward peeking and the right side, hover and look; 2) the small island and the settle; 3) the big island for approvals and reviews with the carrying; 4) the hand-off to the side panel, the moved-panel rule, quiet mode; 5) hardening and docs.

#### Risks and open questions
1. **Hiding behind the real notch.** Peeking needs the Pill to disappear exactly at the notch's edge (the measured 185 by 32). Phase 1 checks it on the real Mac.
2. **Covering menu items on the left** (about 34 to 52 pt). If it bothers the user, the mirror setting or Hanging (nothing on the left) are the fixes.
3. **A glass Pill that small** must stay readable; outside the black it uses the solid body.
4. **The notch window's size.** A bigger transparent window over the menu bar must stay click-through everywhere but the shapes and must not steal focus.
5. **Settling an approval** must never lose it: the amber mark stays and a click brings it back.
6. **Motion is hand-tested only on the real Mac.**

**Needs the user:** which mascot (Peeking recommended, with the carrying from Carrier), whether covering about 34 to 52 pt left of the notch is OK (else Hanging or the mirror), and which right side (Smart recommended). Not blocking: 3e waits.

#### How to test (if built)
Unit: the sizes and mascot positions per state, staying inside the work area, the mirror setting, the settle timers (hover keeps it, an unanswered approval is never lost). Smoke (hidden mode): the notch window in each size. By hand on the real notch: each mascot at rest, leaning out, asleep, the right side in each mode, the settle, the hand-off to the right and left and a dragged panel, a light and a dark wallpaper, a busy menu bar, Reduce Motion.


### Rounds 2 and 1
Two earlier rounds, both still in the Showcase under "Earlier tries". **The shelf** (2026-10-24, from the user's photo): a wide shelf, 700 pt, that was the main surface, in four variations: Dashboard, Chat-first, Projects board, Small and big. The user said it was too big and should not be the main thing. **The first eight islands** (2026-10-22 and 23): A Chin island, B Side island, C Bubbles, D Halo, E Peek, F Drip, G One-sided, H Shelf; ranked A, F, H, E, D, C, G, B. Round 3 grew from these: Peeking (E) and the wings (B, G), with A's small and big islands under the bar. Their detail follows.

#### The shelf (kept for reference)
Where to look: `design/showcase.html`, section 7, under "Earlier tries" (four variations, the eight states, opening and closing, a comparison). The earlier eight directions are in a collapsed "Earlier tries" under it. Section 8 "Added since" lists the features built after the first showcase. Everything is live; the figures react to the real pointer.

##### What the photo shows, and what is Steward's own
The photo: one wide black shelf hangs from the notch, three to four times its width and about 1.5 inches tall, with big rounded bottom corners. It covers the menu bar on both sides while open. Two tabs at the top left, a now-playing card on the left, a middle area with a shortcuts button, a round camera mirror on the right, a gear at the top right.
Steward's version keeps the idea (a calm, dense shelf that grows from the notch) and none of the other app's names, icons or layout:
- **Tabs:** Steward, Tray (the tray already exists) and Reviews (Visual Review, built). Drawn icons, not copied ones.
- **Session card** where the now-playing card sat: the current Claude session. Project, what Claude is doing, how long, and the actions: Open, Allow and Deny when it needs you, Looks good on a review.
- **Ask box with Try prompts** in the middle. (The app has no Try prompts yet; they would be new. Without them it is just the ask box.)
- **Round spot** where the camera mirror sat: Steward's eyes and moods.
- **Gear** at the top right: opens Settings.
Size: 700 by 168 pt (about 3.8 times the notch and 1.4 inches tall on a MacBook Pro 14), bottom corners 26 pt.

##### The four variations
1. **Dashboard** (closest to the photo). Flush with the top of the screen. Tabs, then a row of three widgets: the session card, the ask box with Try prompts, the round spot with the eyes. Covers the menu bar between its edges (about 255 pt each side of the notch) while open.
2. **Chat-first.** Flush with the top, 700 by 188. The shelf is the panel: Steward's face on the left, the last reply and the ask box in the middle, the session on the right. In notch mode it **replaces** the side panel: click and it grows downward into a wide dark chat (700 by 470). Covers the same menu bar.
3. **Projects board.** One tile per project with its Claude status, like several now-playing cards. Tabs for Projects, Tray, Reviews, a small pair of eyes at the left. It hangs **under the menu bar line**, joined to the notch with curved fillets, 440 wide: **covers nothing**.
4. **Small and big.** A small shelf (400 wide, under the menu bar line, covers nothing): one row with the session and its action, and an ask line. A click grows it into today's panel under the notch. The shelf is the glance, the panel is the chat.

##### How it opens and closes (all four)
- **Resting look:** the chin you have (built today). Working and finished show the compact capsule under the bar (also built-style). Quiet mode: only the notch.
- **Opens:** rest the cursor on the notch (or the chin) for **0.25 s** and the shelf grows out of the notch with a spring. In quiet mode the same hover wakes it and opens it.
- **Closes:** **0.5 s** after the cursor leaves the shelf, shrinking back into the notch.
- **By itself:** "needs you" and a review open it without a hover and put it away **6 s** after the cursor is not on it. (My recommendation: for those two, use variation 4's small under-the-bar shelf instead of the full dashboard, so nothing is covered. See the pick.)
- **Click:** the shelf becomes the panel (variation 2 grows into its wide chat; 1, 3 and 4 become today's panel under the notch). The panel keeps its entrance rules.
- **A panel the user dragged elsewhere** (movable panel, built): the shelf does not grow into it. The island squashes once and the panel pops in where it was left, closing in place. In variation 2 the wide chat only applies to a panel that has not been moved.
- **Reduce Motion:** the shape fades out, changes and fades back in. No springs.

##### The eight states
| State | What shows |
|---|---|
| At rest | the chin |
| Hover | the shelf, idle: session card "haven, 12 min ago", the ask box, the eyes |
| Working | the compact capsule ("haven Editing page.tsx"); hover opens the shelf on the live session (2:41, Open) |
| Finished | the capsule ("finished, 3 files changed"); hover opens the shelf with Open and Review |
| Needs you | the shelf opens: the command, Allow and Deny (amber ring on the session tile) |
| Review ready | the shelf opens on the Reviews tab: before and after thumbnails, "Claude says: ...", Open big, Looks good |
| Two projects | both projects listed (variation 3: two tiles, both live) |
| Quiet mode | just the notch; hover wakes it |

##### Relation to today's side panel in notch mode
| | 1 Dashboard | 2 Chat-first | 3 Projects board | 4 Small and big |
|---|---|---|---|---|
| Side panel | stays, for chat | **replaced** by the shelf | stays, for chat | stays, for chat |
| Covers in the menu bar | about 255 pt each side while open | the same | nothing | nothing |
| Best at | the photo's calm dashboard | one surface, fewest clicks to ask | several projects at once | the least intrusive; reuses the panel |
| Weak at | covers menu items | most to build; covers menu items | little room for ask and Tray | two steps to chat |

##### Recommendation
**1, the Dashboard, with 4's small shelf as the alert tier.** It is the closest to the photo the user liked and keeps the panel for chat, so no second chat surface is built. Its cost is the menu bar while open, so the full dashboard opens only on a deliberate hover and closes quickly, while "needs you" and a review come out as 4's small shelf, which covers nothing. 3 is the better choice if covering the menu bar bothers the user on the real Mac (the same content, hanging under the bar). 2 is the boldest and the most work.

##### What it replaces
The earlier eight directions (below). The chin stays as the resting look and the compact capsule as the glance. **Wings and notch 3e are not needed; 3e stays on hold.** Today's panel stays (except in variation 2).

##### How it would be built (if picked)
- The notch window grows from 360 by 96 pt to about 760 by 260 to draw the shelf itself (today the main window draws the alert under the notch). It stays click-through everywhere except the shape; the shape's hit area follows the shelf. The 20-a-second cursor watcher in `notch-window.ts` already knows when the cursor is on the shape: add the 0.25 s dwell to open and the 0.5 s grace to close (phase 3a's hover timings are the model).
- Motion is a small spring loop on the notch page that sets only transforms, opacity and clip paths (the Showcase's `shelf.js` and `island-kit.js` are the working model, measured at a steady 60 fps in headless Chrome). Reduce Motion fades.
- Content: the session card is `SessionView` (project name, state, detail, updatedAt) from the session tracker. "How long" needs the turn's start, which Visual Review's `UserPromptSubmit` hook already tracks. Reviews tab: the Visual Review store. Tray tab: the tray store. Ask box: sends to the chat and opens the panel. Settings: the existing `settings.open`.
- New pure shape function in `src/shared/notch.ts` (like `notchShape`) for the shelf's size per state, with tests for each state staying inside the work area.
- Shared files, small and additive: `src/shared/types.ts` (`NotchState` gains the shelf level and its content), `src/main/notch-window.ts`, `src/renderer/src/Notch.tsx` and `notch.css`, `src/main/index.ts` (the notch window's size).
- Phases (the user's go between each), for variation 1: 1) the flush shelf shape, spring motion, hover open and close, with static content; 2) the session card and the actions (Open, Allow, Deny) wired to real sessions; 3) Tray and Reviews tabs, the ask box and the gear; 4) alerts as the small shelf, opening into the panel, the moved-panel rule; 5) hardening and docs.

##### Risks and open questions
1. **Covering the menu bar** while open. Mitigations above; the real-Mac hand test decides if it is acceptable (otherwise variation 3).
2. **The notch window's size.** A bigger transparent window over the menu bar must stay click-through everywhere but the shape, and must not steal focus or block menu clicks when closed. Phase 1 checks this first.
3. **Hover that is too eager.** A quarter second may open it when the cursor only passes by on its way to the menu bar. The dwell is easy to tune; the hand test decides.
4. **Try prompts are new**, and "how long" needs a turn start time.
5. **Motion is hand-tested only on the real Mac.** CI cannot measure it.

**Needs the user:** which variation (1 recommended, with 4's small shelf for alerts), and whether covering the menu bar while open is acceptable. Not blocking: 3e waits.

##### How to test (if built)
Unit: the shelf's size per state and staying inside the work area; the dwell and grace timings; the hit area. Smoke (hidden mode): the notch window captured in each state. By hand on the real notch: hover on and off, the menu bar under it, every state, a light and a dark wallpaper, a busy menu bar, Reduce Motion, a moved panel, two projects.

#### The first eight islands (kept for reference)
The first restart (2026-10-22 and 2026-10-23): one black island that changes size and shape like the iPhone's Dynamic Island, in eight directions, A to H: A Chin island, B Side island, C Bubbles, D Halo, E Peek, F Drip, G One-sided, H Shelf. They are in the Showcase under "Earlier tries". Summary and ranking, best first: A, F, H, E, D, C, G, B. The strongest pair was A with H's shelf, which the shelf direction above grew from. The detail follows.

Still on `design/showcase.html`, section 7, folded under "Earlier tries".

##### The idea
One black island that merges with the hardware notch and changes size and shape with spring motion, instead of separate Chin or Wings pieces. Steward's lit eyes and moods stay: the eyes are the Pill's, and "thinking" still shows its dots. The notch has no pixels (measured 185 by 32 pt, menu bar 33 pt), so content only goes beside the notch or below it. Anything wider than the notch starts under the menu bar line, joined to the notch by curved fillets, as the built Chin and the alert under the notch (3b) already do.

##### The three directions (the same eight states in each)
- **A, Chin island.** Rests as the chin. Grows out of it, below the menu bar line only. Never covers a menu bar item.
- **B, Side island.** Rests as black wings, one eye each side. Status sits beside the notch like the phone's compact island (a spinner, a check). Cards drop out of it. The wings cover menu bar items while out (28 to 58 pt each side); the page's menu bar is busy on purpose, so it shows.
- **C, Bubbles.** The chin stays as Steward. Things come out as separate floating black bubbles under it, stacking for two projects. No seams to match, but less "one island".

##### Second round: five more directions (D to H), added 2026-10-23
The user looked at A to C and said "Think of more designs." Five more, really different, in the same section with the same eight states and buttons. Each says what it covers in the menu bar.
- **D, Halo.** A thin lit ring hugs the notch (and its lip when awake). The color and motion are the state: a dim steady ring at rest, a light orbiting it while Claude works, green when finished, amber breathing for "needs you", violet and blue for a review, two orbiting lights for two projects, off when quiet. Eyes come out on a small lip only when there is news; the card states grow like A's. Covers a 3 pt strip beside the notch.
- **E, Peek.** Steward hides behind the notch and only peeks out: a small head, eyes half showing. It leans out for news (swaying while it works), wears a small tag with a few words, and for an approval or a review hangs a sign that swings in like a pendulum. Two projects are two heads peeking at different heights. Covers nothing.
- **F, Drip.** Liquid black, drawn with an SVG goo filter over black shapes (no WebGL). A drop swells under the notch, stretches into a capsule or a card, splits into a second drop for a second project (the neck stretches and snaps), sends a droplet off when finished, and drips back up into the notch for quiet mode. The join to the notch is organic, so there is no corner radius to match. Covers nothing.
- **G, One-sided.** Only the right of the notch grows, like the phone's compact leading view: eyes and a few words in the menu bar band, a card hanging from it for approvals and reviews, a second pill under it for a second project. The left stays clear. Covers the right-hand menu extras (clock, Wi-Fi, battery sit there): 40 to about 240 pt while out.
- **H, Shelf.** Rests as the chin. Resting the cursor drops a wide shelf (460 pt) with tabs for Projects, Tray and Reviews, like the Mac notch shelf apps; "needs you" opens a Now tab with the approval, a review opens the Reviews tab, two projects list on the Projects tab. Working and finished stay a compact capsule. Covers nothing.

##### Ranking, best first (with why)
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

##### The states
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

##### Opening and closing
- **Under the notch (the default):** the black grows (spring) into the panel's size and the glass takes over, the eyes slide to the header's Pill. Closing is the reverse, the black shrinking back into the notch. The app draws the island in the notch window and the panel in the main window, so the grow is a crossfade between two windows (the optional 3d morph); a flicker means falling back to today's drop.
- **A panel the user dragged elsewhere (movable panel, built):** the island does not grow into it. It squashes once (7 pt, 150 ms) and the panel pops in where it was left (fade and small grow), closing in place. This keeps the movable panel's rules.
- Reduce Motion: the island fades out, changes, fades back in. No springs.

##### What it replaces, and 3e
- **Recommendation (still): A, the Chin island**, with H's shelf next. Second-round ranking above. The user said the chin's eyes look fine and the wings do not. A keeps the chin and gets the Dynamic Island feel from motion and from what it holds (status next to the eyes, a card for approvals and reviews, a second small shape). It never covers a menu bar item, which matters because a Mac's menu bar is full where the phone's top is empty. B is closest to the phone but pays with the menu bar. C is the easiest to build but loses "one island".
- **Replaces:** the Wings look and notch 3e (the Wings hand-off). Chin becomes the island's resting shape. The setting "In the notch: Chin | Wings" becomes the island alone, or the island plus Wings kept for anyone who likes it (the user's call).
- **3e should wait.** If A is picked it is not needed. If the user keeps Wings as a setting, 3e is a small job after the island.
- The alert under the notch (3b) is the island's card state already, drawn in the main window. It would move into the notch window.

##### How it would be built (if picked)
- The notch window grows from 360 by 96 to about 420 by 240 to draw the compact and card states itself. Today the main window draws the nudge under the notch.
- Motion: a small spring loop in the notch page that sets only transforms and opacity (the Showcase's `island.js` is the working model, measured at a steady 60 fps in headless Chrome with all four islands playing). Reduce Motion skips the springs.
- New pure shape function (like `notchShape` in `src/shared/notch.ts`) for the state targets, with tests for each state's size and for staying inside the work area.
- Shared files, small and additive: `src/shared/types.ts` (the island state), `src/shared/notch.ts`, `src/main/notch-window.ts`, `src/renderer/src/Notch.tsx` and `notch.css`.
- Phases (the user's go between each): 1) the shape and spring motion for rest, hover and quiet; 2) working, finished and the second shape; 3) needs you and Visual Review as cards, moving 3b's alert in; 4) opening and closing, with the moved-panel rule; 5) hardening and docs.

##### Risks and open questions
1. **The curved fillets and the notch's corner radius.** No API reports the radius (10 is a match by eye), so the join needs the hand test on the real Mac. A hides nothing if it is a point off; C has no seams at all.
2. **Menu bar items under B.** Real menu bars vary; B would need a rule for how far the wings may go.
3. **The crossfade between two windows** can flicker or drift (notch 3d's risk). The fallback is today's drop.
4. **Motion is hand-tested only on the real Mac.** CI cannot measure it.
5. **Text on black is small** (12.5 pt). The card states have room; the compact capsule is one line.

**Needs the user:** which direction or combination (A, then H's shelf, recommended), and whether Wings stays as a setting. Not blocking: 3e waits until then.

##### How to test (if built)
Unit: the state sizes, the island staying inside the work area, the moved-panel rule. Smoke: the notch window captured in each state (hidden mode). By hand: every state on the real notch, a light and a dark wallpaper, a busy menu bar, Reduce Motion, a moved panel, two projects.



## Result (Main building)
- What was built, files changed, check results
- Branch / worktree
- Anything unfinished or uncertain
