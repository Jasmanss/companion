# Quiet mode: blend Steward into the screen

Status: ready

## Ask (front door)
A friend tested Steward and said the always-visible edge tab and the notch lip would bother him, because they sit in the way. The user wants Steward to blend into the screen: nearly invisible at rest, and appearing only when it is useful.
Answers from the user (2026-10-15, relayed by the front door; this is not a go to build):
- **What bothered the friend:** the tab always being there, nudges popping out, and the chin covering windows. Not the eyes following the cursor.
- **New installs:** quiet by default. A fresh install starts on "Only when needed", with "Dim when idle" and "Hide from screen sharing" on. The user's own settings stay as they are.
- **Alerts from the edge while Steward sits in the notch:** fine for now. Notch Phase 3 fixes it later.
- **Next in development:** quiet mode.
- **Added after Phase 2 was built (2026-10-16):** the user said "I feel it is hard to find side piece if we forgot where to put it. What if we did it where if its on the left you just put your mouse on the left and it pops up. But I feel as if that isnt good. Whats a better way to do this?" Of three options they picked "Tab comes to you": push anywhere along the tab's edge, hold briefly, and the tab slides out at the cursor's height. This is Part 2c below.
- **Asked for directly (2026-10-15, later):** the user wants to move the tab up or down its side "anywhere on the screen basically", and chose "Up and down its side" when asked what that means: any height on the left or right edge, not floating free. This is Part 2 below.

Ideas from the front door (not decisions):
- **Auto-hide like the Dock.** Fully tucked at rest. It appears when the cursor pushes against the edge (or the notch) for a short delay, or when an alert the user chose arrives. Today the hidden state is manual only (⌥⇧ Space).
- **Step aside automatically.** Hide in full-screen apps, while screen sharing or recording, and in a user-made list of apps. Needs a check of what macOS lets an Electron app detect.
- **Quieter resting look.** Eyes only, no body, dimmed, fading further after a while of inactivity, no eye-following or blinking until hovered. The existing Calm personality may cover part of this.
- **Edge placement that doesn't cover app UI.** The right edge collides with scrollbars and side panels. Let the user move the tab up and down along the edge, remembered per display.
- **Notch: invisible at rest.** The chin (about 22 pt below the menu bar) covers the top center of app windows, such as browser tabs, and Wings covers menu bar items. At rest show nothing beyond the real notch; grow the chin only on hover or an alert. Wings stays optional.

Example for the user (front door, 2026-10-15): the "Quiet mode: blending into the screen" card in the Showcase, Docking section, built in `design/showcase/quiet.js` on this branch. Today vs Quiet for the edge tab and the notch, with four steps (at rest, cursor at the edge, alert, full-screen app). It is a sketch of the "Only when needed" idea, not the final design.

## Design (Roadmap & design)

**In one line:** a new Presence setting. "Only when needed" makes Steward invisible at rest, on the edge and in the notch. It appears when you push the cursor against its spot, when an alert that really needs you arrives, or when you press its hotkey, and it tucks away again afterward. Smaller options build on it: quiet alerts, move the tab along the edge, dim when idle, and step aside for screen sharing, full-screen apps and apps you list.

**Why:** today the edge tab is always on screen (`boundsFor` in `src/main/index.ts` centers it on the edge, 56×132 or 70×160), and the notch chin always reaches about 22 pt below the menu bar (`notchShape` in `src/shared/notch.ts`). Every alert type is on by default and peeks out from the edge (`showAlerts` in `src/main/index.ts` grows the tab into a nudge). The only way to get Steward out of the way is the manual Hide (⌥⇧Space), which then never comes back by itself.

### What the user's answers changed (2026-10-15)
- **The three complaints are tab, nudges and chin.** Part 1 (auto-hide and the notch asleep shape) covers the tab and the chin. The nudges were only half covered before: Settings → Notifications lets you switch alert types off, but everything is on by default, so a quiet install would still pop out all day. That is now its own part, **Part 1c Quiet alerts**, and it is in the first build.
- **The eyes were not the complaint,** so **Dim when idle (Part 1b) moves out of the first build** into the second. It stays on by default for new installs, as the user chose; it just ships one phase later.
- **Quiet by default for new installs** is a settings-migration rule, not just a default. See "Defaults and migration" below.
- **Alerts still come out of the screen edge while Steward is in the notch:** accepted for now. Notch Phase 3 (alerts below the menu bar) fixes it. Quiet mode does not touch that, but Part 1c's filter means far fewer alerts reach it.
- **Tab dragging stays in this brief** as the second build phase (my call, since the tab always being there is the first complaint and moving it is the cheap companion). Build the drag code so the drag-to-notch work can reuse it.

### Defaults and migration
- **A fresh install** (no settings file) starts on Presence "Only when needed". `DEFAULT_STEWARD` in `src/shared/steward.ts` carries `presence: 'quiet'`, `dimWhenIdle: true`, and later `hideFromScreenShare: true`.
- **An existing settings file** without the new fields gets `presence: 'always'` and `dimWhenIdle: false`, so the user's own settings stay exactly as they are. `migrateSettings` already fills missing fields one at a time with the defaults of `defaultSettings()`; for these fields the "missing in an old file" value differs from the fresh-install default, so `migrateSteward` needs an explicit fallback for them. Cover both paths with tests.
- **Dim and screen-share hiding** are defaults of the phase that builds them. Until then a quiet install simply has no such option.

### Part 1: Presence and auto-hide (first build)
- **Settings → Steward → Presence: "Always visible" / "Only when needed".** "Always visible" is today's behavior, unchanged.
- **Only when needed, on the edge:**
  - At rest, the tab window is hidden. Rest means: panel closed, no nudge showing, the agent not working.
  - **Reveal by pushing the cursor against its spot:** the cursor sits within 2 pt of Steward's edge, inside the tab's vertical band (±40 pt), for 300 ms. Then the tab slides in. Using the edge anywhere else (scrollbars, side panels) does nothing.
  - **Tuck back:** 1.5 s after the cursor leaves an untouched tab, it slides away again. Clicking it opens the panel as today.
  - **Hotkey and menu bar:** the open hotkey (⌥Space) and the menu bar icon always open the panel.
  - **Manual Hide stays separate:** it still means "off until I bring it back". Edge pushes don't reveal it, and alerts only badge the menu bar.
- **Only when needed, in the notch:**
  - At rest, nothing shows beyond the real notch: the black is exactly the notch's size and the eyes are off, so browser tabs under the chin are fully clickable. `notchShape` gets an awake input; when asleep, the lip is the notch's own height and there are no wings.
  - **Reveal:** the cursor resting over the notch for 250 ms wakes him. The notch window already checks the cursor 20 times a second when it's near (`notch-window.ts`), so this reuses that. The chin, or wings if that style is picked, grows in with the eyes.
  - **Tuck back:** 1.5 s after the cursor leaves.
- **The cursor check on the edge:** a small watcher in the main process, the same idea as the notch's. It checks the cursor 5 times a second while the tab is hidden, and only does more when the cursor is at the edge. It stops while the panel is open, while manually hidden, and while the screen sleeps.
- **First time on:** a one-time note in the panel: "Steward hides until you need it. Push your cursor against the right edge, or press ⌥Space." If a second display touches that edge, the note adds: "On a screen next to another one, use ⌥Space or the menu bar icon."
- **Menu bar home:** in "Only when needed" the menu bar icon is the permanent home. It must be on, show the waiting count, and also show a plain dot when a quiet alert is waiting (see Part 1c).
- Put the rules (zone, dwell time, tuck timer, what counts as rest) in a new pure module, `src/main/presence.ts`, so they can be unit tested. Use a "revealed" flag in the main process, not a new `DockState`, so the shared types change stays small.

### Part 1c: Quiet alerts (first build)
The nudge complaint is about alerts that were not worth interrupting for. In "Only when needed":
- **Peeks out:** only "A session needs me" (an approval or an input a Claude Code session is waiting on). It blocks real work, so it is the one alert that earns an interruption.
- **Menu bar only:** session finished, build failed, celebrations. They add to the menu bar badge, and still show as cards when the panel next opens (Main building verifies that suppressed alerts are not lost: `showAlerts` already sends them to the panel window).
- **Never interrupts:** the morning brief and "where you left off" already show only when the panel opens.
- **Settings → Steward → Presence → "Alerts that peek out":** a three-way choice, "Only when a session needs me" (default in quiet mode), "Everything I turned on in Notifications" (today's behavior, default in "Always visible"), "Nothing, menu bar only". Settings → Notifications keeps its per-type switches and applies on top: a type that is off never shows anywhere.
- **Nudge length:** Main building checks whether a nudge already hides itself if left alone, and keeps that. If it doesn't, add a hide after about 10 s without the cursor on it.
- This is a filter in `showAlerts` (or just before it), written as a pure function with tests, not a change to how alerts are queued.

### Part 2: Move the tab along the edge (second build)
- **Drag the tab up or down** to move it to any height along its edge (the user's direct ask: "anywhere" means any height on the side, not a free-floating window). The edge stays the one chosen in Settings → Steward → Screen edge; dragging sideways does not switch edges.
- **The only height limits are the ones the screen needs:** the tab stays fully inside the display's work area (`screen.getDisplayNearestPoint(...).workArea`), which already excludes the menu bar, the notch band and the Dock when it sits on that side. So it can be dragged right up to the menu bar and down to the Dock, but not under them. It is clamped while dragging, not after. Nudge and panel sizes are unchanged and are placed from the tab's new height (the panel keeps its existing rule for staying on screen).
- **Edge cases:** an external display with a different height keeps its own saved position; if the saved position would put the tab outside the work area (resolution change, Dock moved), it is clamped back in. A movement of more than 5 px is a drag; anything less is still a click that opens the panel.
- The position is remembered per display (by display id) as a fraction of the screen height, so it survives resolution changes. "Reset position" is in Settings.
- Store it in app state (`appState`), not in settings: it's a remembered place, not a preference.
- The edge-push zone from Part 1 follows the tab's new position.
- Build the vertical drag and the saved position so the planned drag-to-notch can reuse them.

### Part 2b: First-launch peek (second build, small; added after Phase 1, 2026-10-15)
- Phase 1 left a fresh install with only the menu bar icon on first launch, so a new user sees nothing. The user chose to fix it in Phase 2.
- **On the first launch of a fresh install in "Only when needed":** the tab slides in once from its edge with the first-run note ("Steward hides until you need it. Push your cursor against the right edge, or press ⌥Space."), then tucks away like any other reveal (1.5 s after the cursor is not on it, and not while the note is waiting to be read: keep it out until the cursor has been on it, or about 10 s, whichever comes first, Main building picks the exact rule and reports it).
- **Only once:** remember that it happened in app state (`appState`), not in settings. Existing installs, and fresh installs that already switched to "Always visible", never see it. In the notch, the same once-only reveal wakes the notch with the note.
- Test: a pure rule for "show the first-launch peek" (fresh, quiet, not shown yet), and by hand with an empty user data folder.

### Part 2c: The tab comes to you (Phase 2.1; designed, waiting for the user's go)
**Why:** in "Only when needed" the tab only appears when the cursor pushes against the edge inside a band of ±40 pt around the tab's saved height. Once the tab can be dragged to any height, you can forget where you put it, and then you cannot find it. Nobody should have to remember a spot.

**What the user sees:** with Presence "Only when needed", push the cursor against the tab's edge anywhere along the work area, hold still for a moment, and the tab slides out right at the cursor's height. Leave it and it tucks away as before. It does not change where the tab rests: the saved height (set by dragging) still decides where it sits in "Always visible", where a nudge appears, and where the tab shows when something else brings it out.

**The rules** (pure functions in `src/main/presence.ts`, next to `inEdgeZone`, so they are unit tested):
- **Zone:** the whole height of the display's work area (`display.workArea`, so never the menu bar band, and never behind the Dock), still within 2 pt of the edge Steward is on. Replace the ±40 band check in `inEdgeZone` with "anywhere in the work area's height".
- **Hold:** 300 ms near the saved spot (inside the old ±40 band, exactly as today), 500 ms anywhere else along the edge. The longer hold off the band is the price of the bigger zone.
- **Still, not sweeping:** the cursor must stay within about 6 pt while it holds. Dragging a scrollbar, or sliding down the edge to reach something, moves the cursor and never counts. This is the scrollbar rule for the whole edge, replacing "only the strip where the tab sits".
- **No instant re-pop:** after the tab tucks away, the cursor has to leave the zone (move more than about 8 pt from the edge) before a new push counts. Without this, resting the cursor on a scrollbar would bring the tab back every two seconds.
- **Where it appears:** its top is `clampTop(area, tabHeight, cursorY - tabHeight / 2)` from `src/shared/tab-place.ts`, so the cursor is at the tab's middle, shifted just enough to stay inside the work area near the menu bar or the Dock. The cursor always stays over the tab.

**Temporary spot, saved spot:**
- Add a runtime-only `revealTop` in `src/main/index.ts` (not in app state, not saved). `boundsFor('collapsed')` and `tabTop()` use it while it is set, and the saved place (`tabPlaces`) the rest of the time.
- The tab window is hidden when it is not out, so moving it to the new top before it slides in is not visible. The page's slide animation does not change.
- `revealTop` is cleared once the tab has tucked away and its slide-out has finished, so the next hidden tab is at its saved spot again. It is never cleared while the tab is on screen, so the tab never jumps under the cursor.
- **Panel opened from a temporary spot:** it opens around where the tab is now (`topAround` already centers it on the tab's current top). Closing it keeps the tab where it was while the cursor is on it, then the normal tuck and clear apply. The panel must never use a different spot than the tab it grew from.
- **Nudge:** if the tab is out at a temporary spot when an alert arrives, the nudge grows from the tab where it is (it shares the tab's top). If the tab is hidden, a nudge appears at the saved spot, as today.
- **Manual Hide** still ignores pushes, as before. The ⌥Space hotkey and the menu bar icon are unchanged.

**With the drag (Part 2):** dragging a tab that came to the cursor starts from its current top and saves the new height at the end, as for any drag. So the fastest way to move the saved spot is: push anywhere, then drag the tab. The drag's click-or-drag threshold (5 pt) is unchanged. Honest note: in "Only when needed" the saved height now mostly decides where nudges appear; the drag still matters fully in "Always visible".

**With the first-launch peek (Part 2b):** unchanged. The peek shows at the saved spot (the middle on a fresh install), because the cursor is not at the edge. The first-run note's wording changes to "Push your cursor against the right edge, anywhere along it, or press ⌥Space."

**Notch:** not affected. In the notch there is no edge tab and `canWatchEdge()` is off, so none of this applies. "Always visible" is also not affected: the tab is always out at its saved spot.

**Files likely touched (small):** `src/main/presence.ts` (the zone, hold and still rules, with tests in `tests/presence.test.ts`), `src/main/index.ts` (`revealTop`, `boundsFor`, the edge watcher that calls the rules, clearing after the tuck), `src/shared/tab-place.ts` only if a helper is needed, the first-run note text in `presence.ts`, `SPEC.md`. Shared files: none expected; no new setting.

**Risks and open questions:**
1. **Scrollbars and side panels are the real risk.** The hold, stillness and no-instant-re-pop rules are my best guess, not measured. The user's hand test on a Mac with a scrollbar at the edge decides whether to tune the numbers. If false reveals still happen, add a switch in Settings → Steward → Presence ("Reveal from anywhere on the edge", on by default) as the safety valve. I recommend not adding the switch until the hand test shows it is needed.
2. **Dock on the same side.** The work area is narrower than the display then, and the tab sits beside the Dock. Main building checks what today's zone does in that case and keeps it, rather than making the whole edge a zone next to the Dock.
3. **Second display against the edge.** Unchanged: the cursor passes through and the push never counts (`screenBeside`). The hotkey and the menu bar icon still work.
4. **Watcher cost.** The fast check (every 50 ms) runs while the cursor is in the 2 pt strip. The strip is now the whole edge, so it runs more often when someone works at the edge. Measure idle CPU in "Only when needed" as the Phase 1 smoke check does.

**How to test:**
- Unit tests: the new zone (anywhere in the work area, not the menu bar band, not outside the 2 pt strip), hold time near the saved spot (300 ms) and away from it (500 ms), movement over about 6 pt cancels the hold, no re-trigger until the cursor leaves the zone, `clampTop` near the top and bottom of the work area, `revealTop` set and cleared (and never cleared while the tab is out).
- By hand: push high, low and in the middle of the edge and the tab comes at that height; drag a scrollbar at the edge (nothing comes out); open the panel from a temporary spot (it opens around the tab) and close it; push, then drag the tab (the new height is kept after a restart); a nudge while the tab is out at a temporary spot and while it is hidden; with the Dock on the same side; with Always visible (no change); in the notch (no change).

### Part 1b: Dim when idle (second build, small)
- **Settings → Steward → "Dim when idle" toggle** (default on for new installs, off for existing settings).
- After 20 s at rest, the eyes fade to about 40%. They stop blinking, glancing and following the cursor, and the drawing loop pauses, which also saves CPU.
- Any mood change, alert, or the cursor coming near wakes them at once.
- It works in both Presence modes, on the edge and in the notch. The eyes were not the complaint, so this is polish and CPU savings, not the headline.

### Part 3: Step aside (third build; starts with a short investigation report)
- **Settings → Steward → "Step aside" options:**
  - **Hide from screen sharing and recordings** (default on for new installs, as the user chose). Uses `BrowserWindow.setContentProtection(true)` on the tab, panel and notch windows. You still see Steward, but viewers and recordings don't. macOS doesn't tell apps when the screen is being shared, so this protection is more dependable than trying to detect sharing.
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
- Part 3 is not what fixes the nudge complaint; Part 1c is. Part 3 adds the "never while I present" case on top.

### Files likely touched
- **Shared:**
  - `src/shared/types.ts`: `StewardPrefs` gains `presence`, `alertPeek` (first build) and `dimWhenIdle` (second); a step-aside prefs type (third).
  - `src/main/settings-schema.ts`: migrations and the patch schema for the new fields, with the old-file fallbacks described above.
  - `src/preload/index.ts`: the tab drag bridge (second) and "Add app…" (third).
  - `src/renderer/src/Settings.tsx`: a Presence group (first), then the step-aside list (third).
  - `src/renderer/src/Pill.tsx`, `src/renderer/src/pill/eyes.ts`, `src/renderer/src/Notch.tsx`: eyes off when asleep (first), dim and pause (second).
  - Keep all of these changes small and additive.
- **Other:**
  - `src/shared/steward.ts`: defaults (fresh install).
  - `src/shared/notch.ts`: the asleep shape.
  - `src/main/notch-window.ts`: hover-to-wake.
  - `src/main/index.ts`: reveal and tuck, the alert filter in `showAlerts`, menu bar badge.
  - New `src/main/presence.ts` and a pure alert-filter function (in `presence.ts` or next to the alert queue).
  - New `src/main/step-aside.ts` (third build).
  - `SPEC.md`: the "How it lives on screen" section.
- **Tests:**
  - `tests/presence.test.ts` (rules and the alert filter).
  - The asleep and awake notch shape.
  - Settings migration, both paths (fresh install vs old file).
  - Step-aside rules (third build).

### Risks and open questions
Decided (my recommendation; the user can overrule at go):
1. **Defaults:** quiet for fresh installs only, existing settings untouched. Decided by the user.
2. **Two screens side by side:** if another display sits against Steward's edge, the cursor passes through instead of pushing (the Dock has the same limit). Accept it. The first-time note says so, and ⌥Space and the menu bar icon always work.
3. **Notch nudges still come out of the edge:** accepted for now (the user). Notch Phase 3 fixes it.
4. **The drag work overlaps drag-to-notch:** keep Part 2 here as the second build, written so the notch work reuses it.
5. **Cost:** the edge watcher and any app watcher must stay near 0% CPU at idle. Measure them the way the smoke check measures the notch, in both modes.
6. **Being too invisible:** the menu bar icon is the home (see Part 1). It shows the count, plus a dot for quiet alerts, and the first-time note names the hotkey.
7. **Content protection might not stop newer capture tools** (third build): apps built on ScreenCaptureKit may ignore it on recent macOS. Verify with Zoom, Google Meet in Chrome, QuickTime and ⌘⇧5 before promising it in the Settings text. Two side effects to handle: it hides Steward from the user's own screenshots and demo recordings, so the toggle must be easy to find and the Settings line must say so; and the smoke check's screenshots must not break (Main building checks that window capture from inside the app still works with protection on, since the CI shots come from the app itself, not from the screen).

Confirmed by the user at go (2026-10-15, to the front door): "In quiet mode, which alerts should still pop out?" → "Only 'a session needs me'". "Go to build quiet mode Phase 1?" → "Go".
- **The default for "Alerts that peek out" in quiet mode is "Only when a session needs me".** Finished builds, failed builds and celebrations stay off the screen until the panel opens.

### How to test
- **Unit tests:**
  - presence rules: the dwell starts only inside the band, leaving cancels it, the tuck timer fires after 1.5 s, the panel being open or an alert showing blocks the tuck, manual Hide ignores pushes;
  - alert filter: each of the three choices against each alert type, with the Notifications switches applied on top;
  - asleep notch shape = the notch exactly, with no wings;
  - migration: a fresh install gets quiet and dim on; an old file gets "Always visible" and dim off; unknown values fall back;
  - per-display position falls back to centered for an unknown display (second build);
  - step aside: frontmost-app and full-screen parsing, matching bundle ids (third build).
- **Smoke:** in "Only when needed", the tab window isn't visible at rest. Extend `checkNotch`: the asleep capture is the notch's black only, the awake capture shows the chin. Log idle CPU in both modes.
- **By hand (first build):**
  - right and left edge: push to reveal, use a scrollbar near the edge (no reveal), tuck after leaving, click to open;
  - a "needs me" alert peeks out; a finished build only adds to the menu bar, and shows as a card when the panel opens; the three choices behave as written;
  - ⌥Space and the menu bar icon;
  - notch: browser tabs fully clickable at rest, hover the notch to wake, Wings style;
  - a fresh install (empty user data folder) starts quiet; the user's own install still starts "Always visible".
- **By hand (later builds):** dim after 20 s and wake on hover; drag, restart, and the position is kept on the same display, plus an external display; Zoom, Meet, QuickTime, ⌘⇧5, a full-screen video, playing a Keynote slideshow, an app in the list.

### Build phases (for Main building; one phase at a time, the user's go between phases)
1. **Phase 1, the quiet core:** Presence setting with fresh-install and old-file defaults, edge auto-hide (reveal, tuck, hotkey, menu bar), notch asleep shape and hover wake, Part 1c quiet alerts, the first-time note, `presence.ts` and its tests, the smoke additions. No dim, no drag, no step aside.
2. **Phase 2:** the tab drag with the remembered position (Part 2), the first-launch peek (Part 2b), and Dim when idle (Part 1b).
3. **Phase 2.1:** Part 2c, the tab comes to you. A small follow-up to Phase 2: it changes the push zone and the tab's top, so it is reviewable on its own. (Recommended as its own phase after PR #18 merges, not folded into it. The user has not tried Phase 2 by hand yet, and a second behavior change in the same watcher would blur what they are testing.)
4. **Phase 3:** the investigation report for Part 3, then the step-aside options once the user picks the approach.
List the shared-file edits in the Result section after each phase.

## Result (Main building)

### Phase 1: the quiet core (build chat "build: quiet-mode, phase 1", 2026-10-15)
Status stays `ready`: Phases 2 and 3 are not built yet. Recorded by Roadmap & design from the front door's relay.
- **Branch / commit:** `claude/quiet-mode-phase-1-c95ee6`, commit `dd0cd9c`, cut from `v1.1-hub-knx5hf`. Not pushed, not merged.
- **Built:**
  - Presence setting. Fresh installs start quiet; existing settings stay "Always visible". "Dim when idle" and "Hide from screen sharing" are saved as on for fresh installs but do nothing until their phases.
  - Edge auto-hide: slides in after 300 ms with the cursor within 2 pt of the edge beside the tab (±40 pt), tucks back 1.5 s after leaving. ⌥Space and the menu bar icon always open. Manual Hide ignores pushes.
  - Notch asleep: pure notch black, wakes after 250 ms of hover, sleeps 1.5 s after the cursor leaves.
  - Quiet alerts, "Alerts that peek out": Needs me / Everything / Nothing. Held alerts add a menu bar dot and show as the banner with "and N more" when the panel opens.
  - The first-run note, `presence.ts` with tests, SPEC.md and README.md updated.
- **Files:** new `src/main/presence.ts` and `tests/presence.test.ts`. Shared files, small and additive: `src/shared/types.ts`, `src/main/settings-schema.ts`, `src/preload/index.ts`, `src/renderer/src/App.tsx`, `Settings.tsx`, `Notch.tsx`, `Pill.tsx`. Also `src/main/index.ts`, `notch-window.ts`, `app-state.ts`, `src/shared/steward.ts`, `src/shared/notch.ts`, three test files, `SPEC.md`, `README.md`. 19 files, +991 −64.
- **Checks:** lint, typecheck and test pass (254 tests; the front door re-ran all three). Smoke exits 0. Idle CPU: main process 0.02% in quiet mode, notch page 0.26% asleep.
- **Not checked (by hand still):** real cursor pushes, scrollbars near the edge, a real alert and how the timing feels. The held-alert banner is not visible in the screenshot meant to show it.
- **Open points:**
  - A fresh install shows only the menu bar icon on first launch (no first-launch peek).
  - Alerts raised while hidden by hand are now held for the next panel open instead of dropped.
  - The "Alerts that peek out" default moves with Presence only while it is still on the old default.
- **Waiting on the user:** OK to merge Phase 1 into `v1.1-hub-knx5hf`, and the go for Phase 2.

### Phase 1 fix (recorded 2026-10-15, from the front door)
- **Commit:** `eb3e963` on `claude/quiet-mode-phase-1-c95ee6`. Draft PR into main: https://github.com/Jasmanss/companion/pull/15. CI had not reported yet when this was recorded.
- **What changed:** the tab slide is now a CSS transform drawn every frame, so the window never moves (macOS was snapping a partly off-screen window back, which gave the "3 frames" look). Reduce Motion fades instead. The Presence, alerts and first-run text are cut to one line each. Notch motion is unchanged.
- **Measured in smoke:** 47 frames over 383 ms sliding in, 39 over 317 ms sliding out, longest gap 9 ms. Smoke now fails if a slide shows fewer than 8 positions or a gap over 60 ms.
- **Not checked:** the motion as it looks on screen (no Screen Recording). One smoke run in seven showed no slide-out samples and was not reproduced.

### Phase 1 merged (recorded 2026-10-15, from the front door)
- PR #15 (quiet mode Phase 1) merged into main by the user's GitHub account: merge commit `876b487`, 00:30. PR #16 (@types/node 24) merged at 00:32 (`b50ff53`). CI was green on both.
- **CI limit:** the macOS CI runner could not measure motion ("not measurable here: the page drew 0 frames in 700 ms"). Slide smoothness is verified only by the local measurement and the user's hand test.
- **Waiting on the user:** try Phase 1 by hand on the latest build, and the go on Phase 2 (tab drag, first-launch peek, dim when idle).

### Phase 2 (recorded from the front door, 2026-10-16)
Status stays `ready`: Phase 3 is not built. The user typed the Phase 2 go into Main building.
- **Branch / PR:** `claude/quiet-mode-phase-2` (cut from origin/main), 6 commits `2e321cd` to `54e780d`. Draft PR https://github.com/Jasmanss/companion/pull/18, CI running when recorded.
- **Built:**
  - Tab drag: more than 5 pt is a drag, clamped to the work area, height remembered per display, "Reset" in Settings → Steward → Height.
  - Dim when idle: after 20 s at rest the eyes go to 40% and stop drawing. They wake on a mood change, an alert, or the cursor within 120 pt. On for new installs, off for existing ones.
  - First-launch peek: once on a fresh quiet install. It replaces the panel's first-time note.
- **Checks:** lint, typecheck, 269 tests and smoke pass locally (the front door re-ran lint, typecheck and tests).
- **Not checked:** notch dim and notch peek (only an external monitor was on), drag feel with a real mouse, a real fresh install.
- **Known limit:** a second display keeps its own height only when it is the main screen.
- **Waiting on the user:** try Phase 2 by hand (drag the tab, wait for the eyes to dim).

### Phase 3
Not started.
