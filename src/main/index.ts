import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, nativeImage, net, protocol, screen, shell, Tray } from 'electron'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { AlertView, ClaudeHookStatus, DockState, Project } from '../shared/types'
import { Agent } from './agent'
import { AlertQueue, type AlertInput } from './alerts'
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
import { downloadImage } from './fetch-image'
import type { HookPayload } from './hook-payload'
import { HookServer } from './hook-server'
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
let alerts: AlertQueue
const moods = new MoodBoard()
let moodTimer: ReturnType<typeof setTimeout> | undefined
let hookServer: HookServer | null = null

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

function setDock(state: DockState): void {
  if (!win || dock === state) return
  const wasHidden = dock === 'hidden'
  dock = state
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

async function onHookEvent(event: HookPayload): Promise<void> {
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
    await settings.setCurrentProject(folder)
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
  tray = new TrayStore(path.join(userData, 'tray'), (items) => win?.webContents.send('tray:changed', items))
  await tray.load()
  sessions = new SessionTracker({ projects: () => settings.projects() })
  alerts = new AlertQueue({ show: showAlerts })
  agent = new Agent({
    apiKey: () => settings.apiKey(),
    unsplashKey: () => settings.unsplashKey(),
    projects: () => settings.projects(),
    currentProject: () => settings.currentProject(),
    setCurrentProject: (p) => settings.setCurrentProject(p),
    allowlist: () => settings.allowlist(),
    tray,
    capturePage,
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
    // Notice when a session's approval was answered (its log moves on).
    setInterval(() => void sessions.refresh().then((changed) => changed && sendSessions()), 3000)
  }

  screen.on('display-metrics-changed', () => win?.setBounds(boundsFor(dock)))
})

app.on('second-instance', () => setDock('expanded'))
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  hookServer?.stop()
})
app.on('window-all-closed', () => app.quit())
