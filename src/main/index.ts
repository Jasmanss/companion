import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, nativeImage, net, protocol, screen, shell, Tray } from 'electron'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AlertView, ClaudeHookStatus, DeployStatus, DockState, Project } from '../shared/types'
import { Agent } from './agent'
import { AlertQueue, type AlertInput } from './alerts'
import { AppState } from './app-state'
import { briefSince, buildBrief, localDate } from './brief'
import {
  CLAUDE_SETTINGS_FILE,
  hasCompanionHooks,
  hookCommand,
  hooksPreview,
  readClaudeSettings,
  withCompanionHooks,
  withoutCompanionHooks,
  writeClaudeSettings,
} from './claude-settings'
import { alwaysAsks } from './commands'
import { DeployWatcher, fetchBuildLog, type DeployChange } from './deploys'
import { downloadImage } from './fetch-image'
import { dependabotPRs, findGh, ghRunner, MergeTracker, mergedPRs, type GhRunner } from './github'
import type { HookPayload } from './hook-payload'
import { HookServer } from './hook-server'
import { whereYouLeftOff } from './left-off'
import { MoodBoard } from './moods'
import { SessionTracker } from './sessions'
import { extensionForMime, TrayStore } from './tray-store'
import { saveImagesToProject } from './projects'
import { capturePage } from './screenshot'
import { SettingsStore } from './settings'

const PEEK = { width: 56, height: 132 }
const NUDGE = { width: 340, height: 132 }
const PANEL_WIDTH = 400
const VIEWER_MAX_WIDTH = 1100
/** First free one wins. Open toggles the panel; hide takes it off the screen edge and back. */
const OPEN_HOTKEYS = ['Alt+Space', 'Control+Alt+Space']
/** Opening the panel after this long away shows where you left off. */
const AWAY_MS = 2 * 60 * 60 * 1000
const HIDE_HOTKEYS = ['Alt+Shift+Space', 'Control+Alt+Shift+Space']
const SMOKE_OUT = process.env.COMPANION_SMOKE_OUT

protocol.registerSchemesAsPrivileged([{ scheme: 'tray', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])

// The smoke check runs alongside a normal copy, with its own throwaway data.
if (SMOKE_OUT) app.setPath('userData', path.join(os.tmpdir(), 'companion-smoke'))
else if (!app.requestSingleInstanceLock()) app.quit()

let win: BrowserWindow | null = null
let menuBar: Tray | null = null
let hotkeys = { open: '', hide: '' }
let dock: DockState = 'collapsed'
let pinned = false
let modalOpen = false
let draggingOut = false
let settings: SettingsStore
let tray: TrayStore
let agent: Agent
let sessions: SessionTracker
let appState: AppState
let alerts: AlertQueue
const moods = new MoodBoard()
let moodTimer: ReturnType<typeof setTimeout> | undefined
let hookServer: HookServer | null = null
let deploys: DeployWatcher
let gh: GhRunner | null = null
const merges = new MergeTracker()

function boundsFor(state: DockState): Electron.Rectangle {
  const area = screen.getPrimaryDisplay().workArea
  if (state === 'collapsed' || state === 'hidden') {
    return { x: area.x + area.width - PEEK.width, y: area.y + Math.round((area.height - PEEK.height) / 2), ...PEEK }
  }
  if (state === 'nudge') {
    return { x: area.x + area.width - NUDGE.width, y: area.y + Math.round((area.height - NUDGE.height) / 2), ...NUDGE }
  }
  const width = state === 'viewing' ? Math.min(VIEWER_MAX_WIDTH, area.width - 120) : PANEL_WIDTH
  const height = state === 'viewing' ? area.height - 48 : Math.min(760, area.height - 48)
  return { x: area.x + area.width - width - 8, y: area.y + Math.round((area.height - height) / 2), width, height }
}

const isOpen = (state: DockState) => state === 'expanded' || state === 'viewing'

function setDock(state: DockState): void {
  if (!win || dock === state) return
  const wasHidden = dock === 'hidden'
  const wasOpen = isOpen(dock)
  dock = state
  if (wasOpen && !isOpen(state)) void appState?.update({ lastSeenAt: Date.now() })
  if (!wasOpen && isOpen(state)) onPanelOpened()
  win.webContents.send('dock:state', state)
  updateMenuBar()
  if (state === 'hidden') return win.hide()
  win.setBounds(boundsFor(state), !wasHidden)
  if (state === 'collapsed' || state === 'nudge') {
    // Peeking never takes keyboard focus, so it can't interrupt typing.
    if (!win.isVisible()) win.showInactive()
  } else {
    if (!win.isVisible()) win.show()
    win.focus()
    // Opening the panel shows any batched alerts now rather than later.
    alerts?.flush()
  }
}

function toggleDock(): void {
  setDock(dock === 'expanded' || dock === 'viewing' ? 'collapsed' : 'expanded')
}

function toggleHidden(): void {
  setDock(dock === 'hidden' ? 'collapsed' : 'hidden')
}

/** An 18pt template icon for the menu bar: a rounded screen with two eyes. */
function menuBarIcon(): Electron.NativeImage {
  const size = 36 // 18pt at 2x
  const bitmap = Buffer.alloc(size * size * 4)
  const coverage = (d: number) => Math.min(1, Math.max(0, 0.5 - d))
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const px = x + 0.5 - size / 2
      const py = y + 0.5 - size / 2
      // Rounded rectangle, 28x22 with radius 7.
      const qx = Math.abs(px) - 14 + 7
      const qy = Math.abs(py) - 11 + 7
      const box = Math.hypot(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - 7
      // Eyes are cut out of it.
      const eye = (cx: number) => (Math.hypot((px - cx) / 2.2, (py + 1) / 3.6) - 1) * 2.2
      const alpha = coverage(box) * (1 - coverage(Math.min(eye(-5.5), eye(5.5))))
      bitmap[(y * size + x) * 4 + 3] = Math.round(alpha * 255)
    }
  }
  const image = nativeImage.createFromBitmap(bitmap, { width: size, height: size, scaleFactor: 2 })
  image.setTemplateImage(true)
  return image
}

function updateMenuBar(): void {
  if (!menuBar) return
  // While hidden, the menu bar shows how many sessions are waiting on you.
  const waiting = sessions?.waitingCount() ?? 0
  menuBar.setTitle(dock === 'hidden' && waiting ? String(waiting) : '')
  menuBar.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Companion', accelerator: hotkeys.open || undefined, registerAccelerator: false, click: () => setDock('expanded') },
      dock === 'hidden'
        ? { label: 'Show at Screen Edge', accelerator: hotkeys.hide || undefined, registerAccelerator: false, click: () => setDock('collapsed') }
        : { label: 'Hide from Screen Edge', accelerator: hotkeys.hide || undefined, registerAccelerator: false, click: () => setDock('hidden') },
      { type: 'separator' },
      { label: 'Quit Companion', role: 'quit' },
    ]),
  )
}

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    ...boundsFor('collapsed'),
    // A panel floats over full-screen apps and shows on every Space.
    type: process.platform === 'darwin' ? 'panel' : undefined,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    hasShadow: false,
    resizable: false,
    movable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    acceptFirstMouse: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  w.setAlwaysOnTop(true, 'floating')
  // The app has no Dock icon (see below), so there's no process type to switch.
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  // ready-to-show doesn't always fire for transparent windows, so also show once the page loads.
  const reveal = () => {
    if (!w.isDestroyed() && !w.isVisible()) w.showInactive()
  }
  w.once('ready-to-show', reveal)
  w.webContents.once('did-finish-load', reveal)

  // Collapse when you click away, unless something still needs the panel open.
  w.on('blur', () => {
    if ((dock === 'expanded' || dock === 'viewing') && !pinned && !modalOpen && !draggingOut && !agent.waitingForApproval) setDock('collapsed')
  })

  // Links in chat open in the default browser; the window itself never navigates.
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  w.webContents.on('will-navigate', (event) => event.preventDefault())

  // In dev, surface renderer problems in the terminal.
  if (!app.isPackaged) {
    w.webContents.on('console-message', ({ level, message }) => {
      if (level === 'warning' || level === 'error') console.log(`[renderer ${level}] ${message}`)
    })
    w.webContents.on('did-fail-load', (_e, code, description, url) => console.error(`[companion] load failed: ${code} ${description} ${url}`))
    w.webContents.on('render-process-gone', (_e, details) => console.error(`[companion] renderer gone: ${details.reason}`))
  }

  if (process.env.ELECTRON_RENDERER_URL) void w.loadURL(process.env.ELECTRON_RENDERER_URL)
  else void w.loadFile(path.join(__dirname, '../renderer/index.html'))
  return w
}

async function withModal<T>(fn: () => Promise<T>): Promise<T> {
  modalOpen = true
  try {
    return await fn()
  } finally {
    modalOpen = false
  }
}

async function pickFolder(): Promise<string | null> {
  const result = await withModal(() => dialog.showOpenDialog(win!, { properties: ['openDirectory'], buttonLabel: 'Add project' }))
  return result.canceled ? null : result.filePaths[0]
}

/** Alerts that made it through the queue: peek out if tucked away; the open panel shows them itself. */
function showAlerts(list: AlertView[]): void {
  win?.webContents.send('alerts:show', list)
  if (dock === 'collapsed') setDock('nudge')
  updateMenuBar()
}

/** The first open each day shows the morning brief; coming back after a while shows where you left off. */
function onPanelOpened(): void {
  if (!appState) return
  const today = localDate(new Date())
  if (appState.lastBriefDate !== today) {
    const since = briefSince(appState.lastSeenAt, Date.now())
    void appState.update({ lastBriefDate: today })
    void showBrief(since)
    return
  }
  const project = settings.currentProject()
  if (project && Date.now() - appState.lastSeenAt >= AWAY_MS) showLeftOff(project)
}

/** Built from a template: deploys, finished sessions, where you left off, and Dependabot PRs. No model call. */
async function showBrief(since: number): Promise<void> {
  await deploys.ensureChecked().catch(() => {})
  const project = settings.currentProject()
  const [leftOff, dependabot] = await Promise.all([project ? whereYouLeftOff(project) : null, gh ? dependabotPRs(settings.projects(), gh) : null])
  win?.webContents.send('brief:show', buildBrief({ now: new Date(), since, deploys: deploys.recent(), sessions: sessions.list(), leftOff, dependabot }))
}

/** Celebrate PRs merged in your projects while Companion is running. */
async function checkMerges(): Promise<void> {
  if (!gh) return
  for (const project of settings.projects()) {
    const merged = await mergedPRs(project, gh).catch(() => null)
    if (!merged) continue
    for (const number of merges.update(project.path, merged)) {
      const pr = merged.find((m) => m.number === number)
      raise({ key: `pr-merged:${project.path}:${number}`, level: 'normal', title: `${project.name}: PR #${number} merged`, detail: pr?.title, mood: 'celebrating', scope: project.path })
    }
  }
}

function showLeftOff(project: Project): void {
  void whereYouLeftOff(project).then((card) => win?.webContents.send('leftoff:show', card))
}

/** Switching projects, from the menu or by asking, shows where you left off there. */
async function switchProject(projectPath: string | null): Promise<void> {
  const before = settings.currentProject()?.path ?? null
  await settings.setCurrentProject(projectPath)
  const after = settings.currentProject()
  if (after && after.path !== before) showLeftOff(after)
}

/** Every alert goes through here: the queue decides whether it shows, and the face picks up its mood. */
function raise(input: AlertInput): void {
  if (!alerts.push(input)) return
  moods.apply(input.mood, input.scope, Date.now())
  sendMood()
}

function sendMood(): void {
  const now = Date.now()
  win?.webContents.send('alerts:mood', moods.current(now))
  clearTimeout(moodTimer)
  const next = moods.nextChange(now)
  if (next !== null) moodTimer = setTimeout(sendMood, next - now + 50)
}

function sendSessions(): void {
  win?.webContents.send('sessions:changed', sessions.list())
  updateMenuBar()
}

/** A failed build peeks out worried and offers to look; a ready one is celebrated and screenshotted into the tray. */
function onDeployChanges(changes: DeployChange[]): void {
  for (const { kind, deploy } of changes) {
    if (kind === 'failed') {
      raise({
        key: `deploy-failed:${deploy.uid}`,
        level: 'urgent',
        title: `${deploy.project} deploy failed`,
        detail: deploy.errorMessage ?? deploy.commit ?? deploy.branch,
        mood: 'worried',
        scope: deploy.projectPath,
        action: { label: 'Want me to look?', prompt: `The ${deploy.project} deploy ${deploy.uid} failed. Read its build log with deploy_logs and tell me what broke and how to fix it.` },
      })
      continue
    }
    raise({ key: `deploy-ready:${deploy.uid}`, level: 'normal', title: `${deploy.project} deployed`, detail: deploy.url ?? undefined, mood: 'celebrating', scope: deploy.projectPath })
    if (!deploy.url) continue
    const url = `https://${deploy.url}`
    capturePage(url)
      .then((shot) =>
        tray.addBuffer(shot.png, '.png', {
          name: `${deploy.project}-deploy.png`,
          source: url,
          note: `${deploy.target ?? 'preview'} deploy${deploy.commit ? `: ${deploy.commit}` : ''}`,
        }),
      )
      .catch((err: Error) => console.error(`[companion] deploy screenshot failed: ${err.message}`))
  }
}

async function deployLogs(projectName: string, deploymentId?: string): Promise<{ deploymentId: string; log: string }> {
  const token = settings.vercelToken()
  if (!token) throw new Error('No Vercel token yet. Add one in Settings.')
  const wanted = projectName.toLowerCase()
  const link = (await deploys.linked()).find((l) => l.name.toLowerCase() === wanted || l.project.name.toLowerCase() === wanted)
  if (!link) throw new Error(`${projectName} isn't one of your projects linked to Vercel.`)
  const ours = deploys.recent().filter((d) => d.projectPath === link.project.path)
  const id = deploymentId ?? ours.find((d) => d.state === 'ERROR')?.uid ?? ours[0]?.uid
  if (!id) throw new Error(`No deployments of ${projectName} seen yet.`)
  return { deploymentId: id, log: await fetchBuildLog(id, link.orgId, token) }
}

async function onHookEvent(event: HookPayload): Promise<void> {
  // A session about to push or deploy: check deploys more often for a while.
  const command = event.hook_event_name === 'PermissionRequest' ? event.tool_input?.command : undefined
  if (typeof command === 'string' && alwaysAsks(command)) deploys.boost()
  const alert = await sessions.apply(event)
  sendSessions()
  if (alert) raise(alert)
}

const companionHookCommand = () => hookCommand(app.getPath('userData'))

async function claudeStatus(): Promise<ClaudeHookStatus> {
  const base = { connected: false, serverRunning: (hookServer?.port ?? 0) > 0, settingsFile: CLAUDE_SETTINGS_FILE }
  try {
    return { ...base, connected: hasCompanionHooks(await readClaudeSettings()) }
  } catch (err) {
    return { ...base, error: (err as Error).message }
  }
}

// A plain 16x16 icon for drags whose first file has no preview (e.g. SVG).
const FALLBACK_DRAG_ICON = nativeImage.createFromBitmap(Buffer.alloc(16 * 16 * 4, 200), { width: 16, height: 16 })

function registerIpc(): void {
  ipcMain.handle('dock:expand', () => setDock('expanded'))
  ipcMain.handle('dock:collapse', () => setDock('collapsed'))
  ipcMain.handle('dock:hide', () => setDock('hidden'))
  ipcMain.handle('dock:view', () => setDock('viewing'))
  ipcMain.handle('dock:pin', (_e, value: boolean) => {
    pinned = value
  })

  ipcMain.handle('tray:list', () => tray.list())
  ipcMain.handle('tray:addPaths', async (_e, paths: string[]) => {
    const errors: string[] = []
    for (const p of paths) await tray.addFile(p).catch((err: Error) => errors.push(err.message))
    if (errors.length) throw new Error(errors.join('\n'))
  })
  ipcMain.handle('tray:addUrl', async (_e, url: string, source?: string) => {
    const { data, ext, name } = await downloadImage(url)
    await tray.addBuffer(data, ext, { name, source: source ?? url })
  })
  ipcMain.handle('tray:addBytes', async (_e, data: Uint8Array, mime: string, name?: string) => {
    const ext = extensionForMime(mime)
    if (!ext) throw new Error("That isn't an image")
    await tray.addBuffer(Buffer.from(data), ext, { name: name || `pasted${ext}` })
  })
  ipcMain.handle('tray:remove', (_e, id: string) => tray.remove(id))
  ipcMain.handle('tray:clear', () => tray.clear())
  ipcMain.handle('tray:reveal', (_e, target: string) => shell.showItemInFolder(target))
  ipcMain.handle('tray:saveToProject', async (_e, ids: string[]) => {
    let project = settings.currentProject()
    if (!project) {
      const folder = await pickFolder()
      if (!folder) return null
      await settings.addProject(folder)
      await settings.setCurrentProject(folder)
      project = settings.currentProject()!
    }
    const items = (ids.length ? ids.map((id) => tray.get(id)) : tray.list()).filter((item) => item !== undefined)
    return saveImagesToProject(
      project.path,
      items.map((item) => {
        const { width, height } = nativeImage.createFromPath(item.file).getSize()
        return { file: item.file, name: item.name, width: width || undefined, height: height || undefined }
      }),
    )
  })
  ipcMain.on('tray:startDrag', (event, ids: string[]) => {
    const files = ids.map((id) => tray.get(id)?.file).filter((f) => f !== undefined)
    if (!files.length) return
    draggingOut = true
    const thumb = nativeImage.createFromPath(files[0])
    event.sender.startDrag({ file: files[0], files, icon: thumb.isEmpty() ? FALLBACK_DRAG_ICON : thumb.resize({ width: 64 }) })
  })
  ipcMain.on('tray:dragEnded', () => {
    draggingOut = false
  })

  ipcMain.handle('agent:send', (_e, text: string) => agent.send(text))
  ipcMain.handle('agent:approve', (_e, id: string, approved: boolean) => agent.approve(id, approved))
  ipcMain.handle('agent:cancel', () => agent.cancel())
  ipcMain.handle('agent:reset', () => agent.reset())

  ipcMain.handle('settings:get', () => settings.view())
  ipcMain.handle('settings:setApiKey', async (_e, key: string) => {
    await settings.setSecret('anthropic', key)
    return settings.view()
  })
  ipcMain.handle('settings:setUnsplashKey', async (_e, key: string) => {
    await settings.setSecret('unsplash', key)
    return settings.view()
  })
  ipcMain.handle('settings:setVercelToken', async (_e, token: string) => {
    await settings.setSecret('vercel', token)
    deploys.boost()
    return settings.view()
  })
  ipcMain.handle(
    'deploys:status',
    async (): Promise<DeployStatus> => ({
      hasToken: Boolean(settings.vercelToken()),
      linked: (await deploys.linked()).map((l) => l.name),
      lastError: deploys.lastError,
    }),
  )
  ipcMain.handle('settings:addProject', async () => {
    const folder = await pickFolder()
    if (folder) await settings.addProject(folder)
    return settings.view()
  })
  ipcMain.handle('settings:addProjectPath', async (_e, folder: string) => {
    const stat = await fs.stat(folder)
    if (!stat.isDirectory()) throw new Error('Not a folder')
    await settings.addProject(folder)
    return settings.view()
  })
  ipcMain.handle('settings:removeProject', async (_e, folder: string) => {
    await settings.removeProject(folder)
    return settings.view()
  })
  ipcMain.handle('settings:setCurrentProject', async (_e, folder: string | null) => {
    await switchProject(folder)
    return settings.view()
  })
  ipcMain.handle('settings:setAllowlist', async (_e, list: string[]) => {
    await settings.setAllowlist(list)
    return settings.view()
  })
  ipcMain.handle('settings:suggestProjects', (): Promise<Project[]> => settings.suggestProjects())
  ipcMain.handle('clipboard:writeText', (_e, text: string) => clipboard.writeText(text))

  ipcMain.handle('sessions:list', () => sessions.list())
  ipcMain.handle('sessions:dismiss', (_e, id: string) => {
    sessions.dismiss(id)
    sendSessions()
  })

  // Connecting merges Companion's hooks into ~/.claude/settings.json; the renderer shows the preview first.
  ipcMain.handle('claude:status', () => claudeStatus())
  ipcMain.handle('claude:preview', () => hooksPreview(companionHookCommand()))
  ipcMain.handle('claude:connect', async () => {
    await writeClaudeSettings(withCompanionHooks(await readClaudeSettings(), companionHookCommand()))
    return claudeStatus()
  })
  ipcMain.handle('claude:disconnect', async () => {
    await writeClaudeSettings(withoutCompanionHooks(await readClaudeSettings()))
    return claudeStatus()
  })
}

function registerHotkey(candidates: string[], action: () => void): string {
  for (const key of candidates) if (globalShortcut.register(key, action)) return key
  return ''
}

/** CI/dev check: open the panel, screenshot it, and exit 0 if it rendered. */
function runSmokeCheck(w: BrowserWindow, out: string): void {
  const fail = (why: string) => {
    console.error(`smoke: ${why}`)
    app.exit(1)
  }
  const timer = setTimeout(() => fail('timed out'), 30_000)
  w.webContents.once('did-fail-load', (_e, code, description) => fail(`load failed: ${code} ${description}`))
  w.webContents.once('did-finish-load', async () => {
    try {
      // The peek has to appear on its own, before anything asks for the panel.
      if (!w.isVisible()) return fail('window never showed')
      setDock('expanded')
      await new Promise((resolve) => setTimeout(resolve, 1500))
      const image = await w.webContents.capturePage()
      if (image.isEmpty()) return fail('panel rendered empty')
      const mounted = await w.webContents.executeJavaScript('Boolean(document.querySelector("[data-app]"))')
      if (!mounted) return fail('renderer did not mount')
      await fs.writeFile(out, image.toPNG())
      clearTimeout(timer)
      console.log(`smoke: ok -> ${out}`)
      app.exit(0)
    } catch (err) {
      fail(String(err))
    }
  })
}

app.whenReady().then(async () => {
  const userData = app.getPath('userData')
  hotkeys = { open: registerHotkey(OPEN_HOTKEYS, toggleDock), hide: registerHotkey(HIDE_HOTKEYS, toggleHidden) }
  settings = new SettingsStore(path.join(userData, 'settings.json'), hotkeys)
  await settings.load()
  appState = new AppState(path.join(userData, 'state.json'))
  await appState.load()
  tray = new TrayStore(path.join(userData, 'tray'), (items) => win?.webContents.send('tray:changed', items))
  await tray.load()
  sessions = new SessionTracker({ projects: () => settings.projects() })
  alerts = new AlertQueue({ show: showAlerts })
  deploys = new DeployWatcher({ projects: () => settings.projects(), token: () => settings.vercelToken(), onChanges: onDeployChanges })
  agent = new Agent({
    apiKey: () => settings.apiKey(),
    unsplashKey: () => settings.unsplashKey(),
    projects: () => settings.projects(),
    currentProject: () => settings.currentProject(),
    setCurrentProject: (p) => switchProject(p),
    allowlist: () => settings.allowlist(),
    tray,
    capturePage,
    deployLogs,
    onDeployCommand: () => deploys.boost(),
    emit: (event) => {
      win?.webContents.send('agent:event', event)
      // Peek out when the agent needs a decision; the approval card is in the panel.
      if (event.type === 'approval') raise({ key: `agent-approval:${event.id}`, level: 'urgent', title: 'Companion needs your OK', detail: event.command, mood: 'needs-you' })
    },
  })

  // tray://<id> serves stored images to the renderer without exposing file paths.
  protocol.handle('tray', (request) => {
    const item = tray.get(new URL(request.url).hostname)
    if (!item) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(item.file).toString())
  })

  // Like other menu bar utilities, no Dock icon: macOS only lets accessory apps float over full-screen apps.
  // The menu bar icon has Quit.
  if (process.platform === 'darwin') app.dock?.hide()

  registerIpc()
  win = createWindow()
  if (SMOKE_OUT) runSmokeCheck(win, SMOKE_OUT)
  else {
    menuBar = new Tray(menuBarIcon())
    menuBar.setToolTip('Companion')
    updateMenuBar()
    hookServer = new HookServer(userData, (event) => void onHookEvent(event))
    await hookServer.start().catch((err: Error) => {
      hookServer = null
      console.error(`[companion] hook server failed to start: ${err.message}`)
    })
    deploys.start()
    const ghPath = findGh()
    gh = ghPath ? ghRunner(ghPath) : null
    // The first check only takes note of what's merged already; after that, merges are celebrated.
    setTimeout(() => void checkMerges(), 20_000)
    setInterval(() => void checkMerges(), 5 * 60_000)
    // Notice when a session's approval was answered (its log moves on).
    setInterval(() => void sessions.refresh().then((changed) => changed && sendSessions()), 3000)
  }

  screen.on('display-metrics-changed', () => win?.setBounds(boundsFor(dock)))
})

app.on('second-instance', () => setDock('expanded'))
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  hookServer?.stop()
  deploys?.stop()
})
app.on('window-all-closed', () => app.quit())
