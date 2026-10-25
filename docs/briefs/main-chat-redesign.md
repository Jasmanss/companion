# Steward's main chat, redesigned

Status: designed

Designed 2026-10-25 on the front door's request. Four directions are drawn; the user picks one (or mixes), then it gets its go. Nothing is built.

## Ask (front door)
The user, 2026-10-25, with a screenshot of Steward's panel: "I just dont like the bullet points. No need for the hiding feature. I just dont like the way it looks. It feel off. Lets add the auto and manual near the text bar. Lets do a couple of things different. Draw up a couple of different deigns and lets see what we come up with."

What the front door asked for: three or four variations that really differ, each showing the empty state, a chat in progress (with Steward's steps and a "Ran" command), a Visual Review card waiting, and two sessions finished; keep Steward's look (the Pill, tint and frost) and the side-panel size; readable in light and dark; say what each removes or moves; a recommendation.

The live page is `design/main-chat.html` (every direction, every situation, light and dark, calm or busy desktop, Ask or Auto, Reduce Motion). It also holds the screenshot's diagnosis and the control's explanation.

## Design (Roadmap & design)

### What today's panel is (read from `src/renderer/src/App.tsx` on `origin/main`, and the screenshot)
Top to bottom: header (the Pill, the name, five icons: new chat, pin, settings, hide, tuck; the project chip with ⌘K underneath), `SessionStrip` (chips that scroll sideways), a banner, `Tray` (always shown, with a heading and an empty line), then in the body the notices, `ReviewCard`, `BriefCard`, `LeftOffCard` (a card with an X, a status line, a bulleted commit list, a quoted "Claude said"), the chat log (whose empty state is "Try:" and a bulleted list), then the `Composer` (a text box and a Send button that is grey until you type).

### What makes it feel off (the diagnosis)
1. **Everything is above the chat.** Seven blocks stack above the log. In the empty state the chat gets what is left and the ask box is far below, with dead space between.
2. **Equal weight.** An empty Tray takes as much room as a card that needs you. Nothing says "this first".
3. **Three styles of small heading** in a few inches ("Tray" bold, "Where you left off" as a card with an X, "Try:" plain), plus chips, dots, code and a quote.
4. **The same word four times.** The project name is in the header chip, the session chips, the left-off title and its status line.
5. **Bullets and clipping.** Two bulleted lists make a glass app read like a document; the session chips clip ("5m ag") and the quote is cut off.
6. **A crowded header and a dead Send.** Five same-weight icons, two of which are ways to leave (hide and tuck); a second row for the project; a grey Send; and the setting you change while working (Running commands: Ask each time or Auto) is only in Settings.

### The same in all four
- **No bullet points** anywhere. Commits, suggestions and sessions each get another form (below).
- **No hide button.** `HideIcon` and its `api.dock.hide()` button leave the header. Hiding still lives in the menu bar icon's menu ("Hide from Screen Edge", which becomes "Show at Screen Edge" while hidden; `src/main/index.ts`) and as the **Hide shortcut** (`hideFromEdge`, Settings → Shortcuts). Both exist today and are untouched. Tuck stays (the arrow and Esc).
- **Ask / Auto beside the text box.** A control for `commandMode` (`'ask' | 'auto'`, already in settings), which reads and writes the same setting as Settings → Steward → Running commands, so the two never disagree. Hover or focus shows what the mode means: **Ask each time**: every command waits for a Run click. **Auto**: safe commands (reading and searching, tests, lint) run by themselves; anything that deletes, pushes, deploys, installs or goes outside the project still asks (today's `isRisky`, which treats anything it cannot read as risky). To make Auto feel safe: an auto-run command shows "Ran automatically" with an `auto · safe` tag; and a risky one shows why it asks ("Auto is on, but pushing always asks"), so Auto never looks like a loophole.
- **Send** is a round arrow that is quiet when empty and filled when there is text, instead of a grey button.
- **The project name appears once**, in the header.
- **One heading style** for small labels (small capitals), one card look, one chip look.
- The Pill, tint, frost, light and dark and the 400-point width are unchanged.

### The four directions (each removes and moves different things)
**A. Home (a calm home with one focus card).** The panel shows the single most important thing right now, in priority order: something waiting on you, a review, finished sessions, then where you left off. Everything else is quiet.
- **Removes:** the empty Tray block (a dashed drop line), the session chips row (sessions become the focus card or one status line), the bulleted lists (a short timeline for commits, chips for suggestions), the pin button (it stays in Settings as Keep panel open), the project's second row.
- **Moves:** the mode switch into the text box (a two-part Ask | Auto); where you left off becomes the empty state's focus card; suggestions sit by the box.
- **Fixes "off":** hierarchy. The empty state has three things on screen, not seven.
- **Cost:** the smallest. The chat log and the text box stay as they are; the top changes.

**B. Chat first (status folded into the conversation).** Steward posts into the thread like a teammate: a finished session, a review, the welcome back with the last commits in the message.
- **Removes:** the whole stack above the chat (strip, banner, tray block, cards), the Try bullets (quick-reply chips above the box), pin and settings from the header (a "more" menu), the hide button.
- **Moves:** sessions, reviews, the left-off summary and images become messages; a thin "waiting on you" line is the only thing pinned above; the mode switch sits on a line above the box with a sentence beside it.
- **Fixes "off":** one place to look, in time order, one bubble style.
- **Cost:** bigger. The thread becomes a feed (message kinds, history, keeping a long feed from burying what waits).

**C. Cards (a small dashboard of equal tiles).** Sessions, review, where you left off, tray and things to try are the same card. Typing opens the chat, with the tiles folded into a one-line status bar.
- **Removes:** bullets, banners, the stacked blocks of different looks, the hide button.
- **Moves:** each block into a tile with one heading style; commits become short hash chips; the tray is three slots; the mode switch is a shield toggle inside the box.
- **Fixes "off":** consistency, and everything visible at a glance.
- **Cost:** medium. New tiles and a home-to-chat transition. The densest of the four.

**D. Command bar (the box is the hero).** The ask box is at the top with Steward in it, like Spotlight or Raycast. Below it is one list of rows grouped by what needs you. Answers open under the box.
- **Removes:** the header (its actions move to a "more" menu and keys: new chat ⌘N), every card, chip and bullet.
- **Moves:** the input to the top; the mode switch is a chip on the right of the bar.
- **Fixes "off":** fewest elements and the clearest focus.
- **Cost:** the biggest departure. The input leaves the bottom, long answers need a sticky bar, and keyboard rows need building.

### The mix of A and C (2026-10-25, from the user)
The user: "Go with C, Cards. Move the pin to Settings and use 'Ask | Auto'." and right after, "mix of a and c". **Decided:** the **pin moves to Settings** (it stays there as Keep panel open), and the control **reads "Ask | Auto"** (a two-part switch; every direction on the page now uses it, replacing C's and D's single toggle). Pick 2 and 3 below are closed. The direction is the mix. Two ways to mix are drawn at the end of the Direction row on `design/main-chat.html`, in the same four situations, light and dark, with C's one-line status bar shown while a chat is open.

**The status bar (from C, used by both mixes).** While a chat is open the cards fold into one line of three counts: `1 working`, `1 waiting` (amber when something waits on you, with a click that scrolls to it) and `0 images`. The amber chip is the only cue that something needs you, and the thread below carries the card itself (the Run or push approval).

**E. Focus plus cards.** C's cards, with A's focus card on top **only when something needs you** (a review, a waiting approval or input, a failed build). The focus card is a different, larger surface: an orange "Waiting on you" label, a warm border and the thing's full content and actions; the small cards (Sessions, Left off, Tray) sit below it. When nothing is going on the cards stand alone, exactly as in C (its empty state is C's). Finished sessions are information, not a demand, so two finished sessions are just a bigger Sessions card.
- **Removes:** bullets and the stacked blocks, the pin, the hide button; a fixed card order that ignores what matters.
- **Cost:** medium: C's tiles plus one new component (the focus card) and the rule for when it shows.
- **Weakness:** two kinds of surface to keep consistent, and the layout jumps when something starts or stops needing you. The empty state has no first thing (A's point), because the grid is flat.

**F. Cards, one promoted.** One system and one rule: the most important card grows to full width and moves to the top, with a heading, an accent border and its actions; the rest stay small, in a fixed order below. Rank: waiting on you (a review, an approval, a failed build), then finished sessions, then where you left off. There is **always** a first card, even when nothing is going on (then it is Where you left off: the branch, two commits as a short timeline and Claude's last line).
- **Removes:** bullets, the stacked blocks, the pin, the hide button, and the second kind of surface (the promoted card is just a bigger tile).
- **Cost:** the smallest of the mixes: C's tile with a promoted size and a sort.
- **Weakness:** the promoted card is not always urgent, so "bigger" can mean "most recent" rather than "needs you". The orange border and the "Waiting on you" label are what mark real urgency.

**How they differ in the four situations:** empty: E is C's grid, F promotes Where you left off. Chat in progress: identical (the status bar and the thread). Review waiting: both put the review on top (E as a focus card, F as the promoted tile), so they look alike; the difference is the rule behind them. Two finished: E is a Sessions card at the usual size, F promotes it with Open buttons.

**Recommendation for the mix: F.** One component with one rule, so there is always one clear first thing and the layout never switches between two designs. It is the least to build and the easiest to keep consistent as new kinds of card arrive (a failed build, a night report, a Watch card). Choose E only if the user wants the empty state to look exactly like C, with no first thing.

### Recommendation
**A, Home.** It fixes the hierarchy, which is what most of "off" is: one thing first, the chat untouched, and the least to build. It is also the one whose empty state looks calmest next to the notch island and Steward's reactions. Take one idea from C: the small status line (A's "1 session finished") can become a one-line bar of three counts while a chat is open. B is the friendliest but buries status in a feed and is the most work; D is the boldest and best for keyboard users, but moves the input, which every other chat does not. If the user wants everything visible at once, C is the pick.

### Where hiding lives (answer to the user's item 2)
Only the button leaves. The menu bar icon menu and the Hide shortcut remain, as does the Settings shortcut recorder. Nothing in `presence.ts` or the dock changes.

### Phasing (once a direction is picked)
1. **Common changes** (any direction): remove the hide button, round Send, the Ask / Auto control wired to `commandMode`, the "Ran automatically" and "why it asks" labels, the one heading style. A small first PR.
2. **The layout** of the picked direction: the focus card or thread or tiles, the timeline and chips replacing bullets. One or two PRs.
3. **Polish by hand:** light and dark over a busy desktop, Reduce Motion, notch and moved panel, the island and the panel looking like one family.
Built by Main building (it owns the panel and the notch), each phase on the user's go.

### Files likely touched
- **Shared files (small, additive; list them in each Result):** `src/shared/types.ts` (nothing new for phase 1: `commandMode` exists), `src/preload/index.ts` (nothing new: settings update exists), `src/renderer/src/App.tsx` (header, order of blocks, the focus card), `src/renderer/src/styles.css`.
- **Changed:** `src/renderer/src/Chat.tsx` (`Composer`, the empty state, the auto-run and approval cards), `SessionStrip.tsx`, `Tray.tsx`, `LeftOffCard.tsx`, `ReviewCard.tsx`, `BriefCard.tsx`, `icons.tsx` (shield and hand icons), `Settings.tsx` (the same `commandMode`, in step).
- **Not touched:** the dock and presence code (hiding), the notch island, the agent and its commands, `isRisky`.

### Risks and open questions
1. **Auto must stay trustworthy.** The control makes the switch one click away. The labels (what ran by itself, why something asks) are what keep it from feeling like a loophole; `isRisky` stays the only judge and any command it cannot read still asks. A hand test with real risky commands is required.
2. **Taking things away.** Pin leaves the header in A, B and C; tray and the strip become less prominent. The user should say if any of those matter more than they look.
3. **Empty-state space.** A is calm because it is spare; the dead space under the focus card might feel too empty to the user. The suggestion chips sit by the box to anchor the bottom.
4. **B and D change habits** (a feed; an input at the top). They are drawn so the user can see them, not because they are low risk.
5. **The reactions and island work** share the same Pill and moods; the panel header Pill does not change size in A (64 by 54) and shrinks a little in B, C and D (52 by 44, 48 by 41, 44 by 37), which hand testing should confirm still reads.
6. Motion and feel are hand-tested only.

### For the user to pick (none blocks anything)
1. **Which direction:** A (recommended), B, C, D, or a mix (for example A with C's status bar).
2. **Pin:** move into Settings only, as Keep panel open (as drawn in A, B and C), or keep it in the header?
3. **Ask / Auto wording:** "Ask | Auto" as drawn, or longer ("Ask each time | Auto")?

### How to test
- **Unit:** the control reads and writes `commandMode` and stays in step with Settings; nothing runs in Ask; in Auto a safe command runs and each risky kind still asks (the existing `isRisky` tests); the focus-card priority (waiting > review > finished sessions > left off > nothing) for A.
- **Smoke (hidden):** the header has no hide button; the control exists beside the box; toggling it changes the setting; an auto-run row says "Ran automatically"; a risky command shows the card and its reason.
- **By hand:** all four situations in light and dark over a busy desktop, Reduce Motion, notch and a moved panel, a real Auto run, a real risky command.

## Result (Main building)
Not started.
