# Step aside: investigation report (quiet mode, Part 3)

Main building, 2026-10-19. Measured on a 14-inch MacBook Pro (notch), macOS 27.0.1, Electron 44. No app code yet: this
is for picking an approach. Brief: `docs/briefs/quiet-mode.md`, Part 3.

## In short

- **Full-screen apps and "Hide in these apps": approach A.** Electron already hears macOS say "another app came to the
  front" and "the Space changed" (a full-screen app has its own Space). App switches even carry the app's id, so the app
  list needs no extra work. Only when the Space changes, one quick JavaScript for Automation query asks whether it's a
  full-screen app's Space. No long-running helper, no polling, no permission, no native build. Measured: nothing at idle,
  about 0.03 s of CPU per Space change.
- **Hide from screen sharing: keep it, but don't promise too much.** It's one call per window and it works for some
  capture tools, but macOS lets newer screen-sharing apps capture the window anyway. Only a hand test on your Mac can
  say which of your apps respect it. The setting already exists (on for new installs); nothing applies it yet.
- **Decided (2026-10-19):** approach A is built (Phase 3). In the user's share test the protected window showed up in
  the share, so "Hide from screen sharing" is left out for now. Its saved setting stays, unused and not shown.

## 1. Hide from screen sharing and recordings

- `BrowserWindow.setContentProtection(true)` marks the window "don't share". Checked here: macOS records it (the
  window's sharing state goes from 1, read-only, to 0, none), and Steward's own screenshots (`capturePage`, which the
  smoke check uses) still work with it on.
- **The catch:** Electron's own docs say that "newer Mac applications that use ScreenCaptureKit will capture your window
  despite" it, because of an intentional change in macOS. Reports conflict on which apps:
  - A Tauri issue says ScreenCaptureKit ignores the flag from macOS 15 on.
  - An Apple forum thread shows QuickTime (ScreenCaptureKit) capturing such a window right away, while Apple's own
    sample left it out at first. Apple's reply only asked for a bug report.
  - A security write-up found macOS 26's own `screencapture` still leaves the window out.
- **I couldn't test other apps' capture here:** that needs the Screen Recording permission, which this session doesn't
  have. A hand test decides it, with a test window that has protection on:
  - Zoom and Google Meet in Chrome, sharing the whole screen;
  - QuickTime screen recording;
  - ⌘⇧5 screenshot and recording.
  
  I can show that test window for a minute whenever you're ready to share. If none of the apps you use respect it, the
  option isn't worth a Settings line.

  **Hand test, 2026-10-19:** a protected window and an unprotected one side by side, with the user sharing the whole
  screen on macOS 27.0.1. The protected one showed up in the share, so the option was left out.
- **Side effects:** where it works, Steward also disappears from your own screenshots and demo recordings, so the
  Settings line has to say so. Sharing a single window instead of the whole screen never shows Steward anyway.

## 2. Knowing the front app and full screen

Electron can't ask which app is in front or whether it's full screen, but it can listen: `systemPreferences.
subscribeWorkspaceNotification` passes on macOS's own notifications. Tried live (a test window went full screen and back):

- **App switch** (`NSWorkspaceDidActivateApplicationNotification`): fires on every switch, and its message names the app,
  for example `com.apple.finder`. That's all "Hide in these apps" needs. The name comes out of a text description, which
  isn't a promise, so if it ever doesn't parse, the code falls back to the query below.
- **Space change** (`NSWorkspaceActiveSpaceDidChangeNotification`): fires when an app goes into or out of full screen.
- **Is the Space full screen?** Two obvious checks don't work:
  - **Window sizes:** on a notched Mac a full-screen window stops below the notch. It measured 1512 × 949 from y 33, the
    same as a maximized window with the Dock hidden.
  - **The active app's presentation options:** these read 0 from outside the app, even with a window really in full
    screen.

  What works is the Space's own type, from `CGSCopyManagedDisplaySpaces`: type 4 is a full-screen app's Space. It's
  undocumented (private), but read-only, needs no permission, and is what tools like yabai and Hammerspoon use. Live: the
  query said full screen about 1 s after the test window went full screen, and not full screen once it left. If a macOS
  update ever breaks it, the query fails and Steward simply doesn't step aside for full screen; nothing else breaks.
- It answers per display, so Steward can step aside only when the full-screen app is on its own display.

## 3. The approaches, measured on this Mac

| Approach | At idle | Per change | Extra process | Build |
|---|---|---|---|---|
| **A. Electron's notifications, one osascript query per Space change** | nothing | 0.07 s, 0.03 s of CPU; app switches free | none | none |
| B. Long-running osascript watcher, woken by the same notifications | 0.03 s of CPU a minute | inside it | osascript, 11 MB | none |
| C. Long-running osascript watcher, checking every second | 0.13 s of CPU a minute | up to 1 s late | osascript, 31 MB | none |
| D. Small Swift helper | not measured | | yes | compile, sign, notarize, both Mac chips |
| Asking osascript fresh every second | about 2 s of CPU a minute | | | (rejected) |

- **A** is the cheapest and simplest: nothing runs between changes.
- **B** works too, but it's a process that has to be started, watched and restarted for the app's whole life.
- **D** would idle near zero as well, but it adds a native build to the app and to CI. It would still need the same
  private Space call for full screen. And it can't be built on this Mac right now: the Swift compiler fails with a
  Command Line Tools error (fixing that means changing system setup, which I didn't do).

## 4. Not checked

- Other apps' screen capture of a protected window on macOS 27 (needs your hand test, above).
- The Swift helper's real cost (compiler broken here).
- A second display, and Keynote's slideshow: if Keynote doesn't use a full-screen Space, putting it in "Hide in these
  apps" covers it while it's in front.

## 5. What the build would be, once you pick

- **Settings → Steward → Step aside:** "Hide from screen sharing" (wording per the hand test), "Hide in full-screen
  apps", and "Hide in these apps" with "Add app…" (by bundle id; suggested Keynote, Zoom, FaceTime).
- **While stepping aside:** the tab and the notch are hidden, and alerts wait with the menu bar dot, as quiet alerts do
  today. Everything comes back when you leave that app or full screen.
- **Code:** a small `src/main/step-aside.ts` with pure rules (step aside or not, from the front app, full screen on
  Steward's display, and the list) and the query in the style of `notch.ts`, with unit tests; smoke feeds it made-up
  events. Content protection is one call on the tab, panel and notch windows.

## Sources

- [Electron docs, BrowserWindow, `win.setContentProtection`](https://www.electronjs.org/docs/latest/api/browser-window) (the same text ships in `node_modules/electron/electron.d.ts`)
- [Tauri issue 14200: macOS 15+, ScreenCaptureKit ignores sharingType](https://github.com/tauri-apps/tauri/issues/14200)
- [Apple Developer Forums: ScreenCaptureKit sample and NSWindowSharingNone](https://developer.apple.com/forums/thread/808016)
- [Invisible-window research write-up (macOS 26.3.1)](https://raoufabedini.dev/write-ups/invisible-window-research)
