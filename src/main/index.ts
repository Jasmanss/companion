import { app, BrowserWindow, clipboard, dialog, globalShortcut, ipcMain, Menu, nativeImage, nativeTheme, net, powerMonitor, powerSaveBlocker, protocol, screen, shell, systemPreferences, Tray } from 'electron'
import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { islandParts, ISLAND_WINDOW, NOTCH_HOVER_LIP, NOTCH_HOVER_WINGS, NOTCH_LIP, NOTCH_WINDOW, NOTCH_WING, NOTE_LINES, noteSize, nudgeUnderNotch, type IslandNoteSize } from '../shared/notch'
import { checkShortcut, formatAccelerator, GLOBAL_SHORTCUTS, isGlobalShortcut, isShortcutId, normalizeAccelerator, shortcutInfo, type GlobalShortcutId } from '../shared/shortcuts'
import { NUDGE_WIDTH, TAB_SIZES } from '../shared/steward'
import { clampTop, placeFor, TabDrag, topAround, topFor, type Rect } from '../shared/tab-place'
import { clampPanel, clearOfPanel, PanelDrag, panelRect, pickSpot, spotFor, type PanelSpot } from '../shared/panel-place'
import { DIM_AFTER_MS } from '../shared/dim'
import { REVIEW_VIEWER_GAP, reviewViewerRect } from '../shared/review'
import type { AlertView, Appearance, ClaudeHookStatus, DeployStatus, DockState, IslandAct, IslandNote, IslandNoteKind, Mood, NightReport, NotchGeometry, NotchLayout, NotchStyle, PillGlint, Project, SessionView, SettingsSection, SettingsView, StepAsideApp, ViewerKind, WatchView } from '../shared/types'
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
  reviewHookInstalled,
  withStewardHooks,
  withoutStewardHooks,
  writeClaudeSettings,
} from './claude-settings'
import { alwaysAsks } from './commands'
import { DeployWatcher, fetchBuildLog, type DeployChange } from './deploys'
import { downloadImage } from './fetch-image'
import { CiTracker, dependabotPRs, findGh, GH_COMMANDS, ghRunner, GIT_REMOTE, isGitHubRemote, mainRuns, MergeTracker, mergedPRs, type CiChange, type GhRunner } from './github'
import type { HookPayload } from './hook-payload'
import { HookServer } from './hook-server'
import { runGit, whereYouLeftOff } from './left-off'
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
  firstPeekNote,
  firstPeekOver,
  presenceNote,
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
import { alertNote, BIG_NOTE_MS, hookNote, IslandNotes, islandStatus, nextChange, NOTE_AFTER_HOVER_MS, NOTE_SHOW_MS, type Turns } from './island-status'
import { cameBack, idleLookMs, nextReactionChange, pickReaction, recentStops, type ReactionInput } from './reactions'
import { reviewAlert, ReviewTracker, sameTurnFinished } from './review'
import { SessionActivity } from './session-activity'
import { cardPicture, CHANNEL_TOLERANCE, changedAt, comparePictures, GATE_MIN_PIXELS } from './review-diff'
import { isReviewId, ReviewStore, type ReviewRecord } from './review-store'
import { SessionTracker } from './sessions'
import { filesChangedSince, lookAtFiles } from './turn-files'
import { buildNightReport } from './night-report'
import { STUCK_MS, StuckWatch, stuckAlert } from './stuck'
import { isTranscriptPath } from './transcript'
import { OvernightWatch, wakeAt, WatchLog, type Night } from './watch'
import { appFromUserInfo, frontAfter, lookNow, readApp, shouldStepAside, withApp, type FrontApp } from './step-aside'
import { checkAutoMode } from './smoke-auto'
import { judgeMotion, MAX_GAP_MS, measureMotion, MIN_POSITIONS, type Motion, type Sample, type Seen } from './smoke-motion'
import { keepMacAwake, keepOffTheUsersScreen, pretendNotch, pretendNotchScreen, smokeHidden, type Unseen } from './smoke-env'
import { deadPort, gitInit, startPageServer, type SmokeVersion } from './smoke-review'
import { extensionForMime, TrayStore } from './tray-store'
import { saveImagesToProject } from './projects'
import { capturePage } from './screenshot'
import { describeEyeSweep, measureEyeSweep, type EyeSample, type EyeSweep } from './smoke-eyes'
import { SettingsStore } from './settings'
import { parseSettingsPatch } from './settings-schema'

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
/** Smoke check shortcut while building: "island" runs only the notch island's checks once the panel shows (CI runs it all). */
const SMOKE_ONLY = process.env.STEWARD_SMOKE_ONLY
/** The window goes when the page says the tab's slide out has ended (0.3 s); if it never says, it goes after this. */
const SLIDE_MS = 700
/** Why the window went, when the page's slide ended with no frame to draw its end (its own clock said so). */
const SLIDE_END_UNDRAWN = "its slide's end time, with no frame drawn"

protocol.registerSchemesAsPrivileged([
  { scheme: 'tray', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
  { scheme: 'review', privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true } },
])

/** Set when the smoke check runs hidden (the default, see smoke-env.ts): its windows are see-through and never take focus. */
let unseen: Unseen | null = null

// The smoke check runs alongside a normal copy, with its own throwaway data.
if (SMOKE_OUT) {
  app.setPath('userData', path.join(os.tmpdir(), 'steward-smoke'))
  if (smokeHidden(process.env)) unseen = keepOffTheUsersScreen(app, BrowserWindow)
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
/** What the viewing state shows: the tray's images, or a Visual Review's before and after (bigger). */
let viewKind: ViewerKind = 'tray'
let modalOpen = false
let draggingOut = false
let settings: SettingsStore
let tray: TrayStore
let agent: Agent
let sessions: SessionTracker
/** Visual Review: the before and after of a project's running page. */
let reviews: ReviewTracker
let reviewStore: ReviewStore
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
/** Overnight Watch: Go rest, and Steward keeps the Mac awake and writes the night down. */
let watch: OvernightWatch | null = null
/** The nights' logs, which the night reports are built from. */
let watchLog: WatchLog | null = null
/** What the Watch looks at besides alerts: runs on main (new each night) and sessions that may be stuck. */
let ciTracker = new CiTracker()
const stuck = new StuckWatch()
let nightTimer: ReturnType<typeof setInterval> | undefined
/** Projects whose code is on GitHub, once asked (git's origin), for the goodnight card. */
const onGitHub = new Map<string, boolean>()
/** Its keep-awake blocker, while a night goes on. */
let watchBlocker: number | null = null
/** The smoke check says how long the Mac has been idle, so someone's real mouse can't change what it checks. */
let smokeIdle = 0
const idleSeconds = (): number => (SMOKE_OUT ? smokeIdle : powerMonitor.getSystemIdleTime())
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
/** Where the panel was dragged to on each display (see shared/panel-place), by display id, and the one it was last left on. */
let panelPlaces: Record<string, PanelSpot> = {}
let panelDisplay: string | undefined
/** The panel being dragged by its top bar, while it is, and the screen it's over. Blurring then isn't clicking away. */
let panelDrag: { drag: PanelDrag; display: Electron.Display; moved: boolean } | null = null
/** The closed panel's (or a nudge's) way out is playing: the window stays where it is until it's over. */
let wayOutPlaying = false
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
 * nudge is the tab grown sideways; the panel is centered on the tab, kept on screen; the viewer is centered (a review's
 * is bigger, on the panel's screen). Docked in
 * the notch, the nudge, the panel and the viewer come down from the notch instead, on the notch's own screen. A panel
 * that was dragged somewhere opens there instead, at the edge or in the notch.
 */
function boundsFor(state: DockState): Electron.Rectangle {
  // A review's before and after gets nearly the whole screen the panel is on, wherever the panel was moved to.
  if (state === 'viewing' && viewKind === 'review') return reviewViewerRect((panelSpot()?.display ?? panelHome()).workArea)
  // Dragged somewhere, the panel opens there: on the screen it was left on, inside its work area.
  const spot = state === 'expanded' ? panelSpot() : null
  if (spot) return panelRect(spot.display.workArea, panelSize(spot.display.workArea), spot.spot)
  if (state === 'nudge' && inNotch() && notchGeo) return nudgeUnderNotch(notchGeo, notchDisplay().workArea, NUDGE_WIDTH)
  const { edge, size } = settings.steward()
  // Docked in the notch, the panel opens at the side Settings says, on the notch's screen, near its top: never under
  // the notch, which keeps Steward.
  if ((state === 'expanded' || state === 'viewing') && inNotch() && notchGeo) {
    const area = notchDisplay().workArea
    const width = state === 'viewing' ? Math.min(VIEWER_MAX_WIDTH, area.width - 120) : PANEL_WIDTH
    const height = state === 'viewing' ? area.height - 48 : Math.min(760, area.height - 48)
    const y = state === 'viewing' ? area.y + Math.round((area.height - height) / 2) : area.y + 8
    return { x: edge === 'left' ? area.x + 8 : area.x + area.width - width - 8, y, width, height }
  }
  const area = screen.getPrimaryDisplay().workArea
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
    if (state === 'nudge' && nudgeWords > tab.height) {
      // Taller than the tab for its words: grown evenly up and down from the tab, kept inside the screen.
      const height = Math.min(nudgeWords, area.height - 16)
      const y = Math.round(Math.min(area.y + area.height - height - 8, Math.max(area.y + 8, top - (height - tab.height) / 2)))
      return { x: x(width) - (edge === 'left' ? oh : 0), y, width: width + oh, height }
    }
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

/** The panel's size on a screen: as wide as always, as tall as the work area allows. */
const panelSize = (area: Rect) => ({ width: PANEL_WIDTH, height: Math.min(760, area.height - 48) })

/** The screen the panel opens on when it hasn't been moved: the notch's in the notch, otherwise the main one. */
const panelHome = (): Electron.Display => (inNotch() ? notchDisplay() : screen.getPrimaryDisplay())

/** Where a moved panel opens: its saved spot and that spot's screen. null: it hasn't been moved (see pickSpot). */
function panelSpot(): { display: Electron.Display; spot: PanelSpot } | null {
  const displays = screen.getAllDisplays()
  const at = pickSpot(panelPlaces, panelDisplay, displays.map((d) => String(d.id)), String(panelHome().id))
  const display = at && displays.find((d) => String(d.id) === at.display)
  return at && display ? { display, spot: at.spot } : null
}

/** The panel has been moved: it opens and closes where it is, not at its edge or the notch. */
const placed = (): boolean => panelSpot() !== null

/** What the page was last told about the panel being moved (it picks the panel's way in and out by it). */
let sentPlaced: boolean | null = null
function sendPlaced(again = false): void {
  const now = placed()
  if (!win || win.isDestroyed() || (now === sentPlaced && !again)) return
  sentPlaced = now
  win.webContents.send('dock:placed', now)
}

/**
 * From the panel's page: a drag by its top bar began, moved (the pointer is at x, y on the screen), or ended. The window
 * follows the pointer, kept inside the work area of the screen the pointer is over; the end saves where it is, for that
 * screen. Only the open panel moves: the viewer stays centered.
 */
function dragPanel(phase: unknown, x?: unknown, y?: unknown): void {
  if (!win || win.isDestroyed()) return
  if (phase === 'end') {
    if (panelDrag?.moved) savePanelPlace(win.getBounds(), panelDrag.display)
    panelDrag = null
    // Steward in the notch looks where the panel is now.
    placeNotch()
    return
  }
  const pointer = typeof x === 'number' && typeof y === 'number' && Number.isFinite(x) && Number.isFinite(y) ? { x, y } : null
  if (dock !== 'expanded' || !pointer) return
  if (phase === 'start') panelDrag = { drag: new PanelDrag(win.getBounds(), pointer), display: screen.getDisplayNearestPoint(pointer), moved: false }
  else if (phase === 'move' && panelDrag) {
    panelDrag.display = screen.getDisplayNearestPoint(pointer)
    panelDrag.moved = true
    const started = performance.now()
    win.setBounds(panelDrag.drag.move(pointer, panelDrag.display.workArea), false)
    if (drivenBySmoke) panelMoves.push({ at: started, took: performance.now() - started })
  }
}

/** Each move of a drag, for the smoke check: when it came, and how long moving the window took. */
const panelMoves: { at: number; took: number }[] = []

/** Remember where the panel is now, on that screen, and that it was left there. */
function savePanelPlace(bounds: Rect, display: Electron.Display): void {
  const id = String(display.id)
  panelPlaces = { ...panelPlaces, [id]: spotFor(display.workArea, bounds) }
  panelDisplay = id
  void appState.update({ panelPlaces, panelDisplay })
  sendPlaced()
}

/**
 * Double-click on the top bar, or Settings → Steward → Reset: the panel forgets where it was moved, on every screen. An
 * open one glides home (at its edge, the notch's screen in the notch), and the old way in and out is back.
 */
async function resetPanelPlace(): Promise<void> {
  panelPlaces = {}
  panelDisplay = undefined
  await appState.update({ panelPlaces, panelDisplay })
  sendPlaced()
  if (win && !win.isDestroyed() && dock === 'expanded' && win.isVisible()) win.setBounds(boundsFor('expanded'), true)
  placeNotch()
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
  wayOutPlaying = false
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
 * Peek out with a nudge: from the tab at the edge, or in the notch under it, where its page plays it coming down out of
 * the notch (styles.css). In the notch it never slides in from the edge, and the window doesn't move on its way.
 */
function showNudge(animate: boolean): void {
  if (!inNotch()) return showTab(boundsFor('nudge'), animate)
  clearTimeout(slideTimer)
  setSlide(false, false)
  showTab(boundsFor('nudge'), false)
}

/** How long the way out may take before the window goes anyway (the page's exits are 0.2 s). */
const WAY_OUT_MS = 450

/**
 * The panel closed or the nudge went, and its page plays the way out where the window is (styles.css): up into the
 * notch, or for a moved panel shrinking where it is. It says when it's done (intoNotchEnded), and the window moves on
 * then. If the page never says, this does.
 */
function wayOut(): void {
  clearTimeout(slideTimer)
  wayOutPlaying = true
  slideTimer = setTimeout(intoNotchEnded, WAY_OUT_MS)
}

/**
 * The way out is over, unless the panel was opened (or a nudge came) meanwhile: at the edge, with Steward out, the
 * window jumps to the tab's place (no animated resize); otherwise it goes. Then the page draws what's next.
 */
function intoNotchEnded(): void {
  clearTimeout(slideTimer)
  wayOutPlaying = false
  if (!win || win.isDestroyed() || (dock !== 'collapsed' && dock !== 'hidden')) return
  if (dock === 'collapsed' && !inNotch() && out()) showTab(boundsFor('collapsed'), false)
  else hideTab()
  win.webContents.send('dock:left')
}

/**
 * Take the window off the screen. Only when needed, its page waits slid out, ready to come in from the edge, and the tab
 * is back at its saved spot for the next time (a push brings it to the cursor again).
 */
function hideTab(why?: string): void {
  if (!win || win.isDestroyed()) return
  clearTimeout(slideTimer)
  wayOutPlaying = false
  if (why) lastTuck = { ms: Date.now() - tuckStarted, why }
  win.hide()
  revealTop = null
  setSlide(quiet(), false)
}

const MOODS: Mood[] = ['resting', 'idle', 'listening', 'thinking', 'talking', 'done', 'needs-you', 'worried', 'mad', 'celebrating', 'sleepy', 'confused', 'focused', 'juggling', 'nod', 'proud', 'hello', 'watching']
const GLINTS: PillGlint[] = ['sweep', 'step', 'search']
const isOpen = (state: DockState) => state === 'expanded' || state === 'viewing'

/**
 * Steward shows in the notch unless it was hidden by hand: tucked away, with a nudge out under it (joined to its chin),
 * and while the panel is open at the side, looking toward it. Not in the notch: the tab is back at the edge.
 */
function placeNotch(): void {
  notch?.setNudge(inNotch() && dock === 'nudge')
  notch?.setPanel(inNotch() ? panelLook() : null)
  notch?.show(inNotch() && dock !== 'hidden' && !steppedAside)
}

/** Which way the open panel is from the notch, for Steward to look at; null while it isn't open. */
function panelLook(): { x: number; y: number } | null {
  if (!isOpen(dock) || !notchGeo) return null
  const b = boundsFor(dock)
  const dx = b.x + b.width / 2 - (notchGeo.x + notchGeo.width / 2)
  return { x: Math.round(Math.max(-1, Math.min(1, dx / 300)) * 80) / 100, y: 0.35 }
}

/**
 * A display changed (the Dock or the menu bar moved, another resolution): the window goes where it belongs now (a moved
 * panel stays inside the new work area). Not in the notch at rest: the window is gone there, or on its way back up into
 * the notch, and is never at the edge. Nor while a way out plays: the window stays put until it's over.
 */
function placeAfterDisplayChange(): void {
  if (!win || win.isDestroyed() || wayOutPlaying || (inNotch() && (dock === 'collapsed' || dock === 'hidden'))) return
  win.setBounds(boundsFor(dock))
}

/** The tab or the notch follows whether Steward is out: it slides in or out, or the notch wakes or goes to sleep. */
function applyPresence(): void {
  notch?.setAwake(out())
  if (!win || win.isDestroyed() || dock !== 'collapsed' || inNotch()) return
  if (out()) showTab(boundsFor('collapsed'))
  else tuckTab()
}

/**
 * Resting (the panel just closed, a nudge went, or Steward just came back): at the edge, the tab stays out and the
 * watcher tucks it away once the cursor has left and everything is at rest, so closing the panel never pops. The notch
 * goes to sleep, except after a nudge: then it stays awake like the tab does, until the cursor has left it.
 */
function restingPresence(afterNudge = false): PresenceState {
  return quiet() && (!inNotch() || afterNudge) ? { revealed: true, since: null } : asleep()
}

/** Ask macOS where the notch is (at launch, and whenever a display changes), and put Steward where it belongs. */
async function refreshNotch(): Promise<void> {
  const found = pretendNotch(process.env, screen.getPrimaryDisplay()) ?? findNotch(await probeScreens(), screen.getAllDisplays())
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
  if (!win || win.isDestroyed()) return
  // A nudge that's out moves too: under the notch, or back to the edge.
  if (dock === 'nudge') return showNudge(false)
  if (dock !== 'collapsed') return
  if (inNotch()) hideTab()
  else if (out()) showTab(boundsFor('collapsed'), false)
  else if (win.isVisible()) hideTab()
}

function setDock(state: DockState): void {
  if (!win || dock === state) return
  const wasHidden = dock === 'hidden'
  const wasOpen = isOpen(dock)
  const wasNudge = dock === 'nudge'
  // A moved panel closes where it is: it shrinks and fades there, and then the tab or the notch is back.
  const inPlace = wasOpen && !isOpen(state) && placed()
  dock = state
  // Leaving the nudge ends the first-launch peek, however it ended (clicked, closed, timed out, or the cursor left).
  if (state !== 'nudge') {
    firstPeek = null
    clearTimeout(peekTimer)
  }
  // Only when needed: a nudge brings Steward out, and at rest it stays out only while the cursor is on it (or work goes on).
  presenceNow = state === 'nudge' ? { revealed: quiet(), since: null } : state === 'collapsed' ? restingPresence(wasNudge) : asleep()
  notch?.setAwake(out())
  if (wasOpen && !isOpen(state)) void appState?.update({ lastSeenAt: Date.now() })
  if (!wasOpen && isOpen(state)) onPanelOpened()
  // The material first, so the panel's very first frame is drawn for it (frosted or solid).
  applyMaterial()
  // Before the state, so the page picks the panel's way in or out by it.
  sendPlaced()
  win.webContents.send('dock:state', state)
  updateMenuBar()
  placeNotch()
  if (state !== 'expanded') panelDrag = null
  if (state === 'hidden') {
    // A moved panel leaves where it is; docked in the notch, an open panel or a nudge goes back up into it first, as
    // when it's closed.
    if (inPlace && win.isVisible()) wayOut()
    else if ((wasOpen || wasNudge) && inNotch() && win.isVisible()) wayOut()
    else hideTab()
    return syncWatch()
  }
  if (state === 'collapsed' || state === 'nudge') {
    if (state === 'collapsed' && inPlace && win.isVisible()) wayOut()
    else if (state === 'collapsed' && inNotch()) {
      // In the notch there's no tab at the edge: the notch window is the character. An open panel or a nudge goes back
      // up into the notch (its page plays that) before the window goes, and the window stays where it is: never at the edge.
      if ((wasOpen || wasNudge) && win.isVisible()) wayOut()
      else hideTab()
    } else if (state === 'collapsed' && !out()) tuckTab()
    // Peeking never takes keyboard focus, so it can't interrupt typing. Out of hiding, it comes in from the edge.
    else if (state === 'nudge') showNudge(!wasHidden)
    else showTab(boundsFor(state), !wasHidden)
  } else {
    // Hotkey or menu bar, with Steward out of sight: the panel is just there, and its own entrance plays.
    clearTimeout(slideTimer)
    wayOutPlaying = false
    setSlide(false, false)
    // From a nudge in the notch, the panel comes down from the notch as it always does there, not grown out of the nudge.
    // A moved panel pops in at its spot: the window is just there.
    win.setBounds(boundsFor(state), win.isVisible() && !wasHidden && !(wasNudge && inNotch()) && !placed())
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

/**
 * The menu bar's title. While hidden, stepping aside, or when Steward only comes out when needed, it shows how many
 * sessions are waiting on you, and a dot when something quieter is waiting too: an alert, or a review not decided yet.
 */
function menuBarText(): string {
  const waiting = sessions?.waitingCount() ?? 0
  return menuBarTitle(dock === 'hidden' || quiet() || steppedAside ? waiting : 0, heldAlerts.length + asideAlerts.length + pendingReviews + (watch?.unseen ? 1 : 0), watch?.watching ?? false)
}

/** "11:10 PM", for the menu bar. */
const clockText = (at: number) => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** The menu bar's Overnight Watch items: Goodnight, or how long it watches and the ways to end it. */
function watchMenuItems(): Electron.MenuItemConstructorOptions[] {
  const night = watch?.night
  if (!night) return [{ label: 'Goodnight…', click: openGoodnight }]
  return [
    { label: `Watching until ${clockText(night.until)}`, enabled: false },
    { label: "I'm Up", click: () => watch?.stop('up') },
    { label: 'Stop Watching', click: () => watch?.stop('stopped') },
  ]
}

function updateMenuBar(): void {
  if (!menuBar) return
  menuBar.setTitle(menuBarText())
  menuBar.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'Open Steward', accelerator: registered.togglePanel || undefined, registerAccelerator: false, click: () => setDock('expanded') },
      dock === 'hidden'
        ? { label: 'Show at Screen Edge', accelerator: registered.hideFromEdge || undefined, registerAccelerator: false, click: () => setDock('collapsed') }
        : { label: 'Hide from Screen Edge', accelerator: registered.hideFromEdge || undefined, registerAccelerator: false, click: () => setDock('hidden') },
      { label: 'Settings…', accelerator: 'Command+,', registerAccelerator: false, click: () => openSettings() },
      { type: 'separator' },
      ...watchMenuItems(),
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
  // The page starts out not knowing whether the panel was moved.
  w.webContents.on('did-finish-load', () => sendPlaced(true))

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
    if (settings.keepPanelOpen() || modalOpen || draggingOut || panelDrag || agent.waitingForApproval) return
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
  // Centered on the open panel's screen, unless the panel would cover part of it; then beside the panel, wherever it is
  // (at its edge, at its side in the notch, or dragged somewhere), when there's room.
  const panel = win && !win.isDestroyed() && isOpen(dock) && win.isVisible() ? win.getBounds() : null
  const area = (panel ? screen.getDisplayMatching(panel) : screen.getPrimaryDisplay()).workArea
  const at = clearOfPanel(area, SETTINGS_SIZE, panel)
  const { vibrant } = settingsAppearance()
  const w = new BrowserWindow({
    ...at,
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
  // The window in use is on top: the panel floats above normal windows, so while Settings has the keyboard it floats
  // too, above the panel. Once it hasn't, it's a normal window again, and clicking the panel puts the panel on top.
  w.on('focus', () => settingsOnTop(w, true))
  w.on('blur', () => settingsOnTop(w, false))
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

/** Settings above the panel (at the panel's level, and in front), or a normal window again. */
function settingsOnTop(w: BrowserWindow, on: boolean): void {
  if (w.isDestroyed()) return
  if (on) {
    w.setAlwaysOnTop(true, 'floating')
    w.moveTop()
  } else w.setAlwaysOnTop(false)
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
  const island = inNotch() && settings.steward().notchStyle === 'island'
  // Overnight Watch with nobody at the Mac: they wait for the panel (the menu bar's dot), as when Steward is hidden.
  const holding = !isOpen(dock) && (watch?.holdsAlerts() ?? false)
  const split = isOpen(dock) ? { peek: list, held: [] } : dock === 'hidden' || holding ? { peek: [], held: list } : splitAlerts(list, settings.steward().alertPeek, island)
  // The morning card never waits with the others: the report it is about shows when the panel opens.
  const held = split.held.filter((a) => !a.key.startsWith('night:'))
  // In the island every alert comes out as the island itself (one of its sizes), never as the old alert under the notch.
  const notes = island && !isOpen(dock) ? split.peek : []
  const peek = split.peek.filter((a) => !notes.includes(a))
  for (const alert of notes) showOnIsland(alert)
  if (held.length) heldAlerts = [...held.toReversed(), ...heldAlerts].slice(0, MAX_HELD)
  if (peek.length) {
    win?.webContents.send('alerts:show', peek)
    if (dock === 'collapsed') setDock('nudge')
  }
  updateMenuBar()
}

/** How tall the alert at the edge's words are (the page measures them): its window grows past the tab's height to hold them. */
let nudgeWords = 0

/** The alerts the island showed lately, by key: its buttons act on them, and a click shows one too long for it in the panel. */
const islandAlerts = new Map<string, AlertView>()

/**
 * An alert as the island's message (Island mode): the big sizes for what waits on you, a note for the rest. One that
 * can't show now (a note while something that needs you is out) waits for the panel, like the alerts held back.
 */
function showOnIsland(alert: AlertView): void {
  islandAlerts.delete(alert.key)
  islandAlerts.set(alert.key, alert)
  for (const key of [...islandAlerts.keys()].slice(0, Math.max(0, islandAlerts.size - MAX_HELD))) islandAlerts.delete(key)
  // (The morning card never waits: the report it's about shows when the panel opens.)
  if (!islandNotes.show(alertNote(alert, Date.now())) && !alert.key.startsWith('night:')) heldAlerts = [alert, ...heldAlerts].slice(0, MAX_HELD)
}

/**
 * A button on the island's message (at: which message, so a late press on one that's gone does nothing). Open and a
 * click on the island open the panel (a message too long for the island shows there whole); Later settles it now; Want
 * me to look? opens the panel and has Steward's agent read the build log; Allow and Deny answer Steward's own request;
 * Looks good and Open big are a review's.
 */
function islandAct(what: unknown, at: unknown): void {
  const note = islandNotes.current
  if (!note || note.at !== at) return
  const alert = note.key ? islandAlerts.get(note.key) : undefined
  const id = note.key?.slice(note.key.indexOf(':') + 1) ?? ''
  islandNotes.drop()
  switch (what) {
    case 'open':
      setDock('expanded')
      if (alert && note.fit === 'toolong') win?.webContents.send('alerts:show', [alert])
      return
    case 'look':
      setDock('expanded')
      if (alert?.action) win?.webContents.send('alerts:act', alert)
      return
    case 'allow':
    case 'deny':
      if (note.kind === 'agent') agent.approve(id, what === 'allow')
      return
    case 'good':
      if (note.kind === 'review' && isReviewId(id)) void reviews.markGood(id)
      return
    case 'big':
      if (note.kind !== 'review' || !isReviewId(id)) return
      setDock('expanded')
      win?.webContents.send('review:open', id)
      return
  }
}

/**
 * Whether what a big message is about still waits: a session's approval or question until it moves on, Steward's own
 * request until it's answered, a review until it's decided. A moment's grace after it shows, as the alert can come just
 * before the state it's about.
 */
function stillWaits(note: IslandNote, now: number): boolean {
  if (now - note.at < 1000) return true
  const session = (state: SessionView['state']) => sessions.list().some((s) => s.state === state && !!note.key?.includes(`:${s.id}:`))
  if (note.kind === 'wait') return session('needs-approval')
  if (note.kind === 'input') return session('needs-input')
  if (note.kind === 'agent') return agent.waitingForApproval
  if (note.kind === 'review') return pendingReviews > 0
  return true
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
  // Overnight Watch: someone looked. During a night the brief waits (the night's report will be it); after one, the
  // report shows instead.
  watch?.opened()
  if (watch?.watching) return
  if (watch?.unseen) return void showNightReport(watch.unseen)
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
 * so a new user sees where it lives. In the notch the notch wakes, and the note comes out under it like alerts do.
 */
function maybeFirstPeek(): void {
  if (!win || win.isDestroyed() || dock !== 'collapsed' || steppedAside) return
  if (!showFirstPeek({ freshInstall: settings.missing && appState.missing, quiet: quiet(), shown: appState.firstPeekShown })) return
  // The note was the panel's first-time note; this shows it instead.
  void appState.update({ firstPeekShown: true, presenceNoteSeen: true })
  const { title, detail } = firstPeekNote(noteFor())
  // In the island it's the island's own note (it stays at least 10 s, and ends once the cursor has touched it and left).
  if (inNotch() && settings.steward().notchStyle === 'island') return void islandNotes.show({ kind: 'first', name: title, text: detail, at: Date.now(), key: 'first-peek' })
  win.webContents.send('alerts:show', [{ id: 0, key: 'first-peek', level: 'normal', title, detail, at: Date.now() }])
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
  // Overnight Watch writes it down, and whether it waits (nobody at the Mac).
  watch?.alert(input, watch.holdsAlerts())
  moods.apply(input.mood, input.scope, Date.now())
  sendMood()
}

/** What Steward's reactions work from (main/reactions.ts): deploys and merges, the chats, and you coming back. */
function reactionInput(now: number): ReactionInput | null {
  if (!sessions || !agent) return null
  return { event: moods.current(now), sessions: sessions.list(), turns: activity.turns, stops: activity.lastStops(), agentWaiting: agent.waitingForApproval, backAt, now }
}

/**
 * The face the chats, deploys and you coming back call for goes to the panel, which puts the chat's own moods (and you
 * typing) above it and tells the notch. A one-shot's hold running out changes it, so the next look is set for then.
 */
function sendMood(): void {
  const now = Date.now()
  const input = reactionInput(now)
  const reaction = input ? pickReaction(input) : { mood: moods.current(now) }
  win?.webContents.send('alerts:mood', reaction.mood)
  clearTimeout(moodTimer)
  const next = [moods.nextChange(now), input && nextReactionChange(input)].filter((t): t is number => typeof t === 'number')
  if (next.length) moodTimer = setTimeout(sendMood, Math.min(...next) - now + 50)
  // The island's right side follows the reactions too (a "?", proud's spark).
  updateIsland()
}

function sendSessions(): void {
  win?.webContents.send('sessions:changed', sessions.list())
  sendMood()
  updateMenuBar()
}

/** When you came back to the Mac after ten minutes or more away (Steward says hello), and the idle time last seen. */
let backAt: number | null = null
let idleSeen: number | null = null

/** Look at how long the Mac has been idle: rarely, and every second once a return would count. */
function lookAtIdle(): void {
  const idle = powerMonitor.getSystemIdleTime()
  if (cameBack(idleSeen, idle)) {
    backAt = Date.now()
    sendMood()
  }
  idleSeen = idle
  setTimeout(lookAtIdle, idleLookMs(idle))
}

/**
 * A failed build peeks out mad (then stays worried until it's fixed) and offers to look; a ready one is celebrated
 * and screenshotted into the tray.
 */
function onDeployChanges(changes: DeployChange[]): void {
  for (const { kind, deploy } of changes) {
    watch?.deploy({ project: deploy.project, ok: kind === 'ready', production: deploy.target === 'production' })
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

/**
 * What the chats have been doing (a prompt sent, until Claude stops, and how each stop went): the notch island and
 * Steward's reactions read it. Then Steward's own agent, and the reviews waiting.
 */
const activity = new SessionActivity()
let agentSince: number | undefined
let pendingReviews = 0
let islandTimer: ReturnType<typeof setTimeout> | undefined
/** Its note, one line under the notch for a few seconds: a session finished, or a second project started. */
const islandNotes = new IslandNotes({ changed: () => updateIsland() })

/**
 * Work out what the notch island shows (Settings → Steward → In the notch → Island) and tell the notch window. Called
 * whenever something it shows from changes; a finished check goes by itself, so the next look is set for then.
 */
function updateIsland(): void {
  if (!notch || !sessions || !agent) return
  const now = Date.now()
  if (!agent.busy) agentSince = undefined
  else agentSince ??= now
  // A big message about something that no longer waits (answered in the terminal, say) settles now.
  const shown = islandNotes.current
  if (shown && !stillWaits(shown, now)) return islandNotes.drop()
  const input = { sessions: sessions.list(), turns: activity.turns, ...recentStops(activity.lastStops(), now), agentBusy: agent.busy, agentSince, agentWaiting: agent.waitingForApproval, reviews: pendingReviews, failed: moods.troubled(now), note: shown, now }
  notch.setIsland(islandStatus(input))
  // An alert's message comes out even when Steward only shows when needed: the island wakes while it shows, as the tab
  // comes out for a nudge, and goes back to sleep once it settles. (Finished and started are about work going on.)
  if (inNotch() && settings.steward().notchStyle === 'island') notch.setAwake(out() || (!!shown && shown.kind !== 'finished' && shown.kind !== 'started'))
  clearTimeout(islandTimer)
  const next = nextChange(input)
  if (next !== null) islandTimer = setTimeout(updateIsland, next - now + 50)
}

/**
 * News for the island's note, from a hook event (turns: the turns going on before it). Settings → Steward → "Alerts
 * that peek out: Nothing" means no note either, and a finished turn only gets one while Notifications says so.
 */
function islandNote(event: HookPayload, turns: Turns): void {
  // A new turn in any session: the island is about the work now, not what finished before.
  if (event.hook_event_name === 'UserPromptSubmit') islandNotes.drop('finished')
  const session = sessions.list().find((s) => s.id === event.session_id)
  const note = hookNote(event, { turns, agentBusy: agent.busy, name: sessions.names(event).name, detail: session?.detail, now: Date.now() })
  if (!note || settings.steward().alertPeek === 'none' || (note.kind === 'finished' && !settings.notifications().sessionFinished)) return
  islandNotes.show(note)
}

async function onHookEvent(event: HookPayload): Promise<void> {
  const turns = activity.turns
  activity.note(event, Date.now())
  // Anything from a session means it isn't stuck (Overnight Watch).
  const transcript = event.transcript_path && isTranscriptPath(event.transcript_path) ? event.transcript_path : undefined
  stuck.heard(event.session_id, Date.now(), { name: sessions.names(event).name, transcript })
  // A session about to push or deploy: check deploys more often for a while.
  const command = event.hook_event_name === 'PermissionRequest' ? event.tool_input?.command : undefined
  if (typeof command === 'string' && alwaysAsks(command)) deploys.boost()
  // A prompt was sent: photograph the page now (in the background), before Claude changes it.
  if (event.hook_event_name === 'UserPromptSubmit') reviews.turnStarted(event)
  const alert = await sessions.apply(event)
  // After the session strip has it, so a note has the chat's name and a finished one what Claude said.
  islandNote(event, turns)
  sendSessions()
  if (alert) raise(alert)
  // The turn ended: photograph it again, and keep a review if the page looks different.
  if (event.hook_event_name === 'Stop') void reviews.turnStopped(event).then((record) => record && reviewReady(record, event))
}

/**
 * A review is ready: it comes out as an alert that needs you (in the notch island, as the island's note), and the plain
 * "finished" alert of the same turn goes, so there's one alert, not two. One that already peeked out stays shown.
 */
async function reviewReady(record: ReviewRecord, event: { session_id: string; prompt_id?: string }): Promise<void> {
  // The island and the menu bar count it first, so the note has the review's mark to settle to.
  await sendReviews()
  const same = sameTurnFinished(event)
  alerts.withdraw(same)
  heldAlerts = heldAlerts.filter((a) => !same(a))
  asideAlerts = asideAlerts.filter((a) => !same(a))
  raise(reviewAlert(record))
}

/** Overnight Watch keeps the Mac from sleeping when idle (the screen may still sleep) for as long as a night goes on. */
function keepAwakeForWatch(on: boolean): void {
  if (on && watchBlocker === null) watchBlocker = powerSaveBlocker.start('prevent-app-suspension')
  else if (!on && watchBlocker !== null) {
    powerSaveBlocker.stop(watchBlocker)
    watchBlocker = null
  }
}

/** What the goodnight card and the Watching line show: the night, and what Steward can see tonight. */
async function watchView(): Promise<WatchView> {
  const night = watch?.night
  const list = sessions.list()
  const linked = settings.vercelToken() ? (await deploys.linked()).map((l) => l.name) : []
  const working = workingSessions()
  return {
    watching: Boolean(night),
    since: night?.since,
    until: night?.until,
    wakeTime: watch?.wakeTime ?? '07:30',
    plan: { working: list.filter((s) => working.includes(s.id)).map((s) => s.name), waiting: sessions.waitingCount(), deploys: linked, ci: gh ? await githubProjects() : null },
    onBattery: powerMonitor.isOnBatteryPower(),
    ended: watch?.ended,
    lastNight: (await keptNights())[0],
  }
}

/** The nights with a report kept, newest first: not the one going on. */
async function keptNights(): Promise<string[]> {
  const going = watch?.night?.id
  return (await watchLog?.list())?.filter((id) => id !== going) ?? []
}

/** A night's report, built now from its log and the reviews as they stand. null: not kept, or still going on. */
async function nightReportFor(id: string): Promise<NightReport | null> {
  const ids = await keptNights()
  const i = ids.indexOf(id)
  if (!watchLog || i < 0) return null
  const events = await watchLog.read(id)
  return buildNightReport({ id, events, review: (r) => reviewStore.get(r), now: Date.now(), latest: i === 0, earlier: ids[i + 1] ?? null, later: ids[i - 1] ?? null })
}

/** The report goes to the panel. Seen, it is also the day's morning brief. */
async function showNightReport(id: string): Promise<void> {
  const report = await nightReportFor(id)
  if (watch?.unseen === id) watch.seen()
  if (report) {
    win?.webContents.send('watch:report', report)
    void appState.update({ lastBriefDate: localDate(new Date()) })
  }
  updateMenuBar()
}

/**
 * A night ended. What waited on screen doesn't come back one by one: it's in the report. With the panel open the report
 * shows there at once; otherwise one card comes out (in the island, as its note), and the report shows when the panel
 * next opens. A log without its first line (it couldn't be written) leaves the alerts as they are.
 */
async function nightEnded(night: Night): Promise<void> {
  await watch?.settled()
  const events = (await watchLog?.read(night.id)) ?? []
  if (events[0]?.type === 'start') {
    const before = (a: AlertView) => a.at < night.since
    heldAlerts = heldAlerts.filter(before)
    asideAlerts = asideAlerts.filter(before)
  }
  if (win && isOpen(dock)) await showNightReport(night.id)
  else await morningCard()
  updateMenuBar()
}

/** The one card after a night: the greeting and the report's line. A click opens the panel, where the report is. */
async function morningCard(): Promise<void> {
  const id = watch?.unseen
  if (!id || !win || watch?.watching) return
  const report = await nightReportFor(id)
  if (!report) return watch?.seen()
  raise({ key: `night:${id}`, level: 'urgent', title: report.title, detail: report.summary })
}

/**
 * The sessions with a turn going on (a prompt sent, no stop yet) that aren't waiting on you: working. The strip's own
 * state can't say, because a prompt doesn't change it.
 */
function workingSessions(): string[] {
  const waiting = new Set(sessions.list().filter((s) => s.state === 'needs-approval' || s.state === 'needs-input').map((s) => s.id))
  return Object.keys(activity.turns).filter((id) => !waiting.has(id))
}

/** The projects on GitHub, whose runs on main the Watch can see. Asked of git once per project (read-only, fixed). */
async function githubProjects(): Promise<string[]> {
  const found: string[] = []
  for (const project of settings.projects()) {
    if (!onGitHub.has(project.path)) onGitHub.set(project.path, await runGit(GIT_REMOTE, project.path).then(isGitHubRemote, () => false))
    if (onGitHub.get(project.path)) found.push(project.name)
  }
  return found
}

/**
 * While a night goes on, the Watch looks at more than alerts: every minute for sessions that may be stuck, every two
 * for runs on main. Each night's first look at CI only takes note, so the day's runs are never news.
 */
function syncNightSources(): void {
  const night = watch?.night
  if (night && !nightTimer) {
    ciTracker = new CiTracker()
    void checkCi()
    let looks = 0
    nightTimer = setInterval(() => {
      void lookForStuck()
      if (++looks % 2 === 0) void checkCi()
    }, 60_000)
    nightTimer.unref?.()
  } else if (!night && nightTimer) {
    clearInterval(nightTimer)
    nightTimer = undefined
  }
}

/** The runs on main of every project on GitHub: one that ends red is urgent and comes out; a green one is the report's. */
async function checkCi(): Promise<void> {
  if (!gh || !watch?.watching) return
  for (const project of settings.projects()) {
    const runs = await mainRuns(project, gh).catch(() => null)
    if (runs) for (const change of ciTracker.update(project.path, runs)) onCiChange(project, change)
  }
}

/** A red run is mad, then worried, like a failed deploy; green again on main ends the worry for that project. */
function onCiChange(project: Project, { kind, run }: CiChange): void {
  watch?.ci({ project: project.name, workflow: run.workflowName, ok: kind === 'passed' })
  if (kind === 'failed') return raise({ key: `ci-failed:${project.path}:${run.databaseId}`, level: 'urgent', title: `${project.name}: CI failed on main`, detail: run.workflowName, mood: 'mad', scope: project.path })
  moods.clear(project.path)
  sendMood()
}

/** Sessions working with nothing from them for 45 minutes get a word, and at 90 an urgent alert; both go in the log. */
async function lookForStuck(now = Date.now()): Promise<void> {
  const night = watch?.night
  if (!night) return
  for (const step of await stuck.look(workingSessions(), now, night.since)) {
    watch?.stuck({ name: step.name, minutes: step.minutes })
    raise(stuckAlert(step))
  }
}

/** The Watch started, stopped or changed: the panel and the menu bar follow, and the night's looks start or stop. */
function sendWatch(): void {
  syncNightSources()
  updateMenuBar()
  void watchView().then((view) => win?.webContents.send('watch:changed', view))
}

/** Goodnight from the menu bar: the panel opens on the goodnight card. */
function openGoodnight(): void {
  setDock('expanded')
  win?.webContents.send('watch:goodnight')
}

/** The reviews waiting for a decision go to the panel (the card at its top), the island and the menu bar's dot. */
function sendReviews(): Promise<void> {
  return reviews.pending().then((list) => {
    win?.webContents.send('review:changed', list)
    pendingReviews = list.length
    updateIsland()
    updateMenuBar()
    // A decision changes what the history says became of a review.
    sendReviewHistory()
  })
}

/** The history changed (a look after a turn, a decision, or Clear): Settings asks for it again. */
function sendReviewHistory(): void {
  if (settingsWin && !settingsWin.isDestroyed()) settingsWin.webContents.send('review:history')
}

/** A check that found no visible change goes to the panel as a quiet line, so it's never silent. */
function sendReviewChecks(): void {
  win?.webContents.send('review:checks', reviews.checks())
}

/** Why a project's page can't be seen goes to the panel (a quiet line) and to Settings (under the address). */
function sendReviewProblems(): void {
  const list = reviews.problems()
  for (const w of [win, settingsWin]) if (w && !w.isDestroyed()) w.webContents.send('review:problems', list)
}

const stewardHookCommand = () => hookCommand(app.getPath('userData'))

async function claudeStatus(): Promise<ClaudeHookStatus> {
  const base = { connected: false, outdated: false, reviewHook: false, serverRunning: (hookServer?.port ?? 0) > 0, settingsFile: CLAUDE_SETTINGS_FILE, backupFile: path.basename(await backupFile()) }
  try {
    const claude = await readClaudeSettings()
    const state = hookState(claude, stewardHookCommand())
    return { ...base, connected: state === 'current', outdated: state === 'outdated', reviewHook: reviewHookInstalled(claude, stewardHookCommand()) }
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
  // Settings → Steward → Reset: the tab's height and the panel's spot. In the notch there's no tab, so only the panel.
  ipcMain.handle('dock:resetPlace', async () => {
    if (!inNotch()) await resetTabPlace()
    await resetPanelPlace()
  })
  ipcMain.on('dock:dragPanel', (_e, phase: unknown, x: unknown, y: unknown) => dragPanel(phase, x, y))
  ipcMain.handle('dock:resetPanel', () => resetPanelPlace())
  ipcMain.handle('notch:geometry', () => notchGeo)
  ipcMain.handle('notch:state', () => notch.state())
  // A click on the island opens the panel, as its message's Open does.
  ipcMain.on('notch:click', () => (islandNotes.current ? islandAct('open', islandNotes.current.at) : setDock('expanded')))
  ipcMain.on('notch:act', (_e, what: unknown, at: unknown) => islandAct(what, at))
  ipcMain.on('dock:nudgeWords', (_e, height: unknown) => {
    if (typeof height !== 'number' || !Number.isFinite(height)) return
    nudgeWords = Math.ceil(height)
    if (dock === 'nudge' && !inNotch() && win && !win.isDestroyed()) win.setBounds(boundsFor('nudge'))
  })
  ipcMain.on('notch:fit', (_e, at: unknown, fit: unknown) => {
    if (typeof at === 'number' && (fit === 'note' || fit === 'long' || fit === 'toolong')) islandNotes.fit(at, fit)
  })
  ipcMain.on('notch:reportMood', (_e, mood: unknown, glint: unknown) => {
    if (MOODS.includes(mood as Mood) && GLINTS.includes(glint as PillGlint)) notch.setMood(mood as Mood, glint as PillGlint)
  })
  ipcMain.handle('dock:collapse', () => setDock('collapsed'))
  ipcMain.on('dock:intoNotchEnded', () => intoNotchEnded())
  ipcMain.handle('dock:hide', () => setDock('hidden'))
  ipcMain.handle('dock:view', (_e, kind: unknown) => {
    const next: ViewerKind = kind === 'review' ? 'review' : 'tray'
    // Already viewing the other kind: only the size changes.
    if (dock === 'viewing' && next !== viewKind && win && !win.isDestroyed()) {
      viewKind = next
      return win.setBounds(boundsFor('viewing'), true)
    }
    viewKind = next
    setDock('viewing')
  })
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
  ipcMain.handle('settings:setProjectUrl', async (_e, projectPath: unknown, address: unknown) => {
    if (typeof projectPath !== 'string' || typeof address !== 'string') throw new Error('Bad request')
    await settings.setProjectUrl(projectPath, address)
    // A problem with the old address is no longer news.
    sendReviewProblems()
    return settings.view()
  })
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
    if (patch.keepPanelOpen !== undefined || patch.commandMode !== undefined || patch.notifications || patch.steward) await settings.update(patch)
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

  // Visual Review. The address always comes from Settings (the project's own), never from the window or a hook.
  ipcMain.handle('review:list', () => reviews.pending())
  ipcMain.handle('review:problems', () => reviews.problems())
  ipcMain.handle('review:checks', () => reviews.checks())
  ipcMain.handle('review:tryIt', (_e, projectPath: unknown) => (typeof projectPath === 'string' ? reviews.tryIt(projectPath) : { ok: false, error: 'Bad request' }))
  ipcMain.handle('review:markGood', (_e, id: unknown) => (isReviewId(id) ? reviews.markGood(id) : undefined))
  ipcMain.handle('review:sendBack', async (_e, id: unknown, note: unknown) => {
    if (!isReviewId(id) || typeof note !== 'string') throw new Error('Bad request')
    const text = await reviews.sendBack(id, note.slice(0, 2000))
    clipboard.writeText(text)
    return text
  })
  ipcMain.handle('review:openFull', async (_e, id: unknown, which: unknown) => {
    const file = isReviewId(id) && (which === 'before' || which === 'after') ? reviewStore.file(id, which) : null
    if (file) await shell.openPath(file)
  })
  ipcMain.handle('review:history', (_e, projectPath: unknown) => (typeof projectPath === 'string' ? reviews.history(projectPath) : []))
  ipcMain.handle('review:usage', () => reviewStore.usage())
  ipcMain.handle('watch:get', () => watchView())
  ipcMain.handle('watch:report', (_e, id: unknown) => (typeof id === 'string' ? nightReportFor(id) : null))
  ipcMain.handle('watch:nights', async () => (await keptNights()).length)
  ipcMain.handle('watch:clear', async () => {
    await watchLog?.clear(watch?.night?.id)
    watch?.seen()
    sendWatch()
  })
  ipcMain.handle('watch:start', (_e, wakeTime: unknown) => {
    watch?.start(typeof wakeTime === 'string' ? wakeTime : (watch?.wakeTime ?? ''))
    return watchView()
  })
  ipcMain.handle('watch:stop', (_e, why: unknown) => {
    watch?.stop(why === 'up' ? 'up' : 'stopped')
    return watchView()
  })
  ipcMain.handle('watch:setWakeTime', (_e, wakeTime: unknown) => {
    if (typeof wakeTime === 'string') watch?.setWakeTime(wakeTime)
    return watchView()
  })
  ipcMain.handle('review:clear', () => reviews.clear())

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
  const timer = setTimeout(() => fail('timed out'), 30_000 + 90_000 + Number(process.env.STEWARD_SMOKE_IDLE ?? 0) * 2000)
  w.webContents.once('did-fail-load', (_e, code, description) => fail(`load failed: ${code} ${description}`))
  w.webContents.once('did-finish-load', async () => {
    try {
      console.log(unseen ? 'smoke: hidden: the windows are real but nearly see-through (1%), click-through and never focused (--visible shows them)' : 'smoke: visible: the windows are on screen, and take focus')
      // A fresh install is quiet: the tab stays out of sight until it's needed. Then Presence goes to Always visible.
      const presenceTimer = setTimeout(() => fail('presence timed out'), 90_000 + Number(process.env.STEWARD_SMOKE_IDLE ?? 0) * 2000)
      if (SMOKE_ONLY === 'island') {
        await settings.update({ steward: { presence: 'always' } })
        presenceChanged()
        for (const t = Date.now(); !w.isVisible() && Date.now() - t < 3000; ) await new Promise((resolve) => setTimeout(resolve, 100))
      } else await checkPresence(w, out)
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
      if (SMOKE_ONLY === 'island') {
        const islandTimer = setTimeout(() => fail('the island timed out'), 150_000)
        await checkTabAlertWords(w, out)
        setDock('collapsed')
        if (!notchGeo) return fail('no notch: run with STEWARD_SMOKE_NOTCH=1')
        await checkIsland(out)
        clearTimeout(islandTimer)
        return app.exit(0)
      }
      if (SMOKE_DEMO) await captureDemo(w, out, SMOKE_DEMO)
      const reviewTimer = setTimeout(() => fail('visual review timed out'), 120_000)
      await checkReview(w, out)
      clearTimeout(reviewTimer)
      const wordsTimer = setTimeout(() => fail("the edge alert's words timed out"), 20_000)
      await checkTabAlertWords(w, out)
      clearTimeout(wordsTimer)
      const watchTimer = setTimeout(() => fail('overnight watch timed out'), 40_000)
      await checkWatch(w, out)
      clearTimeout(watchTimer)
      // The Settings window is its own page, so it gets checked too.
      const settingsTimer = setTimeout(() => fail('settings window timed out'), 20_000)
      await captureSettings(out)
      clearTimeout(settingsTimer)
      const autoTimer = setTimeout(() => fail('auto mode timed out'), 40_000)
      await runAutoSmoke(w, out)
      clearTimeout(autoTimer)
      const panelTimer = setTimeout(() => fail('the movable panel timed out'), 60_000)
      await checkMovablePanel()
      clearTimeout(panelTimer)
      const besideTimer = setTimeout(() => fail('Settings beside the panel timed out'), 40_000)
      await checkSettingsClearOfPanel()
      clearTimeout(besideTimer)
      const reactionsTimer = setTimeout(() => fail("Steward's reactions timed out"), 60_000)
      await checkReactions(out)
      clearTimeout(reactionsTimer)
      const notchTimer = setTimeout(() => fail('notch timed out'), 150_000 + Number(process.env.STEWARD_SMOKE_IDLE ?? 0) * 3000)
      await checkNotch(out)
      clearTimeout(notchTimer)
      if (unseen?.focusTaken()) return fail('a window took keyboard focus in a hidden run')
      app.exit(0)
    } catch (err) {
      fail(String(err))
    }
  })
}

/**
 * Steward's reactions, through the real hook path with made-up chats: the face the panel works out (as it tells the
 * notch) follows them. Focused for one working, juggling for two, a nod for a short turn, proud for a long one (and the
 * island's spark), confused for a question or a wait for input (the island's "?"), needs you for an approval, and hello
 * when you're back at the Mac.
 */
async function checkReactions(out: string): Promise<void> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  // Nothing peeks out: this is about the face, and a nudge would move the window the next checks expect at rest.
  const alertPeek = settings.steward().alertPeek
  await settings.update({ steward: { alertPeek: 'none' } })
  // The auto-mode check runs commands straight through the agent, so the panel keeps the agent's last mood (a chat turn
  // ends with "done", which clears it). End it the same way, and start from rest.
  if (agent.waitingForApproval) throw new Error('an approval from an earlier check is still waiting')
  win!.webContents.send('agent:event', { type: 'done' })
  // At rest is resting or idle, or sleepy after midnight.
  const atRest = () => ['resting', 'idle', 'sleepy'].includes(notch.state().mood)
  const settling = Date.now()
  while (!atRest() && Date.now() - settling < 4000) await sleep(50)
  if (!atRest()) throw new Error(`before the reactions, Steward's face is ${notch.state().mood} (${pickReaction(reactionInput(Date.now())!).why}), not at rest`)
  const ids = ['react-1', 'react-2', 'react-3', 'react-4', 'react-5']
  const clean = () => {
    for (const id of ids) sessions.dismiss(id)
    activity.reset()
    islandNotes.drop()
    backAt = null
    sendSessions()
  }
  clean()
  const hook = (hook_event_name: HookPayload['hook_event_name'], session_id: string, extra: Record<string, unknown> = {}) =>
    onHookEvent({ hook_event_name, session_id, cwd: '/tmp/steward-smoke-reactions', ...extra } as HookPayload)
  const seen: string[] = []
  const face = async (want: Mood, what: string, within = 2000) => {
    const started = Date.now()
    while (notch.state().mood !== want && Date.now() - started < within) await sleep(25)
    if (notch.state().mood !== want) throw new Error(`${what}: Steward's face is ${notch.state().mood}, not ${want}`)
    seen.push(`${want} (${what}, ${Date.now() - started} ms)`)
  }
  await hook('UserPromptSubmit', 'react-1')
  await face('focused', 'one chat working')
  await hook('UserPromptSubmit', 'react-2')
  await face('juggling', 'two chats working')
  await hook('Stop', 'react-2', { last_assistant_message: 'Done, the tests pass.' })
  await face('nod', 'a short turn ending')
  await face('focused', 'the nod over, one chat still working', 4000)
  // The other turn began over five minutes ago.
  activity.turns['react-1'] = Date.now() - 301_000
  await hook('Stop', 'react-1', { last_assistant_message: 'I rebuilt the settings page.' })
  await face('proud', 'a long turn ending')
  if (!notch.state().island?.spark) throw new Error(`after a long turn the island shows ${JSON.stringify(notch.state().island)}, with no spark`)
  await hook('UserPromptSubmit', 'react-3')
  await hook('Stop', 'react-3', { last_assistant_message: 'I found two layouts. Which one did you mean, page.tsx or layout.tsx?' })
  await face('confused', 'a chat ending on a question')
  if (notch.state().island?.right !== 'asks') throw new Error(`after a question the island's right side is ${notch.state().island?.right}, not a "?"`)
  await hook('Notification', 'react-4', { message: 'Claude is waiting for your input', notification_type: 'idle_prompt' })
  await face('confused', 'a chat waiting for input')
  await hook('PermissionRequest', 'react-5', { tool_name: 'Bash', tool_input: { command: 'npm test' } })
  await face('needs-you', 'a chat waiting for your OK')
  if (notch.state().island?.right !== 'needs') throw new Error(`with an approval waiting the island's right side is ${notch.state().island?.right}, not the amber mark`)
  clean()
  backAt = Date.now()
  sendMood()
  await face('hello', "back at the Mac after a while")
  clean()
  // The made-up chats' alerts (the finished ones wait 20 s to be batched) go now, while nothing peeks out, and are
  // dropped: a nudge coming out later would move the window the next checks expect at rest.
  alerts.flush()
  heldAlerts = []
  updateMenuBar()
  await settings.update({ steward: { alertPeek } })
  console.log(`smoke: reactions: ${seen.join('; ')}`)

  // The new faces, as Settings → Steward previews them: each a moment in, where it shows best.
  openSettings('steward')
  const sw = settingsWin!
  if (sw.webContents.isLoading()) await new Promise<void>((resolve) => sw.webContents.once('did-finish-load', () => resolve()))
  sw.webContents.send('settings:section', 'steward')
  await sleep(800)
  for (const [label, at] of [['Focusing', 1200], ['Juggling', 900], ['Quick nod', 420], ['Proud', 650], ['Confused', 800], ['Welcome back', 300]] as const) {
    const box = (await sw.webContents.executeJavaScript(
      `(() => { const b = [...document.querySelectorAll('.set-moods button')].find((x) => x.textContent === ${JSON.stringify(label)}); b?.click(); const r = document.querySelector('.set-preview')?.getBoundingClientRect(); return b && r ? { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) } : null })()`,
    )) as Electron.Rectangle | null
    if (!box) throw new Error(`Settings → Steward has no "${label}" in its mood preview`)
    await sleep(at)
    await fs.writeFile(out.replace(/\.png$/, `-face-${label.toLowerCase().replace(/ /g, '-')}.png`), (await sw.webContents.capturePage(box)).toPNG())
  }
  sw.close()
  await sleep(400)
}

/** The review the Watch check makes for its second night, cleared before the checks after it. */
let smokeNightReview: string | null = null
/** Its CI project, and the gh it stands in for, put back after it. */
let ciDir: string | null = null
let realGh: GhRunner | null | undefined

/**
 * Overnight Watch, Phase 1: the goodnight card from the panel's moon button, Go rest with a wake time, the keep-awake,
 * the moon in the menu bar, the Watching face, Steward tucking away; an alert waiting while nobody is at the Mac (and
 * written down without its detail) and peeking out while someone is; sleep and waking written down; and "I'm up"
 * ending it and letting the Mac sleep again. Phase 2: the night's report, shown at once in the open panel, or one card
 * after a night that ends with the panel closed and the report when the panel opens (the night's review inside it),
 * Earlier night and Clear. How long the Mac has been idle is the check's own (smokeIdle).
 */
async function checkWatch(w: BrowserWindow, out: string): Promise<void> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const need = (ok: boolean, why: string) => {
    if (!ok) throw new Error(why)
  }
  const wc = w.webContents
  const until = async (script: string, why: string, ms = 5000) => {
    for (const started = Date.now(); Date.now() - started < ms; await sleep(100)) if (await wc.executeJavaScript(script)) return
    throw new Error(why)
  }
  const dockNow = (): DockState => dock
  const button = (label: string) => wc.executeJavaScript(`[...document.querySelectorAll('.card.goodnight button')].find((b) => b.textContent === ${JSON.stringify(label)})?.click()`)
  const log = new WatchLog(path.join(app.getPath('userData'), 'watch'))
  try {
    need(!watch!.watching, 'a night was going on before the check')
    setDock('expanded')
    await sleep(700)
    // The moon in the panel's top bar opens the card: what Steward can see tonight, and the wake time.
    await wc.executeJavaScript(`document.querySelector('.head-actions button[aria-label="Goodnight"]').click()`)
    await until(`document.querySelector('.card.goodnight')?.textContent.includes("Here's what I'll watch tonight.")`, 'the moon did not open the goodnight card')
    const card = await wc.executeJavaScript(`({
      text: document.querySelector('.card.goodnight').textContent,
      wake: document.querySelector('.gn-wake input').value,
    })`)
    need(card.wake === '07:30', `the wake time starts at ${card.wake}, not 7:30`)
    need(/Claude Code sessions/.test(card.text) && /Deploys/.test(card.text) && /CI on main/.test(card.text) && /Keep the lid open/.test(card.text), `the card does not say what it watches ("${card.text}")`)
    await wc.executeJavaScript(`(() => {
      const input = document.querySelector('.gn-wake input')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '06:45')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    })()`)
    await sleep(200)
    await fs.writeFile(out.replace(/\.png$/, '-watch-goodnight.png'), (await wc.capturePage()).toPNG())

    // Go rest: watching until 6:45, the Mac kept awake, a moon in the menu bar, the Watching face; Steward tucks away.
    const started = Date.now()
    await button('Go rest')
    for (const t = Date.now(); !watch!.watching; await sleep(50)) if (Date.now() - t > 3000) throw new Error('Go rest did not start watching')
    const night = watch!.night!
    need(Math.abs(night.until - wakeAt(started, '06:45')) < 5000, `watching until ${new Date(night.until).toString()}, not the next 6:45`)
    need(watchBlocker !== null && powerSaveBlocker.isStarted(watchBlocker), 'Go rest did not keep the Mac awake')
    need(menuBarText().startsWith('☾'), `the menu bar would show "${menuBarText()}", no moon`)
    await until(`document.querySelector('.card.goodnight')?.textContent.includes("Goodnight. I've got it.")`, 'Go rest did not say goodnight')
    for (const t = Date.now(); notch.state().mood !== 'watching'; await sleep(100)) if (Date.now() - t > 3000) throw new Error(`watching, the face is ${notch.state().mood}`)
    for (const t = Date.now(); dockNow() !== 'collapsed'; await sleep(100)) if (Date.now() - t > 4000) throw new Error(`after Go rest Steward is ${dockNow()}, not tucked away`)
    console.log(`smoke: Go rest watches until ${clockText(night.until)}, keeps the Mac awake, puts a moon in the menu bar ("${menuBarText()}"), the face is Watching, and Steward tucks away`)

    // Nobody at the Mac: an alert waits for the panel and is written down, without its detail.
    smokeIdle = 600
    raise({ key: 'approval:smoke-watch:p1:rm -rf build', level: 'urgent', title: 'A session is waiting on you', detail: 'rm -rf build' })
    alerts.flush()
    await sleep(500)
    need(dockNow() === 'collapsed' && heldAlerts.some((a) => a.key === 'approval:smoke-watch:p1:rm -rf build'), `with nobody at the Mac the alert did not wait (Steward is ${dockNow()})`)
    // Someone at the Mac late: it peeks out as usual.
    smokeIdle = 3
    raise({ key: 'approval:smoke-watch:p2', level: 'urgent', title: 'Another session is waiting on you' })
    await sleep(500)
    need(dockNow() === 'nudge', `with someone at the Mac the alert did not peek out (Steward is ${dockNow()})`)
    setDock('collapsed')
    // The Mac sleeping and waking is written down too.
    watch!.power('suspend')
    watch!.power('resume')
    await watch!.settled()
    const events = await log.read(night.id)
    const types: string[] = events.map((e) => e.type)
    need(types[0] === 'start' && types.includes('slept') && types.includes('woke'), `the night's log is ${types.join(', ')}`)
    const alertsLogged = events.filter((e) => e.type === 'alert')
    need(alertsLogged.length === 2 && alertsLogged[0].type === 'alert' && alertsLogged[0].held && alertsLogged[1].type === 'alert' && !alertsLogged[1].held, `the log has ${JSON.stringify(alertsLogged)}`)
    need(!JSON.stringify(events).includes('rm -rf'), "the log kept an alert's detail")
    console.log(`smoke: watching, an alert waits while nobody is at the Mac and peeks out while someone is; the log has ${types.join(', ')}, no details`)

    // I'm up: the night ends, the Mac may sleep again, the moon goes, the face too.
    setDock('expanded')
    await until(`document.querySelector('.card.goodnight.watching')?.textContent.includes('Watching since')`, 'the open panel does not say it is watching')
    await sleep(300)
    await fs.writeFile(out.replace(/\.png$/, '-watch-watching.png'), (await wc.capturePage()).toPNG())
    const blocker = watchBlocker!
    await button("I'm up")
    for (const t = Date.now(); watch!.watching; await sleep(50)) if (Date.now() - t > 3000) throw new Error("I'm up did not end the night")
    need(watch!.ended?.why === 'up' && watchBlocker === null && !powerSaveBlocker.isStarted(blocker), "after I'm up the Mac is still kept awake")
    need(!menuBarText().includes('☾'), `after I'm up the menu bar would still show "${menuBarText()}"`)
    for (const t = Date.now(); notch.state().mood === 'watching'; await sleep(100)) if (Date.now() - t > 3000) throw new Error("after I'm up the face is still Watching")
    await until(`!document.querySelector('.card.goodnight')`, "after I'm up the card is still there")
    await watch!.settled()
    need((await log.read(night.id)).at(-1)?.type === 'end', "the log does not end with I'm up")
    console.log("smoke: I'm up ends the night, lets the Mac sleep again, and takes the moon and the Watching face away")

    // From the open panel, the night's report shows there at once: what needed you, and what came of it.
    const reportText = () => wc.executeJavaScript(`document.querySelector('.card.night-report')?.textContent ?? ''`) as Promise<string>
    await until(`document.querySelector('.card.night-report')?.textContent.includes('2 things needed you.')`, "I'm up did not show the night's report in the open panel")
    const first = await reportText()
    need(/A session is waiting on you\. Waited for you on screen\. You opened Steward at/.test(first) && first.includes('Showed on screen.') && !first.includes('rm -rf'), `the report says "${first}"`)
    need(watch!.unseen === undefined, 'the report shown in the panel still counts as not seen')
    console.log(`smoke: from the open panel, I'm up shows the night's report there ("${first.slice(0, 120)}")`)
    await wc.executeJavaScript(`document.querySelector('.card.night-report button[aria-label="Dismiss"]').click()`)

    // A night that ends with the panel closed: what waited doesn't come back one by one. One card comes out instead,
    // and the panel shows the report, with the night's Visual Review as its card.
    setDock('collapsed')
    await sleep(700)
    // CI on main: a project on GitHub, and gh answering only the Watch's one command. Go rest's first look takes note
    // of the green run there; a red one after it is news.
    ciDir = await fs.mkdtemp(path.join(os.tmpdir(), 'steward-smoke-ci-'))
    await settings.addProject(ciDir)
    const ciProject = path.basename(ciDir)
    const ciRun = (id: number, conclusion: string) => ({ databaseId: id, workflowName: 'CI', status: 'completed', conclusion, updatedAt: new Date().toISOString() })
    let runs = [ciRun(1, 'success')]
    const asked: string[] = []
    realGh = gh
    gh = async (args, cwd) => {
      asked.push(args.join(' '))
      return args === GH_COMMANDS.ciMain && cwd === ciDir ? JSON.stringify(runs) : '[]'
    }
    const second = watch!.start('07:30')
    smokeIdle = 600
    await sleep(300)
    runs = [ciRun(2, 'failure'), ciRun(1, 'success')]
    await checkCi()
    need(heldAlerts.some((a) => a.key === `ci-failed:${ciDir}:2`) && !heldAlerts.some((a) => a.key === `ci-failed:${ciDir}:1`), `CI going red on main did not come out once, waiting (gh was asked: ${asked.join(' | ')})`)
    // A session working with nothing from it for 90 minutes: urgent. (The only turn going on: the check's own.)
    activity.reset()
    await onHookEvent({ hook_event_name: 'UserPromptSubmit', session_id: 'smoke-stuck', cwd: ciDir, prompt_id: 'p1' } as HookPayload)
    await lookForStuck(Date.now() + STUCK_MS)
    need(heldAlerts.some((a) => a.key.startsWith('stuck:smoke-stuck:') && a.title === `${ciProject} may be stuck`), 'a session quiet for 90 minutes did not come out as maybe stuck')
    activity.turns = Object.fromEntries(Object.entries(activity.turns).filter(([id]) => id !== 'smoke-stuck'))
    console.log('smoke: watching, CI going red on main comes out once (the run there at Go rest is not news), and so does a session quiet for 90 minutes')
    const page = (await wc.capturePage()).resize({ width: 720 })
    const review = await reviewStore.save(
      { project: 'smoke-night', projectPath: '/tmp/steward-smoke-night', url: 'http://localhost:4321', before: 'turn-start', heightBefore: page.getSize().height, heightAfter: page.getSize().height, changedPixels: 5000, minPixels: 100, said: 'Made the header green.' },
      { before: page.toPNG(), after: page.toPNG(), beforeCard: page.toJPEG(70), afterCard: page.toJPEG(70) },
    )
    smokeNightReview = review.id
    await sendReviews()
    raise(reviewAlert(review))
    raise({ key: 'approval:smoke-watch:night2', level: 'urgent', title: 'A session is waiting on you', detail: 'rm -rf build' })
    await sleep(400)
    need(dockNow() === 'collapsed' && heldAlerts.some((a) => a.key === 'approval:smoke-watch:night2'), `the second night's alert did not wait (Steward is ${dockNow()})`)
    // I'm Up from the menu bar, with the panel closed.
    watch!.stop('up')
    const island = inNotch() && settings.steward().notchStyle === 'island'
    for (const t = Date.now(); island ? islandNotes.current?.kind !== 'alert' : dockNow() !== 'nudge'; await sleep(100)) if (Date.now() - t > 3000) throw new Error(`after the night no card came out (Steward is ${dockNow()})`)
    need(!heldAlerts.some((a) => a.key === 'approval:smoke-watch:night2' || a.key === `review:${review.id}`), 'the alerts that waited came back after the night')
    need(watch!.unseen === second.id && menuBarText().includes('•'), `the report isn't waiting to be seen (the menu bar would show "${menuBarText()}")`)
    const morning = island
      ? `${islandNotes.current?.name} ${islandNotes.current?.text}`
      : String(await wc.executeJavaScript(`[...document.querySelectorAll('.nudge-title, .nudge-detail')].map((e) => e.textContent).join(' ')`))
    need(/^Good (morning|afternoon|evening) 3 things needed you\. 1 thing changed\.$/.test(morning), `the morning card says "${morning}"`)
    if (!island) await fs.writeFile(out.replace(/\.png$/, '-watch-morning-card.png'), (await wc.capturePage()).toPNG())
    console.log(`smoke: a night that ends with the panel closed leaves one card ("${morning}") instead of the alerts that waited`)

    // The card's click opens the panel: the report, the day's brief taken by it, the review inside and not again on top.
    setDock('expanded')
    await until(`document.querySelector('.card.night-report .card.review')`, "the panel did not open on the report, with the night's review as its card")
    need(watch!.unseen === undefined && appState.lastBriefDate === localDate(new Date()), "the report wasn't taken as seen, or as the day's brief")
    need((await wc.executeJavaScript(`document.querySelectorAll('.body > .card.review[aria-label="What changed in smoke-night"]').length`)) === 0, "the night's review shows twice")
    const night2 = await reportText()
    need(night2.includes('Waited for you on screen. You were up at') && /Urgent.*CI failed on main \(CI\)/.test(night2) && /Urgent.*may be stuck: nothing for 90 minutes/.test(night2) && night2.includes('CI on main: none passed, 1 failed'), `the report says "${night2}"`)
    await sleep(400)
    await fs.writeFile(out.replace(/\.png$/, '-watch-report.png'), (await wc.capturePage()).toPNG())
    // Looks good inside it, and the report says so.
    await wc.executeJavaScript(`document.querySelector('.card.night-report .card.review .btn.primary').click()`)
    await until(`document.querySelector('.card.night-report')?.textContent.includes('smoke-night changed: you marked it Looks good.')`, 'Looks good inside the report did not show in it')
    // Earlier night steps back to the first night of this check; Clear night reports (Settings) leaves none.
    await wc.executeJavaScript(`[...document.querySelectorAll('.card.night-report .chip')].find((b) => b.textContent === 'Earlier night').click()`)
    await until(`document.querySelector('.card.night-report')?.textContent.includes('2 things needed you.')`, 'Earlier night did not show the first night')
    need(/ night ·/.test(await reportText()), `an earlier night is not called by its evening ("${(await reportText()).slice(0, 60)}")`)
    const left = await wc.executeJavaScript(`window.steward.watch.clear().then(() => window.steward.watch.nights())`)
    need(left === 0, `after Clear night reports ${left} are kept`)
    await wc.executeJavaScript(`document.querySelector('.card.night-report button[aria-label="Dismiss"]').click()`)
    console.log('smoke: the card opens the panel on the report, the night\'s review is its card inside, Looks good shows in it, Earlier night steps back, and Clear leaves none')

    // With no night going on, nothing is held however long the Mac has been idle (a CI runner is idle all the time).
    setDock('collapsed')
    await sleep(700)
    smokeIdle = 600
    raise({ key: 'approval:smoke-watch:after', level: 'urgent', title: 'A session is waiting on you' })
    await sleep(500)
    need(dockNow() === 'nudge' && !heldAlerts.some((a) => a.key === 'approval:smoke-watch:after'), `after the night, with the Mac idle, an alert was held (Steward is ${dockNow()})`)
    setDock('collapsed')
    await sleep(700)
    smokeIdle = 0
    // And the check leaves nothing behind for the ones after it.
    need(!watch!.watching && watchBlocker === null && !heldAlerts.some((a) => a.key.startsWith('approval:smoke-watch')), 'the Watch check left a night, the keep-awake or a held alert behind')
    console.log('smoke: with no night going on, an alert comes out however long the Mac has been idle, and the check leaves nothing behind')
  } finally {
    smokeIdle = 0
    watch?.stop('stopped')
    watch?.seen()
    if (realGh !== undefined) gh = realGh
    if (ciDir) {
      // Its red run left Steward worried about it, as a failed deploy would.
      moods.clear(ciDir)
      sendMood()
      await settings.removeProject(ciDir)
      await fs.rm(ciDir, { recursive: true, force: true })
    }
    heldAlerts = heldAlerts.filter((a) => !a.key.startsWith('approval:smoke-watch'))
    // Gone, as the review check leaves the store: the next run's review check starts from none.
    if (smokeNightReview) await reviews.clear()
    smokeNightReview = null
  }
}


/**
 * Visual Review's big viewer, opened from the card (which shows review `id`): the window grows to the review size on the
 * panel's screen, both full-page pictures load, the note is there, the keys and a drag change what it shows, and Esc
 * goes back to the panel, also to a panel that was moved. A moved panel's window is never animated (setDock), so it
 * pops back rather than sliding across the screen; this can only see where it lands. Ends with Looks good inside it.
 * Keys are sent as page events: the hidden smoke's window never has the keyboard. The drag is real mouse input.
 */
async function checkReviewViewer(w: BrowserWindow, out: string, id: string, said: string, until: (wc: Electron.WebContents, script: string, why: string, ms?: number) => Promise<void>): Promise<void> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const need = (ok: boolean, why: string) => {
    if (!ok) throw new Error(why)
  }
  const wc = w.webContents
  const same = (a: Rect, b: Rect) => JSON.stringify(a) === JSON.stringify(b)
  // Read fresh each time (TypeScript would otherwise keep what an earlier check narrowed it to).
  const dockNow = (): DockState => dock
  const settled = async (want: () => Rect, why: string) => {
    for (const started = Date.now(); !same(w.getBounds(), want()); await sleep(50)) if (Date.now() - started > 2000) throw new Error(`${why}: ${JSON.stringify(w.getBounds())}, not ${JSON.stringify(want())}`)
  }
  const press = (key: string, shift = false) =>
    wc.executeJavaScript(`(document.activeElement ?? document.body).dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(key)}, shiftKey: ${shift}, bubbles: true, cancelable: true }))`)
  const look = () =>
    wc.executeJavaScript(`({
      pressed: [...document.querySelectorAll('.review-viewer .rvv-seg button[aria-pressed=true]')].map((b) => b.textContent),
      x: document.querySelector('.rvv-slide')?.style.getPropertyValue('--x') ?? null,
      side: Boolean(document.querySelector('.rvv-sbs')),
      flipShows: document.querySelector('.rvv-flip img:not([hidden])')?.alt ?? null,
      zoom: document.querySelector('.rvv-zoom')?.textContent ?? '',
    })`)
  const openFromCard = async (how: string) => {
    await wc.executeJavaScript(how)
    await until(wc, 'Boolean(document.querySelector(".review-viewer .rvv-stage"))', 'Open big did not open the viewer')
    need(dockNow() === 'viewing', `Open big left Steward ${dockNow()}`)
  }
  const panelArea = () => screen.getDisplayMatching(boundsFor('expanded')).workArea
  const home = boundsFor('expanded')
  need(same(w.getBounds(), home), 'the panel was not at its spot before the viewer opened')

  // From the picture's corner button: the window grows to the screen's work area less 24 points all round.
  await openFromCard(`document.querySelector('.card.review .rv-open').click()`)
  await settled(() => reviewViewerRect(panelArea()), 'the viewer is not the big size')
  const big = w.getBounds()
  await until(
    wc,
    `(() => { const i = [...document.querySelectorAll('.rvv-slide img')]; return i.length === 2 && i.every((p) => p.complete && p.naturalWidth > 0) })()`,
    'the viewer did not load both full-page pictures',
  )
  const pictures = await wc.executeJavaScript(`[...document.querySelectorAll('.rvv-slide img')].map((p) => [p.src, p.naturalWidth, p.naturalHeight])`)
  need(
    pictures[0][0] === `review://${id}/before` && pictures[1][0] === `review://${id}/after` && pictures.every((p: [string, number, number]) => p[1] === 1440),
    `the viewer's pictures are not the page's full width (${JSON.stringify(pictures)})`,
  )
  const note = await wc.executeJavaScript(`document.querySelector('.rvv-note .rv-said')?.textContent ?? ''`)
  need(note.includes(said), `the viewer does not show what Claude said ("${note}")`)
  // The handler itself, asked from main: the page's own rules (its CSP) stop a fetch from the page before it gets there.
  // Chromium tidies a ".." away before the handler sees the address, so a ".." can only name another file of this
  // review (refused) or this review's own pictures.
  const status = async (url: string) => (await net.fetch(url)).status
  need((await status(`review://${id}/after`)) === 200, 'review:// did not serve the after picture')
  for (const url of [`review://${id}/review.json`, `review://${id}/before-card`, `review://${id}/after/../review.json`, `review://${id}/../../after.png`, 'review://20261020-120000-deadbeef/after'])
    need((await status(url)) === 404, `review:// served ${url}`)

  // The keys: 2 and 3 pick the mode, Space flips, 1 is back to the slider, ← → move it, Z is 100%.
  let seen = await look()
  need(seen.pressed.includes('Slide') && seen.pressed.includes('Fit') && seen.x === '55%', `the viewer did not open on Slide and Fit (${JSON.stringify(seen)})`)
  await press('2')
  await until(wc, 'Boolean(document.querySelector(".rvv-sbs"))', '2 did not show the two side by side')
  await press('3')
  await until(wc, 'Boolean(document.querySelector(".rvv-flip"))', '3 did not pick Flip')
  need((await look()).flipShows === 'The page now', 'Flip did not start on the page as it is now')
  await press(' ')
  await until(wc, `document.querySelector('.rvv-flip img:not([hidden])')?.alt === 'The page before'`, 'Space did not flip to the page before')
  await press('1')
  await until(wc, 'Boolean(document.querySelector(".rvv-slide"))', '1 did not go back to the slider')
  await press('ArrowLeft')
  await press('ArrowRight', true)
  seen = await look()
  need(seen.x === '70%', `← then Shift → did not move the slider to 70% (${seen.x})`)
  await press('z')
  await until(wc, `document.querySelector('.rvv-zoom')?.textContent.startsWith('100%')`, 'Z did not show the page at 100%')
  await press('z')

  // A drag on the picture moves the slider: real mouse input, from a fifth of the way across to four fifths.
  const box = await wc.executeJavaScript(`(() => { const r = document.querySelector('.rvv-slide').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width } })()`)
  const at = (f: number) => ({ x: Math.round(box.x + box.width * f), y: Math.round(box.y + 60) })
  const mouse = (type: 'mouseDown' | 'mouseMove' | 'mouseUp', p: { x: number; y: number }) =>
    wc.sendInputEvent({ type, x: p.x, y: p.y, globalX: big.x + p.x, globalY: big.y + p.y, button: 'left', clickCount: 1, modifiers: type === 'mouseUp' ? [] : ['leftbuttondown'] })
  mouse('mouseDown', at(0.2))
  for (const f of [0.35, 0.5, 0.65, 0.8]) {
    mouse('mouseMove', at(f))
    await sleep(30)
  }
  mouse('mouseUp', at(0.8))
  await sleep(150)
  const dragged = parseFloat((await look()).x ?? '0')
  need(Math.abs(dragged - 80) < 2, `dragging across the picture did not move the slider to about 80% (${dragged}%)`)
  await press('ArrowLeft', true)
  await sleep(300)
  await fs.writeFile(out.replace(/\.png$/, '-review-viewer.png'), (await wc.capturePage()).toPNG())
  await press('2')
  await sleep(300)
  await fs.writeFile(out.replace(/\.png$/, '-review-viewer-side.png'), (await wc.capturePage()).toPNG())
  await press('1')
  console.log(`smoke: Open big shows the review at ${big.width}×${big.height} (the work area less ${REVIEW_VIEWER_GAP} all round), both 1440 wide pictures, what Claude said; review:// serves only the pictures; keys and a drag change it`)

  // Esc goes back to the panel, at its spot.
  await press('Escape')
  for (const started = Date.now(); dockNow() !== 'expanded'; await sleep(50)) if (Date.now() - started > 2000) throw new Error('Esc did not go back to the panel')
  await settled(() => home, 'after Esc the panel is not back at its spot')
  await until(wc, 'Boolean(document.querySelector(".card.review")) && !document.querySelector(".review-viewer")', 'after Esc the panel does not show the card')

  // A moved panel: the viewer is the same, and Esc puts the panel back at its saved spot.
  const area = panelArea()
  const spot = clampPanel(area, { ...home, x: area.x + Math.round(area.width / 3), y: area.y + 40 })
  savePanelPlace(spot, screen.getDisplayMatching(home))
  w.setBounds(boundsFor('expanded'))
  need(same(w.getBounds(), spot), 'the panel did not move for the check')
  await openFromCard(`[...document.querySelectorAll('.card.review .rv-link')].find((b) => b.textContent === 'Open big').click()`)
  await settled(() => big, 'with the panel moved, the viewer is not the same big size')
  await press('Escape')
  for (const started = Date.now(); dockNow() !== 'expanded'; await sleep(10)) if (Date.now() - started > 2000) throw new Error('Esc did not go back to the moved panel')
  const back = w.getBounds()
  need(same(back, spot), `the moved panel is not back at its spot (it is at ${JSON.stringify(back)}, not ${JSON.stringify(spot)})`)
  await resetPanelPlace()
  await settled(() => home, 'the panel did not go home after its spot was reset')
  console.log('smoke: Esc goes back to the panel, and a moved panel is back at its saved spot')

  // Send it back opens the note box inside; Esc there puts the box away, not the viewer. Then Looks good, from inside.
  await openFromCard(`document.querySelector('.card.review .rv-open').click()`)
  const button = (label: string) => wc.executeJavaScript(`[...document.querySelectorAll('.rvv-foot button')].find((b) => b.textContent === ${JSON.stringify(label)})?.click()`)
  await button('Send it back')
  await until(wc, 'Boolean(document.querySelector(".rvv-foot textarea"))', 'Send it back in the viewer did not ask for a note')
  const copied = await wc.executeJavaScript('document.querySelector(".rvv-foot .rv-out").textContent')
  need(copied.includes(reviewStore.file(id, 'after')!), 'the note in the viewer does not point at the picture')
  await wc.executeJavaScript(`document.querySelector('.rvv-foot textarea').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))`)
  await until(wc, '!document.querySelector(".rvv-foot textarea")', 'Esc in the note box did not put it away')
  need(dockNow() === 'viewing', 'Esc in the note box closed the viewer')
  await button('Looks good')
  for (const started = Date.now(); dockNow() !== 'expanded'; await sleep(50)) if (Date.now() - started > 3000) throw new Error('Looks good in the viewer did not go back to the panel')
  await settled(() => home, 'after Looks good the panel is not back at its spot')
  console.log('smoke: Send it back and Looks good work inside the viewer, and Esc in the note box only puts the note away')
}

/**
 * Visual Review end to end: the real tracker photographs a page on this Mac before and after a change (a tiny server
 * serves two versions of it), keeps a review, and the panel shows its card; Settings shows the address and Try it now.
 */
async function checkReview(w: BrowserWindow, out: string): Promise<void> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  // Read fresh each time (TypeScript would otherwise keep what an earlier check narrowed it to).
  const dockNow = (): DockState => dock
  const need = (ok: boolean, why: string) => {
    if (!ok) throw new Error(why)
  }
  const until = async (wc: Electron.WebContents, script: string, why: string, ms = 8000) => {
    for (const started = Date.now(); Date.now() - started < ms; await sleep(150)) if (await wc.executeJavaScript(script)) return
    throw new Error(why)
  }
  const server = await startPageServer()
  const projectDir = path.join(os.tmpdir(), 'steward-smoke-review-project')
  await fs.mkdir(projectDir, { recursive: true })
  const turn = (id: string) => ({ session_id: 'smoke-review', prompt_id: id, cwd: projectDir })
  /** A prompt is sent: wait until the page has been loaded for the before picture, so the page can change now. */
  const prompt = async (id: string) => {
    const before = server.hits()
    reviews.turnStarted({ ...turn(id), hook_event_name: 'UserPromptSubmit' })
    for (const started = Date.now(); server.hits() === before; await sleep(50)) if (Date.now() - started > 15_000) throw new Error('the before picture never asked for the page')
  }
  try {
    await settings.addProject(projectDir)
    await settings.setProjectUrl(projectDir, `localhost:${server.port}`)
    need(settings.projects().find((p) => p.path === projectDir)?.url === `http://localhost:${server.port}`, 'the address was not kept')

    // A turn that leaves the page as it was makes no review, even with a spinner and a fade running on it.
    await prompt('same')
    need((await reviews.turnStopped({ ...turn('same'), hook_event_name: 'Stop' })) === null, 'a page that did not change made a review')
    need(reviewStore.list().length === 0, 'a page that did not change was kept')

    // A turn that changes it does, with both pictures and both card pictures, what Claude said it did, and how many
    // files it changed in the project's checkout (one, written during the turn).
    await gitInit(projectDir)
    await prompt('changed')
    await fs.writeFile(path.join(projectDir, 'page.html'), `<h1>Build faster, ship calmer</h1> ${Date.now()}`)
    server.setVersion('b')
    const lastMessage = '**Done.** I changed the heading to `Build faster, ship calmer` and the button to Get started.\n\nWant me to commit this?'
    const review = await reviews.turnStopped({ ...turn('changed'), hook_event_name: 'Stop', last_assistant_message: lastMessage })
    need(review !== null && review.before === 'turn-start', 'a page that changed made no review with a before picture')
    for (const which of ['before', 'after', 'before-card', 'after-card'] as const) {
      const file = reviewStore.file(review!.id, which)
      need(file !== null && (await fs.stat(file).then((s) => s.size, () => 0)) > 0, `the review has no ${which} picture`)
    }
    need(reviewStore.file(review!.id, 'after')!.startsWith(path.join(app.getPath('userData'), 'reviews')), 'a review picture is outside the Steward data folder')
    const said = 'I changed the heading to Build faster, ship calmer and the button to Get started.'
    need(review!.said === said, `the review did not keep what Claude said ("${review!.said}")`)
    need(review!.filesChanged === 1, `the review counted ${review!.filesChanged} files changed, not the one written during the turn`)
    const looks = reviews.history(projectDir).map((e) => e.found)
    need(looks.join() === 'review,same', `the history says ${looks.join()}, not a review after the page that stayed the same`)
    console.log(`smoke: a changed page made a review (${review!.changedPixels} small pixels changed, it takes ${review!.minPixels})`)

    // The same page again makes none.
    await prompt('again')
    need((await reviews.turnStopped({ ...turn('again'), hook_event_name: 'Stop' })) === null, 'a page that stayed changed made a second review')
    need(reviewStore.list().length === 1, 'the store holds more than one review')

    // Only this Mac: another host is refused, and a page that sends the window elsewhere is not captured.
    const refused = await capturePage('http://example.com/', { review: { settleMs: 1000 } }).then(() => false, () => true)
    need(refused, 'Visual Review captured a page that is not on this Mac')
    const away = await capturePage(`http://localhost:${server.port}/away`, { review: { settleMs: 1000 } }).then(
      () => 'captured',
      (err: Error) => err.message,
    )
    need(/another site/.test(away), `a page that sends the visitor elsewhere was not refused (${away})`)
    console.log('smoke: only pages on this Mac are captured, and a redirect away is refused')

    // The review comes out as an alert that needs you: at the edge, the nudge. The same turn's finished alert, still
    // waiting for its batch, is taken back, so there's one alert, not two. The menu bar's dot shows while it waits.
    setDock('collapsed')
    await sleep(700)
    const finishedKey = 'finished:smoke-review:changed'
    raise({ key: finishedKey, level: 'normal', title: 'steward-smoke-review-project finished' })
    await reviewReady(review!, turn('changed'))
    await until(
      w.webContents,
      `document.querySelector('.nudge')?.textContent.includes('steward-smoke-review-project changed') && document.querySelector('.nudge')?.textContent.includes('Review what Claude did?')`,
      'the review did not peek out as an alert',
    )
    need(dockNow() === 'nudge', `the review alert left Steward ${dockNow()}, not peeking out`)
    alerts.flush()
    need(!heldAlerts.some((a) => a.key === finishedKey), "the turn's finished alert came as well as the review's")
    // The smoke has no menu bar icon, so it asks what the title would be.
    need(menuBarText().includes('•'), `the menu bar would show "${menuBarText()}", no dot for the review waiting`)
    await sleep(400)
    await fs.writeFile(out.replace(/\.png$/, '-review-alert.png'), (await w.webContents.capturePage()).toPNG())
    console.log(`smoke: the review comes out as an alert ("steward-smoke-review-project changed"), the turn's finished alert is taken back, the menu bar title would be "${menuBarText()}"`)

    // The panel shows the card at its top.
    setDock('expanded')
    const wc = w.webContents
    await until(wc, 'Boolean(document.querySelector(".card.review .rv-layer img"))', 'the panel never showed the review card')
    await sleep(600)
    const shown = await wc.executeJavaScript(`({
      images: [...document.querySelectorAll('.card.review .rv-layer img')].map((i) => i.naturalWidth),
      buttons: [...document.querySelectorAll('.card.review button')].map((b) => b.textContent),
      slider: Boolean(document.querySelector('.card.review input[type=range]')),
      // At the top of the panel: only Visual Review's own quiet lines may come before it.
      first: (() => {
        const kids = [...(document.querySelector('.body')?.children ?? [])]
        const at = kids.findIndex((k) => k.classList.contains('review'))
        return at >= 0 && kids.slice(0, at).every((k) => k.classList.contains('review-problem'))
      })(),
      checked: document.querySelector('.review-check')?.textContent ?? '',
      said: document.querySelector('.card.review .rv-said')?.textContent ?? '',
    })`)
    need(shown.images.length === 2 && shown.images.every((n: number) => n > 0), 'the card does not show both pictures')
    need(shown.buttons.includes('Looks good') && shown.buttons.includes('Send it back') && shown.slider, 'the card is missing its slider or buttons')
    need(shown.first, 'the card is not at the top of the panel')
    need(shown.said === `Claude says: ${said}`, `the card does not show what Claude said ("${shown.said}")`)
    // The last turn left the page as it was: the panel says it checked.
    need(/Checked steward-smoke-review-project after Claude finished: no visible change/.test(shown.checked), `the panel did not say the check found no change ("${shown.checked}")`)
    const card = await wc.executeJavaScript(`(() => { const r = document.querySelector('.card.review').getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height } })()`)
    // Drag the slider most of the way left, so the picture shows mostly the page as it is now, and keep that.
    const x = await wc.executeJavaScript(`(() => {
      const r = document.querySelector('.rv-ba input[type=range]')
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(r, '30')
      r.dispatchEvent(new Event('input', { bubbles: true }))
      return document.querySelector('.rv-ba').style.getPropertyValue('--x')
    })()`)
    need(x === '30%', `the slider did not move the picture (${x})`)
    await sleep(200)
    await fs.writeFile(out.replace(/\.png$/, '-review-card.png'), (await wc.capturePage()).toPNG())
    // Send it back asks for a note and shows what will be copied; Looks good takes the card away.
    const click = (label: string) => wc.executeJavaScript(`[...document.querySelectorAll('.card.review button')].find((b) => b.textContent === ${JSON.stringify(label)})?.click()`)
    await click('Send it back')
    await until(wc, 'Boolean(document.querySelector(".rv-send textarea"))', 'Send it back did not ask for a note')
    const copied = await wc.executeJavaScript('document.querySelector(".rv-out").textContent')
    need(copied.includes(reviewStore.file(review!.id, 'after')!) && copied.includes('please change this'), 'the note does not point at the picture')
    await click('Cancel')
    console.log(`smoke: the panel shows the card (${Math.round(card.width)}×${Math.round(card.height)}) with what Claude said, the slider moves, Send it back shows the note`)

    // Open big: the review viewer, then Looks good from inside it.
    await checkReviewViewer(w, out, review!.id, said, until)
    await until(wc, '!document.querySelector(".card.review") && document.body.textContent.includes("Marked as reviewed.")', 'Looks good in the viewer did not clear the card')
    need(reviewStore.get(review!.id)?.status === 'good', 'Looks good was not remembered')

    // A soft colour change counts: haven's fade from #F4E6E1 to #FBFBF8, reshaped. First the numbers behind the cutoff:
    // the same page captured twice (text, and the fade), and the reshaped fade, at several cutoffs. Logged, then judged at ours.
    const cutoffs = [0, 2, 4, 6, 8, 12, 24]
    const shoot = async (version: SmokeVersion) => {
      server.setVersion(version)
      return (await capturePage(`http://localhost:${server.port}`, { review: { settleMs: 10_000 } })).png
    }
    const [textA, textB] = [await shoot('b'), await shoot('b')]
    const [fadeA, fadeB] = [await shoot('fade'), await shoot('fade')]
    const reshapedShot = await shoot('reshaped')
    const sameText = changedAt(textA, textB, cutoffs)
    const sameFade = changedAt(fadeA, fadeB, cutoffs)
    const soft = changedAt(fadeB, reshapedShot, cutoffs)
    const row = (counts: number[]) => cutoffs.map((c, i) => `${c}: ${counts[i]}`).join(', ')
    console.log(`smoke: changed small pixels at cutoffs (it takes ${GATE_MIN_PIXELS}). Same text page twice: ${row(sameText)}. Same fade twice: ${row(sameFade)}. Fade reshaped: ${row(soft)}`)
    const at = cutoffs.indexOf(CHANNEL_TOLERANCE)
    need(at >= 0 && sameText[at] < GATE_MIN_PIXELS && sameFade[at] < GATE_MIN_PIXELS, `the same page twice counts as changed at the cutoff of ${CHANNEL_TOLERANCE}`)
    need(soft[at] >= GATE_MIN_PIXELS, `the reshaped fade does not count at the cutoff of ${CHANNEL_TOLERANCE}`)
    // And end to end: a turn that only reshapes the fade makes a review.
    server.setVersion('fade')
    await prompt('soft')
    server.setVersion('reshaped')
    const softReview = await reviews.turnStopped({ ...turn('soft'), hook_event_name: 'Stop' })
    need(softReview !== null, 'a soft colour change made no review')
    // No last message from Claude: the card simply has no note. Its own Looks good takes it away.
    await until(wc, 'Boolean(document.querySelector(".card.review .rv-layer img"))', 'the soft change made no card')
    need(!(await wc.executeJavaScript('Boolean(document.querySelector(".card.review .rv-said"))')), 'a card shows a note though Claude said nothing')
    await click('Looks good')
    await until(wc, '!document.querySelector(".card.review")', 'Looks good on the card did not clear it')
    need(reviewStore.get(softReview!.id)?.status === 'good', 'Looks good on the card was not remembered')
    server.setVersion('b')
    console.log(`smoke: a reshaped soft fade makes a review (${softReview!.changedPixels} small pixels changed at a cutoff of ${CHANNEL_TOLERANCE})`)

    // A capture that fails says why, quietly, where the card would be. No alert.
    const dead = await deadPort()
    await settings.setProjectUrl(projectDir, `localhost:${dead}`)
    reviews.turnStarted({ ...turn('down'), hook_event_name: 'UserPromptSubmit' })
    for (const started = Date.now(); !reviews.problems().length; await sleep(100)) if (Date.now() - started > 15_000) throw new Error('a failed capture left no message')
    await until(
      wc,
      `[...document.querySelectorAll('.review-problem')].some((n) => n.textContent.includes('Couldn\\'t photograph') && n.textContent.includes('nothing is answering at localhost:${dead}'))`,
      'the panel did not say why the page could not be photographed',
    )
    await sleep(300)
    await fs.writeFile(out.replace(/\.png$/, '-review-problem.png'), (await wc.capturePage()).toPNG())
    need((await reviews.turnStopped({ ...turn('down'), hook_event_name: 'Stop' })) === null, 'a turn with the app down made a review')
    need(reviews.problems().length === 1, 'the same failure made two messages')
    console.log(`smoke: with nothing at the address, the panel says "${reviews.problems()[0].reason}"`)

    // A page that sends you to a login says so, in Try it now and in the panel.
    await settings.setProjectUrl(projectDir, `localhost:${server.port}/private`)
    const tried = await reviews.tryIt(projectDir)
    need(tried.ok && tried.login === true && Boolean(tried.note?.includes('sends you to /login')), `Try it now did not spot the login (${JSON.stringify(tried.ok ? tried.note : tried.error)})`)
    await until(wc, `[...document.querySelectorAll('.review-problem')].some((n) => n.textContent.includes('sends you to /login'))`, 'the panel did not say the page is a login')
    console.log('smoke: a page that sends you to /login is spotted, in Try it now and the panel')

    // Settings: the address, and Try it now.
    openSettings('projects')
    const sw = settingsWin!
    await new Promise<void>((resolve, reject) => {
      sw.webContents.once('did-finish-load', () => resolve())
      sw.webContents.once('did-fail-load', (_e, code, description) => reject(new Error(`settings load failed: ${code} ${description}`)))
    })
    const field = 'input.set-address'
    await until(sw.webContents, `Boolean(document.querySelector(${JSON.stringify(field)}))`, 'Settings has no App address field')
    need((await sw.webContents.executeJavaScript(`document.querySelector(${JSON.stringify(field)}).value`)) === `http://localhost:${server.port}/private`, 'the field does not show the saved address')
    await until(sw.webContents, `[...document.querySelectorAll('.set-problem')].some((n) => n.textContent.includes('sends you to /login'))`, 'Settings does not say the address is a login')
    await sw.webContents.executeJavaScript(`[...document.querySelectorAll('.set-row button')].find((b) => b.textContent === 'Try it now')?.click()`)
    await until(sw.webContents, 'Boolean(document.querySelector(".set-shot img"))', 'Try it now showed no picture', 20_000)
    await until(sw.webContents, `document.querySelector('.set-shot')?.textContent.includes('sends you to /login')`, 'Try it now did not say the page is a login')
    await sw.webContents.executeJavaScript(`document.querySelector('.set-shot')?.scrollIntoView({ block: 'center' })`)
    await sleep(500)
    await fs.writeFile(out.replace(/\.png$/, '-review-settings.png'), (await sw.webContents.capturePage()).toPNG())
    // The hook notice depends on this Mac's own ~/.claude/settings.json (only read here), so it's logged, not judged.
    const hookNotice = await sw.webContents.executeJavaScript(`document.body.textContent.includes('Visual Review needs')`)
    console.log(`smoke: Settings shows the address, the problem under it, and Try it now shows the page and names the login (hook notice ${hookNotice ? 'shown' : 'not needed here'})`)
    sw.close()
    await sleep(300)

    // A capture that works clears the message.
    await settings.setProjectUrl(projectDir, `localhost:${server.port}`)
    need((await reviews.tryIt(projectDir)).ok && reviews.problems().length === 0, 'a capture that worked did not clear the message')
    await until(wc, '!document.querySelector(".review-problem")', 'the panel still shows a message after a capture worked')
    console.log('smoke: a capture that works clears the message')
  } finally {
    await reviews.clear()
    await settings.removeProject(projectDir)
    server.close()
    await fs.rm(projectDir, { recursive: true, force: true })
  }
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
    let appeared = 0, animated = null
    const frame = (t) => {
      const el = document.querySelector(${JSON.stringify(look.selector)})
      if (el) {
        appeared++
        // The element's animation as of the first frame it was in: a page whose animation ran out before it drew anything shows as finished.
        if (!animated) {
          const a = el.getAnimations()[0]
          animated = a ? { name: a.animationName || a.transitionProperty || '', durationMs: Math.round(a.effect?.getComputedTiming().duration ?? 0), finished: a.playState === 'finished' } : { name: '', durationMs: 0, finished: false }
        }
      }
      samples.push([t, el ? getComputedStyle(el).${look.property} : ''])
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
    setTimeout(() => resolve({ samples, visibility: document.visibilityState, appeared, animated }), ${ms})
  })`) as Promise<{ samples: Sample[]; visibility: string } & Seen>
  await new Promise((resolve) => setTimeout(resolve, 30))
  await trigger()
  const { samples, visibility, appeared, animated } = await sampling
  return measureMotion(samples, ms, visibility, { appeared, animated })
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
  // The tab is placed in the work area of the moment, so a display change during the run (a CI runner's Dock) is logged.
  screen.on('display-metrics-changed', (_e, d, changed) => console.log(`smoke: display ${d.id} changed (${changed.join(', ')}): work area ${JSON.stringify(d.workArea)}`))
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
  // Where the tab should be comes from the app's own rule (clampTop, topFor) on the work area as it is now: the app
  // places the tab in the work area of the moment, and again whenever the display changes (a CI runner's Dock can
  // change it by a point during the run). The saved spot is compared as the place that's stored, not as a top.
  const workNow = () => screen.getPrimaryDisplay().workArea
  const spotFor = (cursorY: number) => clampTop(workNow(), tabH, cursorY - tabH / 2)
  const areas = () => `(work area ${JSON.stringify(work)} at the start, ${JSON.stringify(workNow())} now)`
  const placeId = String(display.id)
  const savedPlace = tabPlaces[placeId]
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
  const top = spotFor(high.y)
  need(w.isVisible() && w.getBounds().y === top && top === workNow().y, `the tab came out at ${w.getBounds().y} for a push at the top, not at ${top} (under the menu bar) ${areas()}`)
  need(tabPlaces[placeId] === savedPlace, 'a push moved the saved spot')
  // Down the edge, still: the tab tucks away from under it and stays away while the cursor rests there.
  const low = edgeAt(work.y + work.height - 10)
  await hold(low, TUCK_MS + SLIDE_MS + 400)
  need(!presenceNow.revealed && !w.isVisible(), 'the tab did not tuck away with the cursor resting further down the edge')
  need(boundsFor('collapsed').y === savedTabTop(), `the tucked-away tab is at ${boundsFor('collapsed').y}, not back at its saved spot (${savedTabTop()})`)
  await hold(low, 800)
  need(!presenceNow.revealed, 'the tab came back with the cursor still resting on the edge')
  lookAtEdge(away)
  await hold(low, EDGE_FAR_DWELL_MS + 100)
  await sleep(500)
  // At the bottom of the work area: the cursor is 10 points above it, so the tab is shifted up to stay inside.
  const bottom = spotFor(low.y)
  need(bottom === workNow().y + workNow().height - tabH, `a push 10 points above the bottom would put the tab at ${bottom}, not against the bottom of the work area ${areas()}`)
  need(presenceNow.revealed && w.isVisible() && w.getBounds().y === bottom, `after leaving the edge, a push at the bottom brought the tab to ${w.isVisible() ? w.getBounds().y : 'nowhere'}, not ${bottom} ${areas()}`)
  // macOS animates the window between the tab and the panel, and takes longer at some times than others (with a
  // full-screen app's Space showing, say): wait for it to get there, up to 1.5 s.
  const settles = async (ok: () => boolean) => {
    const until = Date.now() + 1500
    while (!ok() && Date.now() < until) await sleep(50)
    return ok()
  }
  setDock('expanded')
  const panelTop = topAround(workNow(), bottom, tabH, boundsFor('expanded').height, 24)
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
  need(tabPlaces[placeId] === undefined && savedTabTop() === topFor(workNow(), tabH, undefined), `Reset did not bring the tab back to the middle ${areas()}`)
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
  // when the tab last came to rest, about 3 s before this point (plus STEWARD_SMOKE_IDLE's wait, which is at rest too),
  // so it isn't dim 14 s from here (less that wait), and is by 28 s.
  const dimmed = async () => Boolean(await w.webContents.executeJavaScript(`Boolean(document.querySelector('.pill-host.dimmed'))`))
  const waiting = Date.now()
  await sleep(DIM_AFTER_MS - 6000 - idle * 1000)
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
    need(Boolean(await w.webContents.executeJavaScript(`Boolean(document.querySelector('.nudge')) && !document.querySelector('.notch-nudge')`)), `the nudge on the ${edge} edge is not the edge's own`)
    await flush('the nudge', edge, edge === 'left' ? '-left-nudge.png' : undefined)
    setDock('collapsed')
    await sleep(700)
    await drag(-150)
    await sleep(300)
    await flush('the tab after a drag', edge)
    await resetTabPlace()
    await sleep(600)
    // On a side edge, closing the panel goes back to that side, as it always has: the window ends at the tab's spot on
    // this edge, and the notch's way up is never played. (Where it goes follows where Steward is docked; the notch's
    // close is checked in checkNotch.)
    const keptOpen = settings.keepPanelOpen()
    await settings.update({ keepPanelOpen: true })
    for (const [how, close] of [
      ['Esc', () => void w.webContents.executeJavaScript('window.steward.dock.collapse()')],
      ['Option Space', () => toggleDock()],
    ] as const) {
      setDock('expanded')
      await sleep(500)
      need(dock === 'expanded' && w.getBounds().width !== boundsFor('collapsed').width, `the panel did not open on the ${edge} edge`)
      close()
      const tab = () => JSON.stringify(w.getBounds()) === JSON.stringify(boundsFor('collapsed'))
      let upIntoNotch = false
      const started = Date.now()
      while (Date.now() - started < 1500 && !(dock === 'collapsed' && w.isVisible() && tab())) {
        upIntoNotch ||= Boolean(await w.webContents.executeJavaScript(`document.documentElement.hasAttribute('data-leaving')`))
        await sleep(20)
      }
      need(!upIntoNotch, `closing with ${how} on the ${edge} edge played the notch's way up`)
      need(dock === 'collapsed' && w.isVisible() && tab(), `closing with ${how} on the ${edge} edge left the window at ${JSON.stringify(w.getBounds())}, not at the tab's spot ${JSON.stringify(boundsFor('collapsed'))}`)
    }
    await settings.update({ keepPanelOpen: keptOpen })
    console.log(`smoke: on the ${edge} edge, closing the panel (Esc, Option Space) goes back to that edge`)
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
      // Any change of mood starts the 20 s over: if it doesn't dim, say which moods it had and when.
      const moodsSeen: string[] = []
      while (!(await dim()) && Date.now() - waiting < DIM_AFTER_MS + 8000) {
        const m = notch.state().mood
        if (moodsSeen.at(-1)?.split(' ')[0] !== m) moodsSeen.push(`${m} at ${((Date.now() - waiting) / 1000).toFixed(1)} s`)
        await sleep(250)
      }
      if (!(await dim())) throw new Error(`the notch's eyes did not dim within ${((Date.now() - waiting) / 1000).toFixed(1)} s at rest (moods: ${moodsSeen.join(', ')}; awake ${notch.state().awake})`)
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

    // A click opens the panel at the side Settings says, on the notch's screen, near its top: never under the notch. It
    // slides in from that side, and Steward stays in the notch, looking toward it. Closing it slides it back out.
    if (notchStyle === 'chin') {
      // Kept open for the check: an open panel that loses focus folds away, and someone may be using another app.
      const keptOpen = settings.keepPanelOpen()
      await settings.update({ keepPanelOpen: true })
      setDock('expanded')
      const area = notchDisplay().workArea
      const at = win!.getBounds()
      const side = settings.steward().edge
      const atSide = side === 'left' ? at.x === area.x + 8 : at.x + at.width === area.x + area.width - 8
      if (!atSide || at.y !== area.y + 8 || at.width !== PANEL_WIDTH) throw new Error(`the panel opened at ${JSON.stringify(at)}, not at the ${side} side of the notch's screen (${JSON.stringify(area)})`)
      if (!notch.visible || !notch.state().panel || Math.sign(notch.state().panel!.x) !== (side === 'left' ? -1 : 1)) throw new Error(`with the panel open, Steward is not in the notch looking toward it (${JSON.stringify(notch.state().panel)})`)
      let entrance = ''
      for (let tries = 0; tries < 12 && !entrance; tries++) {
        await sleep(50)
        entrance = String(await win!.webContents.executeJavaScript(`getComputedStyle(document.querySelector('.panel') ?? document.body).animationName`))
        if (entrance === 'none') entrance = ''
      }
      if (entrance !== (reducedNow ? 'fadein' : 'panel-in')) throw new Error(`the panel in the notch came in with "${entrance}", not ${reducedNow ? 'a fade' : 'the slide from its side'}`)
      await sleep(500)
      await fs.writeFile(out.replace(/\.png$/, '-notch-panel.png'), (await win!.webContents.capturePage()).toPNG())
      const closed = Date.now()
      setDock('collapsed')
      await settings.update({ keepPanelOpen: keptOpen })
      // The way back up takes the page's 0.2 s; where the page isn't drawn (a runner, Reduce Motion) it takes the page's own
      // 400 ms safety timer instead, so wait for it rather than sleep a flat 400 ms (up to 1.5 s).
      while ((win!.isVisible() || !notch.visible) && Date.now() - closed < 1500) await sleep(20)
      const backIn = Date.now() - closed
      if (!notch.visible || win!.isVisible() || notch.state().panel) throw new Error(`closing the panel did not let it go, with Steward in the notch (after ${backIn} ms)`)
      console.log(
        `smoke: notch: a click opens the panel at the ${side} side (${at.width}x${at.height} at ${at.x},${at.y}), sliding in, Steward looking toward it from the notch, and closing lets it go in ${backIn} ms${backIn >= 380 ? ' (on its safety timer, not a drawn frame)' : ''}`,
      )

      // Every way of closing plays the way out: while the panel goes, the window stays where it is (it never
      // takes the edge's bounds, not even for a frame), the exit plays, and then the window goes and the notch is back,
      // awake or asleep as Presence says. After Hide, Steward stays out of sight until it's brought back.
      await settings.update({ keepPanelOpen: true })
      const opens = { click: () => setDock('expanded'), 'Option Space': () => toggleDock(), 'the menu bar': () => setDock('expanded') }
      const closes = {
        Esc: () => void win!.webContents.executeJavaScript('window.steward.dock.collapse()'),
        'Option Space': () => toggleDock(),
        'clicking away': () => setDock('collapsed'),
        'the hide button': () => void win!.webContents.executeJavaScript('window.steward.dock.hide()'),
        'the chevron': () => void win!.webContents.executeJavaScript('window.steward.dock.collapse()'),
      }
      const paths: [keyof typeof opens, keyof typeof closes, 'always' | 'quiet'][] = [
        ['click', 'Esc', 'always'],
        ['Option Space', 'Option Space', 'always'],
        ['the menu bar', 'clicking away', 'always'],
        ['click', 'the hide button', 'always'],
        ['Option Space', 'the chevron', 'quiet'],
      ]
      for (const [opener, closer, presence] of paths) {
        if (settings.steward().presence !== presence) {
          await settings.update({ steward: { presence } })
          presenceChanged()
        }
        opens[opener]()
        await sleep(600)
        const panelAt = win!.getBounds()
        if (dock !== 'expanded' || !win!.isVisible()) throw new Error(`the panel did not open from ${opener} in the notch`)
        const edgeAt = boundsFor('collapsed')
        const started = Date.now()
        closes[closer]()
        // A display change on its way back (the Dock showing, say) doesn't send it to the edge either.
        setTimeout(placeAfterDisplayChange, 60)
        let visibleFor = 0
        let exit = false
        while (Date.now() - started < 900) {
          if (!win!.isVisible()) break
          visibleFor = Date.now() - started
          const b = win!.getBounds()
          if (b.x === edgeAt.x && b.width === edgeAt.width) throw new Error(`closing with ${closer} (opened by ${opener}) put the window at the edge: ${JSON.stringify(b)}`)
          if (JSON.stringify(b) !== JSON.stringify(panelAt)) throw new Error(`closing with ${closer} (opened by ${opener}) moved the window to ${JSON.stringify(b)}, from ${JSON.stringify(panelAt)}`)
          exit ||= Boolean(await win!.webContents.executeJavaScript(`document.documentElement.hasAttribute('data-leaving')`))
          await sleep(10)
        }
        if (win!.isVisible()) throw new Error(`closing with ${closer} (opened by ${opener}) did not let the window go`)
        if (!exit || visibleFor < 100) throw new Error(`closing with ${closer} (opened by ${opener}) did not play the way out (out after ${visibleFor} ms)`)
        const hidden = closer === 'the hide button'
        await sleep(200)
        if (notch.visible === hidden) throw new Error(hidden ? 'after the hide button, the notch still shows' : `after closing with ${closer}, the notch did not come back`)
        if (!hidden && notch.state().awake !== (presence === 'always')) throw new Error(`after closing with ${closer}, the notch is ${notch.state().awake ? 'awake' : 'asleep'} in ${presence}`)
        console.log(`smoke: notch: opened by ${opener}, closing with ${closer} (${presence === 'always' ? 'Always visible' : 'Only when needed'}) slides it out in ${visibleFor} ms, the window staying put`)
        if (hidden) {
          setDock('collapsed')
          await sleep(300)
          if (!notch.visible) throw new Error('the notch did not come back after being hidden')
        }
      }
      await settings.update({ keepPanelOpen: keptOpen, steward: { presence: 'always' } })
      presenceChanged()
    }

    await checkNotchNudge(out, notchStyle)

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
  await checkIsland(out)
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

/**
 * The notch island (Settings → Steward → In the notch → Island), driven by the hook events Claude Code sends. At rest
 * there's no island and Steward peeks out from behind the notch's left edge, part of it showing, the rest hidden. A
 * prompt sent grows the compact island out of the notch: Steward steps into its left side and a spinner with the time
 * shows on its right; a second project shows a count; the cursor on it widens it a little; Claude stopping leaves a
 * check; with nothing going on it shrinks back into the notch and Steward peeks again. Asleep (Only when needed),
 * Steward is tucked fully behind the notch. The growing and the stepping in are drawn frame by frame.
 */
async function checkIsland(out: string): Promise<void> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const geo = notchGeo!
  // Every alert that got through peeks out, so the check sees a finished session not coming out under the notch.
  const alertPeek = settings.steward().alertPeek
  await settings.update({ steward: { notch: true, notchStyle: 'island', presence: 'always', alertPeek: 'all' } })
  presenceChanged()
  replaceForNotch()
  notch.restyle()
  // Nothing going on to start with (reviews from the Visual Review check are left out).
  pendingReviews = 0
  activity.reset()
  islandNotes.drop()
  updateIsland()
  await sleep(1500)
  const page = notch.contents()!
  const layout = notch.state().layout!
  const hw = layout.width / 2
  if (notch.windowBounds()?.width !== ISLAND_WINDOW.width) throw new Error(`the island's window is ${notch.windowBounds()?.width} wide, not ${ISLAND_WINDOW.width}`)
  const pixel = (img: Electron.NativeImage, x: number, y: number) => {
    const { width, height } = img.getSize()
    const k = width / ISLAND_WINDOW.width
    const i = (Math.min(height - 1, Math.round(y * k)) * width + Math.min(width - 1, Math.round(x * k))) * 4
    const b = img.toBitmap()
    return { alpha: b[i + 3], light: Math.max(b[i], b[i + 1], b[i + 2]) }
  }
  const shot = async () => (await notch.capture())!
  const dockNow = (): DockState => dock
  const black = (img: Electron.NativeImage, x: number, y: number) => pixel(img, x, y).alpha > 200 && pixel(img, x, y).light < 30
  const clear = (img: Electron.NativeImage, x: number, y: number) => pixel(img, x, y).alpha < 20
  /**
   * Steward's body (lit, not black) at this point, a little under where its eyes are. At rest its standby glow breathes
   * the body's opacity down to 0.36 (dark) or 0.58 (light), so it's there when it's well above see-through.
   */
  const steward = (img: Electron.NativeImage, x: number, y: number) => pixel(img, x, y + 9).alpha > 80 && pixel(img, x, y + 9).light > 40
  const right = () => page.executeJavaScript(`(() => { const r = document.querySelector('.isl-right-in'); return { html: r?.innerHTML ?? '', time: r?.querySelector('.isl-time')?.textContent ?? '', count: r?.querySelector('.isl-count')?.textContent ?? '', shown: Number(getComputedStyle(document.querySelector('.isl-right')).opacity) } })()`) as Promise<{ html: string; time: string; count: string; shown: number }>
  const hook = (hook_event_name: 'UserPromptSubmit' | 'Stop', session_id: string, said?: string) =>
    onHookEvent({ hook_event_name, session_id, cwd: '/tmp/steward-smoke-island', ...(hook_event_name === 'UserPromptSubmit' ? { prompt: 'make the button blue' } : { last_assistant_message: said }) } as HookPayload)
  const noteLine = () => page.executeJavaScript(`(() => { const n = document.querySelector('.isl-note'); return { text: [...(n?.querySelectorAll('b, span') ?? [])].map((e) => e.textContent).join(' '), shown: Number(getComputedStyle(n).opacity) } })()`) as Promise<{ text: string; shown: number }>

  // At rest: no island; Steward peeks out past the notch's left edge, and nothing is on its right.
  const restPill = islandParts('rest', layout).pill
  let img = await shot()
  if (notch.state().island?.right !== null) throw new Error(`the island shows "${notch.state().island?.right}" with nothing going on`)
  if (!steward(img, layout.cx - hw - 12, restPill.y)) {
    const px = pixel(img, layout.cx - hw - 12, restPill.y + 9)
    throw new Error(`at rest, Steward does not peek out past the notch's left edge (pixel ${JSON.stringify(px)}; ${JSON.stringify({ visible: notch.visible, awake: notch.state().awake, mood: notch.state().mood, hover: notch.state().hover, steppedAside, dock })})`)
  }
  if (!black(img, layout.cx - hw + 4, 8) || !black(img, layout.cx, 8)) throw new Error('at rest, the notch is not black where Steward hides behind it')
  if (!clear(img, layout.cx + hw + 30, 8) || !clear(img, layout.cx - hw - 60, 8)) throw new Error('at rest, there is an island beside the notch')
  await fs.writeFile(out.replace(/\.png$/, '-island-rest.png'), img.toPNG())

  // The eyes following a cursor sweeping past: under the notch, and across the black (where the island leans out).
  for (const mood of ['resting', 'idle'] as const) {
    notch.setMood(mood, 'sweep')
    await sleep(600)
    await sweepEyes(page, geo, 'under the notch', 45)
    await sleep(600)
    await sweepEyes(page, geo, 'across the notch', 10)
  }
  await sleep(900)

  // A prompt sent: the compact island grows out of the notch, Steward steps into its left side, the time on its right.
  const grows = await motionLook(page, '.isl .bp', '.isl')
  smoothly(`the island growing out of the notch${grows.label}`, await watchMotion(page, grows, 900, () => hook('UserPromptSubmit', 'smoke-island-1')))
  const compact = islandParts('compact', layout)
  img = await shot()
  if (notch.state().island?.right !== 'working') throw new Error(`a prompt sent did not show as working (${notch.state().island?.right})`)
  if (!black(img, layout.cx - hw - 60, 6) || !black(img, layout.cx + hw + 60, 6)) throw new Error('the compact island did not grow out of the notch on both sides')
  if (!clear(img, layout.cx + compact.width / 2 + 6, 6)) throw new Error('the compact island is wider than it should be')
  if (!steward(img, layout.cx + compact.pill.x, compact.pill.y)) throw new Error("Steward did not step into the compact island's left side")
  let side = await right()
  if (!side.html.includes('isl-spin') || !/^\d+:\d\d$/.test(side.time) || side.shown < 0.9) throw new Error(`the island's right side shows "${side.html}" (time "${side.time}"), not a spinner and the time`)
  await fs.writeFile(out.replace(/\.png$/, '-island-working.png'), img.toPNG())
  console.log(`smoke: island: at rest Steward peeks from the notch; a prompt grows the compact island (${compact.width}x${compact.height}), Steward steps in, the time shows (${side.time})`)

  // The cursor on it: a little wider.
  smokeNotchCursor = { x: geo.x + geo.width / 2, y: geo.y + 10 }
  await sleep(700)
  img = await shot()
  if (!notch.state().hover || !black(img, layout.cx + compact.width / 2 + 3, 6)) throw new Error('the cursor on the island did not widen it')
  smokeNotchCursor = null
  await sleep(900)
  if (notch.state().hover || !clear(await shot(), layout.cx + compact.width / 2 + 3, 6)) throw new Error('the island did not narrow again once the cursor left')

  // A click on the island opens the panel at the side, never under the notch. While it's open the island steps back to
  // Steward peeking, looking toward the panel; closing it brings the island back.
  const keptOpen = settings.keepPanelOpen()
  await settings.update({ keepPanelOpen: true })
  const at = { x: layout.cx + compact.right!.x, y: layout.height / 2 }
  page.sendInputEvent({ type: 'mouseDown', x: at.x, y: at.y, button: 'left', clickCount: 1 })
  page.sendInputEvent({ type: 'mouseUp', x: at.x, y: at.y, button: 'left', clickCount: 1 })
  await sleep(900)
  const area = notchDisplay().workArea
  const panel = win!.getBounds()
  const edge = settings.steward().edge
  const atSide = edge === 'left' ? panel.x === area.x + 8 : panel.x + panel.width === area.x + area.width - 8
  if (dockNow() !== 'expanded' || !win!.isVisible() || !atSide) throw new Error(`a click on the island opened ${dockNow()} at ${JSON.stringify(panel)}, not the panel at the ${edge} side`)
  img = await shot()
  if (!notch.visible || Math.sign(notch.state().panel?.x ?? 0) !== (edge === 'left' ? -1 : 1)) throw new Error(`with the panel open, Steward is not in the notch looking toward it (${JSON.stringify(notch.state().panel)})`)
  if (!clear(img, layout.cx + hw + 30, 8) || !steward(img, layout.cx - hw - 12, restPill.y)) throw new Error('with the panel open, the island did not step back to Steward peeking')
  await fs.writeFile(out.replace(/\.png$/, '-island-open.png'), img.toPNG())
  await fs.writeFile(out.replace(/\.png$/, '-island-open-panel.png'), (await win!.webContents.capturePage()).toPNG())
  setDock('collapsed')
  await settings.update({ keepPanelOpen: keptOpen })
  const closed = Date.now()
  while (win!.isVisible() && Date.now() - closed < 1500) await sleep(20)
  await sleep(800)
  if (win!.isVisible() || notch.state().panel || !black(await shot(), layout.cx + hw + 60, 6)) throw new Error('closing the panel did not bring the island back')
  console.log(`smoke: island: a click on it opens the panel at the ${edge} side (${panel.width}x${panel.height} at ${panel.x},${panel.y}); the island steps back to Steward peeking toward it, and comes back after`)

  // A second project: the island grows into a note, "started", with a count on its right.
  const noted = Date.now()
  smoothly(`the island growing into a note${grows.label}`, await watchMotion(page, grows, 900, () => hook('UserPromptSubmit', 'smoke-island-2')))
  const note = islandParts('note', layout)
  img = await shot()
  side = await right()
  let line = await noteLine()
  if (notch.state().island?.note?.kind !== 'started' || side.count !== '2') throw new Error(`a second project starting shows ${JSON.stringify(notch.state().island)}, "${side.html}"`)
  if (!black(img, layout.cx, layout.height + 4) || !black(img, layout.cx + note.width / 2 - 8, 6) || !black(img, layout.cx - note.width / 2 + 8, 6)) throw new Error('the island did not grow into the note size')
  if (!clear(img, layout.cx + note.width / 2 + 6, 6) || !clear(img, layout.cx, note.height + 6)) throw new Error('the note is bigger than it should be')
  if (!/started/.test(line.text) || line.shown < 0.9) throw new Error(`the note's line shows "${line.text}" (opacity ${line.shown}), not that a project started`)
  await fs.writeFile(out.replace(/\.png$/, '-island-note.png'), img.toPNG())

  // The cursor on it keeps the note past its time; once the cursor leaves, a moment more, then it settles to compact.
  smokeNotchCursor = { x: geo.x + geo.width / 2, y: geo.y + 10 }
  await sleep(noted + NOTE_SHOW_MS + 600 - Date.now())
  if (!notch.state().hover || !notch.state().island?.note) throw new Error('the cursor on the island did not keep its note')
  let keptAfterLeaving = false
  const settles = await watchMotion(page, grows, 3000, () => {
    smokeNotchCursor = null
    setTimeout(() => (keptAfterLeaving = !!notch.state().island?.note), 1000)
  })
  if (!keptAfterLeaving) throw new Error('the note went as soon as the cursor left the island')
  smoothly(`the note settling to compact${grows.label}`, settles)
  img = await shot()
  side = await right()
  line = await noteLine()
  if (notch.state().island?.note || !clear(img, layout.cx, layout.height + 6) || line.shown > 0.1) throw new Error(`the note did not settle (line "${line.text}", opacity ${line.shown})`)
  if (notch.state().island?.right !== 'two' || side.count !== '2' || !black(img, layout.cx + compact.width / 2 - 8, 6)) throw new Error(`settled, the island is not compact with the count (${side.html})`)
  console.log(`smoke: island: a second project grows a note (${note.width}x${note.height}), "${line.text || 'started'}"; the cursor on it keeps it, and it settles to compact`)

  // One stopping while the other works: "Claude finished" and what it said, the spinner still on the right. The other
  // stopping too: its own note, and a check. Neither comes out under the notch as an alert as well.
  await hook('Stop', 'smoke-island-1', 'I made the button blue.')
  await sleep(700)
  line = await noteLine()
  if (notch.state().island?.right !== 'working' || notch.state().island?.note?.kind !== 'finished' || !line.text.includes('finished · I made the button blue.') || line.shown < 0.9) throw new Error(`one project finishing shows ${JSON.stringify(notch.state().island)}, line "${line.text}"`)
  await hook('Stop', 'smoke-island-2', 'All the tests pass.')
  await sleep(700)
  side = await right()
  line = await noteLine()
  if (notch.state().island?.right !== 'finished' || !side.html.includes('isl-check')) throw new Error(`Claude stopping shows "${side.html}", not a check`)
  if (!line.text.includes('All the tests pass.') || line.shown < 0.9) throw new Error(`the second finish did not take the note's place (line "${line.text}")`)
  await fs.writeFile(out.replace(/\.png$/, '-island-finished.png'), (await shot()).toPNG())
  alerts.flush()
  await sleep(300)
  if (dockNow() === 'nudge') throw new Error('a session finishing came out under the notch as well as in the island')
  console.log(`smoke: island: a chat finishing shows a note ("${line.text}"), and no alert under the notch`)
  const stepsOut = await motionLook(page, '.isl-pill', '.isl')
  smoothly(`Steward stepping out of the island${stepsOut.label}`, await watchMotion(page, stepsOut, 900, () => {
    for (const id of ['smoke-island-1', 'smoke-island-2']) sessions.dismiss(id)
    sendSessions()
  }))
  img = await shot()
  const back = { right: notch.state().island?.right ?? null, beside: clear(img, layout.cx + hw + 30, 8), under: clear(img, layout.cx, layout.height + 6), peeking: steward(img, layout.cx - hw - 12, restPill.y) }
  if (back.right !== null || !back.beside || !back.under || !back.peeking) throw new Error(`with nothing going on, the island did not go back into the notch with Steward peeking (${JSON.stringify({ ...back, pixel: pixel(img, layout.cx - hw - 12, restPill.y + 9), mood: notch.state().mood })})`)
  console.log('smoke: island: wider with the cursor on it, a count for two projects, a check when Claude stops, then back into the notch')

  await checkIslandAlerts(out, { page, layout, shot, black, clear })

  // Asleep: Steward tucked fully behind the notch.
  await settings.update({ steward: { presence: 'quiet' } })
  presenceChanged()
  await sleep(1200)
  img = await shot()
  if (!clear(img, layout.cx - hw - 12, restPill.y) || !black(img, layout.cx, 8)) throw new Error('asleep, Steward is not tucked behind the notch')
  console.log('smoke: island: asleep, Steward is tucked behind the notch')

  // A Visual Review in the island comes out as the island itself, at the review size with Steward joined: its title,
  // its words and Open big and Looks good, never as the old alert under the notch. Asleep (Only when needed), the island
  // wakes for it and goes back to sleep once it settles. "Only when a session needs me" lets it through.
  await settings.update({ steward: { alertPeek: 'needs-me' } })
  pendingReviews = 1
  updateIsland()
  raise(reviewAlert({ id: '20261024-120000-5a0ce111', project: 'haven', projectPath: '/tmp/steward-smoke-island' }))
  await sleep(1000)
  const reviewed = notch.state()
  const reviewCard = String(await page.executeJavaScript(`document.querySelector('.isl-card.on')?.textContent ?? ''`))
  if (dockNow() === 'nudge' || reviewed.nudge || win!.isVisible()) throw new Error('a review came out as the old alert under the notch')
  if (reviewed.island?.note?.kind !== 'review' || reviewed.island.right !== 'review' || !reviewed.awake || !reviewCard.includes('haven changed') || !reviewCard.includes('Open big') || !reviewCard.includes('Looks good'))
    throw new Error(`a review in the island shows ${JSON.stringify(reviewed.island)} (awake: ${reviewed.awake}), card "${reviewCard}"`)
  const reviewSize = islandParts('review', layout)
  img = await shot()
  if (!black(img, layout.cx, reviewSize.height - 3) || !black(img, layout.cx - reviewSize.width / 2 + 10, 6)) throw new Error('the review did not grow the island to the review size')
  await fs.writeFile(out.replace(/\.png$/, '-island-review.png'), img.toPNG())
  // The cursor on it keeps it past its nine seconds, Only when needed too (where the island doesn't grow with it).
  smokeNotchCursor = { x: geo.x + geo.width / 2, y: geo.y + reviewSize.height - 20 }
  await sleep(BIG_NOTE_MS + 600)
  if (notch.state().island?.note?.kind !== 'review') throw new Error('Only when needed, the cursor on the review did not keep it out')
  smokeNotchCursor = null
  await sleep(NOTE_AFTER_HOVER_MS + 900)
  if (notch.state().island?.note || notch.state().awake || dockNow() === 'nudge' || win!.isVisible()) throw new Error('after the review settled, the island did not go back to sleep')
  console.log(`smoke: island: a review comes out at the review size (${reviewSize.width}x${reviewSize.height}) with Steward joined, never under the notch; asleep, the island wakes for it, the cursor on it keeps it, and it sleeps after`)
  pendingReviews = 0

  await settings.update({ steward: { presence: 'always', notchStyle: 'chin', alertPeek } })
  presenceChanged()
  notch.restyle()
  islandNotes.drop()
  if (notch.windowBounds()?.width !== NOTCH_WINDOW.width) throw new Error(`back to the chin, the notch window is ${notch.windowBounds()?.width} wide, not ${NOTCH_WINDOW.width}`)
  void sendReviews()
}

/**
 * The alert at the screen's edge (a Mac without a notch keeps it) never cuts its words off: with a long title, a long
 * detail, an offer and "and 1 more", every word is inside the window (the detail stops at three lines, its last ending
 * in "…"), and the window grows taller to hold them rather than clipping. Island Phase 3, Plan update 3.
 */
async function checkTabAlertWords(w: BrowserWindow, out: string): Promise<void> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  setDock('collapsed')
  await sleep(600)
  const long: AlertView = {
    id: 9001,
    key: 'smoke-words:1',
    level: 'urgent',
    title: 'companion: PR #39 merged into main, the main chat redesign',
    detail: 'Main chat, Phase 1: take the hide button and the pin out of the header, add the Ask | Auto switch by the message box, round the Send button, and label the commands that ran on their own, with why each one asked',
    action: { label: 'Want me to look?', prompt: 'smoke' },
    at: Date.now(),
  }
  w.webContents.send('alerts:show', [long, { ...long, id: 9002, key: 'smoke-words:2' }])
  setDock('nudge')
  await sleep(900)
  const m = (await w.webContents.executeJavaScript(`(() => {
    const box = (sel) => { const e = document.querySelector(sel); if (!e) return null; const r = e.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), wide: e.scrollWidth > e.clientWidth + 1, tall: e.scrollHeight > e.clientHeight + 1, lines: Math.round(e.clientHeight / parseFloat(getComputedStyle(e).lineHeight)) } }
    return { window: innerHeight, nudge: box('.nudge'), text: box('.nudge-text'), title: box('.nudge-title'), detail: box('.nudge-detail'), more: box('.nudge-more'), action: box('.nudge-action') }
  })()`)) as { window: number } & Record<'nudge' | 'text' | 'title' | 'detail' | 'more' | 'action', { top: number; bottom: number; wide: boolean; tall: boolean; lines: number } | null>
  const pieces = [m.title, m.detail, m.more, m.action]
  const inside = pieces.every((p) => p && p.top >= 0 && p.bottom <= m.window)
  console.log(`smoke: the edge alert with long words: window ${m.window} tall (the tab is ${TAB_SIZES[settings.steward().size].tab.height}), words from ${m.text?.top} to ${m.text?.bottom}, title ${m.title?.lines} lines, detail ${m.detail?.lines} lines${m.detail?.tall ? ' (clamped, "…")' : ''}`)
  if (!inside || m.title?.wide || m.title?.tall || m.detail?.wide || (m.detail?.lines ?? 0) < 3) throw new Error(`the edge alert cuts its words off: ${JSON.stringify(m)}`)
  await fs.writeFile(out.replace(/\.png$/, '-edge-alert.png'), (await w.webContents.capturePage()).toPNG())
  setDock('collapsed')
  await sleep(600)
}

/** What checkIsland lends the island's alert checks: the notch page, where the notch is, and its pixel tests. */
interface IslandProbe {
  page: Electron.WebContents
  layout: NotchLayout
  shot(): Promise<Electron.NativeImage>
  black(img: Electron.NativeImage, x: number, y: number): boolean
  clear(img: Electron.NativeImage, x: number, y: number): boolean
}

/**
 * Island Phase 3: in Island mode every alert comes out as the island, never as the old pill under the notch. One of
 * every kind (a session's approval and question through the real hooks, Steward's own request, a failed build, good
 * news, a merged PR, a kind nobody has made yet), each at its size; the buttons (Later, Open, Deny); good news in a
 * moment joining one note; a long message never cut off, and one too long for three lines ending in "…"; and "Alerts
 * that peek out: Nothing" leaving only the status marks.
 */
async function checkIslandAlerts(out: string, { page, layout, shot, black, clear }: IslandProbe): Promise<void> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const alertPeek = settings.steward().alertPeek
  await settings.update({ steward: { alertPeek: 'all' } })
  const oldPill = () => dock === 'nudge' || notch.state().nudge === true || win!.isVisible()
  const sizeNow = () => {
    const n = notch.state().island?.note
    return n ? noteSize(n) : null
  }
  const drawnAt = async (size: IslandNoteSize) => {
    const p = islandParts(size, layout)
    const img = await shot()
    return black(img, layout.cx, p.height - 3) && clear(img, layout.cx, p.height + 6) && black(img, layout.cx + p.width / 2 - 10, 6) && clear(img, layout.cx + p.width / 2 + 6, 6)
  }
  const waitFor = async (ok: () => boolean | Promise<boolean>, ms = 2500) => {
    for (const t = Date.now(); Date.now() - t < ms; await sleep(100)) if (await ok()) return true
    return false
  }
  /** The words showing, and whether any of them is cut: wider or taller than its box. */
  const words = (sel: string) =>
    page.executeJavaScript(`[...document.querySelectorAll(${JSON.stringify(sel)})].map((e) => ({ text: e.textContent, wide: e.scrollWidth > e.clientWidth + 1, tall: e.scrollHeight > e.clientHeight + 1, lines: Math.round(e.clientHeight / 16) }))`) as Promise<{ text: string; wide: boolean; tall: boolean; lines: number }[]>
  const press = async (act: IslandAct) => {
    const at = (await page.executeJavaScript(`(() => { const b = document.querySelector('.isl-card.on [data-act="${act}"]'); if (!b) return null; const r = b.getBoundingClientRect(); return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) } })()`)) as { x: number; y: number } | null
    if (!at) throw new Error(`the island's card has no ${act} button`)
    page.sendInputEvent({ type: 'mouseDown', x: at.x, y: at.y, button: 'left', clickCount: 1 })
    page.sendInputEvent({ type: 'mouseUp', x: at.x, y: at.y, button: 'left', clickCount: 1 })
  }
  const settle = async () => {
    islandNotes.drop()
    await sleep(700)
  }
  const cwd = '/tmp/steward-smoke-island'
  const hook = (event: Record<string, unknown>) => onHookEvent({ session_id: 'smoke-island-3', cwd, ...event } as unknown as HookPayload)

  // One of every kind. A session's approval and question come through the hooks, so the session really waits.
  const kinds: { what: string; kind: IslandNoteKind; size: IslandNoteSize; post(): void | Promise<void>; shot?: string }[] = [
    { what: "a session's approval", kind: 'wait', size: 'approval', post: () => hook({ hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'npm install' } }), shot: 'approval' },
    { what: 'a question', kind: 'input', size: 'approval', post: () => hook({ hook_event_name: 'Notification', message: 'Which database should the new table use?' }) },
    { what: "Steward's own request", kind: 'agent', size: 'approval', post: () => raise({ key: 'agent-approval:smoke-1', level: 'urgent', title: 'Steward needs your OK', detail: 'npm install', mood: 'needs-you' }), shot: 'agent' },
    { what: 'a failed build', kind: 'failed', size: 'approval', post: () => raise({ key: 'deploy-failed:dpl_smoke', level: 'urgent', title: 'haven deploy failed', detail: 'Missing environment variable DATABASE_URL', mood: 'mad', scope: cwd, action: { label: 'Want me to look?', prompt: 'smoke' } }), shot: 'failed' },
    { what: 'a deploy', kind: 'good', size: 'note', post: () => raise({ key: 'deploy-ready:dpl_smoke', level: 'urgent', title: 'haven deployed', detail: 'haven.vercel.app', scope: cwd }) },
    { what: 'a merged PR', kind: 'good', size: 'note', post: () => raise({ key: 'pr-merged:/tmp/haven:12', level: 'urgent', title: 'haven: PR #12 merged', detail: 'Make the button blue' }) },
    { what: 'a kind nobody has made yet', kind: 'alert', size: 'note', post: () => raise({ key: 'brand-new-kind:1', level: 'urgent', title: 'Something new', detail: 'with one line' }) },
  ]
  const joins = await motionLook(page, '.isl-pill', '.isl')
  for (const k of kinds) {
    await settle()
    // The first one: Steward joining the island (its body melting into the black, its eyes carrying on) is drawn frame by frame.
    if (k.kind === 'wait')
      smoothly(
        `Steward joining the island${joins.label}`,
        await watchMotion(page, joins, 900, async () => {
          await k.post()
          alerts.flush()
        }),
      )
    else await k.post()
    alerts.flush()
    const ok = await waitFor(async () => notch.state().island?.note?.kind === k.kind && sizeNow() === k.size && (await drawnAt(k.size)), k.kind === 'agent' ? 950 : 2500)
    if (oldPill()) throw new Error(`${k.what} came out as the old pill under the notch (Steward ${dock}, the notch's nudge ${notch.state().nudge})`)
    if (!ok) throw new Error(`${k.what} did not open as the island's ${k.size} size (${JSON.stringify(notch.state().island)}, drawn: ${await drawnAt(k.size)})`)
    const cut = (await words(k.size === 'note' ? '.isl-note-in, .isl-note-in b, .isl-note-in span' : '.isl-card.on .isl-ct-t b, .isl-card.on .isl-ct-t p')).filter((w) => w.wide || w.tall)
    if (cut.length) throw new Error(`${k.what}: words are cut off on the island (${JSON.stringify(cut)})`)
    if (k.shot) await fs.writeFile(out.replace(/\.png$/, `-island-${k.shot}.png`), (await shot()).toPNG())
    // The buttons: Later settles a session's approval now; Deny answers Steward's own request; Open opens the panel.
    if (k.kind === 'wait') {
      // Good news while it's out doesn't take its place: it waits for the panel (the menu bar's dot).
      raise({ key: 'deploy-ready:dpl_during', level: 'urgent', title: 'haven deployed', detail: 'haven.vercel.app' })
      alerts.flush()
      await sleep(300)
      if (notch.state().island?.note?.kind !== 'wait' || !heldAlerts.some((a) => a.key === 'deploy-ready:dpl_during')) throw new Error(`good news during an approval took its place, or was lost (${JSON.stringify(notch.state().island?.note)})`)
      await press('later')
      if (!(await waitFor(() => !notch.state().island?.note, 800))) throw new Error('Later did not settle the approval')
      if (notch.state().island?.right !== 'needs') throw new Error(`settled, the approval left no amber mark (${notch.state().island?.right})`)
    }
    if (k.kind === 'agent') {
      await press('deny')
      if (!(await waitFor(() => !notch.state().island?.note, 800))) throw new Error("Deny did not answer Steward's own request")
    }
    if (k.kind === 'input') {
      await press('open')
      if (!(await waitFor(() => dock === 'expanded', 1500))) throw new Error(`Open on a question did not open the panel (${dock})`)
      setDock('collapsed')
      // The session moving on (here, gone) takes its "?" away, so the next kinds show their own marks.
      sessions.dismiss('smoke-island-3')
      sendSessions()
      await sleep(900)
    }
    if (k.kind === 'failed' && notch.state().island?.right !== 'failed') throw new Error(`a failed build shows "${notch.state().island?.right}" on the right, not the red mark`)
    console.log(`smoke: island: ${k.what} opens as the ${k.size} size (${notch.state().island?.note ? 'out' : 'settled by its button'}), never the old pill`)
  }
  moods.clear(cwd)
  sendMood()

  // Good news within a moment joins one note.
  await settle()
  for (const n of [1, 2, 3]) raise({ key: `deploy-ready:dpl_join${n}`, level: 'urgent', title: `site ${n} deployed`, detail: `site${n}.vercel.app` })
  alerts.flush()
  await sleep(700)
  const joined = notch.state().island?.note
  const joinedText = (await words('.isl-note-in span'))[0]?.text ?? ''
  if (joined?.kind !== 'good' || joined.more !== 2 || !joinedText.includes('and 2 more')) throw new Error(`three deploys did not join one note (${JSON.stringify(joined)}, "${joinedText}")`)
  console.log(`smoke: island: three deploys in a moment join one note ("${joined.name} ${joinedText}")`)

  // A long message is never cut off: the title on its own line, the rest wrapped, the black taller. Too long for three
  // lines, only the last line ends in "…" (it's clamped), and it stays out longer.
  const pr = 'Main chat, Phase 1: take the hide button and the pin out of the header, and add the Ask | Auto switch'
  const tooLong = `${pr} by the message box, round the Send button, and label the commands that ran on their own, with why each one asked`
  for (const [what, detail, fit] of [['a long message', pr, 'long'], ['a message too long for three lines', tooLong, 'toolong']] as const) {
    await settle()
    raise({ key: `pr-merged:/tmp/companion:${fit}`, level: 'urgent', title: 'companion: PR #39 merged', detail })
    alerts.flush()
    const ok = await waitFor(async () => notch.state().island?.note?.fit === fit && sizeNow() === 'long' && (await drawnAt('long')))
    if (!ok) throw new Error(`${what} did not grow the long note (${JSON.stringify(notch.state().island?.note)})`)
    const lines = await words('.isl-note-in.long b, .isl-note-in.long span')
    const [title, rest] = lines
    if (!title || !rest || title.wide || title.tall || rest.wide || (fit === 'long' && rest.tall) || (fit === 'toolong' && (!rest.tall || title.lines + rest.lines !== NOTE_LINES)))
      throw new Error(`${what}: the words are cut wrongly (${JSON.stringify(lines)})`)
    await fs.writeFile(out.replace(/\.png$/, `-island-${fit}.png`), (await shot()).toPNG())
    console.log(`smoke: island: ${what} grows the long note (${islandParts('long', layout).width}x${islandParts('long', layout).height}), ${title.lines} line for the title and ${rest.lines} for the rest${fit === 'toolong' ? ', the last one ending in "…"' : ', nothing cut off'}`)
  }
  await settle()

  // "Alerts that peek out: Nothing": no notes and no big sizes, only the status marks.
  await settings.update({ steward: { alertPeek: 'none' } })
  const quietHook = (hook_event_name: 'UserPromptSubmit' | 'Stop', session_id: string) => onHookEvent({ hook_event_name, session_id, cwd, ...(hook_event_name === 'Stop' ? { last_assistant_message: 'Done.' } : { prompt: 'go' }) } as HookPayload)
  await quietHook('UserPromptSubmit', 'smoke-quiet-1')
  await quietHook('UserPromptSubmit', 'smoke-quiet-2')
  await sleep(500)
  const started = notch.state().island
  await quietHook('Stop', 'smoke-quiet-1')
  raise({ key: 'approval:smoke-quiet-2:p:npm test', level: 'urgent', title: 'quiet is waiting on you', detail: 'npm test' })
  alerts.flush()
  await sleep(700)
  const finished = notch.state().island
  if (started?.note || finished?.note || started?.right !== 'two' || finished?.right !== 'working' || oldPill()) throw new Error(`with Nothing, a note still showed (${JSON.stringify({ started, finished })})`)
  await quietHook('Stop', 'smoke-quiet-2')
  for (const id of ['smoke-quiet-1', 'smoke-quiet-2']) sessions.dismiss(id)
  sendSessions()
  console.log('smoke: island: with Alerts that peek out: Nothing, no "started" or "finished" note and no big size, only the status marks')

  await settings.update({ steward: { alertPeek } })
  await settle()
}

/**
 * Steward's eyes following a cursor that sweeps past the notch at a steady speed (island Phase 3, the eye jitter fix),
 * from the frames the page drew: how often the eyes moved, and how far in one frame. y: how far down the screen the
 * cursor goes, from its top. Logged with the mood, so a before and after can be compared.
 */
async function sweepEyes(page: Electron.WebContents, geo: NotchGeometry, what: string, y: number, ms = 1500): Promise<EyeSweep> {
  const sampling = page.executeJavaScript(`new Promise((resolve) => {
    const samples = []
    const frame = (t) => {
      // The eyes within the body, so Steward leaning out with the cursor on it isn't counted as the eyes moving.
      const eyes = document.querySelector('.isl-body .open')?.getBoundingClientRect(), body = document.querySelector('.isl-body .pv')?.getBoundingClientRect()
      if (eyes && body) samples.push([t, eyes.left + eyes.width / 2 - (body.left + body.width / 2)])
      requestAnimationFrame(frame)
    }
    requestAnimationFrame(frame)
    setTimeout(() => resolve(samples), ${ms})
  })`) as Promise<EyeSample[]>
  // Across where Steward peeks (the notch's left edge), the stretch where its eyes follow the cursor.
  const from = geo.x - 160, to = geo.x + 160, start = Date.now()
  const move = setInterval(() => (smokeNotchCursor = { x: from + (to - from) * Math.min(1, (Date.now() - start) / ms), y: geo.y + y }), 4)
  const samples = await sampling
  clearInterval(move)
  smokeNotchCursor = null
  const sweep = measureEyeSweep(samples)
  console.log(`smoke: eyes following a cursor sweeping ${what} (mood ${notch.state().mood}): ${describeEyeSweep(sweep)}`)
  return sweep
}

/**
 * Docked in the notch, an alert that peeks out comes out under the notch, below the menu bar, never from the edge:
 * centered on the notch, its top on the menu bar line, joined to the chin (Wings grows one for it), with one line of
 * text under the chin. It comes down out of the notch and goes back up into it, and the window never moves on its way.
 * Only when needed (checked in Chin), it wakes the notch, and after it the notch stays awake until the cursor has left
 * it, like the tab at the edge.
 */
async function checkNotchNudge(out: string, notchStyle: NotchStyle): Promise<void> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const w = win!
  const geo = notchGeo!
  const layout = notch.state().layout!
  const area = notchDisplay().workArea
  const want = nudgeUnderNotch(geo, area, NUDGE_WIDTH)
  const body = await motionLook(w.webContents, '.nn-mid', '.notch-nudge')
  for (const presence of notchStyle === 'chin' ? (['always', 'quiet'] as const) : (['always'] as const)) {
    if (settings.steward().presence !== presence) {
      await settings.update({ steward: { presence } })
      presenceChanged()
      await sleep(600)
    }
    const how = `${notchStyle}, ${presence === 'always' ? 'Always visible' : 'Only when needed'}`
    if (presence === 'quiet' && notch.state().awake) throw new Error('the notch is awake at rest in Only when needed')
    const peek = () => {
      raise({ key: `approval:smoke-notch-${notchStyle}-${presence}`, level: 'urgent', title: 'A session needs you', detail: 'under the notch' })
      alerts.flush()
    }
    smoothly(`a nudge coming out of the notch (${how})${body.label}`, await watchMotion(w.webContents, body, 800, peek))
    const at = w.getBounds()
    if (dock !== 'nudge' || !w.isVisible()) throw new Error(`an alert that needs me did not come out of the notch (${how})`)
    if (JSON.stringify(at) !== JSON.stringify(want)) throw new Error(`the nudge came out at ${JSON.stringify(at)}, not under the notch (${JSON.stringify(want)})`)
    if (at.y < area.y) throw new Error('the nudge under the notch covers the menu bar')
    const s = notch.state()
    if (!notch.visible || !s.awake || !s.nudge || s.hover) throw new Error(`with a nudge out, the notch is ${JSON.stringify({ visible: notch.visible, awake: s.awake, nudge: s.nudge, hover: s.hover })}, not awake and joined to it`)
    const chin = (await notch.capture())!
    if (alphaAt(chin, layout.cx, layout.height + NOTCH_LIP - 4, NOTCH_WINDOW.width) <= 200) throw new Error(`with a nudge out, the notch (${notchStyle}) has no chin for it to join`)
    const page = (await w.webContents.executeJavaScript(`(() => {
      const line = document.querySelector('.notch-nudge .nn-line'), text = line?.querySelector('.nn-text'), r = line?.getBoundingClientRect()
      return { notch: Boolean(line), edge: Boolean(document.querySelector('.nudge')), top: r?.top ?? 0, height: r?.height ?? 0, wide: text?.scrollWidth ?? 0, room: line?.clientWidth ?? 0 }
    })()`)) as { notch: boolean; edge: boolean; top: number; height: number; wide: number; room: number }
    if (!page.notch || page.edge) throw new Error('docked in the notch, the page drew the edge nudge')
    if (page.height > 17) throw new Error(`the nudge's text is ${page.height} points tall, more than one line`)
    // Below the chin, even talking's taller one.
    const chinBottom = geo.y + geo.height + NOTCH_LIP + 5 - at.y
    if (page.top < chinBottom) throw new Error(`the nudge's text starts ${page.top} points down, under the chin (${chinBottom})`)
    const shot = await w.webContents.capturePage()
    const alpha = (x: number, y: number) => alphaAt(shot, x, y, at.width)
    if (alpha(at.width / 2, at.height - 3) <= 200 || alpha(12, at.height / 2 + 6) <= 200 || alpha(at.width - 12, at.height / 2 + 6) <= 200) throw new Error('the nudge under the notch is not black where its body is')
    if (alpha(3, 2) > 20 || alpha(at.width - 3, 2) > 20) throw new Error('the nudge under the notch draws beside the chin, right under the menu bar line')
    // Both windows, to see them together: the nudge, and the notch above it.
    if (presence === 'always') {
      await fs.writeFile(out.replace(/\.png$/, `-notch-nudge-${notchStyle}.png`), shot.toPNG())
      await fs.writeFile(out.replace(/\.png$/, `-notch-nudge-${notchStyle}-notch.png`), chin.toPNG())
    }
    if (presence === 'always' && notchStyle === 'chin') {
      // The first-launch note comes out here too, and has to fit on the line whole.
      const note = firstPeekNote(noteFor())
      w.webContents.send('alerts:show', [{ id: 0, key: 'first-peek', level: 'normal', ...note, at: Date.now() }])
      await sleep(300)
      const [wide, shown] = (await w.webContents.executeJavaScript(`(() => { const t = document.querySelector('.nn-text'); return t ? [t.scrollWidth, t.clientWidth] : [0, 0] })()`)) as number[]
      if (wide > shown) throw new Error(`under the notch, the first-launch note "${note.title} · ${note.detail}" is cut: ${shown} of its ${wide} points show`)
      console.log(`smoke: notch: on a line of ${page.room} points, the test alert takes ${page.wide} and the first-launch note "${note.title} · ${note.detail}" ${wide}, whole`)
    }

    // Tucked away, it goes back up into the notch, the window staying where it is until it goes.
    let visibleFor = 0
    let exit = false
    let moved = ''
    const tuckAway = async () => {
      const started = Date.now()
      void w.webContents.executeJavaScript('window.steward.dock.collapse()')
      setTimeout(placeAfterDisplayChange, 60)
      while (Date.now() - started < 700 && w.isVisible()) {
        visibleFor = Date.now() - started
        if (JSON.stringify(w.getBounds()) !== JSON.stringify(at)) moved ||= JSON.stringify(w.getBounds())
        exit ||= Boolean(await w.webContents.executeJavaScript(`document.documentElement.hasAttribute('data-leaving')`))
        await sleep(10)
      }
    }
    smoothly(`a nudge going back into the notch (${how})${body.label}`, await watchMotion(w.webContents, body, 800, tuckAway))
    if (moved) throw new Error(`tucking the nudge away moved the window to ${moved}`)
    if (w.isVisible()) throw new Error('tucking the nudge away did not let the window go')
    // The way back takes 0.2 s: the window goes once it's over, not partway.
    if (!exit || visibleFor < 160) throw new Error(`tucking the nudge away did not play its way back into the notch (out after ${visibleFor} ms)`)
    if (!notch.visible || notch.state().nudge || !notch.state().awake) throw new Error(`after the nudge, the notch is ${JSON.stringify({ visible: notch.visible, ...notch.state(), layout: undefined })}, not awake on its own`)
    if (presence === 'quiet') {
      // Like the tab at the edge: out until the cursor has been away a moment, then the notch goes back to sleep.
      lookAtCursor(false, false, NOTCH_DWELL_MS)
      await sleep(TUCK_MS + 200)
      lookAtCursor(false, false, NOTCH_DWELL_MS)
      if (presenceNow.revealed || notch.state().awake) throw new Error('after a nudge, the notch did not go back to sleep once the cursor had left it')
    }
    console.log(`smoke: notch (${how}): an alert comes out under the notch (${at.width}x${at.height} at ${at.x},${at.y}), joined to the chin, on one line, and goes back up into it in ${visibleFor} ms${presence === 'quiet' ? '; it woke the notch, which sleeps once the cursor has left' : ''}`)
  }
  if (settings.steward().presence !== 'always') {
    await settings.update({ steward: { presence: 'always' } })
    presenceChanged()
  }
}

/**
 * The movable panel. Dragged by its top bar it follows the pointer, a press that moves 5 points or less doesn't, and it
 * stays inside the work area however far it's dragged. A press on a control that moves leaves the window alone and
 * still clicks. A moved panel closes where it is (the window is never anywhere between there and the tab) and opens
 * there again, popping in. A double-click on the bar puts it back, with the old way in. A spot for a screen that isn't
 * there is ignored. Driven with the page's own input events (what a mouse gives), and in the notch through the same
 * messages the page sends.
 */
async function checkMovablePanel(): Promise<void> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const w = win!
  const page = w.webContents
  const same = (a: Rect, b: Rect) => JSON.stringify(a) === JSON.stringify(b)
  // Read fresh each time (TypeScript would otherwise keep what an earlier check narrowed it to).
  const dockNow = (): DockState => dock
  const near = (a: Rect, b: Rect) => Math.abs(a.x - b.x) <= 1 && Math.abs(a.y - b.y) <= 1 && a.width === b.width && a.height === b.height
  const settles = async (ok: () => boolean, ms = 1500) => {
    const until = Date.now() + ms
    while (!ok() && Date.now() < until) await sleep(30)
    return ok()
  }
  /** The mouse, at a point on the screen: sent to the page in its own coordinates, wherever the window is now. */
  const mouse = (type: 'mouseDown' | 'mouseUp' | 'mouseMove', at: Electron.Point, clickCount = 1) => {
    const b = w.getBounds()
    // The screen point too: without it the page's pointer events say the pointer is at 0,0 on the screen.
    const pressed = type === 'mouseMove' ? (['leftbuttondown'] as const) : []
    page.sendInputEvent({ type, x: Math.round(at.x - b.x), y: Math.round(at.y - b.y), globalX: Math.round(at.x), globalY: Math.round(at.y), button: 'left', clickCount, modifiers: [...pressed] })
  }
  const on = (selector: string) => page.executeJavaScript(`(() => { const r = document.querySelector(${JSON.stringify(selector)})?.getBoundingClientRect(); return r ? { x: r.left, y: r.top, width: r.width, height: r.height } : null })()`) as Promise<Rect | null>
  const entrance = async () => {
    let name = ''
    for (let tries = 0; tries < 12 && !name; tries++) {
      await sleep(40)
      name = String(await page.executeJavaScript(`getComputedStyle(document.querySelector('.panel') ?? document.body).animationName`))
      if (name === 'none') name = ''
    }
    return name
  }
  const reduced = Boolean(await page.executeJavaScript(`matchMedia('(prefers-reduced-motion: reduce)').matches`))
  const popIn = reduced ? 'fadein' : 'panel-settle-in'
  const keptOpen = settings.keepPanelOpen()
  // Kept open for the check: an open panel that loses focus folds away, and someone may be using another app.
  await settings.update({ keepPanelOpen: true })
  await resetPanelPlace()
  setDock('collapsed')
  await sleep(600)
  setDock('expanded')
  await sleep(700)
  const home = boundsFor('expanded')
  const area = screen.getDisplayMatching(home).workArea
  if (!same(w.getBounds(), home)) throw new Error(`the unmoved panel opened at ${JSON.stringify(w.getBounds())}, not ${JSON.stringify(home)}`)
  // Someone's real mouse over the panel would join in (it's the same pointer): the window lets it through meanwhile.
  // The check's own events go straight to the page.
  w.setIgnoreMouseEvents(true)

  // Dragged by the bar (the name, not a button), it follows the pointer; 3 points is still a click.
  const name = (await on('.panel-head .name'))!
  const grab = { x: home.x + name.x + 6, y: home.y + name.y + name.height / 2 }
  mouse('mouseDown', grab)
  mouse('mouseMove', { x: grab.x + 3, y: grab.y + 2 })
  await sleep(150)
  if (!same(w.getBounds(), home)) throw new Error('a press on the bar that moved 3 points moved the panel')
  const by = { x: -120, y: 40 }
  mouse('mouseMove', { x: grab.x + by.x, y: grab.y + by.y })
  const followed = clampPanel(area, { ...home, x: home.x + by.x, y: home.y + by.y })
  if (!(await settles(() => same(w.getBounds(), followed), 800))) throw new Error(`dragged by ${by.x},${by.y}, the panel went to ${JSON.stringify(w.getBounds())}, not ${JSON.stringify(followed)}`)
  if (!(await page.executeJavaScript(`document.querySelector('.panel-head').classList.contains('dragging')`))) throw new Error('the bar does not show it is being dragged')
  // A long drag, a move every 16 ms: the window keeps up (measured as it's moved; Screen Recording isn't granted). The
  // pointer stays on the bar all along, as the window follows it.
  const sweep = (i: number) => ({ x: grab.x - 120 - 8 * i, y: grab.y + 40 })
  mouse('mouseMove', sweep(0))
  await sleep(200)
  panelMoves.length = 0
  const swept = Date.now()
  for (let i = 1; i <= 60; i++) {
    mouse('mouseMove', sweep(i))
    await sleep(16)
  }
  await sleep(120)
  const sweptMs = Date.now() - swept
  mouse('mouseUp', sweep(60))
  await sleep(200)
  const gaps = panelMoves.slice(1).map((m, i) => m.at - panelMoves[i].at)
  const longest = Math.round(Math.max(0, ...gaps))
  const longestAt = gaps.indexOf(Math.max(...gaps)) + 1
  const took = Math.max(0, ...panelMoves.map((m) => m.took)).toFixed(1)
  const line = `motion dragging the panel: ${panelMoves.length} moves of the window in ${sweptMs} ms for 60 pointer moves; longest wait between moves ${longest} ms (move ${longestAt}); moving it took at most ${took} ms`
  console.log(`smoke: ${line}`)
  if (panelMoves.length < MIN_POSITIONS || (!process.env.CI && longest > MAX_GAP_MS)) throw new Error(`dragging the panel is not smooth: ${line}`)
  const spot = w.getBounds()
  const saved = panelPlaces[String(screen.getDisplayMatching(spot).id)]
  if (!placed() || !saved || !near(panelRect(area, { width: spot.width, height: spot.height }, saved), spot)) throw new Error(`letting go did not save where the panel is: ${JSON.stringify(saved)} for ${JSON.stringify(spot)}`)
  if (!(await page.executeJavaScript(`document.documentElement.hasAttribute('data-placed') && !document.querySelector('.panel-head').classList.contains('dragging')`))) throw new Error('the page does not know the panel was moved, or still shows it being dragged')
  // However far it's dragged, it stays inside the work area: top left, then bottom right. Through the messages the page
  // sends, since the check's own pointer would leave the window here.
  for (const [dx, dy] of [
    [-5000, -5000],
    [5000, 5000],
  ]) {
    const from = { x: spot.x + 100, y: spot.y + 20 }
    dragPanel('start', from.x, from.y)
    dragPanel('move', from.x + dx, from.y + dy)
    const corner = dx < 0 ? { ...home, x: area.x, y: area.y } : { ...home, x: area.x + area.width - home.width, y: area.y + area.height - home.height }
    if (!same(w.getBounds(), corner)) throw new Error(`dragged far past the ${dx < 0 ? 'top left' : 'bottom right'}, the panel is at ${JSON.stringify(w.getBounds())}, not inside the work area at ${JSON.stringify(corner)}`)
    dragPanel('move', from.x, from.y)
    dragPanel('end')
  }
  if (!same(w.getBounds(), spot)) throw new Error(`dragged back, the panel is at ${JSON.stringify(w.getBounds())}, not ${JSON.stringify(spot)}`)
  console.log(`smoke: the panel follows a drag by its top bar (${by.x},${by.y}), not a 3-point press, stays inside the work area however far it goes, and is saved where it's let go`)

  // A press on a control that moves 30 points: the window stays, and the click happens (the project chip opens the switcher).
  const chip = (await on('.panel-head .ctx'))!
  const press = { x: spot.x + chip.x + 6, y: spot.y + chip.y + chip.height / 2 }
  const slide = Math.min(30, chip.width - 10)
  mouse('mouseDown', press)
  mouse('mouseMove', { x: press.x + slide, y: press.y })
  await sleep(120)
  mouse('mouseUp', { x: press.x + slide, y: press.y })
  await sleep(250)
  if (!same(w.getBounds(), spot)) throw new Error('a press on the project chip that moved moved the panel')
  if (!(await page.executeJavaScript(`Boolean(document.querySelector('.switcher'))`))) throw new Error(`a press on the project chip that moved ${slide} points did not click it`)
  await page.executeJavaScript(`document.querySelector('.panel-head .ctx').click()`)
  await sleep(300)
  console.log(`smoke: a press on the project chip that moves ${slide} points still clicks it, and leaves the panel where it is`)

  // Closed, a moved panel shrinks where it is: the window is there or at the tab, never anywhere between. Opened again, it
  // pops in at the same spot.
  const tab = boundsFor('collapsed')
  const started = Date.now()
  setDock('collapsed')
  let inPlace = false
  let leftAfter = 0
  while (Date.now() - started < 900) {
    const b = w.getBounds()
    if (!same(b, spot) && !same(b, tab)) throw new Error(`closing the moved panel put the window at ${JSON.stringify(b)}, between its spot and the tab`)
    if (same(b, tab) && !leftAfter) leftAfter = Date.now() - started
    inPlace ||= (await page.executeJavaScript(`document.documentElement.getAttribute('data-leaving')`)) === 'in-place'
    if (leftAfter) break
    await sleep(10)
  }
  if (!inPlace || leftAfter < 150) throw new Error(`closing the moved panel did not shrink where it is first (in place ${inPlace}, at the tab after ${leftAfter} ms)`)
  if (!w.isVisible() || dockNow() !== 'collapsed') throw new Error('after the moved panel closed, the tab is not there')
  await sleep(300)
  setDock('expanded')
  const popped = await entrance()
  if (!near(w.getBounds(), spot)) throw new Error(`the moved panel opened at ${JSON.stringify(w.getBounds())}, not where it was left (${JSON.stringify(spot)})`)
  if (popped !== popIn) throw new Error(`the moved panel came in with "${popped}", not ${popIn}`)
  console.log(`smoke: a moved panel closes where it is (the tab is back after ${leftAfter} ms, the window never in between) and opens there again with ${popped}`)

  // A double-click on the bar puts it back where it opens, with its old way in, and macOS does nothing else.
  await sleep(500)
  const nameNow = (await on('.panel-head .name'))!
  const at = { x: spot.x + nameNow.x + 6, y: spot.y + nameNow.y + nameNow.height / 2 }
  mouse('mouseDown', at, 1)
  mouse('mouseUp', at, 1)
  mouse('mouseDown', at, 2)
  mouse('mouseUp', at, 2)
  if (!(await settles(() => !placed() && same(w.getBounds(), home)))) throw new Error(`a double-click on the bar left the panel at ${JSON.stringify(w.getBounds())}, not back at ${JSON.stringify(home)}`)
  if (w.isMinimized() || !w.isVisible() || dockNow() !== 'expanded') throw new Error('a double-click on the bar did something else to the window')
  if (await page.executeJavaScript(`document.documentElement.hasAttribute('data-placed') || Boolean(window.getSelection()?.toString())`)) throw new Error('after a double-click the page still thinks the panel is moved, or the name got selected')
  setDock('collapsed')
  await sleep(500)
  setDock('expanded')
  const old = await entrance()
  if (old !== (reduced ? 'fadein' : 'panel-in')) throw new Error(`put back, the panel came in with "${old}", not its old entrance`)
  console.log(`smoke: a double-click on the bar puts the panel back (${home.x},${home.y}) and its old entrance (${old}) is back`)
  w.setIgnoreMouseEvents(false)

  // A spot for a screen that isn't connected is ignored, and kept.
  panelPlaces = { '987654321': { x: 0.1, y: 0.1 } }
  panelDisplay = '987654321'
  if (placed() || !same(boundsFor('expanded'), home)) throw new Error('a spot for a screen that is not there moved the panel')
  await resetPanelPlace()
  console.log("smoke: a spot for a screen that isn't connected is ignored")

  // In the notch: before it's moved it slides in at its side; moved, it closes and opens where it is.
  if (notchGeo) {
    setDock('collapsed')
    await settings.update({ steward: { notch: true } })
    replaceForNotch()
    await sleep(800)
    setDock('expanded')
    const slide = await entrance()
    const under = w.getBounds()
    if (slide !== (reduced ? 'fadein' : 'panel-in') || !same(under, boundsFor('expanded'))) throw new Error(`in the notch, the unmoved panel came in with "${slide}" at ${JSON.stringify(under)}`)
    // The same messages the page sends.
    const p0 = { x: under.x + 100, y: under.y + 20 }
    dragPanel('start', p0.x, p0.y)
    dragPanel('move', p0.x - 300, p0.y + 50)
    dragPanel('end')
    const there = w.getBounds()
    if (same(there, under) || !placed()) throw new Error('in the notch, the panel did not move')
    const closing = Date.now()
    setDock('collapsed')
    let slid = false
    let shrank = false
    while (w.isVisible() && Date.now() - closing < 900) {
      if (!same(w.getBounds(), there)) throw new Error(`in the notch, closing the moved panel moved the window to ${JSON.stringify(w.getBounds())}`)
      const how = await page.executeJavaScript(`document.documentElement.getAttribute('data-leaving')`)
      shrank ||= how === 'in-place'
      slid ||= how === ''
      await sleep(10)
    }
    if (!shrank || slid || w.isVisible()) throw new Error(`in the notch, the moved panel did not close where it is (in place ${shrank}, out to its side ${slid})`)
    await sleep(300)
    if (!notch.visible) throw new Error('in the notch, after the moved panel closed, the notch is not back')
    setDock('expanded')
    const back = await entrance()
    if (!near(w.getBounds(), there) || back !== popIn) throw new Error(`in the notch, the moved panel opened at ${JSON.stringify(w.getBounds())} with "${back}", not at ${JSON.stringify(there)} with ${popIn}`)
    await resetPanelPlace()
    if (!(await settles(() => same(w.getBounds(), under)))) throw new Error('in the notch, putting the panel back did not bring it to its side')
    setDock('collapsed')
    await sleep(500)
    await settings.update({ steward: { notch: false } })
    replaceForNotch()
    await sleep(300)
    console.log('smoke: in the notch, the panel slides in at its side until it is moved, then closes and opens where it is, and putting it back brings it to its side')
  }
  await settings.update({ keepPanelOpen: keptOpen })
  setDock('collapsed')
  await sleep(500)
}

/**
 * Settings and the open panel. Settings opens beside the panel when there's room, wherever the panel is (dragged, or
 * at its side in the notch), and centered when there isn't. While Settings is the window in use it floats above the panel, and
 * once it isn't, it's a normal window again, under the panel. The panel stays open throughout, and the pin isn't
 * touched. A hidden run has no real focus, so the check sends Settings the focus and blur macOS would.
 */
async function checkSettingsClearOfPanel(): Promise<void> {
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
  const w = win!
  const overlap = (a: Rect, b: Rect) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
  const keptOpen = settings.keepPanelOpen()
  await settings.update({ keepPanelOpen: true })
  /** Open the panel fresh, and drag it (through the messages the page sends) so its middle is dx points from where it opened. */
  const panelAt = async (dx: number | null) => {
    await resetPanelPlace()
    setDock('collapsed')
    await sleep(500)
    setDock('expanded')
    await sleep(600)
    if (dx !== null) {
      const b = w.getBounds()
      dragPanel('start', b.x + 100, b.y + 20)
      dragPanel('move', b.x + 100 + dx, b.y + 20)
      dragPanel('end')
    }
    if (dock !== 'expanded' || !w.isVisible()) throw new Error('the panel did not open for the Settings check')
    return w.getBounds()
  }
  const openIt = async () => {
    openSettings('steward')
    const s = settingsWin!
    if (s.webContents.isLoading()) await new Promise<void>((resolve) => s.webContents.once('did-finish-load', () => resolve()))
    await sleep(300)
    return s
  }
  /** Used, it floats above the panel; not used, it's a normal window, under it. The panel stays open either way. */
  const onTopWhileUsed = (s: BrowserWindow, where: string) => {
    s.emit('focus')
    if (!s.isAlwaysOnTop()) throw new Error(`with the panel ${where}, Settings in use is not above it`)
    s.emit('blur')
    if (s.isAlwaysOnTop()) throw new Error(`with the panel ${where}, Settings stays above it after it's no longer in use`)
    s.emit('focus')
    if (dock !== 'expanded' || !w.isVisible() || !settings.keepPanelOpen()) throw new Error(`with the panel ${where}, using Settings closed the panel or changed the pin`)
  }
  /**
   * Beside the panel when there's room on either side of it (16 points from it and 24 inside the work area, as
   * clearOfPanel has it), exactly centered on the work area when there isn't: a small screen (the CI runner's is about
   * 1024 points wide) has no room beside a 400-point panel anywhere. Says which, for the log.
   */
  const besideOrCentered = (where: string, panel: Rect, at: Rect): string => {
    const area = screen.getDisplayMatching(panel).workArea
    const need = SETTINGS_SIZE.width + 16 + 24
    const room = panel.x - area.x >= need || area.x + area.width - (panel.x + panel.width) >= need
    const centered = clearOfPanel(area, SETTINGS_SIZE, null)
    if (room && overlap(at, panel)) throw new Error(`with the panel ${where} (${JSON.stringify(panel)}), Settings opened over it at ${JSON.stringify(at)} though there's room beside it`)
    if (!room && JSON.stringify(at) !== JSON.stringify(centered)) throw new Error(`with the panel ${where} (${JSON.stringify(panel)}) and no room beside it, Settings opened at ${JSON.stringify(at)}, not centered at ${JSON.stringify(centered)}`)
    return room ? `beside it (x ${at.x}; there's room on a ${area.width}-point work area)` : `centered (x ${at.x}; no room beside it on a ${area.width}-point work area)`
  }
  const cases: [string, number | null][] = [
    ['dragged to the left', -5000],
    ['dragged to the middle', null],
  ]
  for (const [where, dx] of cases) {
    let panel = await panelAt(dx)
    if (dx === null) {
      // The middle of the screen: no room on either side for Settings on most screens.
      const area = screen.getDisplayMatching(panel).workArea
      const b = panel
      dragPanel('start', b.x + 100, b.y + 20)
      dragPanel('move', b.x + 100 + Math.round(area.x + area.width / 2 - (b.x + b.width / 2)), b.y + 20)
      dragPanel('end')
      panel = w.getBounds()
    }
    const s = await openIt()
    const opened = besideOrCentered(where, panel, s.getBounds())
    onTopWhileUsed(s, where)
    console.log(`smoke: with the panel ${where} (x ${panel.x}), Settings opens ${opened}, and floats above it only while in use`)
    s.close()
    await sleep(400)
  }
  if (notchGeo) {
    await resetPanelPlace()
    setDock('collapsed')
    await settings.update({ steward: { notch: true } })
    replaceForNotch()
    await sleep(600)
    const panel = await panelAt(null)
    if (JSON.stringify(panel) !== JSON.stringify(boundsFor('expanded'))) throw new Error('the panel did not open at its side in the notch for the Settings check')
    const s = await openIt()
    const opened = besideOrCentered('at its side in the notch', panel, s.getBounds())
    onTopWhileUsed(s, 'at its side in the notch')
    console.log(`smoke: with the panel at its side in the notch (x ${panel.x}), Settings opens ${opened}, and floats above it only while in use`)
    s.close()
    await sleep(400)
    setDock('collapsed')
    await settings.update({ steward: { notch: false } })
    replaceForNotch()
    await sleep(300)
  }
  await resetPanelPlace()
  await settings.update({ keepPanelOpen: keptOpen })
  setDock('collapsed')
  await sleep(500)
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
  // The panel's pin moved here: General has Keep panel open, the same setting.
  const keep = String(await w.webContents.executeJavaScript(`[...document.querySelectorAll('[data-settings] *')].some((e) => e.childElementCount === 0 && e.textContent === 'Keep panel open')`))
  if (keep !== 'true') throw new Error('Settings → General has no Keep panel open')
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

/** Auto mode in the real app: the Settings choice, then a safe command with no card and a risky one with it (smoke-auto.ts). */
async function runAutoSmoke(w: BrowserWindow, out: string): Promise<void> {
  if (!isOpen(dock)) setDock('expanded')
  await new Promise((resolve) => setTimeout(resolve, 600))
  const shot = async (target: BrowserWindow, suffix: string) => {
    const file = out.replace(/\.png$/, `-${suffix}.png`)
    await fs.writeFile(file, (await target.webContents.capturePage()).toPNG())
    console.log(`smoke: ${suffix} -> ${file}`)
  }
  await checkAutoMode({
    panel: w,
    openSettings: async (section) => {
      openSettings(section)
      const sw = settingsWin!
      await new Promise<void>((resolve) => (sw.webContents.isLoading() ? sw.webContents.once('did-finish-load', () => resolve()) : resolve()))
      return sw
    },
    commandMode: () => settings.commandMode(),
    setCommandMode: (commandMode) => settings.update({ commandMode }),
    useProject: async (folder) => {
      await settings.addProject(folder)
      await settings.setCurrentProject(folder)
    },
    dropProject: (folder) => settings.removeProject(folder),
    runCommand: async (command) => {
      const tools = agent as unknown as { runTool(block: object, signal: AbortSignal): Promise<{ content: unknown }> }
      const result = await tools.runTool({ type: 'tool_use', id: 'smoke-auto', name: 'run_command', input: { command } }, new AbortController().signal)
      return String(result.content)
    },
    shot,
  })
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
  // The Mac stays awake for the run (pmset shows the hold once the app is ready).
  if (SMOKE_OUT) {
    keepMacAwake(powerSaveBlocker)
    pretendNotchScreen(process.env, screen)
  }
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
  panelPlaces = appState.panelPlaces
  panelDisplay = appState.panelDisplay
  tray = new TrayStore(path.join(userData, 'tray'), (items) => win?.webContents.send('tray:changed', items))
  await tray.load()
  sessions = new SessionTracker({ projects: () => settings.projects() })
  reviewStore = new ReviewStore(path.join(userData, 'reviews'))
  await reviewStore.load()
  reviews = new ReviewTracker({
    projects: () => settings.projects(),
    capture: (url) => capturePage(url, { review: { settleMs: 10_000 } }),
    compare: comparePictures,
    card: cardPicture,
    store: reviewStore,
    onChange: () => void sendReviews(),
    onProblems: sendReviewProblems,
    onChecks: sendReviewChecks,
    onHistory: sendReviewHistory,
    gitFiles: { look: (dir) => lookAtFiles(dir), changed: (dir, since, start) => filesChangedSince(dir, since, start) },
    log: (message) => console.error(`[steward] visual review: ${message}`),
  })
  alerts = new AlertQueue({ show: showAlerts })
  watchLog = new WatchLog(path.join(userData, 'watch'))
  watch = new OvernightWatch(
    {
      log: watchLog,
      idleSeconds,
      onBattery: () => powerMonitor.isOnBatteryPower(),
      sessionsWorking: () => workingSessions().length,
      keepAwake: keepAwakeForWatch,
      save: (saved) => void appState.update({ watch: saved }),
      changed: sendWatch,
      ended: (night) => void nightEnded(night),
    },
    // A smoke run starts with no night going on, whatever an earlier run left.
    SMOKE_OUT ? {} : appState.watch,
  )
  await watch.resume()
  deploys = new DeployWatcher({ projects: () => settings.projects(), token: () => settings.vercelToken(), onChanges: onDeployChanges })
  agent = new Agent({
    apiKey: () => settings.apiKey(),
    unsplashKey: () => settings.unsplashKey(),
    projects: () => settings.projects(),
    currentProject: () => settings.currentProject(),
    setCurrentProject: (p) => switchProject(p),
    allowlist: () => settings.allowlist(),
    commandMode: () => settings.commandMode(),
    tray,
    capturePage,
    deployLogs,
    onDeployCommand: () => deploys.boost(),
    // Typing /demo plays a made-up request with every kind of step, without calling the API. Development only.
    demoImage: app.isPackaged && !SMOKE_OUT ? undefined : demoImage,
    name: () => settings.steward().name,
    emit: (event) => {
      win?.webContents.send('agent:event', event)
      // Its asking for your OK, or getting it, changes the face and the island.
      sendMood()
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
  // review://<id>/before and /after: a review's full-page pictures, for the big viewer. Only those (see pictureFor).
  protocol.handle('review', (request) => {
    const file = reviewStore.pictureFor(request.url)
    if (!file) return new Response('Not found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
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
    onHover: (hover) => islandNotes.hover(hover),
    cursor: () => (drivenBySmoke ? smokeNotchCursor : screen.getCursorScreenPoint()),
    // Only when needed, waking up is the grow; Always visible, the cursor on the black grows it a little.
    hoverable: () => !quiet(),
  })
  // Only when needed, it starts asleep.
  notch.setAwake(out())
  updateIsland()
  // Where the notch is decides whether the tab shows at the edge, so it's known before the window shows.
  await refreshNotch()
  win = createWindow()
  syncWatch()
  // Step aside: listen for full-screen apps and the listed ones, and ask macOS where things stand now.
  syncStepAside()
  // A fresh install that hides until needed comes out once, a moment after it starts, so a new user can find it.
  win.webContents.once('did-finish-load', () => {
    if (!drivenBySmoke) setTimeout(maybeFirstPeek, 1200)
    // A night that ended while Steward wasn't running (or before it was opened again) still gets its morning card.
    const ended = watch?.ended
    if (!drivenBySmoke && ended && Date.now() - ended.at < 12 * 60 * 60 * 1000) setTimeout(() => void morningCard(), 1500)
  })
  // Nobody is at a sleeping or locked screen to push against the edge.
  const screenIs = (asleepNow: boolean) => () => {
    screenAsleep = asleepNow
    syncWatch()
  }
  // Overnight Watch writes down when the Mac slept and woke, and the battery; the goodnight card says which it's on.
  powerMonitor.on('suspend', () => watch?.power('suspend'))
  powerMonitor.on('resume', () => watch?.power('resume'))
  powerMonitor.on('on-battery', () => {
    watch?.power('on-battery')
    sendWatch()
  })
  powerMonitor.on('on-ac', () => {
    watch?.power('on-ac')
    sendWatch()
  })
  powerMonitor.on('suspend', screenIs(true))
  powerMonitor.on('lock-screen', screenIs(true))
  powerMonitor.on('resume', screenIs(false))
  powerMonitor.on('unlock-screen', screenIs(false))
  if (SMOKE_OUT) runSmokeCheck(win, SMOKE_OUT)
  else {
    // The smoke check says when you're back itself, so a real return during it can't change a face it checks.
    lookAtIdle()
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

  screen.on('display-metrics-changed', placeAfterDisplayChange)
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
