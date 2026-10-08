# Companion — v1 Spec

> Working name. The real name comes later.

A personal AI companion that texts like a chill friend and quietly keeps track
of school deadlines, side projects, and the gym. It messages first: a morning
brief, an evening wrap-up, follow-ups on things you mentioned, and a Sunday
review. You mostly just talk to it; it does the bookkeeping.

Single user (me). Timezone: America/Detroit (Eastern).

---

## Core idea: you talk, it does the bookkeeping

No forms. A normal reply like:

> finished the stats assignment, hit legs, got the imperium video half done

should, in one go:

- mark the stats assignment done
- log a gym session (note: legs)
- update Imperium's "where I left off"

Every list is visible and editable in the app, but chat is the main input.

---

## Personality: chill friend

- Texts like a friend, not an assistant. Short messages, casual, lowercase is fine.
- Light humor, celebrates wins without overdoing it.
- **Never guilt-trips.** Skipped the gym? "all good, tomorrow?" not a lecture.
- No corporate phrasing ("Great question!", "I'd be happy to help").
- Emojis rarely.
- Doesn't double-text. If you don't reply, it lets it go.

Example voice:

> morning. stats due tomorrow 11:59. gym day, you're 1/4 this week.
> imperium next step: record the demo

> nice, stats is off the list 🙌 want to push gym to tomorrow?

---

## Daily rhythm

| When | Message |
|---|---|
| **8:00am daily** | Morning brief |
| **9:00pm Mon–Sat** | Evening wrap-up |
| **9:00pm Sunday** | Sunday review (replaces that night's wrap-up) |
| **Anytime, sparingly** | Follow-ups and deadline reminders |

Typical day: 2–3 messages. Quiet hours 10:30pm–8:00am (nothing sent except
the scheduled 9pm messages already in flight).

---

## Features

### 1. School deadlines

**Getting deadlines in**
- **Moodle sync:** paste the Moodle calendar export URL once
  (Moodle → Calendar → Export calendar → get URL). Re-sync every few hours.
  New items are added automatically; changed dates update. The URL contains a
  personal token, so store it as a secret, never in the repo.
- **Text it:** "psych essay due oct 20 11:59pm"
- **Syllabus upload:** PDF or photo. It extracts every deadline and shows them
  for a quick confirm before saving.

**Reminders**
- 3 days before, 1 day before, and the morning it's due (folded into the
  morning brief when possible, so it doesn't add extra messages).
- Exams and big projects: a heads-up ~1 week out, plus "want to plan study
  time?"

**Done**
- "submitted it" in chat, or tap in the app.

### 2. Side projects

Each project has:
- **status**: active or parked
- **where I left off**
- **next step**
- **last touched** date

Behavior:
- Only **active** projects ever get mentioned. Parked ones stay quiet.
- The morning brief mentions at most one project's next step.
- If an active project hasn't been touched in 7+ days, a gentle mention, max
  once a week per project.
- Updates come mostly from the evening wrap-up conversation.

### 3. Gym

- Goal: **at least 4 sessions per week** (Mon–Sun). No fixed days.
- Log with "gym done" / "hit legs" in chat, or a tap. Optional note.
- Tracks this week's count and a weekly streak (weeks where the goal was hit).
- The morning brief shows pace ("2/4, 4 days left"). If it's getting tight
  ("1/4 and it's thursday"), it says so, once, chill.
- The evening wrap-up asks about the gym only if nothing was logged that day.

### 4. Morning brief (8:00am)

About 5 lines, never an essay. In order, only what's relevant:
1. Deadlines due today or tomorrow
2. Gym pace for the week
3. One active project's next step
4. Any follow-up that's due today
5. This week's goals (from the Sunday review), if set

### 5. Evening wrap-up (9:00pm, Mon–Sat)

- Opens with something like "how'd today go?"
- One free-form reply updates deadlines, gym, and projects.
- Asks if anything should carry over to tomorrow.
- If there's no reply, no follow-up nagging.

### 6. Follow-ups

- Picked up from conversation: "quiz tomorrow" → next day "how'd the quiz go?";
  "i'll finish it by friday" → friday check-in.
- Max **2 per day**. Never during quiet hours.
- If the timing lines up, folded into the morning brief instead of sent alone.

### 7. Sunday review (9:00pm Sunday)

- **Last week:** gym sessions vs. goal, deadlines completed, project progress.
- **Next week:** what's due, a nudge to plan gym days.
- Asks for **1–3 goals for the week**. Those show up in the daily briefs.

---

## Memory (supports everything above)

- After conversations, it saves lasting facts ("midterms are in late october",
  "prefers working out in the evening").
- Relevant facts are included when it writes messages, so it feels like it
  actually knows you.
- **Memory screen** in the app: see every fact, edit or delete any of them.

---

## App screens (v1)

1. **Chat**: the main screen.
2. **Today**: what's due, gym pace, active project next steps, today's
   follow-ups.
3. **Lists**: tabs for School, Projects, Gym. All editable.
4. **Memory**: what it knows about me.
5. **Settings**: Moodle URL, notification permissions, message times.

---

## Out of scope for v1

- Sending emails or messages on my behalf
- Anything involving money
- Acting on websites by itself
- Gmail, Google Calendar, Imperium/Mac control (later)
- Native iPhone app, voice (later)

---

## Tech plan (decided at build time)

- **App:** Next.js (App Router, TypeScript, Tailwind), installable as a PWA so
  push notifications work on iPhone once it's added to the Home Screen.
- **Hosting:** always-on server, not the MacBook.
- **Database:** Postgres. Tables roughly: `messages`, `memories`,
  `deadlines`, `projects`, `gym_logs`, `followups`, `weekly_goals`,
  `push_subscriptions`, `settings`.
- **AI:** Claude with tool use. Tools like `add_deadline`, `complete_deadline`,
  `log_gym`, `update_project`, `schedule_followup`, `save_memory`.
- **Scheduler:** a job every ~15 minutes that checks what's due (briefs,
  reminders, follow-ups, Moodle sync). Check the hosting plan's cron limits:
  free tiers may only allow daily jobs.
- **Notifications:** Web Push.
- **Auth:** single user, simple login. It holds personal data on the public
  internet, so no open endpoints.

---

## Open questions

- Name
- Visual style / how it looks
