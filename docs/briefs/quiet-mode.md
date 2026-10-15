# Quiet mode: blend Steward into the screen

Status: requested

## Ask (front door)
A friend tested Steward and said the always-visible edge tab and the notch lip would bother him, because they sit in the way. The user wants Steward to blend into the screen: nearly invisible at rest, and appearing only when it is useful.
Open question to ask the user: what exactly bothered him (the tab always being there, the nudges popping out, the eyes following the cursor, the lip covering the top of windows)? The answer changes which of the ideas below matter most.

Ideas from the front door (not decisions):
- **Auto-hide like the Dock.** Fully tucked at rest. It appears when the cursor pushes against the edge (or the notch) for a short delay, or when an alert the user chose arrives. Today the hidden state is manual only (⌥⇧ Space).
- **Step aside automatically.** Hide in full-screen apps, while screen sharing or recording, and in a user-made list of apps. Needs a check of what macOS lets an Electron app detect.
- **Quieter resting look.** Eyes only, no body, dimmed, fading further after a while of inactivity, no eye-following or blinking until hovered. The existing Calm personality may cover part of this.
- **Edge placement that doesn't cover app UI.** The right edge collides with scrollbars and side panels. Let the user move the tab up and down along the edge, remembered per display.
- **Notch: invisible at rest.** The chin (about 22 pt below the menu bar) covers the top center of app windows, such as browser tabs, and Wings covers menu bar items. At rest show nothing beyond the real notch; grow the chin only on hover or an alert. Wings stays optional.

## Design (Roadmap & design)
- What it does, what the user sees
- Files likely touched (flag shared files)
- Risks and open questions
- How to test

## Result (Main building)
- What was built, files changed, check results
- Branch / worktree
- Anything unfinished or uncertain
