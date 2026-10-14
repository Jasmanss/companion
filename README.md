# Steward

A Mac assistant that lives tucked away at the edge of your screen while you
code. Pull it out to collect images, research designs, and run commands.

- **Tray:** drop images in from Finder or a browser, or paste them (⌘V). Click
  one to open the viewer: flip through with ← → or the filmstrip, click to
  zoom. Drag the whole stack back out in one go, or save it into a project and
  get the code to use them.
- **Chat:** ask it to find design inspiration (it screenshots whole pages, or
  just the section you asked about, into the tray and checks each shot), find
  photos, look at your project's code, or run commands in your project. It
  reads files without asking (read-only, inside the project, never `.env`,
  keys or credentials). Commands always show an approval card first unless
  you've allowlisted them.
- **Context pill:** the header shows the project and what Steward is on, like
  `haven › src/app/page.tsx`, with a live dot while it works. Click it or press
  ⌘K to switch projects (type to search, arrows and Enter) or add one.
- **Always there:** it peeks out from the right edge. Click it, press ⌥ Space,
  or drag an image toward it and it slides out. Press ⌥⇧ Space (or use the
  menu bar icon) to hide it from the edge entirely and bring it back. Change
  any of these in Settings → Shortcuts, on a keyboard that shows them all.

**v1.1: Claude Code does the work. Steward keeps you on top of everything.**

- **Session hub:** turn on Settings → Connections → Connect to Claude Code (it shows the exact
  change to `~/.claude/settings.json` first). Steward peeks out, without
  taking focus, when a session needs your approval or input, or finishes, and
  the panel shows every session's state. Hooks post to a local server on
  127.0.0.1 with a secret token kept in Steward's data folder.
- **Moods from real events:** worried when a build fails, celebrating when a
  deploy is ready or a PR is merged, sleepy after midnight.
- **Where you left off:** switching projects, or opening the panel after 2+
  hours away, shows the branch, last commits, uncommitted and unpushed changes,
  and the last thing Claude said there.
- **Deploy watcher:** add a Vercel token in Settings → Connections. Linked projects
  (`.vercel/project.json`) are checked every minute, more often after a push.
  A failed build offers "Want me to look?"; a ready one is screenshotted into
  the tray. Deploys, rollbacks and `git push` always ask first.
- **Morning brief:** the first open each day: deploys, finished sessions,
  where you left off, and open Dependabot PRs (with `gh` installed). No model
  call.

The product spec is in [SPEC.md](SPEC.md); character explorations are in
[`design/`](design).

## Running it

```bash
npm install
npm run dev
```

Open Settings (the gear in the panel, ⌘, or the menu bar icon) and add your
Anthropic API key under Connections, or start the app with `ANTHROPIC_API_KEY`
set. An Unsplash access key is optional and turns on photo search. Keys are
stored encrypted in your macOS keychain. Settings also has your projects,
shortcuts, and which alerts peek out from the edge.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Run with hot reload |
| `npm run lint` / `typecheck` / `test` | The checks CI runs |
| `npm run design` | Serve `design/` at http://127.0.0.1:4321 (or the next free port) and reload open pages when files change (including after a `git pull`). `npm run design -- <folder>` serves any other folder the same way |
| `npm run smoke` | Build, launch the app, screenshot the panel to `out/smoke.png` and the Settings window to `out/smoke-settings.png`, exit. `STEWARD_SMOKE_THEME=light` (or `dark`) forces the theme; `STEWARD_SMOKE_DEMO=1,4,9` also plays the demo request and screenshots it at those seconds; `STEWARD_SMOKE_SECTIONS=1` screenshots every Settings section |
| `npm run pack` | Build an unsigned `.app` in `dist/` |
| `npm run dist` | Build the DMG and zip in `dist/` |

In `npm run dev`, sending `/demo` in the chat plays a made-up request with every kind of step (thinking, a web
search, a page read, a folder listing, a file read, a command, a screenshot, a streamed reply) without calling the API.

## How it's built

- **Electron + electron-vite**, React and TypeScript.
- `src/main`: the edge-docked window, tray storage, saving to projects,
  command runner, the read-only file tools (`files.ts`), settings (and the
  Settings window), and the agent.
- `src/main/agent.ts`: a streaming tool-use loop on the Claude API
  (`claude-sonnet-5-5`) with web search, web fetch, and custom tools for
  reading project files, screenshots, the tray, image search, and
  approval-gated commands. Refusals
  fall back to another model automatically (`fallbacks: "default"`).
- `src/preload`: the small, typed bridge the UI talks through.
- `src/renderer`: two pages. `index.html` is the peek, panel, tray and chat;
  `settings.html` is the Settings window.

## CI/CD

- **CI** (`.github/workflows/ci.yml`), on every push to `main` and every PR:
  lint, typecheck, and unit tests on Linux, then on macOS a real build, a launch
  smoke test (the screenshot is uploaded as an artifact), and an unsigned
  package.
- **Release** (`.github/workflows/release.yml`): bump `version` in
  `package.json`, then push a matching tag:

  ```bash
  npm version patch
  git push --follow-tags
  ```

  The workflow re-runs the checks, builds the DMG and zip, and publishes them
  as a GitHub release.
- **Dependabot** opens weekly dependency PRs and monthly Actions updates.

Builds are unsigned for now, so the first time you open a downloaded copy,
right-click it and choose Open. To sign, add `MAC_CERT_P12_BASE64` and
`MAC_CERT_PASSWORD` repository secrets (needs an Apple Developer account).
