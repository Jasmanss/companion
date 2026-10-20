# Notch dock, Phase 3: Steward comes alive in the notch

Status: ready

Set by the front door, 2026-10-19: the user typed the go for Phase 3a into Main building directly. 3b, 3c and 3d each wait for their own go. 3e (added 2026-10-20) waits for its own go too, after 3b is merged.

## Ask (front door)
The user's open item, in their words: "Phase 3 (hover grows the black, the panel drops out of the notch, alerts below the menu bar, drop images onto the notch)". They picked it as the next design job on 2026-10-15.
Design only. Nothing is built until the user says go. Written against `origin/main` at `b50ff53`, which has notch dock part 2 (`c9bb4f1`) and quiet mode Phase 1 (`876b487`).

Where this sits in the 6-phase notch plan (memory prompt 08, "Phase 0 to 5"): Phases 0 to 2 are built (measure, design page, the notch resting in the app). This brief is prompt 08's Phase 3 (expand and collapse). Prompt 08's Phase 4 (drag the tab into the notch with the liquid drop, drag out to undock) and Phase 5 (hardening, docs) are not in this brief.

## Design (Roadmap & design)

### What the user sees, with the notch picked in Settings → Steward → Screen edge
1. **Hover grows the black.** Rest the cursor near the notch: the black grows a little (the chin gets a few points taller) and the eyes follow the cursor. Leave: it shrinks back.
2. **Click opens the panel from the notch.** The panel appears centered under the notch, top edge just under the menu bar, instead of at the screen edge. Click away or Esc tucks it back, as today. Closing returns Steward to the notch.
3. **Alerts come out of the notch, below the menu bar.** An alert that passes the quiet-mode filter slides out as a line of text under the menu bar, centered on the notch, instead of peeking from the side edge. It tucks back when dismissed or after the cursor has left it.
4. **Drop an image on the notch.** Drag a screenshot or an image from Finder or a browser toward the notch: the lip opens like a mouth, takes the image in, and it lands in the tray. A short "Added to the tray" line confirms.

All four already exist as animations on `design/notch.html` (the States section: hover, a nudge, dropping an image in, the click that opens the panel). Main building builds from that page and does not redesign it.

### What it reuses from quiet mode Phase 1 (already in main)
- **Asleep and awake:** `notchShape(style, mood, notch, awake)` in `src/shared/notch.ts` and `NotchDock.setAwake` in `src/main/notch-window.ts`. Phase 3 adds a third level above awake, "hover", and does not touch the asleep shape.
- **The cursor watcher** in `NotchDock.watch` (20 checks a second near the notch, already reporting "over the shape") and the presence rules in `src/main/presence.ts` (`NOTCH_DWELL_MS`, wake and sleep timing).
- **The alert filter** (Part 1c: "Alerts that peek out": Needs me / Everything / Nothing) and the held-alerts banner when the panel opens. Phase 3 changes where an allowed alert appears in the notch, not which alerts are allowed.
- **Click handling:** the existing `notch:click` IPC that calls `setDock('expanded')`.

### What it changes in quiet mode's behavior
- **Alerts in the notch:** quiet mode Phase 1 accepted that alerts still peek from the side edge while Steward sits in the notch ("fine for now"). Phase 3b removes that: in notch mode a nudge appears under the notch. The side-edge nudge stays for edge mode.
- **`placeNotch()` in `src/main/index.ts`** shows the notch window for `collapsed` and `nudge` and hides it when the panel is open. Phase 3 keeps the notch window up (as the character) while a nudge is out, and the main window moves to the notch for the nudge and the panel.
- **Hover is independent of Presence.** In "Always visible" the chin is already out, and the new hover grow still applies. In "Only when needed", the hover wake from Phase 1 is the grow: asleep to awake on a 250 ms dwell. Do not add a second grow on top of that wake. The hover level only exists while awake, so quiet mode never shows two motions in a row.

### What it does not touch
- **Quiet mode Phase 2's tab drag** (any height along the edge) is not used here. It will be reused later by prompt 08's Phase 4, where dragging the tab to the top center snaps it into the notch. Nothing in Phase 3 should make that harder: keep the "where does Steward dock" decision in the existing `replaceForNotch()` path.
- **The first-launch peek** from quiet mode Phase 2 wakes the notch with the first-run note; Phase 3's nudge placement is what shows that note under the notch. No extra work, but test it after both phases are in.

### Build phases (each reviewable on its own; the user's go between phases)
**3a: Hover and the panel from the notch.**
- Add a "hover" level to the notch shape (`NotchShape` gets a small extra lip; `NotchState` gets a `hover` flag, or `awake` becomes a three-value level). The notch window's watcher already knows when the cursor is on the shape; it sets hover with a short delay both ways so the edge of the black is never a flicker.
- Panel placement in notch mode: a new pure function in `src/shared/notch.ts` (for example `notchPanelBounds`) that centers a `PANEL_WIDTH` panel on the notch's x, with its top at the work area's top on the notch's display, kept on screen. `boundsFor('expanded')` in `src/main/index.ts` uses it when `inNotch()`.
- The panel's own entrance animation plays as today, with its origin at the top center so it grows down from the notch (a small change in `src/renderer/src/styles.css` and `App.tsx`, flagged below). No morph of the black into the panel yet.
- Closing: the existing tuck-back, then the notch comes back (`placeNotch()` already does this).
- Reduced Motion: fade, no growth.

**3b: Alerts below the menu bar.**
- Nudge placement: the same placement function with the nudge's size. The main window takes the nudge bounds at the notch while the notch window stays as the character. Width stays `NUDGE_WIDTH`, text on one line as today.
- It reveals through the presence rules exactly as an edge nudge does (quiet mode: `{ revealed: true }`; tucks 1.5 s after the cursor leaves and nothing is pending). The held-alert and "and N more" banner behavior is unchanged.
- Stop the edge nudge in notch mode: `showAlerts` and `setDock('nudge')` choose the bounds by `inNotch()`.
- The nudge must never cover menu bar items: it starts under the menu bar line, not in it.

**3c: Drop images onto the notch (start with a spike).**
- **Spike first, report before building the rest.** The notch window ignores mouse events everywhere except over the black shape, switched by the 20-a-second cursor poll. Two things are unknown and must be measured on the real Mac with a real Finder drag: (1) whether `screen.getCursorScreenPoint()` keeps updating during a drag, so the poll can switch the window to take events when a drag arrives over the shape; (2) whether `dragenter` and `drop` then fire on the notch page. If both work, build on that. If the poll doesn't update during a drag, the fallback is to size the notch window to the shape's bounding box while awake (it is 360×96 now) so the whole window can take events. Report which one worked.
- Then: on drag-over, the lip opens (the "mouth" from the design page), on drop the page sends the files or URL to the tray through the same bridge the panel uses (`api.tray.addPaths`, `addUrl`, `addBytes`), and a one-line "Added to the tray" shows under the notch. The drag-type checks (`canDrop`, `urlFromDrag` in `src/renderer/src/App.tsx`) should move to a small shared file so the notch page and the panel use the same code, not a copy.
- Asleep in quiet mode: a drag arriving at the notch wakes it, like the hover does.

**3d: The morph (optional, the user decides after seeing 3a).**
- The black shape drops down and becomes the panel, as on the design page. The notch window and the panel are two separate windows, so this is a crossfade of the two with the black growing in the notch window over about 0.3 s, then the panel appearing under it. Only transform and opacity animate. If it flickers or the two windows drift apart, drop it: 3a's simple entrance is the fallback and is already acceptable.

**3e: The Wings hand-off (added 2026-10-20, shrunk the same day).**
On `design/notch-styles.html` the user picked **C, Hand-off** as the way the Wings turn into eyes. Visual source: stage C on that page. Build it after 3b is merged, because it changes the same shape and alert code. It needs its own go from the user. No new look and no new setting value: Chin stays the default and Wings stays an option.

*Dropped: D, Inside.* The user first picked D (eyes lit inside the notch) for the resting look. It was dropped because the notch is hardware with no pixels, so eyes drawn inside it would not show. The user chose to keep Chin as the resting look.

*C, Hand-off: how it plays and reverses.* It applies to the Wings style only.
- **On an alert:** the eyes in the wings fade out over 0.25 s while the wings fade and shrink over 0.3 s. The chin drops from the notch's bottom edge (22 pt, 0.35 s, starting 0.1 s in) and the chin's eyes grow in from 55% size with a small overshoot (0.35 s, starting 0.18 s in). About 0.5 s in all, with no eye traveling across the menu bar. 3b's alert text line then hangs below the chin as one black shape.
- **When the alert ends:** it runs back in about 0.35 s: chin eyes out, chin up, wing eyes and wings back. A new alert or hover during either direction reverses from wherever it is, with no jump.
- **Thinking and talking** in Wings keep today's behavior (the chin grows for the dots and the mouth). The hand-off is only for alerts.
- **Reduce Motion:** the eyes swap by opacity only, in 150 ms. The chin appears by opacity too. No scale, no overshoot.

*Files for 3e.* `src/shared/notch.ts`: only if the drawing needs to be told that an alert is out in Wings (the shape for Wings during an alert includes the chin). `src/renderer/src/Notch.tsx` and the face code it calls: the hand-off. `SPEC.md` and `README.md`: one line on it. No change to `types.ts`, `settings-schema.ts`, `steward.ts` or `Settings.tsx`.

*Tests for 3e.* Unit: the Wings shape during an alert includes the chin, and the Chin and no-alert shapes are unchanged. Smoke: a capture of the notch window in Wings with an alert. Motion: the same 59 fps measurement the page used, run on the real notch window with the hand-off playing. By hand: Wings with an alert in and out; a second alert or a hover during the change; Reduce Motion on; a light wallpaper.

### Files likely touched
- **Shared files (keep small and additive, list in the Result):**
  - `src/shared/types.ts`: `NotchState` gains the hover flag (and 3c's dropping flag).
  - `src/preload/index.ts`: only if the notch page needs a bridge the panel doesn't have (3c; check first, the notch window uses the same preload).
  - `src/renderer/src/*`: `Notch.tsx` (hover look, mouth, confirmation line), `App.tsx` (the panel's entrance origin; moving the drag-type checks to a shared file), `styles.css` and `notch.css`.
  - `src/main/settings-schema.ts`: no change expected (no new setting).
- **Other:**
  - `src/shared/notch.ts`: the hover shape and the placement function.
  - `src/main/notch-window.ts`: the hover level and (3c) drag handling.
  - `src/main/index.ts`: `boundsFor`, `showAlerts`, `setDock`, `placeNotch`.
  - `SPEC.md` and `README.md`: the notch section moves from "planned" to what it does.
  - `design/notch.html` only if a state changes while building (it is the visual source).
- **Tests:** `tests/notch.test.ts` (hover shape, panel and nudge placement: centered, kept on screen, notch on a non-primary display), a smoke capture of the notch window on hover, and the motion measurement the tab slide uses, for the hover grow.

### Risks and open questions
1. **Display choice.** `boundsFor` uses `screen.getPrimaryDisplay().workArea`. If the notched built-in screen is not the primary display (an external monitor is primary), the panel and nudge must go to the notch's display. Phase 3a uses the notch's display. Main building checks that `findNotch` returns what is needed to find it.
2. **Drag events through a click-through window (3c).** Described above. This is the biggest unknown; it is why 3c starts with a spike.
3. **Motion is checked locally only.** The macOS CI runner cannot measure motion ("the page drew 0 frames"), and Screen Recording is not granted, so the user's hand test is the real check of how hover, the drop-down and the mouth feel. Each phase's report lists exactly what to look at.
4. **Full-screen apps.** The notch window already floats above them. The panel and nudge windows must also appear over a full-screen app when opened from the notch; check it in 3a.
5. **Wings style.** (3e now gives Wings the hand-off on alerts.) The wings sit in the menu bar band and cover items; hover grow on Wings should grow the chin only when the mood needs the middle, or add a few points to the wings. Main building picks the smallest change that reads and reports it.
6. **Panel top gap.** The menu bar is 33 pt and the notch 32 pt on this Mac. The panel's top sits at the work area's top, so it hangs just under the menu bar line; on other Macs use the work area, not a fixed number.

**Needs the user (one decision, not blocking the design):** whether the black-into-panel morph (3d) is worth doing. Recommendation: build 3a with the simple entrance, look at it, and decide after. The other choices are made above and the user can overrule any of them at go.

### How to test
- **Unit tests:** hover level shape (taller than awake, never wider than the notch plus wings), panel and nudge placement (centered on the notch, kept inside the display, correct on a second display), the drag-type check shared by panel and notch.
- **Smoke:** notch window capture on hover; the existing notch checks (asleep is only the notch's black, awake shows the chin) still pass; idle CPU stays near the Phase 1 numbers (main 0.02%, notch page 0.26% asleep).
- **By hand (what the user looks at):**
  - 3a: rest the cursor near the notch (the black grows, the eyes follow), click (the panel appears under the notch, not at the edge), Esc, then do it in Always visible and Only when needed, and with Wings.
  - 3b: trigger a "needs me" alert (the line appears under the menu bar, centered on the notch, covers no menu items); with another alert type in quiet mode nothing appears and the menu bar dot shows.
  - 3c: drag a screenshot from the desktop to the notch (the mouth opens), drop it (it appears in the tray), and drag a picture from a browser; drag something that is not an image (nothing happens).
  - All: a full-screen app, a second display, Reduced Motion on.

### Build order
3a, then 3b, then 3c (its spike first), then 3d only if the user wants it. 3e (the Wings hand-off) goes after 3b is merged; it does not depend on 3c or 3d. The user's go between phases; one phase per build chat, each as a draft PR into main with CI green before it counts as done.

## Result (Main building)

### 3a: hover and the panel from the notch (recorded 2026-10-19, from the front door)
Status stays `ready`: 3b, 3c and 3d are not built. The user typed the 3a go into Main building.
- **Branch / PR:** `claude/notch-phase-3a` (branched from main after PR #21), commits `2d97250`, `623988a`, `282e699`, `c9ae1b0`. Draft PR #24, CI running when recorded.
- **Hover:** in "Always visible", the black grows (chin 4 pt taller, wings 8 pt wider). It takes 220 ms, starts after 80 ms on it, and ends 250 ms after the cursor leaves. In "Only when needed", waking is the grow. With Reduce Motion on there is no grow.
- **Panel from the notch:** a click opens it centered under the notch, on the notch's own screen. It grows down from its top center, or fades in with Reduce Motion on. Closing returns Steward to the notch.
- **Checks:** lint, typecheck and 305 tests (5 runs by Main building, 1 by the front door), and 2 smoke runs.
- **Not checked:** idle CPU in the notch (the Mac went to sleep mid-run), full screen, a second display, Reduce Motion by hand, and the user's hand feel.
- **Next decision:** 3d (the black growing into the panel), after the user tries 3a.
- **Note:** the front door set this brief's Status to `ready` (`d173a29`) on the user's go.
- **Fix in progress (2026-10-19, from the user's hand test):** "Make sure for the notch, that when i close it doesnt go to the side it goes back into the notch." Every close path (click away, Esc, the hotkey, the menu bar) must go straight back into the notch with a reverse drop-down, or a fade with Reduce Motion, and never via the side edge. Sent to Main building as a fix on `claude/notch-phase-3a` (PR #24).
- **CI flake fixed on this PR:** the intermittent smoke failure "a push at the bottom brought the tab to 573, not 574" hit PRs #22 and #23. The check now uses the app's own `clampTop` on the current work area (`477e76f` on #24), likely because the CI runner's Dock moved the work area mid-run. Not proven yet. #23's rerun passed and #24 is green.
- **Waiting on the user:** try 3a by hand again after the close fix, then OK the merge once CI is green.
- **Next:** 3b (alerts below the menu bar), after the 3a close fix. The user types that go into Main building.

### 3a merged, with the close fix (recorded 2026-10-20, from the front door)
- PR #24 (notch 3a) was merged into main by the user: merge commit `4a30bc9`. It includes the close-into-the-notch fix (every close goes back into the notch, never via the side edge) and the smoke flake fix (`477e76f`).

### 3b: alerts below the menu bar (recorded 2026-10-20, from the front door)
Status stays `ready`: 3c and 3d are not built. Built by Main building.
- **Branch / PR:** `claude/notch-phase-3b`, commits `da371d5`, `0bfeb17`, `9b51a12`, `597c621`, `636df43`. Draft PR #25 into main, CI running when recorded.
- **Where alerts appear:** in the notch, an alert comes out under the notch, below the menu bar, as a black shape joined to the chin with one line of text. It grows out in 0.42 s and goes back up in 0.2 s, or fades with Reduce Motion on.
- **Interaction:** a click opens the panel. A close button appears on hover. In "Only when needed" the alert wakes the notch.
- **Left out:** no action button under the notch (the deploy action stays on the panel banner) and no springy overshoot. The first-launch note in the notch is shorter so it fits: "Rest the cursor on the notch · or press ⌥ Space."
- **A 3a bug fixed:** a display change during the close no longer sends the panel to the side.
- **Checks:** lint, typecheck, 310 tests (3 runs by Main building, 1 by the front door) and a full smoke run.
- **Not checked:** the feel by hand, full screen, a second display, Reduce Motion by hand, and idle CPU.
- **Waiting on the user:** try 3b by hand, then OK the merge once CI is green.
- **Next:** 3c (drop images, starting with its spike) and 3d (the morph), each waiting for its own go.

### Notch style pick (recorded 2026-10-20, from the front door)
- On `design/notch-styles.html` the user picked **D, Inside** for the resting look and **C, Hand-off** for the wings-to-eyes animation.
- D was dropped the same day: the notch has no pixels, so eyes inside it would not show. The user's answer: "Keep Chin as the resting look and build only the C hand-off for Wings."
- Written up as phase **3e** above, now only the Wings hand-off. Not built. It waits for 3b to merge and for the user's go, typed into Main building.
