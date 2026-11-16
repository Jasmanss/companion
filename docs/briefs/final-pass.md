# Final pass: the last small fixes and the hand test

Status: ready

Designed 2026-11-16 on the front door's request. **Not ready:** it becomes ready after the user's hand tests, because whatever they turn up joins it (see "Hand test first"). Nothing is built.

Set to ready by the front door on the user's go, 2026-11-16, for F1's five firm items and for F2 with the front door's three notch picks (a: leave as is; b: the amber mark opens its session; c: Island becomes the default, Chin and Wings are removed, old settings move to Island). Asked "OK my notch picks and start F1 and F2 now?", the user answered "Yes, start both". The three items that depend on the hand test, and anything the hand test finds, wait for a later F1b. Each phase is built in a fresh temporary chat the front door starts (to keep usage down), not in Main building. Web search repeating itself was fixed separately (draft PR #59).

## Ask (front door)
The user set the finish line on 2026-11-11: "Yes, park them" (Notch island Phase 5, the website, the hand tests, then one pass of the Small fixes; everything else parked). On 2026-11-16 they asked the front door to keep going ("yo continue") and want to be done soon, so this is kept small:
1. A trimmed Small fixes list: keep only what a user of the finished app would notice, or what is broken; park the rest with a one-line reason.
2. The three questions Main building raised in Notch island Phase 5 (PR #57, now merged), with the front door's picks. **The picks are not yet approved by the user.**
3. What is kept, grouped into one or two Main building phases.
4. A short hand-test checklist: 20 to 30 minutes at most, most important first, minutes for each block, skippable blocks marked.

## Design (Roadmap & design)

### The rule for this pass
One pass, then the app is done. A fix is in only if (a) a user of the finished app would notice it, or (b) something is broken or can fail a release. Everything else is parked and not looked at again unless the hand test shows it matters. Nothing new is added. Each phase is a draft PR into main with CI green.

### Hand test first (it feeds this brief)
The user runs the checklist below once. Notch island Phase 5 (#57) is merged (`7cde449`, 2026-11-16), so the notch part tests the final code. What they find is sorted by the front door into this brief ("Found in the hand test", at the bottom) and then the brief is set ready. A finding that is bigger than a small fix (anything touching a hero feature's design) is not slipped in: it comes back to Roadmap & design as its own item.

### The Small fixes list, trimmed (16 items: 8 kept, 8 parked)

**Kept: what a user would notice, or what is broken.**

| # | Item | Why it stays | Size |
|---|---|---|---|
| 1 | **Friendly names in alerts** | Checked in the code: `describePermission` (`src/main/sessions.ts`) shows the raw tool name when there is no file, url or pattern, so an alert reads `mcp__ccd_directory__propose_branch`. Make a plain line from an MCP name (server and action, spaces, no underscores) and leave `Bash`, `Edit` and the rest as they are. Unit tested. | small |
| 2 | **Rename Liveliness to Idle moves** | Settings → Steward has "Personality: Calm \| Lively" and "Liveliness: Calm \| Quiet \| Off", which read as two of the same thing. Only the label and its note change (the setting's key stays). | tiny |
| 3 | **Sessions card says "finished" while Claude is held** | A visible contradiction on a headline feature: the review card says Claude is waiting for your answer and the Sessions card says "finished just now". The session's row says "waiting for your review" with the countdown instead. | small |
| 4 | **Hold switch text is long** | Four lines in Settings. Two lines of explanation plus one small consent line ("Adds one hook to Claude Code's settings."). Also, only if trivial: the countdown line on the review card in the warm color for its last 30 seconds. | tiny |
| 5 | **release.yml does not set STEWARD_SMOKE_NOTCH** | The release workflow runs smoke without the pretend notch that CI sets, so the notch checks cannot run there (the island-only run fails with "no notch" at `src/main/index.ts`). A release build is how the app ships; one env line in `.github/workflows/release.yml`. Check first whether the full smoke fails or skips without it, and say which in the PR. | one line |
| 6 | **Hold: the terminal says "Stop hook error"** | Decided at the hand test: if Claude acts on a sent-back note as well through `additionalContext`, switch `holdAnswer` in `hook-server.ts` (one line). If not, leave it and say so on the Settings text. | one line, conditional |
| 7 | **Main chat M3: thread gets half the panel** | Decided at the hand test: only if the user finds it cramped. Fold the API key note into the status line. Otherwise drop it. | small, conditional |
| 8 | **Viewer top bar on a small screen** | Decided at the hand test: only if the seven things wrap badly on the user's own screen. Otherwise drop it. | small, conditional |

Items 6 to 8 are "look first": they cost nothing if the hand test shows nothing wrong.

**Parked, with the reason.**

| Item | Reason |
|---|---|
| Movable panel, Phase 2: screens and edges | Only matters with a second screen or a full-screen app. Notch island Phase 5 already covers the More Space notch. Hand-tested in the optional block. |
| Feature building row in CLAUDE.md | A docs line about our own chats, not the product. |
| Notch nudge: short entrance in smoke | A test flake that missed once on CI and has not come back. Reopen only if CI fails on it again. |
| Model line in Settings | Nice to have, nothing is broken without it. |
| Stray thumbnail in the Showcase | It is on a design page, not in the app or the site. |
| Haiku 5.5 for cheap jobs | A check, not a fix. Nothing in the app depends on it. |
| Visual Review: outlines at a phone's width | Real, but only in the phone-width view (an off-by-default Settings switch) on a page taller than the window. The cause is unknown and a first fix failed, so it could eat the whole pass. Reopen only if the hand test shows it on an everyday page. |
| Goodnight card: old hooks | One user, who can press Update in Settings → Connections. The card not saying so is a rough edge, not a break. |

### The three Notch island Phase 5 questions (Main building raised them in PR #57)
**The picks are the front door's. The user has not approved them yet.**

| | Question | Pick | What it means |
|---|---|---|---|
| a | With a notch message out, opening the panel by hotkey and closing it brings the card back if time is left. | **Leave as is.** | It is a rare path and the card only returns while it still has time. No change. |
| b | Clicking a settled amber mark opens the panel, but not on that session. | **Open it on that session.** | The mark means "this session needs you", so the click should land there. Goes in phase F2. |
| c | The island was meant to replace Chin and Wings, but they are still in Settings and Chin is still the default. | **Make Island the default, remove Chin and Wings, move old settings to Island.** | Goes in phase F2. See below for how far to remove. |

### The phases (two, each a draft PR into main)
**Phase F1: words and visible rough edges** (small, independent of the notch).
- Items 1 to 5 above (friendly names, Idle moves, held session wording, hold switch text, `release.yml`).
- Items 6 to 8 only if the hand test calls for them.
- Whatever the hand test turned up that is small and not in the notch (below).
- Checks: lint, typecheck, test; a unit test for the MCP names; a smoke step for the held session's row text (extend the existing hold check). Smoke is needed because Settings and the Sessions card change.

**Phase F2: the notch, one style.** **Not blocked:** #57 is merged (`7cde449`), so F2 can start on the user's go. It touches the same files #57 did (`src/shared/notch.ts`, `Notch.tsx`, `notch-island.ts`), so it builds on the merged code.
- **(b)** The amber mark opens the panel on that session.
- **(c)** `notchStyle` defaults to `island`. `migrateSettings` (in `settings-schema.ts`) moves a stored `chin` or `wings` to `island`. The Style row in Settings goes (or shows only Island). **How far to remove:** take out the Chin and Wings code and tests only where they are cleanly separate; if a path is tangled with the island, leave it unused rather than risk the notch the user just hand-tested, and list what is left in the report so it can be removed later. Update the SPEC's notch section.
- **Shared files touched, small:** `src/main/settings-schema.ts` (default and migration), `src/renderer/src/Settings.tsx` (the Style row), `src/shared/types.ts` (the style type) if the type narrows.
- Checks: lint, typecheck, test (a migration test for chin, wings, island and no value), a full smoke, and the island-only run. The notch needs one more look by the user after it lands (5 minutes, the notch block below).

**Order:** hand test, then F1, then F2 (or F2 first if the user prefers; they do not touch the same files). One go for each, typed into Main building. Expected: F1 about the size of a Visual Review phase's polish, F2 a little larger because of the migration.

### The hand-test checklist (about 25 minutes, most important first)
Run it once (#57 is merged). Say what feels off; small things go to the front door, which adds them to "Found in the hand test" below. **Skip a block marked "can skip" if you are short on time.**

| # | Block | Minutes | What to do | Skip? |
|---|---|---|---|---|
| 1 | **Main chat with your API key** (also covers the Anthropic SDK 1.3.0 that Dependabot #46 brought in, merged 2026-11-14) | 8 | Open a chat and ask something that runs a command. Watch the home fold into the one status line, click the amber count when something waits, press New chat. In **Auto**, ask for a risky command (delete a file, a push, an install): the card must still ask and say why. Try it once in light and once in dark. | No |
| 2 | **The notch** | 6 | Glass Steward over a light and a dark wallpaper (look for the fine edge on a light bar). Let a note, a long message and a failed build come up. Rest your real cursor on the notch in "Only when needed": it wakes, the eyes follow, it sleeps when you leave. With Reduce Motion on, wake and sleep it fast. | No |
| 3 | **Visual Review** | 7 | Run `claude /login` first (the terminal login expired). A real turn that changes a page, the big viewer's keys, Show changes. Turn on "Hold the session for my review", ask for a visible change in the Claude desktop app, watch the card count down, send a note back and see whether Claude acts on it. Does the Sessions card look right while held? Does the viewer's top bar fit your screen? | No |
| 4 | **The website's light page** | 2 | `npm run site:serve`, look at it in Safari and on your phone. The video section is not there yet, by design. | Can skip until the video is in |
| 5 | **Panel and notch odds and ends** | 3 | Move the panel to another spot and open it from the island, and Reduce Transparency on in the Mac's settings to see the notch go flat. | Can skip |
| 6 | **Steward's moods (R1, R2)** | 0 | No special test: glance at it the next time the Mac has been idle for a while. | Can skip |
| 7 | **Overnight Watch 1 to 3** | 0 | Needs a real night. | **Optional.** Skip it; nothing else waits on it. |

Blocks 1 to 3 are about 21 minutes. Adding 4 and 5 makes about 26.

### What is not in this pass
Nothing new. Not here: the website's video and going live (their own phases in `steward-site.md`), Overnight Watch 4 and 5, R3, Notch 3c, Idea inbox, Review before push (parked on 2026-11-11), and every parked item above.

### Risks
1. **The settings migration (F2) touches a stored file.** Every user's settings pass through `migrateSettings`. A test for each old value and for a missing one is required, and a bad value must fall back to Island, not crash.
2. **Notch code just changed.** #57 is merged but has not been hand-tested yet. F2 changes the same code, so the user's notch block comes before F2 starts, or F2 may start first if the user prefers and the notch block then tests both.
3. **Hand-test scope creep.** The rule above keeps it small: a finding that is not a small fix is a new item, not part of this pass.

### How to test
- **F1:** unit test for the MCP names; smoke step for the held session's row text; Settings strings by eye in light and dark.
- **F2:** migration tests; smoke including the island-only run; the user's 5-minute notch look.
- **Both:** lint, typecheck, test, CI green, and the front door's usual combined-branch check.

## Found in the hand test
(Empty until the user runs the checklist. The front door adds each finding here with one line, then sets the brief ready.)

## Result (Main building)
(Empty.)
