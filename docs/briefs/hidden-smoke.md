# Hidden smoke: the app check that runs without getting in the way

Status: ready

## Ask (front door)
The smoke check launches the app, which puts windows on the user's screen and takes focus. The user wants it off screen with no focus, so chats can run it without interrupting them, and never two at once. The user typed the go into the build chat **Build: hidden smoke** ([local_338811b6](#local_338811b6)) on 2026-10-21, so it is being built now.
The user's instruction: "stop all testing until the hidden smoke is finished." No chat runs a local smoke check or launches the app until this lands.
This brief was written after the build started, from the front door's message. The build chat's opening task has the user's exact answers.

## Design (Roadmap & design)
- **What it does:**
  - The smoke check runs off screen, with no focus.
  - A lock makes sure only one smoke run happens at a time, across chats.
  - On CI, a pretend notch stands in for the real one, so the notch checks run on the runner.
- **Why:** several chats build at once and each wants to run the app. Today a run can take the user's focus, and two runs at once collide (`CLAUDE.md`: "run `npm run smoke` in one session at a time").
- **Not designed here:** how the windows are kept off screen, how the lock works and how the pretend notch is built. The build chat decides.
- **Needs care:** the smoke check measures motion, and a window that never shows may not draw frames (CI already needed Chromium switches for this; see `SMOKE_OUT` in `src/main/index.ts`). Off-screen must still draw.
- **How to test:** the usual three checks, then a smoke run while the user works in another app (focus stays put), and two runs at once (the second waits or refuses). Until this lands, nobody runs one.

## Result (Build: hidden smoke)

### Built (recorded 2026-10-21, from the front door)
Built by Build: hidden smoke.
- **Branch / PR:** `claude/hidden-smoke`, commits `7562d73`, `e95b4ea`, `43d5684`, `f36be9d`, `9c3118a`, merge `9fa5f56`. Draft PR #29.
- **How it hides:** the windows are at 1% opacity, click-through and never focused, with a focus watcher that complains if anything takes focus. `--visible` shows them again to watch.
- **Also added:**
  - `STEWARD_SMOKE_NOTCH=1` on CI, a pretend notch for the runner.
  - A one-run lock that waits up to 6 minutes for another run.
  - A stay-awake hold during runs.
- **Deliberate breaks:** two were tried, and hidden mode caught both.
- **Not checked:**
  - 4 of 5 hidden runs passed. One notch-nudge check missed and has no explanation yet.
  - It has never run on a GitHub runner; the CI run on this PR is the first.
  - `release.yml` does not set the notch flag.
- **Waiting on the user:** OK the merge once CI is green. Until it merges, testing on the user's Mac stays paused. After that, chats merge main in and smoke runs hidden.
