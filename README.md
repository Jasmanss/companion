# Companion

A Mac assistant that lives tucked away at the edge of your screen while you
code. Pull it out to collect images, research designs, and run commands.

- **Tray:** drop images in from Finder or a browser, or paste them (⌘V). Click
  one to open the viewer: flip through with ← → or the filmstrip, click to
  zoom. Drag the whole stack back out in one go, or save it into a project and
  get the code to use them.
- **Chat:** ask it to find design inspiration (it screenshots whole pages, or
  just the section you asked about, into the tray and checks each shot), find
  photos, or run commands in your project. Commands always show an approval
  card first unless you've allowlisted them.
- **Always there:** it peeks out from the right edge. Click it, press ⌥ Space,
  or drag an image toward it and it slides out. Press ⌥⇧ Space (or use the
  menu bar icon) to hide it from the edge entirely and bring it back.

The product spec is in [SPEC.md](SPEC.md); character explorations are in
[`design/`](design).

## Running it

```bash
npm install
npm run dev
```

Open settings (gear icon) and add your Anthropic API key, or start the app with
`ANTHROPIC_API_KEY` set. An Unsplash access key is optional and turns on photo
search. Keys are stored encrypted in your macOS keychain.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` | Run with hot reload |
| `npm run lint` / `typecheck` / `test` | The checks CI runs |
| `npm run smoke` | Build, launch the app, screenshot the panel to `out/smoke.png`, exit |
| `npm run pack` | Build an unsigned `.app` in `dist/` |
| `npm run dist` | Build the DMG and zip in `dist/` |

## How it's built

- **Electron + electron-vite**, React and TypeScript.
- `src/main`: the edge-docked window, tray storage, saving to projects,
  command runner, settings, and the agent.
- `src/main/agent.ts`: a streaming tool-use loop on the Claude API
  (`claude-sonnet-5-5`) with web search, web fetch, and custom tools for
  screenshots, the tray, image search, and approval-gated commands. Refusals
  fall back to another model automatically (`fallbacks: "default"`).
- `src/preload`: the small, typed bridge the UI talks through.
- `src/renderer`: the peek, panel, tray, chat, and settings.

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
