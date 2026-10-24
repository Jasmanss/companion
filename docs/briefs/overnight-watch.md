# Overnight Watch: go rest, I've got the build

Status: designed

Designed 2026-10-24 on the front door's request. Not `ready`: it waits for the user's go, and the account in "What you set up" can start now because it takes days.

## Ask (front door)
The user, 2026-10-24: "Lets start taking out the big things and then at the end we can worry about the small fixes." Overnight Watch is the second headline feature next to Visual Review (memory: headline-features-decision.md). Pitch: "Go rest, I've got the build." Combined with Visual Review: "Go rest. Wake up to what changed."

What the front door asked the design to cover: the goodnight card; what it watches (Claude Code sessions, deploys, CI); urgent versus waiting; the morning night report with Visual Review cards; the Mac-awake version first and the off-Mac part later, with what each can and cannot catch; calls and texts (provider, cost, what the user creates, where keys go, what can be built before the account exists); how it looks in the notch island; quiet mode and step aside; small build phases and where they fit; no new dependency without asking.

The design page is `design/overnight-watch.html` (a working mock: the goodnight card, the escalation ladder you can run, the island at night, the night report).

## Design (Roadmap & design)

### What the user sees
1. **Goodnight.** A "Goodnight" button in the panel (and a menu bar item, and later the island's hover) opens the **goodnight card**. It says what Steward will watch tonight, from what already exists: the sessions running now, the projects whose deploys it can see (Vercel linked), the repos whose CI it can see (GitHub through `gh`), and the phone it will call. It checks the Mac (plugged in? it cannot see the lid, so it says "keep the lid open") and offers a **test call** and **test text**. The user sets a **wake time** (default 7:30) and presses **Go rest**.
2. **The go-rest moment.** Steward says "Goodnight. I've got it.", its eyes get heavy and close, a moon appears on the island (or on the edge tab), and Steward settles. From then on it keeps the Mac awake and watches quietly. The panel shows "Watching since 23:10" with a **Stop watching** button.
3. **Overnight.** Only a few things reach the user's phone (below). Everything else is written down, not shown. On-screen alerts are held, because nobody is looking at the screen.
4. **The morning.** When the user is back at the Mac (or at the wake time), the island shows one card, "Good morning. 2 things needed you, 2 things changed.", and a click opens the **night report**. The morning brief becomes this report on days after a Watch.

### What it watches (all from things that exist; no model calls, so it costs nothing)
| Source | How | Already in the code |
|---|---|---|
| Claude Code sessions | the hooks Steward gets: approval needed, waiting for input, finished, and the new `UserPromptSubmit` from Visual Review. "Stuck" is a session that says working and has sent nothing for a long time | `SessionState` in `src/shared/types.ts`, `sessions.ts` |
| Deploys | Vercel's list for linked projects, polled as today. Failure of a **production** deploy is urgent | `deploys.ts` (`DeployInfo.state`, `target`) |
| CI | a new fixed, read-only `gh run list --branch main` per repo, every 2 minutes while Watching. A failed run on `main` is urgent | `github.ts` (`GH_COMMANDS`, the `gh` runner) |
| The Mac itself | `powerMonitor` (suspend, resume, battery, idle time) and `powerSaveBlocker`, both built into Electron | none yet |

### Urgent versus waiting
| Kind | What happens | Examples |
|---|---|---|
| **Urgent** | Calls the user. If the call was not answered by a person, texts at once. If the first call was not heard and the user has not come back to the Mac 15 minutes later, calls once more. A call a person heard is not repeated. | a **production** deploy fails; CI goes red on `main`; a session is **stuck** |
| **Waiting on you** | Texts only, once, and after that at most one reminder text per hour. | a session needs an approval; a session is waiting for your input |
| **Everything else** | Written in the night report only. No phone. | a session finished; a branch deploy failed; a deploy went out |
| **Never** | Steward never approves anything for the user, never answers a session, never runs a command. The Watch makes no model calls and runs no new commands except the fixed read-only `gh` and git ones. | |

Rules that keep it from being a nuisance or a risk:
- **Not when you are there.** If the Mac was used in the last 5 minutes (`powerMonitor.getSystemIdleTime()`), no call: the alert shows on screen as usual. Coming back to the Mac, opening the panel or tapping the island counts as "I'm here" and stops the ladder for that event.
- **Limits per night** (Settings, defaults): 3 calls, 8 texts. At the limit it stops and the report says so. A second event of the same kind in 10 minutes joins the first (one call or text, "2 sessions waiting").
- **Words only, no content.** Texts and calls say the project name, the kind of event and the time ("my-site: production deploy failed, 2:14 AM"). They never include a command, a path, a prompt, a file name, a URL or code. Commands can hold secrets.
- **Only inside the window.** Calls and texts happen only between Go rest and the wake time (or "I'm up").
- **One-way in version 1.** The user cannot reply to a text or press a key on the call. Steward has no public address to receive it (see Later). The message says what happened, and the user acts at the Mac.

**What "stuck" can mean, honestly.** Steward only hears three or four kinds of hook event, so a long test run or a big build looks exactly like a stuck session: nothing arrives for a while. A stuck call at 3 AM for a slow build would be a bad night. Recommendation: **text at 45 minutes of silence, call at 90**. The user's one-liner says stuck is urgent and calls; this keeps that, with a text first. Numbers are Settings fields. This is question 2.

### The morning: the night report
Replaces the morning brief on days after a Watch (`buildBrief` in `src/main/brief.ts` stays for other days; the new `buildNightReport` is a template too, no model). Contents, top to bottom:
1. **One line.** "Quiet night." or "2 things needed you. 2 things changed." If the Mac slept: "Steward could not see 3:10 to 6:55."
2. **Needed you.** Each event with what Steward did ("Called 2:14, rang out. Texted 2:14.") and what came after ("You opened Steward at 6:58").
3. **What changed.** Per project, the sessions that finished, with the **Visual Review card** (the before and after, Looks good, Send it back, open big) and Claude's own one-line note from Phase 1b. Pulled from the review store for reviews made after Go rest. Without Visual Review's history (Phase 2) the list still shows the sessions, just without pictures.
4. **Deploys and CI.** A small timeline, green and red.
5. **Gaps.** When the Mac slept or Steward was not running, said plainly.
6. **Counts.** Calls 1, texts 2, so the user can match the phone bill.
Kept in `<userData>/watch/` for the last 14 nights; "Clear night reports" sits next to Visual Review's clear button. Held on-screen alerts do **not** replay on wake. They are in the report, and the island shows one card instead of a pile.

### Quiet mode, step aside and the island
- **Quiet mode and step aside govern the screen, not the phone.** The phone ladder runs whatever they are set to. While Watching, on-screen peeks are held for the report. If the user is up late and stays at the Mac, they behave as built (stepped aside holds alerts and shows the menu bar dot), and the ladder does not call because the user is active.
- **At rest the island is just the notch**, as decided. Watching shows as a **moon on the menu bar item** and, on hover, the compact island: Steward half asleep on the left, "Watching · 2 working" on the right. This keeps the menu bar uncovered all night.
- **Night states of the Peeking island** (sizes from `design/showcase/peeking.js`): goodnight (the note size for 3 seconds, Steward settles, then back into the notch); hover (compact, half-lidded eyes and the count); waiting (the note size, eyes open: "Approval waiting. Texted you 1:05"); urgent (the approval size, Steward alert, a pulse and "Prod deploy failed. Calling you now" that becomes "Texted 2:15. Calling again 2:30" with **I'm here** and **Open**); morning (the review size: "Good morning. 2 needed you, 2 changed" and **Open night report**, Steward awake). On a Mac without a notch the edge tab does the same with its alert card.
- **Reduce Motion:** fade out, snap, fade in, as the island already does. A new mood, **Watching** (half-lidded eyes, a slow blink every 6 seconds), is added to `src/main/moods.ts` and the Pill.
- Depends on the island: Phase 1 of the island (draft PR #34) for the compact and hover; the larger sizes arrive with island Phases 2 and 3. Until then the Watch uses today's alert path and the mascot mood, so it does not wait for the island.

### Awake first, then off the Mac: what each phase can and cannot catch
| | Catches | Cannot catch |
|---|---|---|
| **Mac awake** (OW 1 to 4) | approvals and input waiting; a session quiet for too long; a session finished; a production deploy failing; CI red on `main` (checked every 2 minutes); calls and texts for those | anything while the Mac sleeps, the lid is closed (on battery it sleeps even with the blocker), it is off, the internet is down or Steward has quit. A slow task cannot be told from a stuck one. It sees only Claude Code on this Mac, not another machine or the web. |
| **Off the Mac** (OW 5, a GitHub Actions job) | CI failing on `main` and a failed production deploy (GitHub gets deploy results from Vercel), **even with the Mac asleep**, by calling and texting from GitHub | sessions, approvals and stuck sessions: they live on the Mac. It cannot know the user is up, so it calls once. |
| **Later, not planned** | answering a text, or approving from the phone (needs a public address to receive the reply: a small service the user would host, which is a new service and a safety question) | |
**Keeping the Mac awake:** `powerSaveBlocker` ("prevent-app-suspension") stops idle sleep for the Watch window and is released at the end. The goodnight card warns about battery and the lid. `powerMonitor` suspend and resume events make the report's "gaps" exact.

### Calls and texts
**Recommendation: Twilio**, over its plain HTTPS API from Steward's main process (the same way `deploys.ts` calls Vercel). Why: the most guides and the clearest error messages, voice and text from one account and one number, and a call can carry its words inline (no web server needed). Other providers (Telnyx, Vonage, Plivo) can do the same and may cost less. If the user wants one of them, only `phone.ts` changes.

**No new dependency.** Twilio publishes an npm package. We do not use it: `fetch` with a Basic auth header is enough for three endpoints, and a package would be a new dependency for a feature that works without. Question 4 asks the user to confirm.

**What it costs** (from Twilio's pages and third-party summaries found 2026-10-24; confirm in the console, prices change):
- One time: **about $19**. A text brand registration of $4 and a campaign vetting fee of $15 for a sole proprietor, plus whatever credit the user adds first (Twilio's minimum top-up was not confirmed; plan on about $20).
- Monthly: **about $3.15**. A US local number (about $1.15, not confirmed in my search) and $2 for the sole proprietor text campaign.
- Per use: a text about **$0.008 plus carrier fees of $0.003 to $0.005**; a call about **$0.014 a minute**, billed by the minute. A bad night (3 calls, 8 texts) is **about $0.15**. The limits above cap it.
- Set a spend alert in the Twilio console at $5 a month.

**What the user must create themselves** (no chat does this for them, and a chat never sees the keys):
1. A Twilio account (twilio.com), with a card on file and credit added. Trial accounts only reach verified numbers and add a "trial" line to messages.
2. A US phone number with Voice and SMS (a local number).
3. **US text registration (A2P 10DLC, sole proprietor).** Brand and campaign, with a US or Canadian mobile number for a one-time code. No company number (EIN) needed. **Review takes days** (a reseller says 1 to 3 business days for sole proprietors; Twilio only says it is slower than toll-free; both unverified). **Start this first.** Texts are blocked on US numbers until it is approved. Calls are not part of this registration; a call to the user's own phone should work the day the account exists (to confirm on the first test call).
4. A Twilio **API key** (Console, Account, API keys; a Standard key). Copy the key SID and the secret; the secret is shown once. A key can be revoked without touching the account, so use one instead of the main auth token.
5. The user's own mobile number, which Steward calls and texts.

**Where the keys go.** Settings → Watch, five fields: Account SID, API key SID, API secret, the Twilio number, the user's number. Typed by the user in the app, never by a chat. The secret is saved the way the Vercel token is (`safeStorage`, the macOS keychain, base64 in `settings.json`), the renderer only ever gets "saved: yes", it is never logged and never put in a report, a text or a URL. Steward talks only to `api.twilio.com`. "Remove keys" deletes them. If the off-Mac part is built, the same kind of key goes into the GitHub repository's secrets, entered by the user in GitHub (a second, separate API key is recommended so it can be revoked on its own).

**Plain-words messages** (templates, no model):
- Call, read aloud: "Steward here. The production deploy of my-site failed at 2:14 AM. I have also sent you a text."
- Text, urgent: "Steward: my-site production deploy failed 2:14 AM. Open Steward when you can."
- Text, waiting: "Steward: Claude in my-site is waiting for your OK. 1:05 AM."

**How the ladder checks "answered".** After the call is created, Steward asks Twilio for the call's status every few seconds for up to a minute. It counts as answered only if the call was `completed`, picked up by a person (Twilio's `MachineDetection` fills `answered_by`; to confirm in the spike) and lasted long enough to hear the message. Otherwise it texts. If unsure, it texts. A text after a heard call is harmless; a missed one is not.

**What can be built and tested before the account exists.** Everything but the final live check: a fake provider and a small local fake of the three Twilio endpoints for tests; the ladder with a fake clock; the Settings fields and their checks; the Watch, the log, the report, the CI source, stuck detection, the island states. The one thing only the user can do is press "Test call" with real keys. That is why OW 4 comes after OW 1 to 3, and why the account should be started now.
A text stand-in while registration is pending is possible through the Messages app on the Mac (AppleScript, an Automation permission the user grants, Mac awake only). It is not in the plan; it needs a spike. Question 3.

### Build phases (small, each a draft PR into main with CI green; the user's go typed into Feature building for each)
1. **OW 1: Goodnight and Watch.** The goodnight card, the Watch state (start, stop, wake time, "I'm up"), keep-awake with the battery warning, the event log, sleep gaps, held on-screen alerts, the Watching mood, the moon on the menu bar item. No phone, no report yet. First visible: Go rest, and a log file that fills.
2. **OW 2: The night report.** `buildNightReport`, the report view, "one card on wake", the 14 nights kept, Clear. Visual Review cards when VR Phase 2 history exists.
3. **OW 3: All the sources.** CI on `main` (the new `gh` command), production deploy failures marked urgent, stuck detection, session finished and waiting recorded, with the on-screen alerts only.
4. **OW 4: Calls and texts.** `phone.ts`, Settings → Watch with the test buttons, the ladder (idle check, call, status check, text, one more call, limits, merge), the plain-words templates. **Needs the account for its last check; start the account now.**
5. **OW 5: Off the Mac.** A GitHub Actions workflow Steward writes into a project (on request, as a file the user commits) that calls and texts on a failed run or failed production deploy, and the setup steps for repository secrets. Steward cannot put secrets there; the user does.
6. **Island night states** (the sizes above) are part of OW 1 to 4 as the island phases land; no separate phase.

**Where it fits.** The user's order is Visual Review first, then Overnight Watch. Recommendation: **Visual Review 1b and 2 first, then OW 1 to 3 (no account needed), then OW 4 when the account is ready, and Visual Review 3 and 4 after that.** Why: the night report needs Visual Review's history from Phase 2, OW 1 to 3 are quiet and safe to build while the account is being registered, and Visual Review 3 (highlights, phone width) and 4 (a spike on holding the Stop hook) are the least urgent parts. Question 5. Both are Feature building, one phase at a time.

### Files likely touched
- **Shared files (small, additive; list them in each Result):** `src/shared/types.ts` (`WatchState`, `NightReport`, the Watching mood), `src/main/settings-schema.ts` (a `watch` block: wake time, limits, stuck minutes, phone fields, the encrypted secret), `src/preload/index.ts` (watch start and stop, test call and text, the report), `src/renderer/src/App.tsx` and `Settings.tsx` (the card, Settings → Watch, the report view), `src/renderer/src/styles.css`.
- **New:** `src/main/watch.ts` (state, window, event log), `src/main/watch-ladder.ts` (the escalation, pure, with an injected clock and provider), `src/main/phone.ts` (Twilio over `fetch`, host allow-list `api.twilio.com`), `src/main/night-report.ts`, tests for each.
- **Changed:** `src/main/brief.ts` (route to the night report), `src/main/github.ts` (`GH_COMMANDS.ciMain`), `src/main/deploys.ts` (mark production failures), `src/main/alerts.ts` and `presence.ts` (hold while Watching), `src/main/moods.ts`, `src/main/index.ts` (wiring, `powerSaveBlocker`, `powerMonitor`), `SPEC.md`.
- **Not touched:** the hook payload schema beyond what Visual Review adds, the agent and its commands, auto mode.

### Risks and open questions
1. **The Mac sleeps.** The biggest hole, and it cannot be closed from inside the app. The card warns, the report says so, and the Actions part covers CI and deploys only.
2. **False alarms from "stuck".** See above; text before call, and tunable.
3. **Calls to voicemail.** Handled by "if unsure, text". Needs a real test.
4. **US text registration is slow and can be rejected once.** A rejected sole proprietor campaign needs a fix and a resubmit. Calls still work meanwhile.
5. **Escalation bugs are costly and embarrassing** (calling at 3 AM by mistake). The ladder is a pure function with a fake clock, every rule above has a test, and the first real night is a **dry run**: OW 4 ships with a "Practice night" switch that logs what it would have called and texted without sending, to be used for a week before real calls.
6. **Privacy.** The user's number and Twilio keys live on this Mac only; messages hold no code or paths. Twilio sees the number, the times and the words above.
7. **Hooks differ between the terminal and the desktop app** (SPEC notes `Notification` differs). Approval and input detection are as good as today's alerts, no better.
8. **Motion** is hand-tested only.

### Questions for the user (defaults in bold; none blocks starting OW 1)
1. **Provider:** **Twilio**, or another?
2. **Stuck:** **text at 45 minutes, call at 90**, or call at 45?
3. **Texts while registration is pending:** wait, or spike the Messages-app stand-in?
4. **Dependency:** confirm **no Twilio package**, plain `fetch`.
5. **Order:** **Visual Review 1b and 2, then Overnight Watch 1 to 3, then 4, then Visual Review 3 and 4**, or all of Visual Review first?
6. **Off-Mac:** is putting a second Twilio key in the repository's GitHub secrets acceptable?

### How to test
- **Unit:** the ladder with a fake clock and fake provider (urgent calls then texts; not answered texts; answered by a person does not; idle under 5 minutes does not call; "I'm here" stops it; the second call after 15 minutes; limits; same-kind events merge; outside the window nothing is sent); stuck detection (45 and 90 minutes, reset by any event); window end (wake time, "I'm up", the 12-hour cap); the CI parser (red, green, in progress, no runs); the night report (empty night, gaps, order, counts, held alerts); messages contain no command, path or URL; phone number checks and masking; the secret is never in a log, a settings read or a report; `phone.ts` against a local fake of `api.twilio.com` (the host guard refuses any other host).
- **Smoke:** Go rest, the Watching state, a fake event is held and logged, Stop, and the report shows it. No real phone in CI.
- **By hand:** the keep-awake and the battery warning, a real test call and text, a practice night, then one real night with a real failing deploy.

## Result (Feature building)
Not started.
