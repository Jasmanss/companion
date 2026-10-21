# Movable panel: drag it anywhere, and it opens where you left it

Status: ready

Set by the front door, 2026-10-21: the user typed the go for Phase 1 into Main building directly. Phase 2 waits for its own go.

## Ask (front door)
The user's words, 2026-10-21: "new feature we should do now. Make the companion screen movable and where you left it is where it would pop up." The "companion screen" is Steward's panel (the tray, the greeting, the input). Their answers:
- **Reopen:** "Pop up in place." After you have dragged it, it fades and grows in right where you left it. Until you move it, it keeps today's entrance (sliding from the edge, or dropping from the notch).
- **Reset:** "Double-click the top bar." That sends it back to its edge or the notch. There is also a Reset in Settings.
- **Builder:** Main building. The user types the go.
Design page: `design/movable-panel.html` (live: drag the top bar, close and reopen, double-click, both closing options, notch mode, Reduce Motion). Written against `origin/main` at `73bd0fb` (notch 3b merged).

## Design (Roadmap & design)

### What the user sees
1. **Drag.** Press on the panel's top bar (the Pill, the name, the empty space) and move more than 5 points: the panel follows the cursor and stays inside the screen's work area (never under the menu bar or the Dock). The buttons (new chat, pin, settings, hide, tuck away) and the project chip still click, also when a press starts on them and moves.
2. **Reopen in place.** Once moved, every way of opening it (the tab, the notch, an alert click, the menu bar icon, ⌥ Space) shows it at that spot: a fade with a small grow, 0.3 s. Until the first move, nothing is different from today.
3. **Put it back.** Double-click the top bar (not a button), or Settings → Steward → Reset. The panel glides home (0.3 s) and the old entrance from the edge or the notch is back.
4. **Close.** A moved panel shrinks to 96% and fades where it is (0.2 s), the pop-in in reverse. Then the tab or the notch is there as usual. With Reduce Motion, both the pop-in and the close are a 150 ms fade.

### The calls (the five questions from the front door)

**1. The drag handle: a JS drag, not a native drag region.** The top bar listens for pointer events and the main process moves the window, the same way the tab's drag already works (`src/renderer/src/tab-drag.ts`, `dragTab` and `TabDrag` in `src/main/index.ts`). A press that starts on a `button` (or any `a`, `input`) is ignored, so the buttons and the chip click as now. The pointer is captured, so a quick drag cannot outrun the window. Why not `-webkit-app-region: drag`: the page never sees events on a native drag region, so it could not catch the double-click or clamp the move to the work area while dragging, and the window is `movable: false` on purpose.

**2. The macOS double-click.** There is no native drag region, so macOS has no title bar to run its zoom or minimize action on: nothing else can happen. The page gets a normal `dblclick` and asks the main process to put the panel back. The top bar gets `user-select: none`, so the double-click does not select the name. A tooltip on the bar says "Drag to move. Double-click to put it back."

**3. Saving the spot.**
- Where: `app-state.json` (`src/main/app-state.ts`), next to `tabPlaces`, as `panelPlaces: Record<displayId, { x, y }>` plus `panelDisplay`, the screen it was last left on. Not `settings.json`: it is where something sits, not a preference, and `settings-schema.ts` would have to learn a new field. `settings-schema.ts` does not change.
- The unit: each of `x` and `y` is a fraction (0 to 1) of the free room on that screen (work area minus the panel's size). So it survives a change of resolution, a Dock that appears, or a smaller work area, and always lands inside it.
- Which screen: while dragging, the screen under the cursor decides, and the window is clamped to that screen's work area (so it can be dragged onto another screen). It is saved for that screen.
- Opening: if `panelDisplay` is still connected and has a spot, use it. Otherwise the screen it would open on today (the notch's screen in the notch, else the main screen). If that one has no spot, it is simply not moved: today's placement. A spot for a screen that is not connected is kept for when it comes back, never used or deleted.
- Bad data (not numbers, outside 0 to 1) is dropped when read, like `tabPlaces`.
- A pure file, `src/shared/panel-place.ts`, holds the arithmetic (`panelRect`, `spotFor`, `clampPanel`), reusing `Rect`, `DRAG_THRESHOLD` and `isDrag` from `tab-place.ts`.
- The window is 400 wide and up to 760 tall (`PANEL_WIDTH`, `Math.min(760, area.height - 48)`), as now.

**4. Closing a moved panel: shrink and fade in place (recommended).** The panel leaves the way it came: the pop-in in reverse, where it is. Then the window goes to the tab's or the notch's place with no animated resize. The other option, gliding the whole panel back to the tab, is on the design page as "Glides back to the tab"; I do not recommend it: a 400 by 760 window crossing the screen is the heaviest thing the app can animate, macOS animates the resize itself and cannot be told to stop on a frame, and it contradicts "where you left it". This reads the user's earlier rule ("the exit follows where Steward is") as "follows where the panel is" for a moved panel. An unmoved panel closes exactly as today (up into the notch, or back to the edge). The user can overrule this at go; it is the one judgment call in here.

**5. How it fits with what exists.**

| Thing | What happens |
|---|---|
| Quiet mode (Only when needed), the tab | Nothing changes. An open panel keeps Steward out. After it closes, the tab comes and goes at the edge as before, and a click on it opens the panel at the saved spot. A push along the edge still brings the tab to the cursor. |
| Keep panel open (pin) | A pinned panel stays where it is. Moving it does not unpin it, and a drag never counts as clicking away (a `movingPanel` flag joins `draggingOut` in `tuckIfAway`). |
| Notch mode | Before the first move, the panel drops from the notch. After it, it opens in place, and closes in place, not up into the notch. The notch window is the character at rest, as before. Reset brings the drop back. |
| Step aside | As today: the window goes while an app is in front, and the panel reopens in place afterwards. |
| Alerts, the nudge, the Visual Review card | The nudge still comes from the edge or the notch. Clicking it opens the panel at the saved spot with no animated resize from the nudge's bounds. The Visual Review card is inside the panel, so it is wherever the panel is. |
| ⌥ Space, the menu bar icon, a second launch | All end in `setDock('expanded')`, so all open in place. |
| Hide from the screen edge | The panel's way out is the in-place leave. The saved spot is kept. |
| The viewer ('viewing') | Not movable. It stays centered. |
| Settings → Steward → Reset | The existing Reset (which centers the tab) also clears the panel's spots. One button, its note says both. |

### How it is built
- **Main process (`src/main/index.ts`):** `boundsFor('expanded')` returns the saved spot's rectangle when there is one (and not in `viewing`). New `dragPanel(phase, dx, dy)` like `dragTab`: `start` remembers the window's bounds, `move` sets bounds without animation, clamped to the work area of the screen under the cursor, `end` saves. `resetPanelPlace()` clears the spots and glides the window to `boundsFor('expanded')` if the panel is open. In `setDock`, a moved panel opens with no animated resize (`setBounds(..., false)`) and leaves by the in-place way: the page plays the shrink (the existing `data-leaving` and "the page says when it is done" pattern used for the way back into the notch) and the window then jumps to the tab's bounds. `placeAfterDisplayChange` already calls `boundsFor(dock)`, so a display change re-clamps for free. The page is told whether the panel is moved with a new `dock:placed` message.
- **Renderer:** a `usePanelDrag` hook (new `src/renderer/src/panel-drag.ts`, modeled on `tab-drag.ts`) on the `panel-head` in `App.tsx`: pointer capture, the 5-point threshold, one move message per animation frame, `dblclick` to reset. `styles.css`: `panel-settle-in` (opacity 0 and scale .94 to 1, 0.3 s, from the center) and `panel-settle-out` (to opacity 0 and scale .96, 0.2 s), chosen with `:root[data-placed]`; the fade for Reduce Motion; `cursor: grabbing` while dragging.
- **Shared files, small and additive (list in the Result):** `src/shared/types.ts` (`dock.dragPanel`, `dock.resetPanel`, `dock.onPlaced`), `src/preload/index.ts` (the same three bridges), `src/renderer/src/App.tsx`, `src/renderer/src/styles.css`, `src/renderer/src/Settings.tsx` (the Reset row's note). Not touched: `settings-schema.ts`, `notch-window.ts`, `notch.ts`.
- **Other new or changed:** `src/shared/panel-place.ts` (new), `src/main/app-state.ts` (`panelPlaces`, `panelDisplay`), `tests/panel-place.test.ts` (new), `SPEC.md` and `README.md` (a line on moving the panel).

### Build phases (the user types each go into Main building; each is a draft PR into main with CI green)
**Phase 1: move it, remember it, put it back.** Everything in "What the user sees", on one screen: the drag, saving, popping in and closing in place, double-click and Settings Reset, the unit tests and the smoke checks below. Without the in-place close, a moved panel would fly to the tab, so open and close go together.
**Phase 2: screens and edges.** A second screen (drag across, saved per screen, fallback when it is gone), a work area that shrinks (the Dock appears), a full-screen app, notch mode on a non-primary screen, Reduce Motion by hand, `SPEC.md` and `README.md`. Small if Phase 1 handled the arithmetic in `panel-place.ts`.

### Risks and open questions
1. **Drag smoothness.** The panel is a big window with macOS frost (vibrancy) and a shadow; moving it with a `setBounds` per frame may stutter or flicker the frost. The tab's drag works the same way but is tiny. Phase 1 measures it on the real Mac (frame cadence while dragging, like the tab slide measurement). If it stutters: switch the frost and shadow off during the drag and back on at its end. If that is not enough, fall back to a native drag region on the empty parts of the bar, and then the double-click cannot be caught, so Reset lives only in Settings. Report which one was used.
2. **Little room up and down.** The panel is 760 points tall on a 900-point screen (a MacBook Pro 14 work area is 867), so it moves mostly sideways there. On larger screens it has room. A shorter panel when moved is a separate idea, not part of this.
3. **No keyboard way to move it.** The drag is for the pointer. Reset is in Settings, reachable by keyboard. Noted, not solved here.
4. **Finding out you can.** The only hint is the tooltip on the bar and the Settings note. The user said nothing about a hint, so none is added.
5. **The glide on reset.** It uses macOS's animated `setBounds`, which is fine for the short trip home. If it looks bad in the hand test, the reset jumps instead and the pop-in plays.
6. **Motion is checked locally only.** CI cannot measure motion. The user's hand test is the real check of how the drag, the pop-in and the close feel.

**Needs the user:** nothing blocking. The one call they can overrule is #4 (the close in place, not back to the tab).

### How to test
- **Unit (`tests/panel-place.test.ts`):** a spot round-trips to the same rectangle; the rectangle is always inside the work area, also when the work area is smaller than before, and when the panel is taller than the work area allows; bad saved data is dropped; a spot for a screen that is not connected is ignored but kept; 0 and 1 land on the work area's edges.
- **Smoke (the app's own check, driven through the same IPC the page uses):**
  1. Drag by the bar: the window's bounds move by the same amount; dragged far past every edge it stops inside the work area.
  2. A press on a button that moves 30 points does not move the window, and the click still happens.
  3. Close, then open: the bounds equal the saved spot (within 1 point) and the page plays `panel-settle-in`, not `panel-in` or `panel-drop`.
  4. Double-click on the bar: the bounds equal today's placement, the next open plays the old entrance, and nothing else (no zoom, no minimize) happens.
  5. Closing a moved panel: the window never shows at a point between the panel's spot and the tab (sampled every 16 ms, like the existing "never at the edge" notch check), and ends at the tab's bounds.
  6. A saved spot for a screen id that does not exist is ignored.
  7. The existing checks still pass (notch close, tab slide, alerts under the notch).
- **By hand (what the user looks at):** drag and let go, close, open (it pops in the same place); click each button and the chip; double-click the bar and the name; do it in the notch and in Only when needed and with the pin on; an alert while the panel is moved; ⌥ Space; Reduce Motion on; a second screen; a full-screen app.

## Result (Main building)

### Phase 1 built (recorded 2026-10-21, from the front door)
Status line: the front door sets it (`ready` on the user's go). Phase 2 is not built. Built by Main building.
- **Branch / PR:** `claude/movable-panel-1`, commits `5667802`, `6672713`, `93ca003`, `1156183`, `bf1a3ca`. Draft PR #27, CI running when recorded.
- **Built:**
  - A JS drag by the top bar (no native drag region, so the frost stays and the double-click works).
  - It reopens in place with a 0.3 s fade and grow, and closes in place by shrinking and fading over 0.2 s.
  - A double-click on the bar, or Settings → Steward → Place → Reset, glides it home. The Settings "Height" row became "Place", and it now also shows in notch mode.
  - Also fixed: the tab flashing for a frame inside the panel window.
- **Checks:** lint, typecheck, 319 tests, and the last smoke run. A 60-step drag moved the window 60 times, with the longest gap 26 ms.
- **Not checked:** the feel, frost flicker, Reduce Motion, a second screen, full screen, the pin, and Only when needed. Phase 2 covers screens and edge cases.
- **Merge order:** #27 conflicts with #26 (Visual Review) in renderer files. Whichever merges second brings main in.
- **Waiting on the user:** try it by hand (drag, close, reopen, double-click), then OK the merge.
- **Next:** Phase 2 (screens and edges), after the user tries Phase 1. The user types that go into Main building.
