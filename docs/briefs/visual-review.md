# Visual Review: see what Claude changed

Status: ready

Set by the front door on the user's go, 2026-10-20: "Yes, start Phase 1" (and "Accept all" on the four questions). Feature building builds it, one phase at a time, with the user's go between phases.

## Ask (front door)
The user, 2026-10-20: "Lets make some actual progress... What is the next big thing?" They picked **Visual Review**, one of the two headline features (memory: headline-features-decision.md; research: memory/research/2026-10-16-winning-feature.md). Pitch: "Claude Code changes your code. Steward shows you what changed."

Their answers:
- **When:** it slides out when a Claude Code session stops after changing files in a project with a running app.
- **Which app:** the user sets the URL once per project (for example localhost:3000, in Settings → Projects). No auto-discovery in version 1.
- **Sizes:** desktop width first. Phone width in a later phase.
- **The card:** a before/after of the running page with a slider, plus Looks good / Send it back. Changed areas highlighted, a tests badge and a one-line risk line can come in later phases if they would make version 1 too big.

Questions the design had to answer from the code: where the "before" comes from, whether capture fits, what "Send it back" can really do, where it shows (quiet mode, step aside, the notch), and privacy. The answers are in the Design section.

The design page is `design/visual-review.html` (a working mock: drag the slider, try the buttons).

## Design (Roadmap & design)

### What the user sees
1. In Settings → Projects, each project gets an "App address" field (for example `http://localhost:3000`). Empty means Visual Review is off for that project. Only addresses on this Mac (localhost, 127.0.0.1, `[::1]`) are accepted. Next to it, a "Try it now" button captures the page once so the user can see that capture works before relying on it.
2. The user works with Claude Code as usual. When a session in that project stops and the running page looks different from before, Steward slides out (an alert, like "needs me") and the panel's top card shows the page **as it was** and **as it is now** with a slider.
3. Two buttons. **Looks good** marks it reviewed. **Send it back** opens a note box, then copies a ready-to-paste note for the session (the user's words, plus where the picture is saved so Claude can look at it).
4. Turns that do not change how the page looks make no card and no alert. They are kept in a history, so the user can see Steward looked.

### Where the "before" comes from (answered from the code)
- **What Steward's hooks give it today:** three events, `PermissionRequest`, `Notification` and `Stop` (`HOOK_EVENTS` in `src/main/claude-settings.ts`, the zod schema in `src/main/hook-payload.ts`). Every payload has `session_id`, `cwd`, `transcript_path` and a `prompt_id`. `Stop` also has `last_assistant_message` and `stop_hook_active`. Nothing says when a turn **starts**, and no payload lists the files that changed.
- **What is missing:** the start of the turn. Recommendation: add the `UserPromptSubmit` hook (Claude Code's docs say it receives `session_id`, `cwd`, `transcript_path`, `permission_mode` and the `prompt`). Steward should drop the prompt text in its schema (unknown fields are already dropped), so it never keeps what the user typed.
- **The before:** captured when `UserPromptSubmit` arrives, in the background. It is a few seconds of work (load plus the 1.5 s settle plus stitching), and Claude takes longer than that to read files and make its first edit, so the page is still the old one. The capture never delays Claude: the hook command returns at once, like the existing ones (`curl -m 1`, output discarded). One caution from the docs: `UserPromptSubmit` has a **30 s** default timeout and blocks the prompt, so the hook must stay fire-and-forget.
- **Fallbacks:** if the before capture failed or arrived late, use the project's last "after" if it is recent and labeled "from your last review". If the app was down at the start, show only the after, labeled.
- **Matching:** the pair is keyed by `session_id` and `prompt_id`. The project comes from `cwd` with the existing `matchProject`. Two sessions in one project can both change the page; Steward cannot tell whose change it is, and says nothing about it in version 1.
- **Existing installs:** the user's `~/.claude/settings.json` only gets the new hook when "Connect to Claude Code" is run again. Settings → Connections must notice "Visual Review needs one more hook" when a project has an address, and offer the update.
- **To check first (Phase 1, task 1):** that `UserPromptSubmit` arrives from both the terminal Claude Code and the desktop app. SPEC notes the two differ for `Notification`. If it does not arrive from one of them, the fallback above (the last after) is the plan for that one.

### Capture (answered from the code)
`src/main/screenshot.ts` already does most of it: a hidden Electron window at 1440×900, the page stitched down to 8,000 px, no new dependency. Fit and gaps:
- **Same size both times:** yes (fixed viewport). A page that got taller is shown top-aligned, with a "page is taller now" note.
- **Waiting for the dev server:** the code waits 1.5 s after load. Hot reload has usually finished at Stop, but a first compile may not have. Plan: after Stop wait up to 10 s, capturing until two captures in a row are identical.
- **Noise:** animations and transitions are switched off in the captured page (one injected line of CSS) so a spinner does not look like a change. Scroll-driven pages show their first state.
- **Long pages:** the card shows the top 16:10 of the page; a "full image" link opens it. Phase 3 jumps to the first changed area.
- **Login:** capture uses an in-memory session with no cookies (`session.fromPartition('research')`), so a page behind a login looks the same twice. Not supported in version 1; Settings says so.
- **Only one page:** one address per project, so a change on another route is missed. The address can include a path (`localhost:3000/pricing`). Several pages per project is a later phase.
- **Change gate:** compare the two pictures reduced to a small width (plain `nativeImage` resize and a bitmap compare, no dependency). A change of at least about 0.3% of pixels counts. Tune on real pages.
- **Safety:** the address comes only from Settings, never from a hook payload (payloads are data). A new guard in `capturePage` allows only loopback hosts for this feature. `capturePage` today accepts any http(s) URL for the agent's research tool, so the guard is an option, not a change to that tool.

### "Send it back": what is really possible (answered, with a recommendation)
- **Today Steward cannot talk back to a session.** Its hook commands are `curl -s -m 1 -o /dev/null` and the hook server answers `204` before it even looks at the event ("Answer first so the hook never waits on Steward").
- **What Claude Code allows** (from its hooks reference, which I read in part; the Stop section's detail about timeouts was not in what I read):
  - A `Stop` hook can return `{"decision": "block", "reason": "..."}` (or `hookSpecificOutput.additionalContext`), and Claude then **keeps working** with that text. `HTTP` hooks can return the same JSON in a 2xx body.
  - `stop_hook_active` is true while Claude is already continuing because of a stop hook. After 8 continuations in a row Claude Code ends the turn anyway.
  - The default hook timeout is 600 s, and 30 s for `UserPromptSubmit`.
- **The catch:** the note only exists after the user has looked, which is **after** `Stop` fired. To use the Stop hook for it, Steward would have to **hold the Stop hook open** until the user clicks (or a timeout). That changes how every turn ends in that project: the session sits "still running" until the user decides.
- **Recommendation:**
  1. **Version 1: copy the note.** Steward builds the message ("Visual Review of my-site: please change this. <the user's note>. What I saw: <path to the picture>"), puts it on the clipboard, and says so. Claude Code can read the image at that path. It works in the terminal and the desktop app, and it touches nothing.
  2. **Later, opt-in, per project: "Hold the session for my review".** A second Stop hook that waits for the user, with a short limit (for example 120 s, then it lets Claude stop). Only after a spike proves it behaves in both the terminal and the desktop app, and what the session looks like while it waits. Off by default.
  3. Ask Research to confirm the Stop timeout behavior before the spike; I did not read that part.

### Where it shows (quiet mode, step aside, notch)
- **It is an alert, so it reuses everything:** a new alert key prefix `review:` goes through the same queue. In `src/main/presence.ts`, `needsMe(key)` must count `review:` as "needs me", so it passes quiet mode's "Alerts that peek out" filter. In `src/main/alerts.ts`, `alertSwitch` returns no switch for `review:` (like Steward's own requests): the user turned the feature on by entering an address, so it is not hidden by "session finished" being off.
- **The plain "finished" alert is dropped** when a review alert exists for the same turn (one alert, not two). A turn with no visible change still gets its normal quiet "finished" behavior.
- **Step aside:** nothing to do. Stepped-aside Steward holds alerts and shows the menu bar dot, as built.
- **Notch:** the alert comes out of the edge today and out of the notch once notch 3b is in. Nothing here depends on it.
- **The card:** if the full card were too big for the alert, the alert is only a line ("my-site changed. Review what Claude did?"). A click opens the panel on the card. The card lives at the top of the panel like "where you left off", and the panel's project strip shows a small dot on projects with an unreviewed card.
- **Menu bar:** it counts a review like any held alert.

### Privacy and storage (answered)
- **No model, no network:** capture loads only the user's own local address. The pictures are never sent anywhere by Steward. They reach a model only if the user pastes a note that points Claude at the file.
- **Where:** `<userData>/reviews/<project>/<date-and-turn>/before.png`, `after.png` and `review.json` (the time, the address, the result of the compare).
- **How long:** the newest 10 reviews per project and nothing older than 14 days, and about 300 MB in total, oldest first. "Clear review pictures" in Settings deletes all of it. Numbers to confirm.
- **The prompt text is never stored** (see above).

### Build phases (small, each its own draft PR into main with CI green)
**Built by Feature building**, the build chat for big features (from the user, 2026-10-20: "Yes: add Feature building for the big features, starting with Visual Review once the design is done. Main building keeps the small things and the notch."). The user types each phase's go into Feature building. Main building is not involved, except that it keeps the notch work, so notch 3b (alerts below the menu bar) and this feature's alert (Phase 2) touch the same `showAlerts` path: Feature building rebases on whatever of 3b is in main by then.
1. **See it.** The address field and "Try it now"; the `UserPromptSubmit` hook (with the check that it arrives from both Claude apps) and the Connections update notice; the capture module, the compare gate, the store and its limits; the card in the panel with the slider, **Looks good** and **Send it back** (copies the note). No alert yet: the card is there when the user opens the panel. This is the first thing the user can see working.
1b. **Look closely (added 2026-10-22).** A big before and after viewer (Slide, Side by side, Flip, Fit and 100%, keys, the two decisions inside it) and a one-line "Claude says" note from the Stop hook's last message. Recommended before Phase 2. See "Phase 1b" below.
2. **Tell me.** The alert (`review:` key, "needs me", edge and notch), the dot in the menu bar and the project strip, dropping the duplicate "finished" alert, the file count (a fixed read-only git command run by the app, as `where you left off` does), and the history list. A tests badge is not in this list: Steward does not run tests and a hook does not report them, so it needs a test command set per project and is a separate later idea.
3. **See what changed.** Highlight the changed areas and jump to the first change (in the 1b viewer's "Show changes"), and desktop plus phone width (390 px).
4. **Send it back for real.** A spike on holding the Stop hook (both Claude apps, the timeout, the 8-continuation cap), then the opt-in "Hold the session for my review" setting if it behaves.
5. **More pages, and logins** (only if wanted). Several addresses per project, and a one-time "sign in" window so a login-gated app can be captured.

### Phase 1b: Look closely, a big viewer and a note on what changed (added 2026-10-22)
The user's words, after the first card worked on haven: "the visual review worked but can we get a better before and after maybe something where we can the images in full screen and maybe steward gives a small message about what changed." Design page: `design/visual-review-viewer.html` (live: click the card's picture; the modes, zoom, keys, the note options and both buttons work). Written against `origin/main` at `be57476`.

**What exists:** the card's picture is the top 16:10 of the page at about 460 by 290 points, and "Full image" only opens the after PNG in Preview (`review:openFull` → `shell.openPath`), with no before. The panel is 400 wide, so the card cannot simply be made bigger. Nothing gives a written note.

**1. The viewer (answers question 1).**
- **Not a new window and not macOS full screen.** The panel's window already has a big state: `viewing`, used by the tray's image viewer (`Viewer.tsx`, `boundsFor('viewing')`, `dock:view`), which is centered on the screen. The review viewer is the same window in that state, sized larger: the work area minus 24 points all round (about 1,460 by 930 on a MacBook Pro 14), where today's tray viewer stops at 1,100 wide. Steward photographs pages 1,440 wide, so "100%" there is the page's real pixels. A real macOS full screen is a separate Space with a slow slide, hides the app being reviewed, and Steward's windows do not belong in it.
- **How it opens:** the card's picture becomes a button (a magnifier on hover) and "Full image" becomes "Open big". `dock:view` takes a kind (`tray` or `review`) so main knows which size to use, and the page knows which viewer to draw. Esc, the X, or a click outside goes back to the panel.
- **What it shows:** the whole page, not just the top. Tall pages scroll. Three ways to compare: **Slide** (default; drag anywhere on the picture, or the arrow keys), **Side by side** (two columns that scroll together), **Flip** (click or Space toggles between Before and After, which makes small changes jump out). **Fit** (to the width) and **100%** (real pixels, scrolls sideways if needed).
- **Looks good and Send it back are inside it**, the same two actions as the card (`review.markGood`, `review.sendBack`, the same note and the same copy). After a decision it closes and the panel shows the same confirmation line. "Open in Preview" stays as a button.
- **Keys:** Esc back; ← → move the slider (Shift for more); 1 2 3 pick the mode; Space flips; Z toggles Fit and 100%; [ and ] show the other waiting reviews; wheel and ↑ ↓ scroll. Every control is also a real button for keyboard and screen reader users.
- **The pictures:** the slider data URLs on `ReviewView` are small tops of the pages. The viewer needs the full-page PNGs already on disk (`ReviewView.files`). Recommend a small read-only `review://<id>/before` and `/after` protocol, registered like `tray://` (the privileged-scheme line in `src/main/index.ts`), that serves only those files from the review store folder and refuses anything else. A page up to 8,000 px tall as a base64 data URL over IPC would be tens of megabytes. No new dependency.
- **Fits with the rest:**
  - **The panel:** as above.
  - **Notch mode:** the viewer is centered either way. The notch only matters for how the panel comes back (it drops from the notch).
  - **A moved panel (merged, movable panel Phase 1):** the viewer ignores the panel's spot. On close the panel returns to its saved spot. Feature building checks the way back does not look like a long slide; if it does, the viewer fades and the panel pops in at its spot.
  - **Phase 2's alert:** a click on it opens the panel at the card, as planned. The viewer is one more click. Opening the viewer straight from the alert can come later.
  - **Quiet mode, the pin, step aside, full-screen apps:** the same as the tray viewer today: it counts as the panel being open.
  - **Two reviews waiting:** the viewer header says "Review 1 of 2" with previous and next.

**2. The "what changed" note (answers question 2).**
- **(a) Claude's own words.** The Stop hook payload Steward already receives carries `last_assistant_message` (up to 4,000 characters, already kept by `hook-payload.ts`), and `review.turnStopped(event)` already gets the event. So the source costs nothing and reads nothing new: no transcript file is needed (`transcript_path` is there but not required). A pure function (`sayFrom`, in `src/shared/review.ts`) strips the markdown (code blocks, backticks, bold, links, list marks, headings), collapses spaces, keeps the first one or two sentences up to about 220 characters, and returns nothing if what is left is empty or only a question ("Want me to...?"). The note is stored with the review (`ReviewRecord.said`, `ReviewView.said`) and goes away with the Clear button. Shown as **"Claude says: ..."** on the card (at most two lines) and in the viewer. Its weak spot is honest: it is what Claude meant to do, not proof of what shows.
- **(b) Steward looks at the pictures.** The two photos go to the Claude API and a model writes one or two sentences. Cost: about 3,500 input tokens for two pictures (1,440 by 900 is about 1,700 tokens each) and about 100 out, so a fraction of a cent on the smallest model; this is an estimate, not measured. Privacy: the page leaves the Mac, which breaks Visual Review's promise today that it only talks to this Mac and sends nothing out. Needs an API key in Steward (the chat uses `deps.apiKey()` with the Anthropic SDK already in `package.json`; someone with only a Claude Code login has none). It says what actually shows. Shown as **"Steward sees: ..."**.
- **(c) (a) by default, (b) on a button. Recommended.** Every review gets (a), free and local. A "Describe what changed" button in the viewer asks for (b) for that one review, after one sentence: "This sends the two pictures to Anthropic with your API key." The answer is kept with the review (`ReviewRecord.seen`). The button is not shown when there is no API key. The default promise (nothing leaves the Mac) stays true. Never automatic.
- **How (b) is built (when it is):** `review:describe(id)` in main reads both PNGs, shrinks each to at most 1,568 px on the long edge with `nativeImage`, and sends one request with a short system prompt: two screenshots of the same web page, before and after; say in one or two plain sentences what looks different; do not guess about the code. A small `max_tokens` (150) and a 20 s timeout. Failure shows "Couldn't describe it" and the card is unchanged. The model is the smallest Steward can use: the ideas list already has "Haiku 5.5 for cheap jobs: check it works with Steward's tools", and this is the check. No real API call runs in CI: the unit tests use a fake client.

**3. Where it goes in the phases (answers question 3).** Recommended order: **Phase 1b now, then Phase 2 (the alert), then Phase 3, with the (b) button as a small Phase 1c after the user has lived with (a).**
- **1b before 2:** the user is reacting to the card itself right now, and the alert's whole job is to open that card. The thing it opens should be right first. The alert is useful with a bad card but not as good as with a good one.
- **Phase 3 shrinks:** its highlights (outline the changed areas) and "jump to the first change" now live in the viewer's "Show changes" button, which is on the design page, disabled, marked Phase 3. It builds on 1b instead of on a bigger card. The phone width (390 px) stays in Phase 3.
- **1c, the (b) button,** stays separate so the privacy decision is made on its own, after the user has seen how useful (a) is.
- **Alternative:** fold 1b into Phase 3. Not recommended: Phase 3 is the biggest phase, and the viewer is what the user asked for now.

**Files likely touched (1b).** Shared files, small and additive (list in the Result): `src/shared/types.ts` (`dock.view(kind)`, `ReviewView.said`), `src/preload/index.ts` (the `dock.view` argument), `src/renderer/src/App.tsx` (which viewer to draw), `src/renderer/src/styles.css`. Other: `src/shared/review.ts` (`sayFrom`), `src/main/review.ts` and `review-store.ts` (keep `said` with the record), `src/main/index.ts` (`boundsFor('viewing')` for the review kind, the `review://` protocol), `src/renderer/src/ReviewCard.tsx` (the picture as a button, the note, "Open big"), a new `src/renderer/src/ReviewViewer.tsx`, `tests/`. Not touched: `settings-schema.ts`, the hook payload schema, the notch files.

**Risks (1b).** (1) A page 8,000 px tall at 100% is a big decoded image (about 46 MB per picture); fine for two, but the viewer should show the pictures one review at a time and release them on close. (2) The `viewing` to panel return with a moved panel (above). (3) A note from (a) can be wrong or empty; it is labelled as Claude's words, and when there is none the card simply has no note. (4) Motion and feel are hand-tested only; CI cannot measure them.

**How to test (1b).** Unit: `sayFrom` (markdown stripped, two sentences at most, 220 characters, a question alone gives nothing, empty gives nothing); the `review://` handler serves only files in the store and refuses `..`, other ids and other file names; `boundsFor('viewing')` for the review kind is inside the work area. Smoke (`smoke-review.ts`): open the viewer from the card; the window's bounds are the big size; the two pictures load (`naturalWidth` is the page's width); the keys change the mode and the slider; Esc returns to the panel (and to a saved spot, if moved). By hand: haven, a real turn: open big, slide, side by side, flip, 100% on a tall page, the note, Looks good and Send it back from inside it, notch mode, a moved panel.

**For the user:** nothing blocks the start. Two calls they can overrule: the note starts with Claude's own words and the picture-reading button comes later (c), and 1b comes before the alert.

### Files likely touched
- **Shared files (small, additive; list them in the Result):**
  - `src/shared/types.ts`: `Project` gains an optional `url`; a `ReviewView` type for the card.
  - `src/main/settings-schema.ts`: project parsing keeps `url` (today it keeps only `name` and `path`, so the field would be dropped without this) and validates loopback addresses.
  - `src/preload/index.ts`: bridges for the reviews list, "Try it now", mark reviewed, and copy note.
  - `src/renderer/src/App.tsx` (the card at the top of the panel) and `src/renderer/src/Settings.tsx` (the address field, the Connections notice).
- **Other:** `src/main/claude-settings.ts` (`HOOK_EVENTS`), `src/main/hook-payload.ts` and `sessions.ts` (turn start), `src/main/screenshot.ts` (a loopback-only option, freeze-animation CSS, optional viewport), `src/main/alerts.ts` and `src/main/presence.ts` (the `review:` key), `src/main/index.ts` (wiring), `SPEC.md`.
- **New:** `src/main/review.ts` (the before/after pairing), `src/main/review-store.ts` (files and limits), `src/main/review-diff.ts` (the gate and, later, regions), and tests for each.
- **Not touched:** the research tool's own screenshot behavior, the notch, quiet mode's rules beyond the one key.

### Risks and open questions
1. **The before can be late.** If Claude edits before the before capture finishes, "before" is already partly after. The fallback (the last after) and a label cover it; the capture should start the moment the hook arrives.
2. **Server-only changes make no card.** The gate is "the page looks different", so a turn that changes only an API or tests is quiet. That is the intent, but the user should know.
3. **Dynamic pages are noisy:** carousels, dates, ads and random content can look changed every time. Frozen animations help; a per-project "ignore this area" is a later idea.
4. **Hot reload lag and dev errors:** if the page shows a build error overlay at Stop, the card shows the error. That is useful, and Phase 2 can name it.
5. **Two Claude apps, two behaviors** (hooks differ). Phase 1 verifies `UserPromptSubmit` on both before anything else is built.
6. **Hook change on existing installs** needs the user to press an update button once.
7. **Anthropic's own preview pane** (research, medium confidence) is the nearest overlap. Steward's difference is the finish-time before/after with a decision, not a preview. Worth rechecking before the site claims anything about it.

**Answered by the user (2026-10-20, via the front door): "Accept all".**
1. **One address per project**, and a path in the address is fine. Changes on other pages are missed in version 1.
2. **"Send it back" copies a note** in version 1. The real send comes later as an opt-in hold on the Stop hook (Phase 4).
3. **A card only when the page looks different.** Server-only turns stay quiet.
4. **Storage:** 10 reviews per project, 14 days, about 300 MB, with a "Clear review pictures" button.
Nothing is left open for the user. Phase 1 was started on the same day (see the Result section).

### How to test
- **Unit tests:** the compare gate (identical, tiny change, big change, different heights), retention (count, age, size), loopback-only address validation (accepts localhost and 127.0.0.1, refuses other hosts, refuses a hook-supplied URL), the `review:` key counting as "needs me" and mapping to no Notifications switch, the hook payload for `UserPromptSubmit` dropping the prompt, project parsing keeping `url`.
- **Smoke:** a tiny local server serving two versions of a page. Capture the first, serve the second, capture again, and check the gate says "changed" and the files exist. A third identical capture says "not changed". Idle CPU stays near today's numbers.
- **By hand:**
  - Phase 1: set the address, press "Try it now" and see the picture; in a real project, send Claude a prompt that changes the page, open the panel when it stops, and drag the slider.
  - With both the terminal Claude Code and the desktop app.
  - With the app not running, with the page unchanged, and with a login page.
  - Phase 2: the alert in quiet mode ("needs me" peeks out; nothing else does), full-screen step aside holding it, the notch.
- **Privacy check:** after a run, confirm the files are only under the Steward data folder, and nothing else was opened or sent.

## Result (Feature building)

### Phase 1: See it (started 2026-10-20)
The user answered "Yes, start Phase 1" and Feature building began on branch `claude/visual-review-phase-1`, with the go in its opening task. The front door set this brief's Status to `ready`.

### Phase 1 built (recorded 2026-10-20, from the front door)
Status stays `ready`: Phases 2 to 5 are not built. Built by Feature building.
- **Branch / PR:** `claude/visual-review-phase-1`, commits `bf2e67b`, `3edbe30`, `8abfc1e`, `018c4c3`, `7c49bc0`, `3ddf764`. Draft PR #26, CI running when recorded.
- **Built:**
  - The App address per project, with "Try it now".
  - The `UserPromptSubmit` hook (fire-and-forget, the prompt is dropped) and the Connections notice.
  - Capture with frozen animations, settling until two captures match, loopback only, and redirects refused.
  - The change gate at about 0.3% of one screen, counted per screen and not over the whole page, so long pages still count.
  - The store with its limits and the clear button.
  - The card with the slider, Looks good, Send it back (copies a note) and an X "Later".
- **Checks:** lint, typecheck and 351 tests (Feature building and the front door). Smoke passed on runs 3 and 4. Run 2 failed once in the notch close check right after display-change events, likely the 3a bug that notch 3b's `0bfeb17` fixes (not in main yet). Idle CPU under about 1%.
- **Spike result (Task 1):** `UserPromptSubmit` arrives from the terminal CLI (`-p`) and from the desktop app's bundled Claude Code, with the same prompt_id as Stop. The interactive terminal and a real Code tab session are not verified.
- **Not checked:** a real project and a real Claude turn by hand, dark mode, and logins.
- **Merge order:** #26 conflicts with #25 (notch 3b) in shared renderer files. #25 merges first (its CI is green), then Feature building brings main in.
- **Waiting on the user:** try Visual Review by hand, then OK the merge of #25, then #26.
- **Next:** Phase 2 (Tell me), after the user tries Phase 1. The user types that go into Feature building.

### Phase 1 fixes and a decision (recorded 2026-10-21, from the front door)
- **Fixes in** (`9b48db4` on PR #26): problems now show in the panel and in Settings, a login redirect gets a warning, and the hook notice sits under the App address. Smoke and CI pass.
- **Decided by the user:** Visual Review stays **Claude Code only**. There are no reviews for Steward's own chat.
- **Still to do:** the user tries it by hand, then OKs the merge of #26. #27 (movable panel) conflicts with it in renderer files; whichever merges second brings main in.

### Phase 1 merged (recorded 2026-10-21, from the front door)
- PR #26 was merged into main by the user: merge commit `00e2cb1`. It includes the fixes above.
- Status stays `ready`: Phases 2 to 5 are not built. **Next:** Phase 2 (Tell me, the alert), after the user's go typed into Feature building.
