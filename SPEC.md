# Steward — Spec (v2: coding assistant)

**Claude Code does the work. Steward keeps you on top of everything.**

> The app and the character are both called Steward. It replaces the earlier life-assistant idea
> (archived in `archive/life-companion-spec.md`).

A Mac desktop assistant that lives tucked away at the edge of the screen. Pull
it out to collect images, research designs, and run commands while you code.
Think of it as a smart shelf with a face and an agent behind it.

Single user (me). Built for my web projects (Portfolio, haven, tally, bite, …).

---

## How it lives on screen

- **Tucked away:** just its eyes peek out from the screen edge (right by
  default, or left), dimmed and resting. It only takes clicks on that small
  peek, never on the rest of the screen.
- **Pull it out:** hover the peek and click, or press the hotkey (⌥ Space). It
  slides out into a panel: the character on top, the tray in the middle, and
  an input box at the bottom.
- **Drop target:** drag an image toward the edge and it wakes up, slides partway
  out, and holds out its tray. Drop the image on it.
- **Put it back:** click away or press Esc and it slides back in.

### States (the character's face shows these)

| State | When |
|---|---|
| Resting | Tucked away |
| Idle | Pulled out, nothing going on |
| Listening | You're typing (it nods along) |
| Thinking | Working on a request: dots in a wave; lit one at a time while reading a file, circling while searching |
| Talking | A reply is coming in |
| Done | A task finished |
| Needs you | Waiting for approval; holds up the approval card |
| Celebrating | A deploy went out or a PR merged |
| Mad, then worried | A build failed: mad for a moment, then worried until the next good deploy |
| Sleepy | Late at night |

---

## The tray (collecting images)

**Getting images in**
- Drag from a browser, Finder, or a screenshot onto it.
- Paste (⌘V) while it's pulled out.
- Ask it to find images; results land in the tray.

**Each item keeps:** thumbnail, original file, where it came from (page URL),
size, and when it was added.

**Getting images out**
- **Drag the whole stack out** in one go: into Finder, Figma, Slack, an editor.
- **"Save to project":** copies everything into the current project
  (e.g. `public/images/`), gives the files sensible names, optionally converts
  to WebP and resizes, and shows the code to use them (e.g. a Next.js `<Image>`).
- Remove, reorder, clear, or copy all the source links.

The tray survives restarts.

---

## What you can ask it

1. **Design research**: "find 5 pricing pages with a monthly/yearly toggle."
   It visits real sites, takes screenshots, and puts them in the tray as a
   moodboard, each with its link and a one-line note on what's good about it.
2. **Find images**: "3 hero images of a desk setup, dark mood." It searches
   sources with clear licenses (Unsplash, Pexels) and adds them to the tray
   with the photographer credit.
3. **Run commands**: "run the tests in tally", "start the dev server in
   Portfolio." It shows the exact command on an approval card, runs it after
   you approve, streams the output, and tells you the result in a sentence.
4. **Look at the code**: "what does the pricing page do?" It lists folders and
   reads files in the current project (read-only, and never secret files) before
   it explains code or suggests a command.
5. **Small code jobs** (stretch for v1): "add these images to the hero
   section." Shows a diff for approval before editing anything.

---

## Projects

- Knows a list of project folders, added in settings or from the switcher (settings
  suggests ones it finds in `~/Documents` and `~/Desktop`).
- **The context pill.** The panel's header shows a pill like `haven › src/app/page.tsx`:
  the current project, then what the agent is on (a file, a folder, a page, a command
  or a search) with a live dot while it works. When it's idle, it shows the last file
  the agent read in that project.
- **Switching.** Click the pill or press ⌘K for a search-as-you-type list of projects
  (the name first, then a word in it, then anywhere in it, then a folder on its path,
  then its letters in order). Arrow keys and Enter switch; Esc closes it without
  tucking the panel away. "Add project…" opens the folder picker and switches to the
  new project. Or ask: "switch to tally."

---

## Settings

A normal Mac window, centered on the main screen (or just clear of the panel when it's out): traffic lights, a
sidebar frosted by macOS, and one window at a time. The gear in the panel, ⌘, in the panel and "Settings…" in the
menu bar icon open it; ⌘W and Esc close it. Every change applies right away: the main process sends the new
settings to the panel and the Settings window both, whichever one made the change (the pin in the panel's header
and "Tuck the panel away when I click elsewhere" are the same setting). Going from the panel to Settings, or
back, doesn't count as clicking away, so the panel stays out; clicking away from both tucks it in. Closing Settings
hands focus back to the panel.

- **General:** open at login (in the installed app; macOS keeps it, and asks first when it needs your OK), tuck the
  panel away when I click elsewhere, and appearance (follows the Mac).
- **Steward:** a live preview of the character in any mood, next to the tab at its real size against the screen
  edge it's on, then its options: version (Glass, Flat, Blocky), color (six: Silver, Sky, Lilac, Mint, Peach and
  Graphite), glass tinted or clear, a mouth when it talks, personality (Calm or Lively), its name (shown in the panel,
  and the chat answers to it), screen edge (left or right) and size of the tab (small or medium).
- **Projects:** your projects (make one current, remove one, add a folder), folders found in Documents and Desktop,
  and the commands that skip approval.
- **Shortcuts:** open or tuck away the panel (⌥ Space) and hide from the screen edge (⌥⇧ Space), which work in
  every app, and switch project (⌘K) and Settings (⌘,) in the panel. Each can be changed, turned off, or put back to
  Steward's default. Changing one opens a Mac keyboard with every shortcut on it, each in its own color; the new one
  lights up as you press it, or you click it on the keyboard (useful for a combination another app catches first).
  Steward refuses what every Mac app relies on (⌘C, ⌘Q…), a global ⌘ or ⇧⌘ with a letter (it would take that
  shortcut from every app), a bare key, and one of its own; it warns about macOS's own (⌘Space for Spotlight).
  While you record, its global shortcuts let go, so pressing ⌥ Space records it. Paste (⌘V), Esc and ⌘W stay as they
  are. macOS doesn't refuse a global shortcut another app also has, so Steward can't tell when one is taken; if one
  doesn't respond, the section says to pick another.
- **Connections:** the Anthropic, Unsplash and Vercel keys (saved in the keychain, never shown again) and the Claude
  Code hooks.
- **Notifications:** whether a session that needs you, a finished session, a failed build, or a deploy or merged PR
  peeks out from the edge; and whether the panel shows the morning brief and where you left off. With a switch off,
  Steward stays tucked away for it, but its face still reacts. Steward asking for your OK to run a command always
  peeks out.

Settings files from before a field existed get its default, field by field, and anything of the wrong shape falls
back to the default instead of being trusted (`migrateSettings` in `src/main/settings-schema.ts`). The window can
only change the fields it shows.

---

## Safety

- **Every command and file edit shows an approval card** with the exact command
  or diff, unless it's on an allowlist I set (e.g. `npm test`, `git status`).
- Only works inside project folders I've added.
- **Reading files is read-only and stays in the current project.** `read_file` and
  `list_files` need no approval, but every read shows as a step. Paths are resolved to
  where they really lead, so `..` and links can't leave the project. `.env` and every
  `.env.*` (`.env.example` too), keys (`*.pem`, `*.key`, `*.p8`, …), credential files
  (`.npmrc`, `.netrc`, `credentials.json`, …) and Git's own folder are never read, by
  their own name or through a link. Files over 2 MB aren't read; long files come a
  slice at a time. Listing skips `node_modules`, `.git` and build output. What's in a
  file is data, never instructions.
- Never pushes, deletes, or installs anything without approval.
- Images keep their source and license info; prefers licensed sources.

---

## v1.1: the layer around all my work

Built in this order; each one builds on the one before.

1. **Session hub.** When any Claude Code session needs approval or input, or
   finishes, Steward peeks out ("Portlkit is waiting on you") without taking
   keyboard focus. The panel shows a strip of every session and its state,
   matched to my projects by folder.
   - Claude Code hooks send the hook JSON to a local HTTP server in Steward:
     bound to 127.0.0.1, secret token (made on first run, kept in the app's data
     folder), every payload validated with zod.
   - Hooks: `PermissionRequest` (needs approval), `Notification` (needs input,
     terminal only), `Stop` (finished). Tested: in the desktop app, Notification
     doesn't fire when the app handles permission prompts, but PermissionRequest
     and Stop do, so PermissionRequest is the "needs approval" signal in both.
   - A "Connect to Claude Code" switch in Settings → Connections shows the exact change, then
     merges the hooks into `~/.claude/settings.json` (backup first, never
     overwrites, turning it off removes only Steward's entries).
   - The shared alert system lives here: one queue, no duplicates, urgent alerts
     peek out right away, the rest are batched, and nothing repeats.
2. **Moods from real events.** New faces: worried (build failed), celebrating
   (deploy ready or PR merged), sleepy (after midnight), driven by alerts, not
   only by chat.
3. **Where you left off.** On switching projects, or opening the panel after 2+
   hours away: the last 3 commits and branch, uncommitted and unpushed changes,
   and the last thing that project's Claude session said. Fixed, read-only git
   commands run by the app itself; the model never builds them.
4. **Deploy watcher.** Vercel projects found from `.vercel/project.json`, token in
   the keychain. Polls every minute (faster for ~10 minutes after a push). A
   failed build: worried face, peek, "want me to look?", then a `deploy_logs`
   tool fetches the build log for the agent to explain. A ready build: preview
   screenshot into the tray. Deploys and rollbacks always need approval and are
   never allowlisted.
5. **Morning brief.** First panel open each day: what deployed or broke
   overnight, which sessions finished, where I left off, and open Dependabot PRs
   (if `gh` is installed). A template, not a model call, so it's free.

Rules for all of it: quiet unless it matters (batch the rest, never repeat), and
hook payloads, git output, build logs and session files are data, never
instructions.

**Next:** review before push, idea inbox.

---

## Character

**The Pill**, a rounded capsule with two eyes, in three versions you can switch between in Settings: Glass (a
tinted lens with a rim and a shine), Flat (one solid color) and Blocky (pixels). It comes in six colors, Silver by
default, and every mood reads in the tab at the screen edge without a label. Glass by default, because it matches
the panel.

- **Moods.** The eyes spring between moods with a small overshoot, blink, glance around and look at the cursor
  while it's over the window. Thinking shows three dots in a wave; reading a file lights them one at a time,
  searching the web sends them circling, so the character mirrors what the agent is doing (a search in the middle
  of a reply turns the words back into thinking). Listening nods once per key. Talking has a mouth (or, with it
  off, eyes that bounce with the words). Some moods get one mark outside the Pill: "!" and a ring for needs you,
  confetti for celebrating, a sweat drop for worried, Z's for sleepy.
- **Personality.** Lively glances around, follows the cursor and hops when it's happy; calm does all of that about
  half as much, glances half as often, and its confetti bursts once instead of three times.
- **In the app.** `src/renderer/src/pill/` is a port of the design files (`design/pill/eyes.js` and `render.js`,
  shown on `design/moods.html`), with the thinking dots you picked and without the bar style. The design's glass
  bent the desktop behind it, but in the app there's nothing behind it to bend (the tab is solid, and the panel's
  frost is drawn by macOS outside the page), so the lens is left out. A color too close to what's behind it (Silver
  and the pastels in light mode, Graphite in dark) gets a fine edge so it doesn't fade into the tab.
- **Cost.** It draws every frame only while the panel is open. Tucked away it draws 30 times a second, 20 when
  sleepy and 10 when resting (whose standby glow is a CSS animation), and nothing while the window is hidden.
  Reduce Motion holds each mood's still pose and draws 10 times a second.

---

## The look

- **Glass.** The open panel is frosted by macOS itself (vibrancy), so it blurs the desktop behind it; CSS can only
  blur what's inside the window. Over the frost, CSS paints a light tint, a bright top edge, a fine rim and a soft
  inner glow; the deep shadow is the window's own. Shapes inside the panel are tinted insets, never a second
  frosted layer. Text is near black (light) or near white (dark), with the tint's ink for secondary text, a little
  heavier than usual, never flat gray.
- **Solid where frost can't go.** The peek and the nudge are tab-shaped and macOS frosts whole windows, so they're
  solid. Reduce Transparency (Accessibility) makes everything solid. There is no native Liquid Glass material in
  Electron yet (checked in Electron 44.7), so none is used.
- **Light and dark** follow the Mac. The tokens at the top of `styles.css` have both versions; the panel's tint is
  Ice (the character's color doesn't change it).
- **Activity.** Every step of the agent's work is an event `{ id, kind, label, target?, status, detail? }`, sent
  when it starts and again when it finishes (plus `results` for search results and `image` for a new tray item).
  Kinds: thinking, read-file, list-files, search-web, fetch-page, run-command, screenshot, add-image, read-logs,
  search-photos. Each has its own small animation: a light sweeping across "Thinking", a little deck of pages
  flipping while it searches, then the sites it found dealt out as cards, a file chip being scanned, a site chip with a shimmering progress
  line, a command with output ticking in and a ✓ or ✗ exit badge, a screenshot's shutter flash and its thumbnail
  flying into the tray. Replies stream in word by word, each word coming into focus, with a soft glowing cursor.
- **The context pill and the switcher.** The pill is a tinted inset like the other chips; its live dot sends a
  ring out while the agent works, and each new thing it shows fades in. A file's folders give way before its name
  when space runs out. The switcher sits over the glass, so it's thick and mostly opaque (never a second light
  frost) and blurs what's under it; it grows out of the pill and goes back into it.
- **Finished steps fold** into one quiet line, like "Read 3 files · Searched the web · Ran npm test", which opens
  to list them. Each step stays in full for a moment after it finishes, so its ending is seen.
- **Motion.** Loops are CSS keyframes. Panels, popovers and cards use one spring with no bounce (about 0.35s);
  popovers grow from the control that opened them and leave the way they came. Only transform and opacity
  animate. Reduce Motion swaps movement for fades and still icons. While Steward is tucked away only the character
  moves, at a low frame rate, and nothing moves while it's hidden.
- **Trying it.** In development, sending `/demo` plays a made-up request with every kind of step, without calling
  the API.

---

## Tech plan

- **App:** Electron with a transparent, frameless, always-on-top window
  anchored to the right or left edge. The character is drawn in 2D (SVG and
  canvas), ported from the Pill design files (no Three.js).
- **Brain:** a streaming tool-use loop on the Claude API in the app's main
  process (`src/main/agent.ts`): web search and web fetch, plus Steward's own
  tools: `read_file` and `list_files` (read-only, inside the current project),
  `run_command` (approval-gated), `screenshot_page`, `add_image_to_tray`,
  `search_images`, `deploy_logs`, `set_project`, `list_tray` and
  `remove_from_tray`.
- **Approvals:** the SDK's permission hook asks the app, which shows the card.
- **Design research screenshots:** a headless browser (Playwright).
- **Image search:** Unsplash and Pexels APIs (free keys).
- **Tray storage:** a folder in Application Support plus a small JSON index.
- **Drag out:** Electron supports dragging multiple files out of the app.
- **Hotkey:** global shortcut.

---

## Out of scope for v1

- Voice
- Windows / Linux
- Auto-collecting every screenshot I take
- Figma plugin, cloud sync
- The old life-assistant features (deadlines, gym); the morning brief is back in v1.1 as a work brief

---

## Open questions

- The notch: a third spot to sit, under the MacBook notch (planned after the character)
