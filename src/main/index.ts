import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, nativeImage, nativeTheme, net, powerMonitor, protocol, screen, shell, systemPreferences, Tray } from 'electron'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { NOTCH_HOVER_LIP, NOTCH_HOVER_WINGS, NOTCH_LIP, NOTCH_WINDOW, NOTCH_WING, underNotch } from '../shared/notch'
import { checkShortcut, formatAccelerator, GLOBAL_SHORTCUTS, isGlobalShortcut, isShortcutId, normalizeAccelerator, shortcutInfo, type GlobalShortcutId } from '../shared/shortcuts'
import { TAB_SIZES } from '../shared/steward'
import { clampTop, placeFor, TabDrag, topAround, topFor } from '../shared/tab-place'
import { DIM_AFTER_MS } from '../shared/dim'
import type { AlertView, Appearance, ClaudeHookStatus, DeployStatus, DockState, Mood, NotchGeometry, PillGlint, Project, SettingsSection, SettingsView, StepAsideApp } from '../shared/types'
import { Agent } from './agent'
import { AlertQueue, withNotificationPrefs, type AlertInput } from './alerts'
import { AppState } from './app-state'
import { briefSince, buildBrief, localDate } from './brief'
import {
  backupFile,
  CLAUDE_SETTINGS_FILE,
  hookCommand,
  hookState,
  hooksPreview,
  readClaudeSettings,
  withStewardHooks,
  withoutStewardHooks,
  writeClaudeSettings,
} from './claude-settings'
import { alwaysAsks } from './commands'
import { DeployWatcher, fetchBuildLog, type DeployChange } from './deploys'
import { downloadImage } from './fetch-image'
import { dependabotPRs, findGh, ghRunner, MergeTracker, mergedPRs, type GhRunner } from './github'
import type { HookPayload } from './hook-payload'
import { HookServer } from './hook-server'
import { whereYouLeftOff } from './left-off'
import { LEGACY_APP_NAME, markSecretsDone, migrateUserData, readLegacyKeychainPassword, secretsPending } from './migrate'
import { MoodBoard } from './moods'
import { findNotch, probeScreens } from './notch'
import { NotchDock } from './notch-window'
import {
  asleep,
  EDGE_FAR_DWELL_MS,
  freshPush,
  inRect,
  MAX_HELD,
  menuBarTitle,
  nextLookMs,
  NOTCH_DWELL_MS,
  firstPeekOver,
  presenceNote,
  presenceNoteParts,
  pushAlongEdge,
  showFirstPeek,
  screenBeside,
  splitAlerts,
  stepPresence,
  TUCK_MS,
  WATCH_MS,
  type EdgePush,
  type PresenceState,
} from './presence'
import { SessionTracker } from './sessions'
import { appFromUserInfo, frontAfter, lookNow, readApp, shouldStepAside, withApp, type FrontApp } from './step-aside'
import { judgeMotion, measureMotion, type Motion, type Sample } from './smoke-motion'
import { extensionForMime, TrayStore } from './tray-store'
import { saveImagesToProject } from './projects'
import { capturePage } from './screenshot'
import { SettingsStore } from './settings'
import { parseSettingsPatch } from './settings-schema'

const NUDGE_WIDTH = 340
const PANEL_WIDTH = 400
const VIEWER_MAX_WIDTH = 1100
const SETTINGS_SIZE = { width: 720, height: 560 }
const SETTINGS_SECTIONS: SettingsSection[] = ['general', 'steward', 'projects', 'shortcuts', 'connections', 'notifications']
/** Opening the panel after this long away shows where you left off. */
const AWAY_MS = 2 * 60 * 60 * 1000
const SMOKE_OUT = process.env.STEWARD_SMOKE_OUT
/** Smoke check extras: force light or dark, and play the demo request, capturing the panel at these seconds. */
const SMOKE_THEME = process.env.STEWARD_SMOKE_THEME
const SMOKE_DEMO = process.env.STEWARD_SMOKE_DEMO
/** Smoke check extra: screenshot every section of the Settings window, not just the first. */
const SMOKE_SECTIONS = process.env.STEWARD_SMOKE_SECTIONS
/** The window goes when the page says the tab's slide out has ended (0.3 s); if it never says, it goes after this. */
const SLIDE_MS = 700
/** Why the window went, when the page's slide ended with no frame to draw its end (its own clock said so). */
const SLIDE_END_UNDRAWN = "its slide's end time, with no frame drawn"

protocol.registerSchemesAsPrivileged([{ scheme: 'tray', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } }])

// The smoke check runs alongside a normal copy, with its own throwaway data.
if (SMOKE_OUT) {
  app.setPath('userData', path.join(os.tmpdir(), 'steward-smoke'))
  // It watches animations frame by frame. On a CI runner nobody is looking at the screen, and Chromium may count the
  // windows as covered or in the background and stop drawing them; these keep a test run drawing, as browser test tools do.
  for (const s of ['disable-renderer-backgrounding', 'disable-background-timer-throttling', 'disable-backgrounding-occluded-windows']) app.commandLine.appendSwitch(s)
} else {
  // Electron names the data folder after the app, so the rename gave Steward a new one. Copy the old folder
  // (LEGACY_APP_NAME) across once, before anything (the instance lock included) creates the new one; the old one stays as a backup.
  migrateUserData(path.join(app.getPath('appData'), LEGACY_APP_NAME), app.getPath('userData'))
  if (!app.requestSingleInstanceLock()) app.quit()
}

let win: BrowserWindow | null = null
/** The Settings window, while it's open. Only ever one. */
let settingsWin: BrowserWindow | null = null
let menuBar: Tray | null = null
/** The global shortcuts macOS gave Steward, by what they do. */
let registered: Partial<Record<GlobalShortcutId, string>> = {}
/** A new shortcut is being pressed in Settings: the global ones step aside so the keys reach the window. */
let recordingShortcut = false
let dock: DockState = 'collapsed'
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
/** Steward in the MacBook notch, and where the notch is (null: no screen has one right now). */
let notch: NotchDock
let notchGeo: NotchGeometry | null = null
/** Docked in the notch: picked in Settings, and a screen has one. Otherwise it's on its edge. */
const inNotch = (): boolean => !!settings?.steward().notch && notchGeo !== null
/** The screen with the notch: the built-in one, which isn't always the main screen (an external one can be). */
const notchDisplay = (): Electron.Display => screen.getAllDisplays().find((d) => d.id === notchGeo?.displayId) ?? screen.getPrimaryDisplay()

/** Presence is "Only when needed": Steward is out of sight until a push, an alert, work or the hotkey brings it out. */
const quiet = (): boolean => settings?.steward().presence === 'quiet'
/** Where hiding stands (the "revealed" flag): out because the cursor pushed, an alert came or the agent is working. */
let presenceNow: PresenceState = asleep()
/** Steward is showing: always, or when it's been brought out. At the edge that's the tab, in the notch it's awake. */
const out = (): boolean => !quiet() || presenceNow.revealed
let watchTimer: ReturnType<typeof setTimeout> | undefined
let slideTimer: ReturnType<typeof setTimeout> | undefined
/** The window's page is slid out, off the screen edge (see setSlide). */
let slidOut = false
/** When the last tuck began, and how long until the window went and why (for the smoke check). */
let tuckStarted = 0
let lastTuck: { ms: number; why: string } | null = null
/** The screen is asleep or locked: nobody is there to push, so the cursor isn't checked. */
let screenAsleep = false
/** The smoke check feeds the rules the cursor itself, so the real one (wherever it is parked) is left out. */
const drivenBySmoke = Boolean(SMOKE_OUT)
/** The cursor the smoke check shows the notch window instead (null: far away). */
let smokeNotchCursor: Electron.Point | null = null
/** Alerts that didn't peek out, newest first: the menu bar's dot now, and cards when the panel next opens. */
let heldAlerts: AlertView[] = []
/** Stepping aside: an app fills Steward's screen, or an app on the list is in front (see step-aside.ts). */
let steppedAside = false
/** The app in front (Steward itself not counted), and the screens showing a full-screen app, as macOS last said. */
let asideFront: string | null = null
let asideFullScreenOn: number[] = []
/** Alerts that came while stepping aside, oldest first: they peek out once Steward is back. */
let asideAlerts: AlertView[] = []

/** Where the tab sits on each display's edge (dragged there; see shared/tab-place), by display id. */
let tabPlaces: Record<string, number> = {}
/**
 * The tab comes to you: a push anywhere along the edge brought it out here, at the cursor's height. Only while it's out
 * (never saved); once it has tucked away and its window has gone, it's back at its saved spot.
 */
let revealTop: number | null = null
/** The push along the edge being timed, and whether one counts yet (see pushAlongEdge). */
let edgePush: EdgePush = freshPush()

/** The tab's saved top on the main screen: where it was dragged to, or the middle. */
function savedTabTop(): number {
  const display = screen.getPrimaryDisplay()
  return topFor(display.workArea, TAB_SIZES[settings.steward().size].tab.height, tabPlaces[String(display.id)])
}

/** The tab's top now: where a push brought it out, while it's there, or its saved spot. */
function tabTop(): number {
  if (revealTop === null) return savedTabTop()
  return clampTop(screen.getPrimaryDisplay().workArea, TAB_SIZES[settings.steward().size].tab.height, revealTop)
}

/**
 * macOS rounds the corners of every frameless window (Electron's roundedCorners, on by default), and that cut the
 * tab's and the nudge's square corners where they meet the screen edge, so the desktop showed through there. Instead,
 * those two windows hang this far past the screen edge: the rounded corners are off the screen, and the page leaves the
 * part that hangs over empty. (Turning roundedCorners off would also square the panel's frosted glass, which macOS draws.)
 */
const EDGE_OVERHANG = 16

/** The Dock sits on the edge Steward is on: the work area stops short of the screen's edge there. */
function dockOnEdge(): boolean {
  const { bounds, workArea } = screen.getPrimaryDisplay()
  return settings.steward().edge === 'right' ? workArea.x + workArea.width !== bounds.x + bounds.width : workArea.x !== bounds.x
}

/** How far the tab and the nudge hang past the edge: only where the screen really ends (no Dock there, no screen beside). */
function edgeOverhang(): number {
  const display = screen.getPrimaryDisplay()
  const others = screen.getAllDisplays().filter((d) => d.id !== display.id).map((d) => d.bounds)
  return !dockOnEdge() && !screenBeside(display.bounds, others, settings.steward().edge) ? EDGE_OVERHANG : 0
}

/** What the tab's page was last told about the overhang, so it leaves that much empty on the edge side. */
let sentOverhang = -1

/**
 * Where the window goes in each state: against the screen edge you picked, at the height the tab was dragged to. The
 * nudge is the tab grown sideways; the panel is centered on the tab, kept on screen; the viewer is centered. Docked in
 * the notch, the panel and the viewer come down from the notch instead, on the notch's own screen.
 */
function boundsFor(state: DockState): Electron.Rectangle {
  if ((state === 'expanded' || state === 'viewing') && inNotch() && notchGeo) {
    const area = notchDisplay().workArea
    if (state === 'expanded') return underNotch(notchGeo, area, { width: PANEL_WIDTH, height: Math.min(760, area.height - 48) })
    const size = { width: Math.min(VIEWER_MAX_WIDTH, area.width - 120), height: area.height - 48 }
    return { ...underNotch(notchGeo, area, size), y: area.y + Math.round((area.height - size.height) / 2) }
  }
  const area = screen.getPrimaryDisplay().workArea
  const { edge, size } = settings.steward()
  const tab = TAB_SIZES[size].tab
  /** Left of a window this wide that sits gap points from the edge. */
  const x = (width: number, gap = 0) => (edge === 'left' ? area.x + gap : area.x + area.width - width - gap)
  const top = tabTop()
  if (state === 'collapsed' || state === 'hidden' || state === 'nudge') {
    const oh = edgeOverhang()
    // The page has to know, or it would draw into the part that hangs off the screen.
    if (oh !== sentOverhang && win && !win.isDestroyed()) {
      sentOverhang = oh
      win.webContents.send('dock:overhang', oh)
    }
    const width = state === 'nudge' ? NUDGE_WIDTH : tab.width
    return { x: x(width) - (edge === 'left' ? oh : 0), y: top, width: width + oh, height: tab.height }
  }
  const width = state === 'viewing' ? Math.min(VIEWER_MAX_WIDTH, area.width - 120) : PANEL_WIDTH
  const height = state === 'viewing' ? area.height - 48 : Math.min(760, area.height - 48)
  const y = state === 'viewing' ? area.y + Math.round((area.height - height) / 2) : topAround(area, top, tab.height, height, 24)
  return { x: x(width, 8), y, width, height }
}

/** The tab being dragged up or down its edge, while it is. */
let tabDrag: TabDrag | null = null

/** From the tab's page: a drag began, moved (dy points since it began), or ended. The tab follows; the end saves where it is. */
function dragTab(phase: unknown, dy: unknown): void {
  if (!win || win.isDestroyed()) return
  if (phase === 'end') {
    if (tabDrag) void appState.update({ tabPlaces })
    tabDrag = null
    return
  }
  // Only the tab at rest moves, and only at the edge (in the notch there's no tab).
  if (dock !== 'collapsed' || inNotch()) return
  const display = screen.getPrimaryDisplay()
  const height = TAB_SIZES[settings.steward().size].tab.height
  if (phase === 'start') {
    // From where the tab is now, also when a push brought it out somewhere else: that spot becomes the saved one.
    tabDrag = new TabDrag(win.getBounds().y, display.workArea, height)
    tabPlaces = { ...tabPlaces, [String(display.id)]: placeFor(display.workArea, height, win.getBounds().y) }
    revealTop = null
  } else if (phase === 'move' && tabDrag && typeof dy === 'number' && Number.isFinite(dy)) {
    tabPlaces = { ...tabPlaces, [String(display.id)]: placeFor(display.workArea, height, tabDrag.move(dy)) }
    win.setBounds(boundsFor('collapsed'))
  }
}

/** Settings → Steward → Reset: the tab goes back to the middle of this display's edge. */
async function resetTabPlace(): Promise<void> {
  const id = String(screen.getPrimaryDisplay().id)
  tabPlaces = Object.fromEntries(Object.entries(tabPlaces).filter(([key]) => key !== id))
  await appState.update({ tabPlaces })
  if (win && !win.isDestroyed() && win.isVisible() && dock !== 'hidden') win.setBounds(boundsFor(dock), true)
}

/**
 * Only when needed: the tab slides in from the screen edge and back out. The page does the sliding, as a transform in the
 * compositor (styles.css), and the window stays at its place on the edge. Moving the window itself can't work: macOS puts a
 * window that is partly off the screen back on it, so the old "slide" was a window popping in and out, and what looked
 * like a few frames was the window changing size. A hidden window's page is always slid out, so it comes in from there.
 */
function setSlide(out: boolean, animate: boolean): void {
  slidOut = out
  win?.webContents.send('presence:slide', { out, animate })
}

/** Show the tab or the nudge at these bounds. Slid out (Only when needed), it comes in from the edge. Not while stepping aside. */
function showTab(target: Electron.Rectangle, animateBounds = true): void {
  if (!win || win.isDestroyed()) return
  if (steppedAside) return hideTab()
  clearTimeout(slideTimer)
  const wasShowing = win.isVisible()
  win.setBounds(target, wasShowing && animateBounds)
  if (!wasShowing) win.showInactive()
  if (slidOut) setSlide(false, true)
}

/** Only when needed, at rest: the tab slides back into the edge, and then the window goes. */
function tuckTab(): void {
  if (!win || win.isDestroyed() || !win.isVisible()) return
  clearTimeout(slideTimer)
  setSlide(true, true)
  tuckStarted = Date.now()
  // The page says when the slide has ended (slideEnded), and the window goes then. If it never says, this does.
  slideTimer = setTimeout(() => {
    if (win && !win.isDestroyed() && dock === 'collapsed' && !out()) hideTab('the safety timeout')
  }, SLIDE_MS)
}

/**
 * From the tab's page: its slide out ended, drawn, or by the clock when no frame came to draw its end. Unless it was
 * brought out again meanwhile, the window goes now.
 */
function slideEnded(by: 'drawn' | 'clock'): void {
  if (!win || win.isDestroyed() || !win.isVisible() || dock !== 'collapsed' || out() || !slidOut) return
  hideTab(by === 'drawn' ? 'its slide ending' : SLIDE_END_UNDRAWN)
}

/**
 * Take the window off the screen. Only when needed, its page waits slid out, ready to come in from the edge, and the tab
 * is back at its saved spot for the next time (a push brings it to the cursor again).
 */
function hideTab(why?: string): void {
  if (!win || win.isDestroyed()) return
  clearTimeout(slideTimer)
  if (why) lastTuck = { ms: Date.now() - tuckStarted, why }
  win.hide()
  revealTop = null
  setSlide(quiet(), false)
}

const MOODS: Mood[] = ['resting', 'idle', 'listening', 'thinking', 'talking', 'done', 'needs-you', 'worried', 'mad', 'celebrating', 'sleepy']
const GLINTS: PillGlint[] = ['sweep', 'step', 'search']
const isOpen = (state: DockState) => state === 'expanded' || state === 'viewing'

/**
 * Steward shows in the notch while it's tucked away (and while a nudge peeks out, which for now still peeks from the
 * edge); the panel opens from the edge. Not in the notch: the tab is back at the edge.
 */
function placeNotch(): void {
  notch?.show(inNotch() && (dock === 'collapsed' || dock === 'nudge') && !steppedAside)
}

/** The tab or the notch follows whether Steward is out: it slides in or out, or the notch wakes or goes to sleep. */
function applyPresence(): void {
  notch?.setAwake(out())
  if (!win || win.isDestroyed() || dock !== 'collapsed' || inNotch()) return
  if (out()) showTab(boundsFor('collapsed'))
  else tuckTab()
}

/**
 * Resting (the panel just closed, or Steward just came back): at the edge, the tab stays out and the watcher tucks it
 * away once the cursor has left and everything is at rest, so closing the panel never pops. The notch goes to sleep.
 */
function restingPresence(): PresenceState {
  return quiet() && !inNotch() ? { revealed: true, since: null } : asleep()
}

/** Ask macOS where the notch is (at launch, and whenever a display changes), and put Steward where it belongs. */
async function refreshNotch(): Promise<void> {
  const found = findNotch(await probeScreens(), screen.getAllDisplays())
  if (JSON.stringify(found) === JSON.stringify(notchGeo)) return
  notchGeo = found
  notch?.setNotch(found)
  for (const w of [win, settingsWin]) if (w && !w.isDestroyed()) w.webContents.send('notch:geometry', found)
  replaceForNotch()
}

/** The notch came or went, or was picked or unpicked: the tab leaves the edge for the notch, or comes back. */
function replaceForNotch(): void {
  placeNotch()
  presenceNow = asleep()
  notch?.setAwake(out())
  syncWatch()
  if (!win || win.isDestroyed() || dock !== 'collapsed') return
  if (inNotch()) hideTab()
  else if (out()) showTab(boundsFor('collapsed'), false)
  else if (win.isVisible()) hideTab()
}

function setDock(state: DockState): void {
  if (!win || dock === state) return
  const wasHidden = dock === 'hidden'
  const wasOpen = isOpen(dock)
  dock = state
  // Leaving the nudge ends the first-launch peek, however it ended (clicked, closed, timed out, or the cursor left).
  if (state !== 'nudge') {
    firstPeek = null
    clearTimeout(peekTimer)
  }
  // Only when needed: a nudge brings Steward out, and at rest it stays out only while the cursor is on it (or work goes on).
  presenceNow = state === 'nudge' ? { revealed: quiet(), since: null } : state === 'collapsed' ? restingPresence() : asleep()
  notch?.setAwake(out())
  if (wasOpen && !isOpen(state)) void appState?.update({ lastSeenAt: Date.now() })
  if (!wasOpen && isOpen(state)) onPanelOpened()
  // The material first, so the panel's very first frame is drawn for it (frosted or solid).
  applyMaterial()
  win.webContents.send('dock:state', state)
  updateMenuBar()
  placeNotch()
  if (state === 'hidden') {
    hideTab()
    return syncWatch()
  }
  if (state === 'collapsed' || state === 'nudge') {
    if (state === 'collapsed' && inNotch()) {
      win.setBounds(boundsFor(state), !wasHidden)
      // In the notch there's no tab at the edge: the notch window is the character.
      hideTab()
    } else if (state === 'collapsed' && !out()) tuckTab()
    // Peeking never takes keyboard focus, so it can't interrupt typing. Out of hiding, it comes in from the edge.
    else showTab(boundsFor(state), !wasHidden)
  } else {
    // Hotkey or menu bar, with Steward out of sight: the panel is just there, and its own entrance plays.
    clearTimeout(slideTimer)
    setSlide(false, false)
    win.setBounds(boundsFor(state), win.isVisible() && !wasHidden)
    if (!win.isVisible()) win.show()
    win.focus()
    // Opening the panel shows what waited for it, and any batched alerts now rather than later.
    deliverHeld()
    alerts?.flush()
  }
  syncWatch()
}

/**
 * The open panel is frosted by macOS itself (vibrancy), which blurs whatever is behind the window; CSS can only blur
 * what's inside it. The peek and the nudge stay solid: vibrancy fills the whole window, and they're shaped as a tab.
 * Reduce transparency (System Settings, Accessibility) turns the frost off everywhere.
 */
function appearance(): Appearance {
  return { vibrant: process.platform === 'darwin' && isOpen(dock) && !nativeTheme.prefersReducedTransparency }
}

/** The Settings window's sidebar is frosted by macOS too, unless Reduce Transparency is on. */
function settingsAppearance(): Appearance {
  return { vibrant: process.platform === 'darwin' && !nativeTheme.prefersReducedTransparency }
}

let applied: boolean | null = null
function applyMaterial(): void {
  if (!win) return
  const { vibrant } = appearance()
  if (vibrant === applied) return
  applied = vibrant
  win.setVibrancy(vibrant ? 'popover' : null)
  // The deep shadow under the glass is the window's own, so it follows the window's shape.
  win.setHasShadow(vibrant)
  win.webContents.send('appearance:changed', { vibrant })
}

/**
 * One look at the cursor, for Only when needed: the presence rules say whether Steward comes out or goes back, and this
 * does it. Both watchers (the edge's, and the notch window's) look through here. On the edge, a push says whether it
 * moved (and starts over) and where the tab would come out for it.
 */
function lookAtCursor(inZone: boolean, onIt: boolean, dwellMs: number, push?: { restart: boolean; top: number }): { next: number } {
  const input = { now: Date.now(), quiet: quiet(), hidden: dock === 'hidden', rest: dock === 'collapsed' && !agent?.busy, inZone, onIt, dwellMs, restart: push?.restart }
  const step = stepPresence(presenceNow, input)
  presenceNow = step.state
  // A push brought it out: the tab comes to the cursor.
  if (step.change === 'reveal' && input.rest && inZone && push) revealTop = push.top
  if (step.change) applyPresence()
  return { next: nextLookMs(presenceNow, input) }
}

/** Presence was switched in Settings: Steward comes out, or slips away, now. */
function presenceChanged(): void {
  presenceNow = dock === 'collapsed' ? restingPresence() : asleep()
  // Always visible, the tab is at its saved spot.
  if (!quiet()) revealTop = null
  // Hidden, its page waits slid out or not, to match the new Presence.
  if (win && !win.isVisible()) setSlide(quiet(), false)
  applyPresence()
  syncWatch()
  updateMenuBar()
}

/** The notch window checks the cursor often while it's near; it says whether it's on the notch. */
function lookAtNotch(over: boolean): void {
  if (!drivenBySmoke && quiet() && inNotch() && dock === 'collapsed') lookAtCursor(over, over, NOTCH_DWELL_MS)
}

/** Within this many points of the tab, the cursor is near: Dim when idle wakes the eyes. */
const NEAR_TAB = 120
/** What the tab's page was last told about the cursor being near. */
let sentNear = false

/**
 * One look at the cursor for the edge: the tab's page hears whether it's near, for Dim when idle, and Only when needed a
 * push anywhere along the edge brings the tab out right there, with the cursor at its middle (kept inside the work area).
 * The watcher looks with the real cursor, the smoke check with made-up ones. Says when to look next.
 */
function lookAtEdge(cursor: Electron.Point): number {
  const display = screen.getPrimaryDisplay()
  const height = TAB_SIZES[settings.steward().size].tab.height
  const tabBounds = boundsFor('collapsed')
  const near = inRect(cursor, tabBounds, NEAR_TAB)
  if (near !== sentNear) {
    sentNear = near
    win?.webContents.send('presence:near', near)
  }
  if (!quiet()) return WATCH_MS
  const at = { screen: display.bounds, area: display.workArea, edge: settings.steward().edge, savedCenterY: savedTabTop() + height / 2, dockOnEdge: dockOnEdge() }
  const look = pushAlongEdge(edgePush, cursor, at, presenceNow.revealed)
  edgePush = look.push
  const top = clampTop(display.workArea, height, cursor.y - height / 2)
  return lookAtCursor(look.inZone, inRect(cursor, tabBounds, 6), look.dwellMs, { restart: look.restart, top }).next
}

/**
 * The edge's watcher: while the tab is tucked away or out at rest, it checks the cursor 5 times a second, and 20 when it
 * is pushing against the edge. It stops while the panel is open (or a nudge is), while hidden by hand, while the screen
 * sleeps, in the notch (its own window watches there), and when Steward is always visible with Dim when idle off.
 */
function watchEdge(): void {
  watchTimer = undefined
  if (!canWatchEdge()) return
  const next = lookAtEdge(screen.getCursorScreenPoint())
  // The look may have ended the watch (it came out, and something else changed).
  if (canWatchEdge()) watchTimer = setTimeout(watchEdge, next)
}

const canWatchEdge = (): boolean => !!win && (quiet() || settings.steward().dimWhenIdle) && !inNotch() && dock === 'collapsed' && !screenAsleep && !steppedAside && !drivenBySmoke

/** Start or stop the edge's watcher to match what's going on. Called whenever any of that changes. */
function syncWatch(): void {
  if (!canWatchEdge()) {
    clearTimeout(watchTimer)
    watchTimer = undefined
  } else if (!watchTimer) watchTimer = setTimeout(watchEdge, 0)
}

/* ---------- Step aside ---------- */

/** The notifications from macOS Steward listens to while Step aside is on (their subscription ids). */
let asideSubs: number[] = []
let asideLooking = false
let asideAgain = false

/** Step aside is on: for full-screen apps, or for a list of apps. Only a Mac can say. */
const wantsStepAside = (): boolean => process.platform === 'darwin' && (settings.steward().hideInFullScreen || settings.steward().hideInApps.length > 0)

/** The screen Steward shows on: the notch's when it's docked there, otherwise the main one, where the tab sits. */
const stewardScreen = (): number => (inNotch() && notchGeo ? notchGeo.displayId : screen.getPrimaryDisplay().id)

/**
 * Listen to macOS, or stop, to match Settings, and ask it once now. An app switch names the app, which is all the list
 * needs; a Space change (into or out of a full-screen app) asks which screens show a full-screen app. Nothing runs in
 * between. The smoke check feeds these itself.
 */
function syncStepAside(): void {
  const want = wantsStepAside() && !drivenBySmoke
  if (want && !asideSubs.length) {
    asideSubs = [
      systemPreferences.subscribeWorkspaceNotification('NSWorkspaceDidActivateApplicationNotification', (_e, info) => {
        const front = appFromUserInfo(info)
        if (front) noteFront(front)
        else void lookAside()
      }),
      systemPreferences.subscribeWorkspaceNotification('NSWorkspaceActiveSpaceDidChangeNotification', () => void lookAside()),
    ]
  } else if (!want && asideSubs.length) {
    for (const id of asideSubs) systemPreferences.unsubscribeWorkspaceNotification(id)
    asideSubs = []
  }
  if (want) void lookAside()
  applyStepAside()
}

/** Another app came to the front. Steward itself coming forward (its panel, Settings) changes nothing. */
function noteFront(front: FrontApp): void {
  asideFront = frontAfter(asideFront, front, process.pid)
  applyStepAside()
}

/** Which screens show a full-screen app now. */
function noteFullScreen(on: number[]): void {
  asideFullScreenOn = on
  applyStepAside()
}

/** Ask macOS which app is in front and which screens show a full-screen app: one question at a time, again if something changed meanwhile. */
async function lookAside(): Promise<void> {
  if (asideLooking) {
    asideAgain = true
    return
  }
  asideLooking = true
  do {
    asideAgain = false
    const look = await lookNow()
    if (look) {
      asideFront = frontAfter(asideFront, look.front, process.pid)
      asideFullScreenOn = look.fullScreenOn
    }
  } while (asideAgain)
  asideLooking = false
  applyStepAside()
}

/**
 * Step aside, or come back. Stepping aside, the tab, a nudge, the notch and an open panel go, and alerts wait (the
 * hotkey and the menu bar still open the panel). Back, Steward is as it was: always visible, the tab is there again;
 * hiding until needed, it stays hidden. What waited peeks out then.
 */
function applyStepAside(): void {
  const s = settings.steward()
  const on = wantsStepAside() && shouldStepAside({ hideInFullScreen: s.hideInFullScreen, apps: s.hideInApps, front: asideFront, fullScreenHere: asideFullScreenOn.includes(stewardScreen()) })
  if (on === steppedAside) return
  steppedAside = on
  if (on) {
    if (dock !== 'collapsed' && dock !== 'hidden') setDock('collapsed')
    else if (dock === 'collapsed') hideTab()
  } else if (dock === 'collapsed') {
    if (quiet() && !agent?.busy) presenceNow = asleep()
    if (!inNotch() && out()) showTab(boundsFor('collapsed'), false)
  }
  placeNotch()
  notch?.setAwake(out())
  syncWatch()
  updateMenuBar()
  if (!on && asideAlerts.length) {
    const back = asideAlerts
    asideAlerts = []
    showAlerts(back)
  }
}

/** The app picker, as a sheet: an app (from Applications), read for its bundle id. */
async function pickApp(parent: BrowserWindow | null): Promise<StepAsideApp | null> {
  const options: Electron.OpenDialogOptions = { defaultPath: '/Applications', properties: ['openFile'], filters: [{ name: 'Apps', extensions: ['app'] }], buttonLabel: 'Add app' }
  const result = await withModal(() => (parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options)))
  if (result.canceled) return null
  const picked = await readApp(result.filePaths[0])
  if (!picked) throw new Error("Steward can't tell which app that is.")
  return picked
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
  // While hidden, stepping aside, or when Steward only comes out when needed, the menu bar shows how many sessions are
  // waiting on you, and a dot when something quieter is waiting too.
  const waiting = sessions?.waitingCount() ?? 0
  menuBar.setTitle(menuBarTitle(dock === 'hidden' || quiet() || steppedAside ? waiting : 0, heldAlerts.length + asideAlerts.length))
  menuBar.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Steward', accelerator: registered.togglePanel || undefined, registerAccelerator: false, click: () => setDock('expanded') },
      dock === 'hidden'
        ? { label: 'Show at Screen Edge', accelerator: registered.hideFromEdge || undefined, registerAccelerator: false, click: () => setDock('collapsed') }
        : { label: 'Hide from Screen Edge', accelerator: registered.hideFromEdge || undefined, registerAccelerator: false, click: () => setDock('hidden') },
      { label: 'Settings…', accelerator: 'Command+,', registerAccelerator: false, click: () => openSettings() },
      { type: 'separator' },
      { label: 'Quit Steward', role: 'quit' },
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
    // Keep the frost lively even though the panel rarely becomes the key window.
    visualEffectState: 'active',
    // The tab and the nudge hang a little past the screen edge (EDGE_OVERHANG); without this macOS pulls a window
    // that's partly off the screen back onto it when it's shown.
    enableLargerThanScreen: true,
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
    // Docked in the notch, the notch window shows instead; Only when needed, it stays out of sight until it's brought out.
    if (dock === 'collapsed' && (inNotch() || !out())) return
    if (!w.isDestroyed() && !w.isVisible()) w.showInactive()
  }
  w.once('ready-to-show', reveal)
  w.webContents.once('did-finish-load', reveal)

  // Collapse when you click away, unless something still needs the panel open.
  w.on('blur', tuckIfAway)

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
    w.webContents.on('did-fail-load', (_e, code, description, url) => console.error(`[steward] load failed: ${code} ${description} ${url}`))
    w.webContents.on('render-process-gone', (_e, details) => console.error(`[steward] renderer gone: ${details.reason}`))
  }

  loadPage(w, 'index.html')
  return w
}

/** A page of the renderer: from the dev server while developing, from the build otherwise. */
function loadPage(w: BrowserWindow, page: 'index.html' | 'settings.html' | 'notch.html', hash?: string): void {
  if (process.env.ELECTRON_RENDERER_URL) void w.loadURL(`${process.env.ELECTRON_RENDERER_URL}/${page}${hash ? `#${hash}` : ''}`)
  else void w.loadFile(path.join(__dirname, '../renderer', page), hash ? { hash } : undefined)
}

/**
 * Clicking away from Steward tucks the panel away. Going from the panel to its Settings window (or back) isn't
 * clicking away, so this waits for focus to land before deciding.
 */
function tuckIfAway(): void {
  setTimeout(() => {
    // Quitting closes the windows; by now they may be gone.
    if (!win || win.isDestroyed() || !isOpen(dock)) return
    if (settings.keepPanelOpen() || modalOpen || draggingOut || agent.waitingForApproval) return
    if (win.isFocused() || (settingsWin && !settingsWin.isDestroyed() && settingsWin.isFocused())) return
    setDock('collapsed')
  }, 50)
}

/**
 * Settings, in a normal Mac window centered on the main screen: traffic lights, a frosted sidebar, one at a time.
 * Asking again brings it forward, at the section asked for.
 */
function openSettings(section?: SettingsSection): void {
  if (settingsWin && !settingsWin.isDestroyed()) {
    if (section) settingsWin.webContents.send('settings:section', section)
    if (settingsWin.isMinimized()) settingsWin.restore()
    app.focus({ steal: true })
    settingsWin.show()
    settingsWin.focus()
    return
  }
  const area = screen.getPrimaryDisplay().workArea
  const { width, height } = SETTINGS_SIZE
  // Centered, unless the open panel would cover part of it; then just clear of the panel.
  let x = area.x + Math.round((area.width - width) / 2)
  if (isOpen(dock)) {
    const panel = PANEL_WIDTH + 8 + 24
    x = settings.steward().edge === 'left' ? Math.max(x, area.x + panel) : Math.min(x, area.x + area.width - panel - width)
  }
  x = Math.max(area.x + 24, Math.min(x, area.x + area.width - width - 24))
  const { vibrant } = settingsAppearance()
  const w = new BrowserWindow({
    x,
    y: area.y + Math.round((area.height - height) / 2),
    width,
    height,
    minWidth: 640,
    minHeight: 420,
    title: 'Steward Settings',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    // With vibrancy and no background color, the page is see-through, so the sidebar can show the frost.
    ...(vibrant ? { vibrancy: 'sidebar' as const } : { backgroundColor: nativeTheme.shouldUseDarkColors ? '#1c1f27' : '#f4f6fa' }),
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
    },
  })
  settingsWin = w
  w.once('ready-to-show', () => {
    app.focus({ steal: true })
    w.show()
    w.focus()
  })
  w.on('blur', tuckIfAway)
  w.on('closed', () => {
    settingsWin = null
    // Closed in the middle of recording a shortcut: the global ones come back.
    recordShortcuts(false)
    // Back to the panel if it's still out, so clicking away tucks it again.
    if (win && !win.isDestroyed() && isOpen(dock)) win.focus()
  })
  w.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })
  w.webContents.on('will-navigate', (event) => event.preventDefault())
  if (!app.isPackaged) {
    w.webContents.on('console-message', ({ level, message }) => {
      if (level === 'warning' || level === 'error') console.log(`[settings ${level}] ${message}`)
    })
  }
  loadPage(w, 'settings.html', section)
}

/** Open at login lives in macOS. While developing it's off limits: it would register Electron itself. */
function loginItem(): SettingsView['openAtLogin'] {
  if (!app.isPackaged || process.platform !== 'darwin') return { available: false, enabled: false, needsApproval: false }
  const { openAtLogin, status } = app.getLoginItemSettings()
  return { available: true, enabled: openAtLogin || status === 'enabled' || status === 'requires-approval', needsApproval: status === 'requires-approval' }
}

/** Every window shows every change as it happens. */
function broadcastSettings(): void {
  const view = settings.view()
  for (const w of [win, settingsWin]) if (w && !w.isDestroyed()) w.webContents.send('settings:changed', view)
  notch?.post('settings:changed', view)
}

async function withModal<T>(fn: () => Promise<T>): Promise<T> {
  modalOpen = true
  try {
    return await fn()
  } finally {
    modalOpen = false
  }
}

/** The folder picker, as a sheet on whichever window asked for it. */
async function pickFolder(parent: BrowserWindow | null): Promise<string | null> {
  const options: Electron.OpenDialogOptions = { properties: ['openDirectory'], buttonLabel: 'Add project' }
  const result = await withModal(() => (parent ? dialog.showOpenDialog(parent, options) : dialog.showOpenDialog(options)))
  return result.canceled ? null : result.filePaths[0]
}

const senderWindow = (e: Electron.IpcMainInvokeEvent) => BrowserWindow.fromWebContents(e.sender)

/**
 * Alerts that made it through the queue (Settings → Notifications has silenced the types switched off). The open panel
 * shows them all. Tucked away, "Alerts that peek out" decides which peek out; the rest wait in the menu bar (a dot) and
 * show as cards when the panel next opens. Hidden by hand, nothing peeks out. Stepping aside, they all wait (a dot in
 * the menu bar) and come through here again once Steward is back.
 */
function showAlerts(list: AlertView[]): void {
  if (steppedAside && !isOpen(dock)) {
    asideAlerts = [...asideAlerts, ...list].slice(-MAX_HELD)
    return updateMenuBar()
  }
  const { peek, held } = isOpen(dock) ? { peek: list, held: [] } : dock === 'hidden' ? { peek: [], held: list } : splitAlerts(list, settings.steward().alertPeek)
  if (held.length) heldAlerts = [...held.toReversed(), ...heldAlerts].slice(0, MAX_HELD)
  if (peek.length) {
    win?.webContents.send('alerts:show', peek)
    if (dock === 'collapsed') setDock('nudge')
  }
  updateMenuBar()
}

/** The panel opened: the alerts that didn't peek out, or waited while Steward stepped aside, show now. */
function deliverHeld(): void {
  if (!heldAlerts.length && !asideAlerts.length) return
  win?.webContents.send('alerts:show', [...asideAlerts.toReversed(), ...heldAlerts])
  heldAlerts = []
  asideAlerts = []
  updateMenuBar()
}

/** The first open each day shows the morning brief; coming back after a while shows where you left off. */
function onPanelOpened(): void {
  if (!appState) return
  showPresenceNote()
  const prefs = settings.notifications()
  const today = localDate(new Date())
  if (prefs.morningBrief && appState.lastBriefDate !== today) {
    const since = briefSince(appState.lastSeenAt, Date.now())
    void appState.update({ lastBriefDate: today })
    void showBrief(since)
    return
  }
  const project = settings.currentProject()
  if (prefs.leftOff && project && Date.now() - appState.lastSeenAt >= AWAY_MS) showLeftOff(project)
}

/** The first time the panel opens with Steward hiding until it's needed, a note says where to push and what to press. Once. */
function showPresenceNote(): void {
  if (!quiet() || appState.presenceNoteSeen) return
  void appState.update({ presenceNoteSeen: true })
  win?.webContents.send('presence:note', presenceNote(noteFor()))
}

/** What the note says depends on where Steward is, the opening shortcut, and whether another screen touches its edge. */
function noteFor(): Parameters<typeof presenceNote>[0] {
  const where = inNotch() ? 'notch' : settings.steward().edge
  const display = screen.getPrimaryDisplay().bounds
  const others = screen.getAllDisplays().filter((d) => d.id !== screen.getPrimaryDisplay().id).map((d) => d.bounds)
  return { where, hotkey: registered.togglePanel ?? '', besideScreen: where !== 'notch' && screenBeside(display, others, where), dockOnEdge: where !== 'notch' && dockOnEdge() }
}

/** The first-launch peek while it's out: when it came out, and whether the cursor has been on it. */
let firstPeek: { startedAt: number; touched: boolean } | null = null
let peekTimer: ReturnType<typeof setTimeout> | undefined

/**
 * The first launch of a fresh install, hiding until needed: Steward comes out once on its own, peeking out with the note,
 * so a new user sees where it lives. In the notch the notch wakes, and the note peeks from the edge like alerts do for now.
 */
function maybeFirstPeek(): void {
  if (!win || win.isDestroyed() || dock !== 'collapsed' || steppedAside) return
  if (!showFirstPeek({ freshInstall: settings.missing && appState.missing, quiet: quiet(), shown: appState.firstPeekShown })) return
  // The note was the panel's first-time note; this shows it instead.
  void appState.update({ firstPeekShown: true, presenceNoteSeen: true })
  const { title, how } = presenceNoteParts(noteFor())
  win.webContents.send('alerts:show', [{ id: 0, key: 'first-peek', level: 'normal', title, detail: how, at: Date.now() }])
  setDock('nudge')
  firstPeek = { startedAt: Date.now(), touched: false }
  watchPeek()
}

/** One look at the cursor during the first-launch peek: once it's over, the peek goes back to being the tab, which tucks away as usual. */
function lookAtPeek(onIt: boolean): void {
  if (!firstPeek || dock !== 'nudge') return
  if (onIt) firstPeek.touched = true
  if (firstPeekOver({ ...firstPeek, onIt, now: Date.now() })) setDock('collapsed')
}

function watchPeek(): void {
  peekTimer = undefined
  if (!firstPeek || !win || drivenBySmoke) return
  lookAtPeek(inRect(screen.getCursorScreenPoint(), win.getBounds(), 6))
  if (firstPeek) peekTimer = setTimeout(watchPeek, WATCH_MS)
}

/** Built from a template: deploys, finished sessions, where you left off, and Dependabot PRs. No model call. */
async function showBrief(since: number): Promise<void> {
  await deploys.ensureChecked().catch(() => {})
  const project = settings.currentProject()
  const [leftOff, dependabot] = await Promise.all([project ? whereYouLeftOff(project) : null, gh ? dependabotPRs(settings.projects(), gh) : null])
  win?.webContents.send('brief:show', buildBrief({ now: new Date(), since, deploys: deploys.recent(), sessions: sessions.list(), leftOff, dependabot }))
}

/** Celebrate PRs merged in your projects while Steward is running. */
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

/** Switching projects, from the switcher or by asking, shows where you left off there. */
async function switchProject(projectPath: string | null, before = settings.currentProject()?.path ?? null): Promise<void> {
  await settings.setCurrentProject(projectPath)
  const after = settings.currentProject()
  if (after && after.path !== before && settings.notifications().leftOff) showLeftOff(after)
}

/**
 * Every alert goes through here: Settings → Notifications decides whether it peeks out, the queue whether it
 * shows, and the face picks up its mood either way.
 */
function raise(input: AlertInput): void {
  if (!alerts.push(withNotificationPrefs(input, settings.notifications()))) return
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

/**
 * A failed build peeks out mad (then stays worried until it's fixed) and offers to look; a ready one is celebrated
 * and screenshotted into the tray.
 */
function onDeployChanges(changes: DeployChange[]): void {
  for (const { kind, deploy } of changes) {
    if (kind === 'failed') {
      raise({
        key: `deploy-failed:${deploy.uid}`,
        level: 'urgent',
        title: `${deploy.project} deploy failed`,
        detail: deploy.errorMessage ?? deploy.commit ?? deploy.branch,
        mood: 'mad',
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
      .catch((err: Error) => console.error(`[steward] deploy screenshot failed: ${err.message}`))
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

const stewardHookCommand = () => hookCommand(app.getPath('userData'))

async function claudeStatus(): Promise<ClaudeHookStatus> {
  const base = { connected: false, outdated: false, serverRunning: (hookServer?.port ?? 0) > 0, settingsFile: CLAUDE_SETTINGS_FILE, backupFile: path.basename(await backupFile()) }
  try {
    const state = hookState(await readClaudeSettings(), stewardHookCommand())
    return { ...base, connected: state === 'current', outdated: state === 'outdated' }
  } catch (err) {
    return { ...base, error: (err as Error).message }
  }
}

// A plain 16x16 icon for drags whose first file has no preview (e.g. SVG).
const FALLBACK_DRAG_ICON = nativeImage.createFromBitmap(Buffer.alloc(16 * 16 * 4, 200), { width: 16, height: 16 })

function registerIpc(): void {
  ipcMain.handle('dock:expand', () => setDock('expanded'))
  ipcMain.handle('presence:slid', () => slidOut)
  ipcMain.on('dock:drag', (_e, phase: unknown, dy: unknown) => dragTab(phase, dy))
  ipcMain.on('presence:slideEnded', (_e, by: unknown) => slideEnded(by === 'clock' ? 'clock' : 'drawn'))
  ipcMain.handle('dock:overhang', () => edgeOverhang())
  ipcMain.handle('dock:resetPlace', () => resetTabPlace())
  ipcMain.handle('notch:geometry', () => notchGeo)
  ipcMain.handle('notch:state', () => notch.state())
  ipcMain.on('notch:click', () => setDock('expanded'))
  ipcMain.on('notch:reportMood', (_e, mood: unknown, glint: unknown) => {
    if (MOODS.includes(mood as Mood) && GLINTS.includes(glint as PillGlint)) notch.setMood(mood as Mood, glint as PillGlint)
  })
  ipcMain.handle('dock:collapse', () => setDock('collapsed'))
  ipcMain.handle('dock:hide', () => setDock('hidden'))
  ipcMain.handle('dock:view', () => setDock('viewing'))
  ipcMain.handle('appearance:get', (e) => (settingsWin && e.sender === settingsWin.webContents ? settingsAppearance() : appearance()))

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
  ipcMain.handle('tray:saveToProject', async (e, ids: string[]) => {
    let project = settings.currentProject()
    if (!project) {
      const folder = await pickFolder(senderWindow(e))
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
  ipcMain.handle('settings:addProject', async (e) => {
    const folder = await pickFolder(senderWindow(e))
    if (folder) await settings.addProject(folder)
    return settings.view()
  })
  ipcMain.handle('settings:addProjectAndSwitch', async (e) => {
    const folder = await pickFolder(senderWindow(e))
    if (folder) {
      // Adding the first project makes it current already; it still counts as switching to it.
      const before = settings.currentProject()?.path ?? null
      await settings.addProject(folder)
      await switchProject(folder, before)
    }
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
  ipcMain.handle('settings:update', async (_e, input: unknown) => {
    const { openAtLogin, ...patch } = parseSettingsPatch(input)
    if (openAtLogin !== undefined && loginItem().available) app.setLoginItemSettings({ openAtLogin })
    const before = settings.steward()
    // Saving broadcasts; open at login isn't saved here, so it's broadcast on its own.
    if (patch.keepPanelOpen !== undefined || patch.notifications || patch.steward) await settings.update(patch)
    else broadcastSettings()
    // The other screen edge, or another size: the window moves there now.
    const after = settings.steward()
    if (win && !win.isDestroyed() && dock !== 'hidden' && (after.edge !== before.edge || after.size !== before.size)) win.setBounds(boundsFor(dock))
    // Into the notch or out of it, or the other notch style.
    if (after.notch !== before.notch || after.edge !== before.edge) replaceForNotch()
    if (after.notchStyle !== before.notchStyle) notch.restyle()
    // Always visible or only when needed: Steward comes out, or slips away, now.
    if (after.presence !== before.presence) presenceChanged()
    else if (after.dimWhenIdle !== before.dimWhenIdle) syncWatch()
    // Step aside's switch or list: listen to macOS or stop, and step aside or come back now.
    if (after.hideInFullScreen !== before.hideInFullScreen || JSON.stringify(after.hideInApps) !== JSON.stringify(before.hideInApps)) syncStepAside()
    return settings.view()
  })
  ipcMain.handle('settings:addStepAsideApp', async (e) => {
    const picked = await pickApp(senderWindow(e))
    if (picked) {
      await settings.update({ steward: { hideInApps: withApp(settings.steward().hideInApps, picked) } })
      syncStepAside()
    }
    return settings.view()
  })
  ipcMain.handle('settings:setShortcut', (_e, id: unknown, accelerator: unknown) => setShortcut(id, accelerator))
  ipcMain.handle('settings:recordShortcuts', (_e, recording: unknown) => recordShortcuts(recording === true))
  ipcMain.handle('settings:open', (_e, section?: unknown) => openSettings(SETTINGS_SECTIONS.find((s) => s === section)))
  ipcMain.handle('settings:close', () => settingsWin?.close())
  ipcMain.handle('clipboard:writeText', (_e, text: string) => clipboard.writeText(text))

  ipcMain.handle('sessions:list', () => sessions.list())
  ipcMain.handle('sessions:dismiss', (_e, id: string) => {
    sessions.dismiss(id)
    sendSessions()
  })

  // Connecting merges Steward's hooks into ~/.claude/settings.json; the renderer shows the preview first.
  ipcMain.handle('claude:status', () => claudeStatus())
  ipcMain.handle('claude:preview', () => hooksPreview(stewardHookCommand()))
  ipcMain.handle('claude:connect', async () => {
    await writeClaudeSettings(withStewardHooks(await readClaudeSettings(), stewardHookCommand()))
    return claudeStatus()
  })
  ipcMain.handle('claude:disconnect', async () => {
    await writeClaudeSettings(withoutStewardHooks(await readClaudeSettings()))
    return claudeStatus()
  })
}

function registerHotkey(candidates: string[], action: () => void): string {
  for (const key of candidates) if (globalShortcut.register(key, action)) return key
  return ''
}

const GLOBAL_ACTIONS: Record<GlobalShortcutId, () => void> = { togglePanel: () => toggleDock(), hideFromEdge: () => toggleHidden() }

/**
 * The global shortcuts: the ones you set, or the first of Steward's defaults macOS lets it have. While a new one
 * is being recorded they're all let go, and what was registered is kept for showing.
 */
function registerGlobalShortcuts(): void {
  globalShortcut.unregisterAll()
  if (!recordingShortcut) {
    registered = {}
    for (const id of GLOBAL_SHORTCUTS) {
      const set = settings.shortcuts()[id]
      const got = registerHotkey(set === undefined ? shortcutInfo(id).defaults : set ? [set] : [], GLOBAL_ACTIONS[id])
      if (got) registered[id] = got
    }
  }
  updateMenuBar()
  broadcastSettings()
}

/** While a new shortcut is being pressed in Settings, the global ones let go, so the keys reach the window. */
function recordShortcuts(on: boolean): void {
  if (recordingShortcut === on) return
  recordingShortcut = on
  registerGlobalShortcuts()
}

/** Change a shortcut: an accelerator, '' for off, or null for the default. Checked here as well as in the window. */
async function setShortcut(id: unknown, accelerator: unknown): Promise<SettingsView> {
  if (!isShortcutId(id)) throw new Error("That isn't one of Steward's shortcuts.")
  let value: string | undefined
  if (accelerator === null) value = undefined
  else if (accelerator === '') value = ''
  else {
    const normal = typeof accelerator === 'string' ? normalizeAccelerator(accelerator) : null
    if (!normal) throw new Error("That isn't a key a shortcut can end in.")
    const current = Object.fromEntries(Object.entries(settings.view().shortcuts).map(([k, v]) => [k, v.accelerator]))
    const check = checkShortcut(id, normal, current)
    if (check.level === 'error') throw new Error(check.message)
    // Make sure macOS will register it at all. (It doesn't refuse one another app has too; nothing can tell that.)
    if (isGlobalShortcut(id) && !Object.values(registered).includes(normal)) {
      if (!globalShortcut.register(normal, () => {})) throw new Error(`macOS wouldn’t give Steward ${formatAccelerator(normal)}. Pick another one.`)
      globalShortcut.unregister(normal)
    }
    value = normal
  }
  await settings.setShortcut(id, value)
  if (isGlobalShortcut(id)) registerGlobalShortcuts()
  return settings.view()
}

/** CI/dev check: open the panel, screenshot it, and exit 0 if it rendered. */
function runSmokeCheck(w: BrowserWindow, out: string): void {
  const fail = (why: string) => {
    console.error(`smoke: ${why}`)
    app.exit(1)
  }
  // The panel has 30 s to show; the presence check before it (with its 20 s wait for Dim when idle) has its own budget.
  const timer = setTimeout(() => fail('timed out'), 30_000 + 80_000 + Number(process.env.STEWARD_SMOKE_IDLE ?? 0) * 2000)
  w.webContents.once('did-fail-load', (_e, code, description) => fail(`load failed: ${code} ${description}`))
  w.webContents.once('did-finish-load', async () => {
    try {
      // A fresh install is quiet: the tab stays out of sight until it's needed. Then Presence goes to Always visible.
      const presenceTimer = setTimeout(() => fail('presence timed out'), 80_000 + Number(process.env.STEWARD_SMOKE_IDLE ?? 0) * 2000)
      await checkPresence(w, out)
      clearTimeout(presenceTimer)
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
      if (SMOKE_DEMO) await captureDemo(w, out, SMOKE_DEMO)
      // The Settings window is its own page, so it gets checked too.
      const settingsTimer = setTimeout(() => fail('settings window timed out'), 20_000)
      await captureSettings(out)
      clearTimeout(settingsTimer)
      const notchTimer = setTimeout(() => fail('notch timed out'), 75_000 + Number(process.env.STEWARD_SMOKE_IDLE ?? 0) * 3000)
      await checkNotch(out)
      clearTimeout(notchTimer)
      app.exit(0)
    } catch (err) {
      fail(String(err))
    }
  })
}

/** How opaque one pixel of a capture of a transparent window is (0 to 255), at a point in the window's own coordinates. */
function alphaAt(img: Electron.NativeImage, x: number, y: number, windowWidth: number): number {
  const { width, height } = img.getSize()
  const k = width / windowWidth
  const px = Math.min(width - 1, Math.max(0, Math.round(x * k)))
  const py = Math.min(height - 1, Math.max(0, Math.round(y * k)))
  return img.toBitmap()[(py * width + px) * 4 + 3]
}

/**
 * Watches an element's transform in a page, once per drawn frame, while `trigger` makes it move. A slide drawn by the
 * compositor shows many positions with frames a display refresh apart; one stepped from the main process shows a few,
 * with long waits between. This measures the page's frames, not what the screen shows (Screen Recording isn't granted).
 */
async function watchMotion(wc: Electron.WebContents, look: MotionLook, ms: number, trigger: () => void | Promise<void>): Promise<Motion> {
  const sampling = wc.executeJavaScript(`new Promise((resolve) => {
    const samples = []
    const frame = (t) => {
      const el = document.querySelector(${JSON.stringify(look.selector)})
      samples.push([t, el ? getComputedStyle(el).${look.property} : ''])
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
    setTimeout(() => resolve({ samples, visibility: document.visibilityState }), ${ms})
  })`) as Promise<{ samples: Sample[]; visibility: string }>
  await new Promise((resolve) => setTimeout(resolve, 30))
  await trigger()
  const { samples, visibility } = await sampling
  return measureMotion(samples, ms, visibility)
}

/** What to watch: an element, and whether it moves (its transform) or, with Reduce Motion on, fades (its opacity). */
interface MotionLook {
  selector: string
  property: 'transform' | 'opacity'
  /** Said in the log, so a fade isn't mistaken for a slide. */
  label: string
}

/**
 * With Reduce Motion on, Steward fades instead of moving (styles.css, notch.css), so its transform never changes and
 * the fade is what has to be smooth. The macOS CI runner has Reduce Motion on, which is why it once saw "1 position".
 */
async function motionLook(wc: Electron.WebContents, moving: string, fading: string): Promise<MotionLook> {
  const reduced = Boolean(await wc.executeJavaScript(`matchMedia('(prefers-reduced-motion: reduce)').matches`))
  return reduced ? { selector: fading, property: 'opacity', label: ' (Reduce Motion is on: a fade)' } : { selector: moving, property: 'transform', label: '' }
}

/** The piece of the notch's black that moves when it wakes: the chin, or in Wings the wings (the second shape). */
const MOVING_BLACK = { chin: '.nt .bp', wings: '.nt .blob + .blob .bp' } as const

/**
 * The motion has to be smooth: drawn at many positions, with no long stall between frames. On a CI runner, which
 * decides when the page draws, every frame the page drew has to show a new position instead; if it hardly draws at
 * all, it says it couldn't measure, and goes on (smoke-motion has the rules).
 */
function smoothly(what: string, m: Motion): void {
  const verdict = judgeMotion(what, m, Boolean(process.env.CI))
  console.log(`smoke: ${verdict.line}`)
  if (verdict.result === 'not smooth') throw new Error(`${what} is not smooth: ${verdict.line}`)
}

/** The CPU the main process and a page used over the last look, as a short phrase for the log. */
const cpuNow = (pid: number | null | undefined): string => {
  const m = app.getAppMetrics()
  return `main ${m.find((x) => x.pid === process.pid)?.cpu.percentCPUUsage.toFixed(2)}% CPU, page ${m.find((x) => x.pid === pid)?.cpu.percentCPUUsage.toFixed(2)}% CPU`
}

/**
 * Only when needed, on the edge: a fresh install starts quiet, and the tab is out of sight at rest. The cursor is fed to
 * the same rules the watcher uses (the real one can't be moved from here): a push comes out, leaving goes back. A
 * session that needs you peeks out; a finished one only waits (a dot in the menu bar) until the panel opens. Then
 * Presence goes to Always visible, for the rest of the check. STEWARD_SMOKE_IDLE=seconds logs the idle CPU in both modes.
 */
async function checkPresence(w: BrowserWindow, out: string): Promise<void> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const idle = Number(process.env.STEWARD_SMOKE_IDLE ?? 0)
  const need = (ok: boolean, why: string) => {
    if (!ok) throw new Error(why)
  }
  need(settings.steward().presence === 'quiet' && settings.steward().alertPeek === 'needs-me', 'a fresh install did not start quiet')
  need(settings.steward().dimWhenIdle && settings.steward().hideFromScreenShare, 'a fresh install did not start with dim and screen-share hiding on')
  // A push against the edge at the tab's saved spot for 300 ms comes out; leaving goes back after 1.5 s. The cursor is
  // made up: on the edge, or away in the middle of the screen.
  const display = screen.getPrimaryDisplay()
  const edgeAt = (y: number) => ({ x: settings.steward().edge === 'right' ? display.bounds.x + display.bounds.width - 1 : display.bounds.x, y })
  const away = { x: display.bounds.x + Math.round(display.bounds.width / 2), y: display.bounds.y + Math.round(display.bounds.height / 2) }
  const push = (inZone: boolean) => lookAtEdge(inZone ? edgeAt(savedTabTop() + TAB_SIZES[settings.steward().size].tab.height / 2) : away)
  /** The cursor is away and everything is at rest: after 1.5 s the tab slides out, and then the window goes. */
  const tuck = async () => {
    push(false)
    await sleep(TUCK_MS + 100)
    push(false)
    await sleep(SLIDE_MS + 150)
  }

  // The first launch of a fresh install: Steward peeks out once with the note, and tucks away once it's been read.
  await sleep(500)
  need(dock === 'collapsed' && !w.isVisible(), 'the tab showed before the first-launch peek')
  maybeFirstPeek()
  need(dock === 'nudge' && appState.firstPeekShown, 'a fresh install did not peek out on its first launch')
  await sleep(800)
  need(w.isVisible(), 'the first-launch peek did not come out')
  const said = String(await w.webContents.executeJavaScript(`[...document.querySelectorAll('.nudge-title, .nudge-detail')].map((e) => e.textContent).join(' ')`))
  need(said.startsWith('Hides until you need it.'), `the first-launch peek says "${said}"`)
  await fs.writeFile(out.replace(/\.png$/, '-first-peek.png'), (await w.webContents.capturePage()).toPNG())
  lookAtPeek(true)
  need(dock === 'nudge', 'the first-launch peek went while the cursor was on it')
  lookAtPeek(false)
  need(dock === 'collapsed' && w.isVisible(), 'the first-launch peek did not go back to being the tab once read')
  await tuck()
  need(!w.isVisible(), 'the tab did not tuck away after the first-launch peek')
  maybeFirstPeek()
  need(dock === 'collapsed' && !w.isVisible(), 'the first-launch peek came out twice')
  console.log(`smoke: a fresh install peeks out once ("${said}"), and tucks away once it's been read`)
  console.log('smoke: fresh install is quiet, the tab is out of sight at rest')
  if (idle > 0) {
    app.getAppMetrics()
    await sleep(idle * 1000)
    console.log(`smoke: edge idle ${idle}s, Only when needed (tab hidden): ${cpuNow(w.webContents.getOSProcessId())}`)
  }

  push(true)
  await sleep(150)
  push(false)
  await sleep(100)
  need(!presenceNow.revealed && !w.isVisible(), 'a push that left early still brought the tab out')
  push(true)
  await sleep(350)
  const tabLook = await motionLook(w.webContents, '#root', '#root')
  smoothly(`the tab sliding in${tabLook.label}`, await watchMotion(w.webContents, tabLook, 700, () => void push(true)))
  need(presenceNow.revealed, 'a push for 300 ms did not bring the tab out')
  need(w.isVisible(), 'the tab did not slide in')
  const home = boundsFor('collapsed')
  const at = w.getBounds()
  need(Math.abs(at.x - home.x) <= 2 && Math.abs(at.y - home.y) <= 2, `the tab stopped at ${at.x},${at.y}, not at its edge (${home.x},${home.y})`)
  push(false)
  await sleep(1600)
  smoothly(`the tab sliding out${tabLook.label}`, await watchMotion(w.webContents, tabLook, 700, () => void push(false)))
  need(!presenceNow.revealed && !w.isVisible(), 'the tab did not tuck away after the cursor left')
  // The window went when the page said the slide had ended, not on the safety timeout. On a Mac with a screen, the page
  // drew the end. A CI runner sometimes stops drawing the page for a while, so there the slide's own end time may say so.
  const undrawn = lastTuck?.why === SLIDE_END_UNDRAWN && Boolean(process.env.CI)
  need(lastTuck?.why === 'its slide ending' || undrawn, `the window went after ${lastTuck?.ms} ms, on ${lastTuck?.why ?? 'nothing'}, not when the page drew the slide's end`)
  console.log(
    undrawn
      ? `smoke: the window went ${lastTuck?.ms} ms after the tuck began, at its slide's end time: the page drew no frame then (on CI that's logged, not judged)`
      : `smoke: the window went ${lastTuck?.ms} ms after the tuck began, when the page said its slide had ended`,
  )
  console.log('smoke: a push brings the tab out to its edge, leaving tucks it away')

  // The tab comes to you: held still against the edge anywhere along it for 500 ms, it comes out right there, with the
  // cursor at its middle. Sliding along the edge never counts. Once it has been out, a push counts again only after the
  // cursor has left the edge. The panel and a nudge grow from where it is, a drag from there saves it, and once it has
  // tucked away it's back at its saved spot.
  const work = display.workArea
  const tabH = TAB_SIZES[settings.steward().size].tab.height
  const saved = savedTabTop()
  const hold = async (p: Electron.Point, ms: number) => {
    const until = Date.now() + ms
    do {
      lookAtEdge(p)
      await sleep(50)
    } while (Date.now() < until)
  }
  for (let y = work.y + 40; y < work.y + 400; y += 12) {
    lookAtEdge(edgeAt(y))
    await sleep(50)
  }
  need(!presenceNow.revealed, 'sliding along the edge brought the tab out')
  const high = edgeAt(work.y + 10)
  await hold(high, EDGE_FAR_DWELL_MS - 120)
  need(!presenceNow.revealed, `a push away from the saved spot came out before ${EDGE_FAR_DWELL_MS} ms`)
  await hold(high, 220)
  need(presenceNow.revealed, `a push held still for ${EDGE_FAR_DWELL_MS} ms high on the edge did not bring the tab out`)
  await sleep(500)
  need(w.isVisible() && w.getBounds().y === work.y, `the tab came out at ${w.getBounds().y} for a push at the top, not at ${work.y} (under the menu bar)`)
  need(savedTabTop() === saved, 'a push moved the saved spot')
  // Down the edge, still: the tab tucks away from under it and stays away while the cursor rests there.
  const low = edgeAt(work.y + work.height - 10)
  await hold(low, TUCK_MS + SLIDE_MS + 400)
  need(!presenceNow.revealed && !w.isVisible(), 'the tab did not tuck away with the cursor resting further down the edge')
  need(boundsFor('collapsed').y === saved, `the tucked-away tab is at ${boundsFor('collapsed').y}, not back at its saved spot (${saved})`)
  await hold(low, 800)
  need(!presenceNow.revealed, 'the tab came back with the cursor still resting on the edge')
  lookAtEdge(away)
  await hold(low, EDGE_FAR_DWELL_MS + 100)
  await sleep(500)
  const bottom = work.y + work.height - tabH
  need(presenceNow.revealed && w.isVisible() && w.getBounds().y === bottom, `after leaving the edge, a push at the bottom brought the tab to ${w.isVisible() ? w.getBounds().y : 'nowhere'}, not ${bottom}`)
  // macOS animates the window between the tab and the panel, and takes longer at some times than others (with a
  // full-screen app's Space showing, say): wait for it to get there, up to 1.5 s.
  const settles = async (ok: () => boolean) => {
    const until = Date.now() + 1500
    while (!ok() && Date.now() < until) await sleep(50)
    return ok()
  }
  setDock('expanded')
  const panelTop = topAround(work, bottom, tabH, boundsFor('expanded').height, 24)
  need(await settles(() => w.getBounds().y === panelTop), `the panel opened at ${w.getBounds().y}, not around the tab at ${bottom} (${panelTop})`)
  setDock('collapsed')
  need(await settles(() => w.isVisible() && w.getBounds().y === bottom), `closing the panel put the tab at ${w.getBounds().y}, not back where it was (${bottom})`)
  raise({ key: 'approval:smoke-comes-to-you', level: 'urgent', title: 'A session needs you' })
  need(await settles(() => dock === 'nudge' && w.getBounds().y === bottom), `the nudge came out at ${w.getBounds().y}, not from the tab at ${bottom}`)
  setDock('collapsed')
  await sleep(500)
  await w.webContents.executeJavaScript(`window.steward.dock.drag('start'); window.steward.dock.drag('move', -100); window.steward.dock.drag('end')`)
  await sleep(300)
  need(w.getBounds().y === bottom - 100 && savedTabTop() === bottom - 100, `a drag from where the tab came out left it at ${w.getBounds().y}, saved at ${savedTabTop()}, not ${bottom - 100}`)
  await tuck()
  need(!w.isVisible() && boundsFor('collapsed').y === bottom - 100, 'after a drag, the tucked-away tab is not at its new saved spot')
  await resetTabPlace()
  need(savedTabTop() === saved, 'Reset did not bring the saved spot back')
  console.log(`smoke: the tab comes to you: a push held ${EDGE_FAR_DWELL_MS} ms brings it out at the cursor (top and bottom), sliding along the edge doesn't, a push counts again only after leaving the edge, the panel and a nudge grow from where it is, and a drag there saves it`)

  // Alerts: only a session that needs me peeks out. The rest wait (a dot in the menu bar) and show when the panel opens.
  raise({ key: 'finished:smoke', level: 'normal', title: 'A session finished' })
  alerts.flush()
  need(dock === 'collapsed' && !w.isVisible() && heldAlerts.length === 1, 'a finished session peeked out in quiet mode, or was lost')
  need(menuBarTitle(0, heldAlerts.length) === '•', 'the menu bar has no dot for a waiting alert')
  raise({ key: 'approval:smoke', level: 'urgent', title: 'A session needs you' })
  need(dock === 'nudge', 'a session that needs me did not peek out')
  await sleep(700)
  need(w.isVisible(), 'the nudge did not come out from the edge')
  // The nudge ends and the tab stays out until the cursor has been away for 1.5 s, so nothing pops.
  setDock('collapsed')
  await sleep(500)
  need(dock === 'collapsed' && w.isVisible(), 'the tab went at once when the nudge ended')
  await tuck()
  need(dock === 'collapsed' && !w.isVisible(), 'the tab did not tuck away after the nudge')
  setDock('expanded')
  need(heldAlerts.length === 0, 'the panel opened without showing the alerts that waited')
  await sleep(500)
  setDock('collapsed')
  await sleep(500)
  need(w.isVisible(), 'the tab went at once when the panel closed')
  await tuck()
  need(!w.isVisible(), 'the tab did not tuck away after the panel closed')
  console.log('smoke: only a session that needs me peeks out, the rest wait for the panel')

  // Always visible: the tab is there at rest, as before.
  await settings.update({ steward: { presence: 'always' } })
  presenceChanged()
  await sleep(700)
  need(w.isVisible(), 'the tab is not showing with Presence on Always visible')
  if (idle > 0) {
    app.getAppMetrics()
    await sleep(idle * 1000)
    console.log(`smoke: edge idle ${idle}s, Always visible (tab shown): ${cpuNow(w.webContents.getOSProcessId())}`)
  }

  // Dim when idle: after 20 s at rest the tab's eyes fade and stop; the cursor coming near wakes them. The 20 s began
  // when the tab last came to rest, about 3 s before this point, so it isn't dim 14 s from here, and is by 28 s.
  const dimmed = async () => Boolean(await w.webContents.executeJavaScript(`Boolean(document.querySelector('.pill-host.dimmed'))`))
  const waiting = Date.now()
  await sleep(DIM_AFTER_MS - 6000)
  need(!(await dimmed()), 'the eyes dimmed well before 20 s at rest')
  while (!(await dimmed()) && Date.now() - waiting < DIM_AFTER_MS + 8000) await sleep(250)
  const tookS = ((Date.now() - waiting) / 1000).toFixed(1)
  // If not, say what the tab's page had: any of these changing starts the 20 s over.
  const inputs = String(await w.webContents.executeJavaScript(`document.querySelector('.peek')?.dataset.dim ?? 'no tab'`))
  need(await dimmed(), `the eyes did not dim within ${tookS} s of this check (about 3 s more at rest); the tab had ${inputs}`)
  // The fade to dim takes 1.2 s; it has to settle at 0.4.
  const eyesOpacity = async () => Number(await w.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.pill-host')).opacity`))
  const fading = Date.now()
  let opacity = await eyesOpacity()
  while (Math.abs(opacity - 0.4) >= 0.02 && Date.now() - fading < 4000) {
    await sleep(100)
    opacity = await eyesOpacity()
  }
  need(Math.abs(opacity - 0.4) < 0.02, `the dimmed eyes are at opacity ${opacity}, not 0.4, 4 s after they began to fade`)
  // What the edge's watcher sends when the cursor comes within reach of the tab.
  w.webContents.send('presence:near', true)
  await sleep(300)
  need(!(await dimmed()), 'the cursor coming near did not wake the eyes')
  w.webContents.send('presence:near', false)
  console.log(`smoke: the tab's eyes dim ${tookS} s into this check, about 20 s at rest (opacity ${opacity}), and the cursor coming near wakes them`)

  // The tab drags up or down its edge, through the bridge its page uses. It stays inside the work area, the place is saved
  // for this display, the panel stays on screen, and Reset brings it back to the middle.
  const area = screen.getPrimaryDisplay().workArea
  const middle = w.getBounds().y
  const drag = (dy: number) => w.webContents.executeJavaScript(`window.steward.dock.drag('start'); window.steward.dock.drag('move', ${dy}); window.steward.dock.drag('end')`)
  await drag(-200)
  await sleep(300)
  need(w.getBounds().y === middle - 200, `the tab is at ${w.getBounds().y} after a drag of 200 up from ${middle}`)
  need(appState.tabPlaces[String(screen.getPrimaryDisplay().id)] !== undefined, "the tab's place was not saved")
  await drag(-5000)
  await sleep(300)
  need(w.getBounds().y === area.y, `the tab went past the top of the work area (${w.getBounds().y}, not ${area.y})`)
  const panel = boundsFor('expanded')
  need(panel.y >= area.y + 24 && panel.y + panel.height <= area.y + area.height - 24, 'the panel would be off screen with the tab at the top')
  await drag(5000)
  await sleep(300)
  need(w.getBounds().y + w.getBounds().height === area.y + area.height, 'the tab went past the bottom of the work area')
  await resetTabPlace()
  await sleep(600)
  need(w.getBounds().y === middle, 'Reset did not bring the tab back to the middle')
  console.log('smoke: the tab drags up and down its edge, stays inside the work area, is saved, and Reset brings it back')

  // Both edges, as mirrors: the tab and the nudge stop at the screen edge with square corners, and their window hangs
  // past it by the overhang (left empty), so the rounded corners macOS gives every frameless window are off the screen.
  // At the default height and after a drag. The screen's own pixels can't be read here, so this checks the window's
  // place and what the page drew.
  const screenBounds = screen.getPrimaryDisplay().bounds
  const flush = async (what: string, edge: 'left' | 'right', save?: string) => {
    const b = w.getBounds()
    const oh = edgeOverhang()
    const screenEdge = edge === 'right' ? screenBounds.x + screenBounds.width : screenBounds.x
    const windowEdge = edge === 'right' ? b.x + b.width - oh : b.x + oh
    need(windowEdge === screenEdge, `${what} on the ${edge} edge ends at ${windowEdge}, not at the screen edge (${screenEdge}), with ${oh} points hanging past it`)
    const img = await w.webContents.capturePage()
    if (save) await fs.writeFile(out.replace(/\.png$/, save), img.toPNG())
    const a = (x: number, y: number) => alphaAt(img, x, y, b.width)
    const inside = edge === 'right' ? b.width - oh - 1 : oh + 1
    const far = edge === 'right' ? 1 : b.width - 2
    const past = edge === 'right' ? b.width - oh / 2 : oh / 2
    const seen = { edgeTop: a(inside, 1), edgeBottom: a(inside, b.height - 2), farTop: a(far, 1), past: oh ? a(past, b.height / 2) : 0 }
    need(seen.edgeTop > 200 && seen.edgeBottom > 200 && seen.farTop < 60 && seen.past < 10, `${what} on the ${edge} edge is not square at the screen edge and rounded away from it: ${JSON.stringify(seen)}`)
  }
  for (const edge of ['right', 'left'] as const) {
    await settings.update({ steward: { edge } })
    win!.setBounds(boundsFor(dock))
    replaceForNotch()
    await sleep(700)
    await flush('the tab', edge, edge === 'left' ? '-left-tab.png' : undefined)
    raise({ key: `approval:smoke-${edge}`, level: 'urgent', title: 'A session needs you', detail: 'mirrored on both edges' })
    need(dock === 'nudge', `a session that needs me did not peek out on the ${edge} edge`)
    await sleep(700)
    await flush('the nudge', edge, edge === 'left' ? '-left-nudge.png' : undefined)
    setDock('collapsed')
    await sleep(700)
    await drag(-150)
    await sleep(300)
    await flush('the tab after a drag', edge)
    await resetTabPlace()
    await sleep(600)
  }
  await settings.update({ steward: { edge: 'right' } })
  win!.setBounds(boundsFor(dock))
  replaceForNotch()
  await sleep(500)
  console.log(`smoke: on both edges the tab and the nudge stop square at the screen edge, ${edgeOverhang()} points of window hanging past it`)

  // Step aside, fed what macOS's notifications would say. The real question to macOS is asked once, to see it answers.
  const asked = await lookNow()
  need(asked !== null && asked.front.pid > 0, 'macOS did not say which app is in front')
  console.log(`smoke: step aside: macOS says ${asked?.front.app ?? 'an app without a bundle id'} is in front, full screen on ${JSON.stringify(asked?.fullScreenOn)}`)
  await settings.update({ steward: { hideInFullScreen: true, hideInApps: [{ id: 'com.apple.iWork.Keynote', name: 'Keynote' }] } })
  syncStepAside()
  await sleep(300)
  need(w.isVisible() && !steppedAside, 'the tab is not out before anything asked it to step aside')
  noteFront({ app: 'com.apple.iWork.Keynote', pid: 90_001 })
  await sleep(300)
  need(steppedAside && !w.isVisible(), 'the tab did not step aside with an app on the list in front')
  raise({ key: 'approval:smoke-aside', level: 'urgent', title: 'A session needs you' })
  await sleep(300)
  need(dock === 'collapsed' && !w.isVisible() && asideAlerts.length === 1, 'an alert peeked out while stepping aside, or was lost')
  // Steward itself coming forward (its panel, opened by the hotkey) changes nothing; the panel still opens. Looked at
  // right away: an open panel that loses focus folds away, and the person using the Mac may click elsewhere meanwhile.
  noteFront({ app: 'com.github.Electron', pid: process.pid })
  setDock('expanded')
  need(steppedAside && dock === 'expanded' && w.isVisible(), 'the panel did not open from the hotkey while stepping aside')
  await sleep(400)
  setDock('collapsed')
  await sleep(400)
  need(steppedAside && !w.isVisible(), 'the tab came back when the panel closed, while stepping aside')
  raise({ key: 'approval:smoke-aside-2', level: 'urgent', title: 'Another session needs you' })
  noteFront({ app: 'com.apple.finder', pid: 90_002 })
  await sleep(500)
  need(!steppedAside && dock === 'nudge' && w.isVisible() && asideAlerts.length === 0, 'the alert that waited did not peek out once Steward was back')
  setDock('collapsed')
  await sleep(400)
  // A full-screen app on Steward's screen, and on another one.
  noteFullScreen([stewardScreen() + 1])
  await sleep(300)
  need(!steppedAside && w.isVisible(), 'the tab stepped aside for a full-screen app on another screen')
  noteFullScreen([stewardScreen()])
  await sleep(300)
  need(steppedAside && !w.isVisible(), 'the tab did not step aside for a full-screen app on its screen')
  await settings.update({ steward: { hideInFullScreen: false } })
  syncStepAside()
  await sleep(300)
  need(!steppedAside && w.isVisible(), 'the tab did not come back when "In full-screen apps" was switched off')
  noteFullScreen([])
  await settings.update({ steward: { hideInFullScreen: true, hideInApps: [] } })
  syncStepAside()
  console.log('smoke: step aside: an app on the list in front or a full-screen app on its screen hides the tab, alerts wait and peek out once it is back, and the hotkey still opens the panel')
}

/**
 * On a Mac whose screen has a notch: docks Steward there in both styles, checks the tab left the edge and the notch
 * window drew something, and saves what it drew next to the smoke screenshot. STEWARD_SMOKE_IDLE=seconds then leaves
 * it resting that long and reports how much CPU it used. Elsewhere (CI), it says so and skips.
 */
async function checkNotch(out: string): Promise<void> {
  if (!notchGeo) return void console.log('smoke: no notch on this screen, skipped the notch')
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  setDock('collapsed')
  for (const notchStyle of ['chin', 'wings'] as const) {
    await settings.update({ steward: { notch: true, notchStyle } })
    replaceForNotch()
    notch.restyle()
    await sleep(1500)
    const image = await notch.capture()
    if (!image || image.isEmpty()) throw new Error(`the notch (${notchStyle}) rendered empty`)
    if (win?.isVisible()) throw new Error('the tab still shows at the edge while docked in the notch')
    if (!notch.visible) throw new Error('the notch window is not showing')
    const file = out.replace(/\.png$/, `-notch-${notchStyle}.png`)
    await fs.writeFile(file, image.toPNG())
    const b = notch.windowBounds()
    console.log(`smoke: notch ${notchStyle}: notch ${notchGeo.width}x${notchGeo.height} at x ${notchGeo.x}; window ${b?.width}x${b?.height} at ${b?.x},${b?.y} -> ${file}`)

    // Awake, the black reaches below the notch (a chin) or beside it (wings), and the eyes are lit in it.
    const layout = notch.state().layout!
    const solid = (img: Electron.NativeImage, x: number, y: number) => alphaAt(img, x, y, NOTCH_WINDOW.width) > 200
    const below = layout.height + 8
    const beside = layout.width / 2 + 8
    if (notchStyle === 'chin' ? !solid(image, layout.cx, below) : !solid(image, layout.cx - beside, layout.height / 2)) throw new Error(`the awake notch (${notchStyle}) did not draw its ${notchStyle === 'chin' ? 'chin' : 'wings'}`)

    // Dim when idle, in the notch (once, in Chin): after 20 s awake at rest the eyes fade; the cursor coming near wakes
    // them. The real cursor is left out of the smoke run (moving the mouse near the top of the screen would wake them).
    if (notchStyle === 'chin') {
      const page = notch.contents()!
      const dim = async () => Boolean(await page.executeJavaScript(`Boolean(document.querySelector('.notch-root.dim'))`))
      const waiting = Date.now()
      while (!(await dim()) && Date.now() - waiting < DIM_AFTER_MS + 8000) await sleep(250)
      if (!(await dim())) throw new Error(`the notch's eyes did not dim within ${((Date.now() - waiting) / 1000).toFixed(1)} s at rest`)
      // What the notch window sends its page when the cursor comes near.
      notch.post('notch:cursor', { x: layout.cx, y: 10 })
      await sleep(300)
      if (await dim()) throw new Error('the cursor coming near the notch did not wake its eyes')
      notch.post('notch:cursor', null)
      console.log("smoke: notch: after 20 s at rest the eyes dim, and the cursor coming near wakes them")
      // The notch steps aside too, for a full-screen app on its screen, and comes back after.
      noteFullScreen([stewardScreen()])
      await sleep(300)
      if (notch.visible || !steppedAside) throw new Error('the notch did not step aside for a full-screen app on its screen')
      noteFullScreen([])
      await sleep(300)
      if (!notch.visible) throw new Error('the notch did not come back once the full-screen app was gone')
      console.log('smoke: notch: it steps aside for a full-screen app on its screen, and comes back')
    }

    // Always visible, the cursor on the black grows it a little: the chin taller, or the wings wider. The real watcher
    // is shown a made-up cursor. With Reduce Motion on it doesn't grow.
    const page = notch.contents()!
    const reducedNow = Boolean(await page.executeJavaScript(`matchMedia('(prefers-reduced-motion: reduce)').matches`))
    const grownAt: [number, number] = notchStyle === 'chin' ? [layout.cx, layout.height + NOTCH_LIP + NOTCH_HOVER_LIP / 2] : [layout.cx - (layout.width / 2 + NOTCH_WING + NOTCH_HOVER_WINGS / 4), layout.height / 2]
    const grown = async () => solid((await notch.capture())!, ...grownAt)
    if (await grown()) throw new Error(`the notch (${notchStyle}) is grown before the cursor is on it`)
    const onBlack = { x: notchGeo.x + notchGeo.width / 2, y: notchGeo.y + 10 }
    const hoverLook = await motionLook(page, MOVING_BLACK[notchStyle], '.nt')
    if (reducedNow) {
      smokeNotchCursor = onBlack
      await sleep(600)
    } else smoothly(`the notch growing on hover (${notchStyle})`, await watchMotion(page, hoverLook, 700, () => void (smokeNotchCursor = onBlack)))
    if (!notch.state().hover) throw new Error(`the notch (${notchStyle}) did not see the cursor on it`)
    if ((await grown()) === reducedNow) throw new Error(reducedNow ? 'the notch grew on hover with Reduce Motion on' : `the notch (${notchStyle}) did not grow with the cursor on it`)
    await fs.writeFile(file.replace(/\.png$/, '-hover.png'), (await notch.capture())!.toPNG())
    smokeNotchCursor = null
    await sleep(900)
    if (notch.state().hover || (await grown())) throw new Error(`the notch (${notchStyle}) did not shrink back once the cursor left`)
    console.log(`smoke: notch ${notchStyle}: the cursor on it ${reducedNow ? 'is seen (Reduce Motion: no growth)' : 'grows it a little'}, and leaving shrinks it back`)

    // A click opens the panel under the notch, on the notch's screen, its top just under the menu bar, coming down from
    // it. Closing it brings Steward back to the notch.
    if (notchStyle === 'chin') {
      // Kept open for the check: an open panel that loses focus folds away, and someone may be using another app.
      const keptOpen = settings.keepPanelOpen()
      await settings.update({ keepPanelOpen: true })
      setDock('expanded')
      const area = notchDisplay().workArea
      const want = underNotch(notchGeo, area, { width: PANEL_WIDTH, height: Math.min(760, area.height - 48) })
      const at = win!.getBounds()
      if (at.x !== want.x || at.y !== area.y || at.width !== want.width || at.height !== want.height) throw new Error(`the panel opened at ${JSON.stringify(at)}, not under the notch (${JSON.stringify(want)})`)
      if (notch.visible) throw new Error('the notch window still shows with the panel open')
      let entrance = ''
      for (let tries = 0; tries < 12 && !entrance; tries++) {
        await sleep(50)
        entrance = String(await win!.webContents.executeJavaScript(`document.documentElement.hasAttribute('data-notch') ? getComputedStyle(document.querySelector('.panel') ?? document.body).animationName : 'no notch'`))
        if (entrance === 'none') entrance = ''
      }
      if (entrance !== (reducedNow ? 'fadein' : 'panel-drop')) throw new Error(`the panel from the notch came in with "${entrance}", not ${reducedNow ? 'a fade' : 'the drop from the notch'}`)
      await sleep(500)
      await fs.writeFile(out.replace(/\.png$/, '-notch-panel.png'), (await win!.webContents.capturePage()).toPNG())
      setDock('collapsed')
      await settings.update({ keepPanelOpen: keptOpen })
      await sleep(400)
      if (!notch.visible || win!.isVisible()) throw new Error('closing the panel did not bring Steward back to the notch')
      console.log(`smoke: notch: a click opens the panel under it (${at.width}x${at.height} at ${at.x},${at.y}), coming down from it, and closing brings it back`)
    }

    // Only when needed: asleep it is the notch's own black and nothing else, so what is under it stays clickable.
    await settings.update({ steward: { presence: 'quiet' } })
    presenceChanged()
    await sleep(1500)
    const resting = await notch.capture()
    if (!resting || resting.isEmpty()) throw new Error(`the sleeping notch (${notchStyle}) rendered empty`)
    if (!solid(resting, layout.cx, layout.height / 2)) throw new Error('the sleeping notch does not cover the notch')
    if (solid(resting, layout.cx, below) || solid(resting, layout.cx - beside, layout.height / 2) || solid(resting, layout.cx + beside, layout.height / 2)) throw new Error(`the sleeping notch (${notchStyle}) still reaches beyond the notch`)
    await fs.writeFile(file.replace(/\.png$/, '-asleep.png'), resting.toPNG())
    // The cursor resting on it for 250 ms wakes it; leaving for 1.5 s puts it back to sleep.
    lookAtCursor(true, true, NOTCH_DWELL_MS)
    await sleep(100)
    lookAtCursor(true, true, NOTCH_DWELL_MS)
    if (presenceNow.revealed) throw new Error('the notch woke before the cursor had rested on it for 250 ms')
    await sleep(200)
    const notchLook = await motionLook(notch.contents()!, MOVING_BLACK[notchStyle], '.nt')
    smoothly(`the notch waking (${notchStyle})${notchLook.label}`, await watchMotion(notch.contents()!, notchLook, 1300, () => void lookAtCursor(true, true, NOTCH_DWELL_MS)))
    if (!presenceNow.revealed) throw new Error('the notch did not wake when the cursor rested on it')
    await sleep(300)
    const woke = await notch.capture()
    if (!woke || (notchStyle === 'chin' ? !solid(woke, layout.cx, below) : !solid(woke, layout.cx - beside, layout.height / 2))) throw new Error(`the notch (${notchStyle}) did not grow when it woke`)
    lookAtCursor(false, false, NOTCH_DWELL_MS)
    await sleep(1600)
    smoothly(`the notch going to sleep (${notchStyle})${notchLook.label}`, await watchMotion(notch.contents()!, notchLook, 1300, () => void lookAtCursor(false, false, NOTCH_DWELL_MS)))
    if (presenceNow.revealed) throw new Error('the notch did not go back to sleep after the cursor left')
    console.log(`smoke: notch ${notchStyle}: asleep is the notch's black only, resting the cursor on it wakes it, leaving puts it back to sleep`)
    await settings.update({ steward: { presence: 'always' } })
    presenceChanged()
  }
  const idle = Number(process.env.STEWARD_SMOKE_IDLE ?? 0)
  const measure = async (what: string) => {
    const pid = notch.pid()
    app.getAppMetrics()
    await sleep(idle * 1000)
    const m = app.getAppMetrics()
    const cpu = (p: number | null | undefined) => m.find((x) => x.pid === p)?.cpu.percentCPUUsage.toFixed(2)
    console.log(`smoke: notch idle ${idle}s, ${what}: notch page ${cpu(pid)}% CPU, main ${cpu(process.pid)}% CPU, GPU ${m.find((x) => x.type === 'GPU')?.cpu.percentCPUUsage.toFixed(2)}%`)
  }
  if (idle > 0) {
    await measure('Always visible')
    // Asleep, the eyes aren't drawn at all: this should be lower.
    await settings.update({ steward: { presence: 'quiet' } })
    presenceChanged()
    await sleep(1500)
    await measure('Only when needed, asleep')
    await settings.update({ steward: { presence: 'always' } })
    presenceChanged()
  }
  await settings.update({ steward: { notch: false } })
  replaceForNotch()
  if (!win?.isVisible()) throw new Error('the tab did not come back to the edge')
  console.log('smoke: notch off, the tab is back at the edge')
}

/** Opens Settings and screenshots it (every section with STEWARD_SMOKE_SECTIONS), next to the smoke screenshot. */
async function captureSettings(out: string): Promise<void> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  openSettings('general')
  const w = settingsWin!
  await new Promise<void>((resolve, reject) => {
    w.webContents.once('did-finish-load', () => resolve())
    w.webContents.once('did-fail-load', (_e, code, description) => reject(new Error(`settings load failed: ${code} ${description}`)))
  })
  await sleep(1000)
  if (!(await w.webContents.executeJavaScript('Boolean(document.querySelector("[data-settings]"))'))) throw new Error('settings window did not mount')
  // Going to Settings isn't clicking away: the panel should still be out. (Logged, not failed: focus is up to macOS.)
  console.log(`smoke: settings focused ${w.isFocused()}, panel still ${dock}`)
  for (const section of SMOKE_SECTIONS ? SETTINGS_SECTIONS : (['general'] as const)) {
    w.webContents.send('settings:section', section)
    await sleep(600)
    const image = await w.webContents.capturePage()
    if (image.isEmpty()) throw new Error('settings window rendered empty')
    const file = out.replace(/\.png$/, SMOKE_SECTIONS ? `-settings-${section}.png` : '-settings.png')
    await fs.writeFile(file, image.toPNG())
    console.log(`smoke: settings ${section} -> ${file}`)
  }
  // The Presence group is below the fold in Steward: with Only when needed picked, scroll to it and screenshot it.
  await settings.update({ steward: { presence: 'quiet' } })
  presenceChanged()
  w.webContents.send('settings:section', 'steward')
  await sleep(600)
  const found = await w.webContents.executeJavaScript(
    `(() => { const h = [...document.querySelectorAll('.set-group h2')].find((x) => x.textContent === 'Presence'); h?.scrollIntoView({ block: 'center' }); return Boolean(h) })()`,
  )
  if (!found) throw new Error('Settings → Steward has no Presence group')
  await sleep(400)
  const presenceShot = await w.webContents.capturePage()
  if (presenceShot.isEmpty()) throw new Error('settings window rendered empty')
  await fs.writeFile(out.replace(/\.png$/, '-settings-presence.png'), presenceShot.toPNG())
  // Step aside, below it, with an app on its list.
  await settings.update({ steward: { hideInApps: [{ id: 'com.apple.iWork.Keynote', name: 'Keynote' }] } })
  await sleep(300)
  const aside = await w.webContents.executeJavaScript(
    `(() => { const h = [...document.querySelectorAll('.set-group h2')].find((x) => x.textContent === 'Step aside'); h?.scrollIntoView({ block: 'start' }); return Boolean(h) })()`,
  )
  if (!aside) throw new Error('Settings → Steward has no Step aside group')
  await sleep(400)
  await fs.writeFile(out.replace(/\.png$/, '-settings-step-aside.png'), (await w.webContents.capturePage()).toPNG())
  await settings.update({ steward: { presence: 'always', hideInApps: [] } })
  presenceChanged()
  // Closing it hands focus back to the panel, so clicking away tucks it again.
  w.close()
  await sleep(300)
  console.log(`smoke: settings closed, panel ${dock} and focused ${win?.isFocused()}`)
}

/** Plays the demo request and captures the panel at the given seconds, next to the smoke screenshot. */
async function captureDemo(w: BrowserWindow, out: string, seconds: string): Promise<void> {
  const times = seconds.split(',').map(Number).filter((n) => n >= 0)
  const started = Date.now()
  void agent.send('/demo')
  for (const [i, t] of times.entries()) {
    await new Promise((resolve) => setTimeout(resolve, Math.max(0, started + t * 1000 - Date.now())))
    const file = out.replace(/\.png$/, `-demo-${i + 1}.png`)
    await fs.writeFile(file, (await w.webContents.capturePage()).toPNG())
    console.log(`smoke: demo ${t}s -> ${file}`)
  }
}

/** A made-up screenshot for the demo request: a soft gradient, like a page header. */
function demoImage(): Buffer {
  const width = 480
  const height = 300
  const bitmap = Buffer.alloc(width * height * 4)
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const u = x / width
      const v = y / height
      const header = y < 28
      // BGRA
      bitmap[i] = header ? 238 : Math.round(255 - 40 * v)
      bitmap[i + 1] = header ? 234 : Math.round(196 + 40 * u)
      bitmap[i + 2] = header ? 232 : Math.round(124 + 110 * u * (1 - v))
      bitmap[i + 3] = 255
    }
  }
  return nativeImage.createFromBitmap(bitmap, { width, height }).toPNG()
}

app.whenReady().then(async () => {
  if (SMOKE_THEME === 'light' || SMOKE_THEME === 'dark') nativeTheme.themeSource = SMOKE_THEME
  const userData = app.getPath('userData')
  // The smoke check starts as a fresh install every time, which is quiet: its throwaway data folder is emptied first.
  if (SMOKE_OUT) await Promise.all(['settings.json', 'state.json'].map((f) => fs.rm(path.join(userData, f), { force: true })))
  settings = new SettingsStore(path.join(userData, 'settings.json'), () => ({ registered, openAtLogin: loginItem(), version: app.getVersion() }), broadcastSettings)
  await settings.load()
  // Only when needed, the window starts out of sight, with its page slid out ready to come in.
  slidOut = quiet()
  registerGlobalShortcuts()
  if (secretsPending(userData)) {
    // The copied keys were encrypted for the old keychain entry: re-encrypt them once. macOS asks to allow this;
    // if it's denied, the keys simply need entering again in Settings.
    await readLegacyKeychainPassword().then((password) => settings.migrateLegacySecrets(password), () => 0)
    markSecretsDone(userData)
  }
  appState = new AppState(path.join(userData, 'state.json'))
  await appState.load()
  tabPlaces = appState.tabPlaces
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
    // Typing /demo plays a made-up request with every kind of step, without calling the API. Development only.
    demoImage: app.isPackaged && !SMOKE_OUT ? undefined : demoImage,
    name: () => settings.steward().name,
    emit: (event) => {
      win?.webContents.send('agent:event', event)
      // Peek out when the agent needs a decision; the approval card is in the panel.
      if (event.type === 'approval') raise({ key: `agent-approval:${event.id}`, level: 'urgent', title: 'Steward needs your OK', detail: event.command, mood: 'needs-you' })
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
  notch = new NotchDock({
    preload: path.join(__dirname, '../preload/index.js'),
    load: (w) => loadPage(w, 'notch.html'),
    style: () => settings.steward().notchStyle,
    onCursor: lookAtNotch,
    cursor: () => (drivenBySmoke ? smokeNotchCursor : screen.getCursorScreenPoint()),
    // Only when needed, waking up is the grow; Always visible, the cursor on the black grows it a little.
    hoverable: () => !quiet(),
  })
  // Only when needed, it starts asleep.
  notch.setAwake(out())
  // Where the notch is decides whether the tab shows at the edge, so it's known before the window shows.
  await refreshNotch()
  win = createWindow()
  syncWatch()
  // Step aside: listen for full-screen apps and the listed ones, and ask macOS where things stand now.
  syncStepAside()
  // A fresh install that hides until needed comes out once, a moment after it starts, so a new user can find it.
  win.webContents.once('did-finish-load', () => {
    if (!drivenBySmoke) setTimeout(maybeFirstPeek, 1200)
  })
  // Nobody is at a sleeping or locked screen to push against the edge.
  const screenIs = (asleepNow: boolean) => () => {
    screenAsleep = asleepNow
    syncWatch()
  }
  powerMonitor.on('suspend', screenIs(true))
  powerMonitor.on('lock-screen', screenIs(true))
  powerMonitor.on('resume', screenIs(false))
  powerMonitor.on('unlock-screen', screenIs(false))
  if (SMOKE_OUT) runSmokeCheck(win, SMOKE_OUT)
  else {
    menuBar = new Tray(menuBarIcon())
    menuBar.setToolTip('Steward')
    updateMenuBar()
    hookServer = new HookServer(userData, (event) => void onHookEvent(event))
    await hookServer.start().catch((err: Error) => {
      hookServer = null
      console.error(`[steward] hook server failed to start: ${err.message}`)
    })
    // Hooks installed before the rename still read the port and token from the old data folder.
    // Keep that working until they're updated in Settings.
    if ((await claudeStatus()).outdated) await hookServer?.mirrorTo(path.join(app.getPath('appData'), LEGACY_APP_NAME)).catch(() => {})
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
  // A display added or removed, the lid closed or opened, or another resolution: look for the notch again.
  let recheck: ReturnType<typeof setTimeout> | undefined
  const notchLater = () => {
    clearTimeout(recheck)
    recheck = setTimeout(() => {
      void refreshNotch()
      // Which screens show a full-screen app may have changed too.
      if (asideSubs.length) void lookAside()
    }, 400)
  }
  screen.on('display-added', notchLater)
  screen.on('display-removed', notchLater)
  screen.on('display-metrics-changed', notchLater)
  // Reduce transparency, and light or dark, can change while Steward runs.
  nativeTheme.on('updated', () => {
    applied = null
    applyMaterial()
    if (settingsWin && !settingsWin.isDestroyed()) {
      const { vibrant } = settingsAppearance()
      settingsWin.setVibrancy(vibrant ? 'sidebar' : null)
      if (!vibrant) settingsWin.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#1c1f27' : '#f4f6fa')
      settingsWin.webContents.send('appearance:changed', { vibrant })
    }
  })
})

app.on('second-instance', () => setDock('expanded'))
app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  hookServer?.stop()
  deploys?.stop()
})
app.on('window-all-closed', () => app.quit())
