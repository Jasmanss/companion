import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, nativeImage, net, protocol, screen, shell } from 'electron'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { DockState, Project } from '../shared/types'
import { Agent } from './agent'
import { downloadImage } from './fetch-image'
import { extensionForMime, TrayStore } from './tray-store'
import { saveImagesToProject } from './projects'
import { capturePage } from './screenshot'
import { SettingsStore } from './settings'

const PEEK = { width: 56, height: 132 }
const PANEL_WIDTH = 400
const HOTKEYS = ['Alt+Space', 'Control+Alt+Space']
const SMOKE_OUT = process.env.COMPANION_SMOKE_OUT

protocol.registerSchemesAsPrivileged([{ scheme: 'tray', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])

// The smoke check runs alongside a normal copy, with its own throwaway data.
if (SMOKE_OUT) app.setPath('userData', path.join(os.tmpdir(), 'companion-smoke'))
else if (!app.requestSingleInstanceLock()) app.quit()

let win: BrowserWindow | null = null
let dock: DockState = 'collapsed'
let pinned = false
let modalOpen = false
let draggingOut = false
let settings: SettingsStore
let tray: TrayStore
let agent: Agent

function boundsFor(state: DockState): Electron.Rectangle {
  const area = screen.getPrimaryDisplay().workArea
  if (state === 'collapsed') {
    return { x: area.x + area.width - PEEK.width, y: area.y + Math.round((area.height - PEEK.height) / 2), ...PEEK }
  }
  const height = Math.min(760, area.height - 48)
  return { x: area.x + area.width - PANEL_WIDTH - 8, y: area.y + Math.round((area.height - height) / 2), width: PANEL_WIDTH, height }
}

function setDock(state: DockState): void {
  if (!win || dock === state) return
  dock = state
  win.setBounds(boundsFor(state), true)
  if (state === 'expanded') win.focus()
  win.webContents.send('dock:state', state)
}

function toggleDock(): void {
  setDock(dock === 'expanded' ? 'collapsed' : 'expanded')
}

function createWindow(): BrowserWindow {
  const w = new BrowserWindow({
    ...boundsFor('collapsed'),
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
  w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true })
  w.once('ready-to-show', () => w.showInactive())

  // Collapse when you click away, unless something still needs the panel open.
  w.on('blur', () => {
    if (dock === 'expanded' && !pinned && !modalOpen && !draggingOut && !agent.waitingForApproval) setDock('collapsed')
  })

  // Links in chat open in the default browser; the window itself never navigates.
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  w.webContents.on('will-navigate', (event) => event.preventDefault())

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

// A plain 16x16 icon for drags whose first file has no preview (e.g. SVG).
const FALLBACK_DRAG_ICON = nativeImage.createFromBitmap(Buffer.alloc(16 * 16 * 4, 200), { width: 16, height: 16 })

function registerIpc(): void {
  ipcMain.handle('dock:expand', () => setDock('expanded'))
  ipcMain.handle('dock:collapse', () => setDock('collapsed'))
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
}

function registerHotkey(): string {
  for (const key of HOTKEYS) if (globalShortcut.register(key, toggleDock)) return key
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
  const hotkey = registerHotkey()
  settings = new SettingsStore(path.join(userData, 'settings.json'), hotkey)
  await settings.load()
  tray = new TrayStore(path.join(userData, 'tray'), (items) => win?.webContents.send('tray:changed', items))
  await tray.load()
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
      // Pop the panel open when the agent needs a decision.
      if (event.type === 'approval') setDock('expanded')
    },
  })

  // tray://<id> serves stored images to the renderer without exposing file paths.
  protocol.handle('tray', (request) => {
    const item = tray.get(new URL(request.url).hostname)
    if (!item) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(item.file).toString())
  })

  registerIpc()
  win = createWindow()
  if (SMOKE_OUT) runSmokeCheck(win, SMOKE_OUT)

  screen.on('display-metrics-changed', () => win?.setBounds(boundsFor(dock)))
})

app.on('second-instance', () => setDock('expanded'))
app.on('will-quit', () => globalShortcut.unregisterAll())
app.on('window-all-closed', () => app.quit())
