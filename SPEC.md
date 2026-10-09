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

- **Tucked away:** just its eyes peek out from the right edge, dimmed and
  resting. It only takes clicks on that small peek, never on the rest of the
  screen.
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
| Listening | Pulled out, or you're typing |
| Thinking | Working on a request |
| Talking | A reply is coming in |
| Done | A task finished |
| Needs you | Waiting for approval; holds up the approval card |

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
4. **Small code jobs** (stretch for v1): "add these images to the hero
   section." Shows a diff for approval before editing anything.

---

## Projects

- Knows a list of project folders, added in settings (it suggests ones it finds
  in `~/Documents`).
- The current project is shown in the panel. Switch by name: "switch to tally."

---

## Safety

- **Every command and file edit shows an approval card** with the exact command
  or diff, unless it's on an allowlist I set (e.g. `npm test`, `git status`).
- Only works inside project folders I've added.
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
   - A "Connect to Claude Code" toggle in Settings shows the exact change, then
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

Not picked yet. Explorations live in `design/`:
- `design/faces-3d.html`: Orb, Screen, Butler bot (all with the shared face)
- `design/assistant-3d.html`: Core, Unit, Halo (faceless)
- `design/characters-3d.html`, `design/steward-3d.html`: plush directions

Leading candidates: **Butler bot** (the tray and approval card fit him
naturally) and **Screen**.

---

## Tech plan

- **App:** Electron (or Tauri) with a transparent, frameless, always-on-top
  window anchored to the right edge. The 3D character renders with Three.js
  inside it, reusing the face and state system from the design files.
- **Brain:** Claude Agent SDK (TypeScript) in the app's main process. Built-in
  tools for shell commands, files, and web search, plus custom tools:
  `add_to_tray`, `save_tray_to_project`, `screenshot_page`.
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

- Which character design Steward gets
- Right edge vs. left, and the hotkey
