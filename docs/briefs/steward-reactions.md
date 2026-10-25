# Steward's reactions: a face that follows the chats

Status: designed

Designed 2026-10-24 on the front door's request. Waits for the user's go. The live page is `design/showcase.html`, section 9 "Steward's reactions" (open `#reactions`); the model it runs is `design/pill/reactions.js`.

## Ask (front door)
The user, 2026-10-24, with a screenshot of the island (Steward's happy eyes on the left, a spinner and "2" on the right): "Since steward does monitors the chats and tells me whether they are done or not. Can we get more animations from him. Like he does different animations. Not just the happy looking dude. Like do a random loop or something, he has a focusing animation, confused animation, getting frustrated animation, all done animation. Things like that."

What the front door asked the design to cover: a reaction for each chat event, with an honest account of the signal behind each; an idle loop that is calm and never distracting; every size, including where the notch is too small; a moods table with holds and what wins; and phasing against the island phases. It also said to be exact about any new hook and how it reaches the user.

## Design (Roadmap & design)

### What exists today (read from the code on `origin/main` at `a4fc04f`)
- **Eleven moods** in the `Mood` type (`src/shared/types.ts`): resting, idle, listening, thinking, talking, done, needs-you, worried, mad, celebrating, sleepy. A twelfth, **Confused**, is drawn on `design/moods.html` but is not in the app, so nothing can set it.
- **Who sets the face.** `pickMood` in `src/renderer/src/pick-mood.ts` picks from the agent's mood, an event mood, listening, waiting and the time of night. `MoodBoard` in `src/main/moods.ts` holds event moods from deploys and CI with set hold times (celebrating 12 s, done 5 s, mad 6 s, worried 30 minutes). The notch window gets the mood through `notch:reportMood`.
- **What chats do to the face today.** Only an approval or an input request (`needs-you`) and the finished alert's mood. A chat that is simply working shows the same face as idle, and a finished chat shows the same Happy whatever the turn was. That is the "same happy dude" the user sees.
- **What Steward hears from Claude Code** (`src/main/hook-payload.ts`, `claude-settings.ts`): `PermissionRequest`, `Notification` (with `notification_type`), `Stop` (with `last_assistant_message`) and, since Visual Review, `UserPromptSubmit` (turn start; the prompt text is dropped). It does **not** hear tool errors.
- **The eyes engine** (`src/renderer/src/pill/eyes.ts`, mirrored by `design/pill/eyes.js`) is spring-driven: each mood is a set of targets (size, lid, tilt, squint, gap, happy arch, closed, look offsets, a mouth), plus a look direction, a body move and corner marks. New moods are new target sets and small hooks, not new drawing code.

### A reaction for each thing a chat can do
Details, with the full "can tell / cannot tell" text, are on the page (click a row to play it). In short:

| Reaction | Mood | New? | Signal | Holds |
|---|---|---|---|---|
| **Focusing**: narrowed eyes read along a line, a small lean in, rare blinks | `focused` | new | a turn started and no Stop yet | while a chat works |
| **Juggling**: eyes follow a ball over to the other hand, faster with three | `juggling` | new | two or more sessions working | while they work |
| **Quick nod**: one small dip, soft happy eyes | `nod` | new | Stop after a turn under 15 s | 2.5 s |
| **All done**: calm happy arches | `done` | reused | Stop after 15 s to 5 min | 5 s |
| **Proud**: two hops, chest out, one small burst of confetti | `proud` | new | Stop after 5 min or more, and no failure streak | 7 s |
| **Confused**: "?", eyes looking two ways, head rocking | `confused` | designed, not built | needs-input notification, or a Stop whose last message ends in a question | while it waits; 10 s after a question |
| **Needs you**: wide eyes, "!" and rings (pulse speeds up and eyes look to the panel after 2 minutes) | `needs-you` | reused | PermissionRequest | until answered |
| **Worried**: today's rule, deploys and CI only | `worried` | reused | deploy or CI trouble | 30 min or good news |
| **Frustrated**: lids angled, an eye roll, a sigh, a small head shake, repeating | `frustrated` | new | 3 or more tool failures in 2 minutes (new hook) | while it happens, plus 6 s |
| **Welcome back**: eyes pop wide, settle to a smile, one hop | `hello` | new | Mac goes from idle to active after 10 minutes or more | 3 s |
| **Celebrating** and **Mad** | | reused | deploys and merges, as today | 12 s, 6 s |

**What each signal can and cannot tell (the honest part):**
- **Stop is not success.** As I remember Claude Code's hooks docs, a turn the user interrupts sends no Stop (to confirm in the first task of R1), and a Stop only says Claude stopped replying. So "all done" means "it stopped and it is your turn", never "it worked". Proud steps down to the plain Happy when a failure streak was seen, so the face never cheers a mess. Without the turn-start hook (a Visual Review install that was never updated) the turn length is unknown and every finish is the plain Happy.
- **Length is not value.** A 6-minute turn is not better than a 6-second one. Proud is a mood for effort, not a verdict.
- **Confused is a guess about wording.** It is "the chat is asking you something", and a question picked out of the last message can be wrong either way (the same test as the Phase 1b "Claude says" note). It is brief on purpose.
- **Focusing and Juggling are counts and clocks.** They cannot tell thinking from a long command from stuck. Focusing is the same for all three, so it never says anything stronger than "running".
- **Frustrated needs a real signal.** Three honest sources, in order of strength:
  1. **Tool failures** (new hook, below): 3 or more in 2 minutes in one turn. Even this is only a streak: a test that fails three times while Claude fixes it is normal, so it is a mood and the alert text never says "failing".
  2. **The same chat stopping 3 times in 10 minutes**: weak. Fast back and forth is often fine.
  3. **One turn running 15 minutes**: weak. Often just a big job.
  Only (1) earns the full version. (2) and (3) earn a **milder, shorter** one (the same animation, played through once and held 6 seconds, not repeating; it is not drawn separately) or nothing. If the user does not install the hook, (2) and (3) are all there is, and the design is honest that the face is then a guess.

### The one new hook: `PostToolUseFailure`
- **Which:** `PostToolUseFailure`, which Claude Code sends when a tool call fails (named by the front door; the first task of the phase is to confirm against Claude Code's docs that it arrives from both the terminal and the desktop app, and what the payload holds, the way Visual Review confirmed `UserPromptSubmit`). No success hook is needed: a Stop clears the count.
- **What Steward keeps:** only the session id, the time and the tool's name (for a friendly name later). The error text, the tool input and anything else is dropped in the zod schema in `hook-payload.ts`, exactly as `UserPromptSubmit` drops the prompt. Error text can hold paths and secrets.
- **How it reaches the user:** as its own entry beside `REVIEW_HOOK_EVENT` in `src/main/claude-settings.ts`. Settings → Connections already shows a notice when a hook is missing; it gains "Reactions need one more hook" with the same **Update** button, which **the user clicks themselves**. Nothing is installed behind their back, and `~/.claude/settings.json` is changed only by that button, as today. The hook command is the same fire-and-forget `curl -s -m 1`, so it never slows Claude.
- **If it is not installed:** every other reaction works. Frustrated is the weak version only.

### The idle loop (calm, random, never distracting)
When nothing is going on (idle mood), Steward keeps its life from three layers:
1. **Already built in, not scheduled:** blinks every 3 to 4 s (one in five is a double), a glance every 2 to 5.5 s, and following the cursor.
2. **New, scheduled by one small function** (`idleStep`, pure, with an injected clock and random): one small action every **10 to 25 seconds**: **Ponder** (looks up and aside, head tilted), **Look around** (slowly to one side, then the other), **Small smile**. Rarely, only after 2 quiet minutes and at most once every 4 minutes: **Yawn** (a real mouth; at the notch, one slow long blink instead) and **Stretch** (grows tall, relaxes).
3. **Doze, as today:** after 5 minutes of nothing, Resting (heavy lids); after 10, Sleepy. Any event wakes it with a blink.

**Never distracting:**
- Nothing is scheduled in the 20 seconds after anything happened, and no action repeats back to back.
- Nothing runs while a chat works, a reaction plays or an alert is out. Only idle gets actions.
- **Dim when idle** (Quiet mode): once dimmed, no actions, only the slow Resting glances.
- **Reduce Motion:** the whole loop, the blinks and the glances stop. State reactions still change, each snapping to its still pose (the eye shape without movement).
- Only Steward's face moves for an idle action: the island and the panel never grow, slide or jump because of one.
- **Cost:** while no action plays the notch window redraws about 10 times a second (today's resting rate). The scheduler is a timer, not a poll, and a mood goes to the windows only when it changes.
- **A setting:** Settings → Steward, **Liveliness: Calm (default) | Quiet (blinks and glances only) | Off (only reacts)**. It is the one new setting.

### Every size (where the notch is too small)
The page shows each live (the notch at rest, the compact island, the big island, the panel header, the 50 by 44 peek tab). In short:
- **Panel header Pill (64 by 54):** everything, in full.
- **Notch at rest (peeking, about half visible):** all the eye work, body lean and a small lift, marks at peek-tab size. A hop is a 3 px lift, confetti is 4 pieces sprayed inward, and a yawn is one slow long blink.
- **Compact island (324 by 32):** Steward is lit eyes only, 14 pt. All the eye shapes and looks work, so focusing, juggling, frustrated's roll, nod, proud and hello read. **Dropped:** body moves, corner marks, the mouth, confetti. **Instead:** the mark moves to the island's right side as a glyph (`?` for a question, amber `!` for an approval as today, a small spark that pops once for proud), and the spinner and time stay.
- **Note, approval and review islands:** lit eyes in the avatar spot, about 22 pt, a little more room (the `?` and `!` can sit as a badge on the avatar's corner), eyes face the content. No body moves, mouth or confetti: the island carries the news.
- **Blocky and Glass** do the same with their own drawing; the blocky yawn is closed eyes without a mouth.

### The moods table and what wins
Twelve moods are new (six reactions: focused, juggling, frustrated, nod, proud, hello; six idle actions: ponder, lookaround, smile, yawn, stretch, slowblink), Confused finally gets a trigger, and nothing existing is redrawn. Rank, 1 wins:

1 mad (a deploy just failed, 6 s) · 2 needs-you · 3 confused · 4 celebrating · 5 proud · 6 done · 7 nod · 8 hello · 9 frustrated · 10 worried · 11 juggling · 12 focused · 13 resting and sleepy · 14 idle (and its actions).

The rule: **things that need you outrank things that just happened, which outrank things that are only going on.** A one-shot (nod, done, proud, hello) plays its hold when nothing above it is pending; if it lost to something above, it is dropped when its hold would have ended, not queued forever. Frustrated sits below the one-shots so a different chat finishing still gets its moment, and it returns after. If one of two chats struggles, Frustrated beats Juggling because it says more. `pickMood` in `design/pill/reactions.js` is the working rule; the page has a tester (set two chats, a deploy and so on and see the winner and why).

Overnight Watch's **Watching** mood (half-lidded, slow blink) slots in below worried and replaces focused, juggling and idle while a Watch is on, so a sleeping Mac's island does not look busy; needs-you, confused and mad still win.

### Phasing, and where it fits with the island
Not island Phase 5: Phase 5 is hardening and docs, and this is a feature with its own hook and setting. It is also mostly independent of the island's shape code: it changes the mood plumbing and the eyes engine, which the island and the panel both read. Recommended: **its own three small phases, built by Main building after island Phase 2 merges** (Phase 2 touches the notch window and note; this touches `pick-mood.ts`, `moods.ts` and `eyes.ts`, so they do not collide, but the compact island's glyph slot arrives with island work). It can run in parallel with island Phases 3 and 4. Feature building is busy with Visual Review and Overnight Watch, so it is not the better home.
1. **R1: Reactions from what Steward already hears.** Focusing, Juggling, the nod, Happy and Proud tiers, Confused (added to the `Mood` type), Welcome back, the needs-you escalation. `pickReaction` (pure) and a small session tracker (turn start and stop times, stops per 10 minutes), the new moods in `eyes.ts`, the glyphs in the compact island. First thing the user sees: the face follows the chats.
2. **R2: The idle loop.** The scheduler, the six actions, Settings → Steward **Liveliness**, the Dim and Reduce Motion rules.
3. **R3: Frustrated.** The `PostToolUseFailure` hook, the Connections notice, the failure counter (also used to step Proud down), the milder version for the weak signals.

Each is a draft PR into main with CI green; the user types each go into Main building.

### Files likely touched
- **Shared files (small, additive; list them in each Result):** `src/shared/types.ts` (`Mood` gains the new ids; a liveliness setting), `src/main/settings-schema.ts` (`liveliness`), `src/preload/index.ts` (nothing new for R1; the setting bridge for R2), `src/renderer/src/App.tsx` and `Settings.tsx` (the liveliness choice, the Connections notice).
- **Changed:** `src/renderer/src/pill/eyes.ts` (the new mood targets and hooks; `design/pill/eyes.js` has the working version, with `addMoods` as the extension point), `src/renderer/src/pill/glint.ts` if a mood needs a variant, `src/renderer/src/pick-mood.ts` and `src/main/moods.ts` (the rank rule, replacing today's ad hoc order), `src/main/sessions.ts` (turn timing, stops, failures), `src/main/hook-payload.ts` and `claude-settings.ts` (R3), the notch's right-side glyph code from island Phase 1 and 2, `SPEC.md`.
- **New:** `src/main/reactions.ts` (the pure rank rule and the idle scheduler, with tests), `src/main/session-activity.ts` (the tracker).
- **Not touched:** the notch shapes, the chat, Visual Review's hook beyond reading its turn times, auto mode.

### Risks and open questions
1. **Over-reading a weak signal.** A face that says "frustrated" when nothing is wrong would erode trust. Hence the hook, the milder version, short holds and no alert words.
2. **Cheering a failed turn.** Stop is not success. Proud steps down on a failure streak, and without the hook it is capped at the plain Happy for turns Steward cannot judge. A user who finds Proud over the top can turn the idle loop and hold times down; if it stays annoying the fallback is to drop Proud.
3. **Too busy.** A new mood every few seconds would be noise. The ranks, holds, the 10 to 25 s gap and the 20 quiet seconds are the controls; all are constants in one file to tune by hand.
4. **Hooks differ** between the terminal and the desktop app (SPEC notes `Notification` differs). Phase 3's first task checks `PostToolUseFailure` on both; if it does not arrive from one, frustrated is the weak version for that one.
5. **The compact island is tiny.** The glyph slot and the 14 pt eyes carry the whole reaction there. Motion and feel are hand-tested only on the real Mac; CI cannot measure them.
6. **`confused` was designed on `moods.html`** long ago and has never run in the app. It needs a hand look at the real sizes.

### Decided by the user (2026-10-24, via the front door)
The user: "Accept all four reactions defaults: the milder frustrated without the hook, keep Proud's small confetti, Calm liveliness, and Main building builds it after island Phase 2."
1. **Without the hook:** Frustrated is the milder version from the weak signals (the same animation played through once, held 6 seconds, not repeating).
2. **Proud** keeps the one small confetti burst.
3. **Liveliness** defaults to **Calm**.
4. **Who and when:** Main building builds R1 to R3 after island Phase 2 (almost done, on its last smoke run).

**Status stays `designed`** until the user types R1's go into Main building.

### How to test
- **Unit:** `pickReaction` against every rank (each row beats the one below, one-shots expire, a lost one-shot is dropped, Frustrated beats Juggling, two chats mix); the turn tiers at 14.9, 15, 299 and 300 s and with no turn start; the failure window (3 in 120 s, 2 in 120 s, a Stop clears it); stops in 10 minutes; `idleStep` with a fake clock and random (nothing in the first 20 s, no repeat, big actions after 2 quiet minutes and 4 minutes apart, none while dimmed, with reduced motion, or outside idle, the notch mapping of a yawn); the `PostToolUseFailure` payload keeps only the id, time and tool name and drops the error text and input; the Connections notice appears only when the hook is missing and a project uses reactions.
- **Smoke (`smoke-*.ts`, hidden):** post turn-start, Stop and failure events to the hook server and assert the mood reported to the notch for each; check an idle run reports no action inside 20 seconds. No real Claude Code in CI.
- **By hand:** the feel of every reaction at the panel, the notch at rest and the compact island; a real long turn for Proud; a real failing run for Frustrated; Reduce Motion; Dim when idle; an hour of idle to judge the loop.

## Result (Main building)
Not started.
