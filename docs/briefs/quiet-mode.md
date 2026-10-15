# Quiet mode: blend Steward into the screen

Status: designed

## Ask (front door)
A friend tested Steward and said the always-visible edge tab and the notch lip would bother him, because they sit in the way. The user wants Steward to blend into the screen: nearly invisible at rest, and appearing only when it is useful.
Open question to ask the user: what exactly bothered him (the tab always being there, the nudges popping out, the eyes following the cursor, the lip covering the top of windows)? The answer changes which of the ideas below matter most.

Ideas from the front door (not decisions):
- **Auto-hide like the Dock.** Fully tucked at rest. It appears when the cursor pushes against the edge (or the notch) for a short delay, or when an alert the user chose arrives. Today the hidden state is manual only (⌥⇧ Space).
- **Step aside automatically.** Hide in full-screen apps, while screen sharing or recording, and in a user-made list of apps. Needs a check of what macOS lets an Electron app detect.
- **Quieter resting look.** Eyes only, no body, dimmed, fading further after a while of inactivity, no eye-following or blinking until hovered. The existing Calm personality may cover part of this.
- **Edge placement that doesn't cover app UI.** The right edge collides with scrollbars and side panels. Let the user move the tab up and down along the edge, remembered per display.
- **Notch: invisible at rest.** The chin (about 22 pt below the menu bar) covers the top center of app windows, such as browser tabs, and Wings covers menu bar items. At rest show nothing beyond the real notch; grow the chin only on hover or an alert. Wings stays optional.

Example for the user (front door, 2026-10-15): the "Quiet mode: blending into the screen" card in the Showcase, Docking section, built in `design/showcase/quiet.js` on this branch. Today vs Quiet for the edge tab and the notch, with four steps (at rest, cursor at the edge, alert, full-screen app). It is a sketch of the "Only when needed" idea, not the final design.

## Design (Roadmap & design)

**In one line:** a new Presence setting. "Only when needed" makes Steward invisible at rest, on the edge and in the notch. It appears when you push the cursor against its spot, when an alert you allow arrives, or when you press its hotkey, and it tucks away again afterward. Three smaller options build on it: dim when idle, move the tab along the edge, and step aside for screen sharing, full-screen apps, and apps you list.

**Why:** today the edge tab is always on screen (`boundsFor` in `src/main/index.ts` centers it on the edge, 56×132 or 70×160), and the notch chin always reaches about 22 pt below the menu bar (`notchShape` in `src/shared/notch.ts`). The only way to get Steward out of the way is the manual Hide (⌥⇧Space), which then never comes back by itself. People who don't want Steward in their face have no middle ground.

### Part 1: Presence and auto-hide (build first; the rest depends on it)
- **Settings → Steward → Presence: "Always visible" / "Only when needed".** "Always visible" is today's behavior, unchanged.
- **Only when needed, on the edge:**
  - At rest, the tab window is hidden. Rest means: panel closed, no nudge showing, the agent not working.
  - **Reveal by pushing the cursor against its spot:** the cursor sits within 2 pt of Steward's edge, inside the tab's vertical band (±40 pt), for 300 ms. Then the tab slides in. Using the edge anywhere else (scrollbars, side panels) does nothing.
  - **Tuck back:** 1.5 s after the cursor leaves an untouched tab, it slides away again. Clicking it opens the panel as today.
  - **Alerts:** an alert that passes Settings → Notifications reveals as a nudge, as today, and the nudge hides fully when dismissed. Quiet alerts, and anything you've switched off, only update the menu bar badge, which already counts waiting sessions while hidden (`updateMenuBar`).
  - **Hotkey and menu bar:** the open hotkey (⌥Space) and the menu bar icon always open the panel.
  - **Manual Hide stays separate:** it still means "off until I bring it back". Edge pushes don't reveal it, and alerts only badge the menu bar.
- **Only when needed, in the notch:**
  - At rest, nothing shows beyond the real notch: the black is exactly the notch's size and the eyes are off. `notchShape` gets an awake input; when asleep, the lip is the notch's own height and there are no wings.
  - **Reveal:** the cursor resting over the notch for 250 ms wakes him. The notch window already checks the cursor 20 times a second when it's near (`notch-window.ts`), so this reuses that. The chin, or wings if that style is picked, grows in with the eyes.
  - **Tuck back:** 1.5 s after the cursor leaves.
  - **Alerts:** these still nudge from the edge today. See open question 4.
- **The cursor check on the edge:** a small watcher in the main process, the same idea as the notch's. It checks the cursor 5 times a second while the tab is hidden, and only does more when the cursor is at the edge. It stops while the panel is open, while manually hidden, and while the screen sleeps.
- **First time on:** a one-time note in the panel: "Steward hides until you need it. Push your cursor against the right edge, or press ⌥Space."
- Put the rules (zone, dwell time, tuck timer, what counts as rest) in a new pure module, `src/main/presence.ts`, so they can be unit tested. Use a "revealed" flag in the main process, not a new `DockState`, so the shared types change stays small.

### Part 1b: Dim when idle (same build)
- **Settings → Steward → "Dim when idle" toggle.** After 20 s at rest, the eyes fade to about 40%. They stop blinking, glancing and following the cursor, and the drawing loop pauses, which also saves CPU.
- Any mood change, alert, or the cursor coming near wakes them at once.
- It works in both Presence modes, on the edge and in the notch. Calm personality stays what it is (smaller movements); this is about rest.

### Part 2: Move the tab along the edge (separate worktree, after Part 1)
- **Drag the tab up or down** to move it along its edge. A movement of more than 5 px is a drag; anything less is still a click that opens the panel.
- The position is remembered per display (by display id) as a fraction of the screen height, so it survives resolution changes. "Reset position" is in Settings.
- Store it in app state (`appState`), not in settings: it's a remembered place, not a preference.
- The edge-push zone from Part 1 follows the tab's new position.
- Build the vertical drag so the planned drag-to-notch (notch dock work) can reuse it later. See open question 5.

### Part 3: Step aside (separate worktree, after Part 1; starts with a short investigation report)
- **Settings → Steward → "Step aside" options:**
  - **Hide from screen sharing and recordings.** Uses `BrowserWindow.setContentProtection(true)` on the tab, panel and notch windows. You still see Steward, but viewers and recordings don't. macOS doesn't tell apps when the screen is being shared, so this protection is more dependable than trying to detect sharing.
  - **Hide in full-screen apps.**
  - **Hide in these apps:** a list with "Add app…", stored by bundle id. Suggested: Keynote, Zoom, FaceTime.
- **While stepping aside:** Steward is fully hidden (tab and notch), and alerts wait and badge the menu bar. They show when you leave that app or full screen.
- **Investigate first and report before building:**
  - Electron can't see the frontmost app or other apps' full screen.
  - Candidate approaches, in the style of `notch.ts` (JavaScript for Automation through osascript, no native build):
    - a long-running osascript watcher for `NSWorkspace` app switches,
    - window bounds from `CGWindowListCopyWindowInfo` to spot a full-screen window.
  - Neither should need extra permissions. Don't read window titles, which would need the Screen Recording permission.
  - Compare against a tiny Swift helper, measure the CPU cost of each, and recommend one.

### Files likely touched
- **Shared:**
  - `src/shared/types.ts`: `StewardPrefs` gains `presence` and `dimWhenIdle`; a new step-aside prefs type.
  - `src/main/settings-schema.ts`: migrations and the patch schema for the new fields. Existing users keep "Always visible".
  - `src/preload/index.ts`: the tab drag and "Add app…" bridges.
  - `src/renderer/src/Settings.tsx`: a Presence group and the step-aside list.
  - `src/renderer/src/Pill.tsx`, `src/renderer/src/pill/eyes.ts`, `src/renderer/src/Notch.tsx`: dim and pause, eyes off when asleep.
  - Keep all of these changes small and additive.
- **Other:**
  - `src/shared/steward.ts`: defaults.
  - `src/shared/notch.ts`: the asleep shape.
  - `src/main/notch-window.ts`: hover-to-wake.
  - `src/main/index.ts`: reveal and tuck, alerts revealing, menu bar.
  - New `src/main/presence.ts`.
  - New `src/main/step-aside.ts` (Part 3).
  - `SPEC.md`: the "How it lives on screen" section.
- **Tests:**
  - `tests/presence.test.ts`.
  - The asleep and awake notch shape.
  - Settings migration.
  - Step-aside rules (Part 3).

### Risks and open questions
1. **What bothered the friend?** The always-there tab, the nudges popping out, the eyes following the cursor, or the chin covering windows? This decides which part matters most. Part 1 covers the tab and the chin, Part 1b the eyes. If it was the nudges, the answer is mostly Settings → Notifications plus Part 3.
2. **Defaults:** keep "Always visible" for you and existing settings. Should new installs start on "Only when needed"? Should "Dim when idle" be on by default? I'd say yes to both, with Hide from screen sharing on by default too.
3. **Two screens side by side:** if another display sits against Steward's edge, the cursor passes through instead of pushing (the Dock has the same limit). The hotkey and menu bar still work, and Part 2 doesn't fix this. Accept it, or say so in the first-time note.
4. **Notch nudges still come out of the edge** (the comment above `placeNotch`). With the notch invisible, an edge nudge looks out of place. Either build "alerts drop down from the notch" from the notch dock plan first, or accept it for now.
5. **The drag work overlaps:** the planned drag-to-notch also moves the tab. Build Part 2 so it can be reused, or fold Part 2 into that work if it's next.
6. **Content protection might not stop newer capture tools:** apps built on ScreenCaptureKit may ignore it on recent macOS. Verify with Zoom, Google Meet in Chrome, QuickTime and ⌘⇧5 before promising it. It also hides Steward from your own screenshots and demo recordings, so it needs to be easy to switch off.
7. **Cost:** the edge watcher and any app watcher must stay near 0% CPU at idle. Measure them the way the smoke check measures the notch.
8. **Being too invisible:** people can forget Steward exists. The menu bar icon becomes its home, so make sure it shows the waiting count in "Only when needed" too, not just when manually hidden.

### How to test
- **Unit tests:**
  - presence rules: the dwell starts only inside the band, leaving cancels it, the tuck timer fires after 1.5 s, the panel being open or an alert showing blocks the tuck, manual Hide ignores pushes;
  - asleep notch shape = the notch exactly, with no wings;
  - migration: old settings get "Always visible", unknown values fall back;
  - per-display position falls back to centered for an unknown display;
  - Part 3: frontmost-app and full-screen parsing, matching bundle ids.
- **Smoke:** in "Only when needed", the tab window isn't visible at rest. Extend `checkNotch`: the asleep capture is the notch's black only, the awake capture shows the chin. Log idle CPU in both modes.
- **By hand:**
  - right and left edge: push to reveal, use a scrollbar near the edge (no reveal), tuck after leaving, click to open;
  - an allowed alert vs one switched off (badge only);
  - ⌥Space and the menu bar icon;
  - notch: browser tabs fully clickable at rest, hover the notch to wake, Wings style;
  - dim after 20 s, wake on hover;
  - Part 2: drag, restart, and the position is kept on the same display; an external display;
  - Part 3: Zoom, Meet, QuickTime, ⌘⇧5, a full-screen video, playing a Keynote slideshow, an app in the list.

### Build order
Part 1 + 1b → then Parts 2 and 3 in their own worktrees, in parallel. List the shared-file edits in the Result section.

## Result (Main building)
- What was built, files changed, check results
- Branch / worktree
- Anything unfinished or uncertain
