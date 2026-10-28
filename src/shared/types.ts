/**
 * hidden: off screen entirely · collapsed: the peek at the edge · nudge: peeking out with a message, without focus ·
 * expanded: the panel · viewing: the large image viewer
 */
export type DockState = 'hidden' | 'collapsed' | 'nudge' | 'expanded' | 'viewing'
/** What the viewing state shows: the tray's images, or a Visual Review's before and after (a bigger window). */
export type ViewerKind = 'tray' | 'review'

/**
 * What the character's face shows. Some come from real events: mad and then worried for a failed build, celebrating
 * for a deploy or merge, sleepy for the hour. The reactions follow the chats (main/reactions.ts): focused while one
 * works, juggling while several do, a nod, done or proud when one stops (by how long its turn was), confused when one
 * asks you something, hello when you're back at the Mac. Watching is Overnight Watch: half-lidded, a slow blink.
 */
export type Mood =
  | 'resting'
  | 'idle'
  | 'listening'
  | 'thinking'
  | 'talking'
  | 'done'
  | 'needs-you'
  | 'worried'
  | 'mad'
  | 'celebrating'
  | 'sleepy'
  | 'confused'
  | 'focused'
  | 'juggling'
  | 'nod'
  | 'proud'
  | 'hello'
  | 'watching'

/** Glass: a tinted lens. Flat: one solid color. Blocky: pixels. */
export type PillVersion = 'glass' | 'flat' | 'blocky'

export type PillColor = 'silver' | 'sky' | 'lilac' | 'mint' | 'peach' | 'graphite'

/** The color the panel's glass is tinted with. */
export type PanelTint = 'ice' | 'lilac' | 'mint' | 'peach' | 'graphite'

export type NotchStyle = 'chin' | 'wings' | 'island'

/**
 * What the island's right side shows (the Smart choice): Claude working (a spinner and the time), two projects working
 * (a spinner and a count), finished (a check), needs you (an amber mark), asks you something (a "?"), a review ready (a
 * thumbnail), a build failed (a red mark), good news (a spark, while its note shows).
 */
export type IslandRight = 'working' | 'two' | 'finished' | 'needs' | 'asks' | 'review' | 'failed' | 'good'
export interface IslandStatus {
  /** null: nothing going on, so no island; Steward peeks from the notch. */
  right: IslandRight | null
  /** Working: when the turn began, so the time counts up from it. */
  since?: number
  /** Two projects: how many are working. */
  count?: number
  /** Finished after a long turn (Steward is proud): a small spark pops once by the check. */
  spark?: boolean
  /** A short message, one line under the notch, for a few seconds: the island grows into the note size for it. */
  note?: IslandNote
}
/**
 * A message the island grows for. The note size: finished ("Main building finished", and what Claude said), started (a
 * second project started while one works), good (deployed, a PR merged), first (the first launch's how-to), alert (the
 * catch-all: any other alert, its title and one line). The approval size: wait (a session waits for your OK), input (a
 * session asks you something), agent (Steward's own request, with Allow and Deny), failed (a build failed). The review
 * size: review.
 */
/** The buttons on the island's messages. */
export type IslandAct = 'open' | 'later' | 'look' | 'allow' | 'deny' | 'good' | 'big'
export type IslandNoteKind = 'finished' | 'started' | 'good' | 'first' | 'alert' | 'wait' | 'input' | 'agent' | 'failed' | 'review'
export interface IslandNote {
  kind: IslandNoteKind
  /** The chat's name (or the project's), in bold, then the rest. */
  name: string
  text: string
  /** When it was shown: a new note, even one saying the same, is a new message. */
  at: number
  /** The alert it came from, if any: its buttons act on it. */
  key?: string
  /** The alert's offer, like "Want me to look?". */
  action?: string
  /** Good news that came within a moment of it, joined into this note: "and 2 more". */
  more?: number
  /** How its words fit (the notch page measures them): on one line, the long note, or too long. */
  fit?: 'note' | 'long' | 'toolong'
}

/** Always visible: the tab (or the notch's chin) is always there. Only when needed: it's out of sight until it's useful. */
export type Presence = 'always' | 'quiet'

/** Which alerts peek out from where Steward sits: only a session that needs you, everything switched on in Notifications, or none. */
export type AlertPeek = 'needs-me' | 'all' | 'none'

/** The notch on a display that has one, in screen points (Electron's coordinates). Read from macOS, never guessed. */
export interface NotchGeometry {
  displayId: number
  /** The notch's left side and the screen's top. */
  x: number
  y: number
  width: number
  height: number
}

/** The notch's size, and where its center is in the notch window. */
export interface NotchLayout {
  cx: number
  width: number
  height: number
}
/** What thinking is busy with: a wave, reading a file, or searching. */
export type PillGlint = 'sweep' | 'step' | 'search'
/** What the notch window shows: where the notch is, and the character's mood. */
export interface NotchState {
  layout: NotchLayout | null
  mood: Mood
  glint: PillGlint
  /** Asleep (Only when needed, at rest): just the notch's own black, no eyes. */
  awake: boolean
  /** The cursor is on the black (Always visible): it grows a little. */
  hover?: boolean
  /** An alert is out under the notch, joined to the chin (Wings grows its chin for it). */
  nudge?: boolean
  /** The island (Settings → Steward → In the notch → Island): what it shows. */
  island?: IslandStatus
  /** The panel is open at the side: which way it is from the notch (x and y from -1 to 1), for Steward to look at. */
  panel?: { x: number; y: number } | null
}

/** How the character looks and behaves, and where it sits: Settings → Steward. */
export interface StewardPrefs {
  version: PillVersion
  color: PillColor
  /** Glass only: tinted with the color, or clear. */
  glass: 'tinted' | 'clear'
  /** Talking shows a mouth; without one, the eyes bounce with the words. */
  mouth: boolean
  /** Lively glances around, follows the cursor and hops when happy; calm mostly keeps still. */
  personality: 'calm' | 'lively'
  /** Shown in the panel, and what the agent answers to. */
  name: string
  /** The side of the screen it docks on; also where it goes when it can't be in the notch. */
  edge: 'right' | 'left'
  /** Dock in the MacBook notch instead, on screens that have one. Elsewhere it stays on the edge above. */
  notch: boolean
  /** In the notch: a chin below it with the eyes in it, or one eye on each side of it in the menu bar. */
  notchStyle: NotchStyle
  /** How big the tab at the screen edge is. */
  size: 'small' | 'medium'
  /** The panel's glass: its tint, and how frosted it is, 0 (clear) to 100 (frosted). */
  tint: PanelTint
  frost: number
  /** Always visible, or out of sight until it's needed (a cursor pushed against its spot, an alert, or the hotkey). */
  presence: Presence
  /** Which alerts peek out. The rest wait in the menu bar and show as cards when the panel next opens. */
  alertPeek: AlertPeek
  /** The eyes fade after a while at rest. Saved now; it does something from the next build. */
  dimWhenIdle: boolean
  /** Viewers and recordings don't see Steward. Saved now; it does something from a later build. */
  hideFromScreenShare: boolean
  /** Step aside: hidden while an app is full screen on Steward's screen. */
  hideInFullScreen: boolean
  /** Step aside: hidden while one of these apps is in front. */
  hideInApps: StepAsideApp[]
}

/** An app Steward steps aside for: its bundle id, and its name to show in Settings. */
export interface StepAsideApp {
  id: string
  name: string
}

export interface TrayItem {
  id: string
  /** Display name, usually the original file name. */
  name: string
  /** Absolute path of the stored copy. */
  file: string
  /** Page or URL the image came from. */
  source?: string
  note?: string
  credit?: string
  addedAt: number
  bytes: number
}

export interface Project {
  name: string
  path: string
  /** Where the project's app runs on this Mac (Visual Review). Empty means Visual Review is off for the project. */
  url?: string
}

/** Which alerts peek out from the screen edge, and which cards the panel shows. All on by default. */
export interface NotificationPrefs {
  /** A Claude Code session is waiting for approval or input. */
  sessionNeedsMe: boolean
  /** A Claude Code session finished a long turn. */
  sessionFinished: boolean
  buildFailed: boolean
  /** A deploy went out or a PR was merged. */
  celebrations: boolean
  /** The first time the panel opens each day. */
  morningBrief: boolean
  /** On switching projects, or coming back after a while. */
  leftOff: boolean
}

/** The shortcuts you can change. The first two work anywhere on the Mac; the others while the panel has focus. */
export type ShortcutId = 'togglePanel' | 'hideFromEdge' | 'switchProject' | 'openSettings'

export interface ShortcutView {
  /** Electron accelerator form ("Alt+Space"); '' when it's turned off. */
  accelerator: string
  /** Steward's own choice: you haven't changed it. */
  isDefault: boolean
  /** It works now. A global one is inactive when macOS gave it to another app. */
  active: boolean
}

/** The sections of the Settings window, in sidebar order. */
export type SettingsSection = 'general' | 'steward' | 'projects' | 'shortcuts' | 'connections' | 'notifications'

/** How Steward's chat runs commands: it asks each time, or runs the safe ones and asks only for risky ones. */
export type CommandMode = 'ask' | 'auto'

/** What Settings can change in one go. Keys, projects and the allowlist have their own calls. */
export interface SettingsPatch {
  /** The panel stays open when you click elsewhere (the pin in its header). */
  keepPanelOpen?: boolean
  commandMode?: CommandMode
  notifications?: Partial<NotificationPrefs>
  openAtLogin?: boolean
  steward?: Partial<StewardPrefs>
}

export interface SettingsView {
  projects: Project[]
  currentProject: string | null
  allowlist: string[]
  /** Where the Anthropic API key comes from. */
  apiKeySource: 'env' | 'saved' | 'none'
  hasUnsplashKey: boolean
  hasVercelToken: boolean
  keepPanelOpen: boolean
  commandMode: CommandMode
  notifications: NotificationPrefs
  /** Lives in macOS, not in the settings file. Unavailable while developing (it would register Electron itself). */
  openAtLogin: { available: boolean; enabled: boolean; needsApproval: boolean }
  shortcuts: Record<ShortcutId, ShortcutView>
  steward: StewardPrefs
  /** The home folder, for showing project paths as ~/… */
  home: string
  version: string
}

/** What a Claude Code session is doing, as far as its hooks have said. */
export type SessionState = 'working' | 'needs-approval' | 'needs-input' | 'finished'

export interface SessionView {
  id: string
  /** The chat's own name in the Claude app, else the matching project's name, or the folder name. */
  name: string
  /** With a chat name: the project or folder, as a quieter second word. */
  place?: string
  projectPath: string | null
  cwd: string
  state: SessionState
  /** The command waiting for approval, the question, or the last thing Claude said. */
  detail?: string
  updatedAt: number
}

/** urgent: peek out now · normal: peek out, batched with others · quiet: only shown in the panel */
export type AlertLevel = 'urgent' | 'normal' | 'quiet'

export interface AlertView {
  id: number
  /** Same key, same alert: it's shown once. */
  key: string
  level: AlertLevel
  title: string
  detail?: string
  mood?: Mood
  /** Usually a project path: good news for a scope clears its worried face. */
  scope?: string
  /** An offer like "Want me to look?": accepting opens the panel and sends the prompt to the agent. */
  action?: { label: string; prompt: string }
  at: number
}

/** A Vercel deployment of one of your linked projects. */
export interface DeployInfo {
  uid: string
  project: string
  projectPath: string
  /** BUILDING, READY, ERROR, CANCELED, QUEUED, … */
  state: string
  url: string | null
  created: number
  ready?: number
  target: string | null
  commit?: string
  branch?: string
  inspectorUrl?: string
  errorMessage?: string
}

export interface DeployStatus {
  hasToken: boolean
  /** Names of your projects linked to Vercel. */
  linked: string[]
  lastError: string | null
}

export interface ClaudeHookStatus {
  /** All of Steward's hooks are in ~/.claude/settings.json, with the current command. */
  connected: boolean
  /** Some are there but need updating, e.g. still pointing at the data folder from before the rename. */
  outdated: boolean
  /** The prompt hook Visual Review needs (UserPromptSubmit) is in ~/.claude/settings.json with the current command. */
  reviewHook: boolean
  /** The backup kept from before Steward first changed the settings (file name). */
  backupFile: string
  serverRunning: boolean
  settingsFile: string
  error?: string
}

/**
 * Why a night's Watch ended: the wake time, "I'm up", Stop watching, you came back and used the Mac for a couple of
 * minutes, or the 12-hour cap.
 */
export type WatchEnd = 'wake-time' | 'up' | 'stopped' | 'back' | 'cap'

/** Overnight Watch, for the panel: watching or not, and what the goodnight card says Steward can watch tonight. */
export interface WatchView {
  watching: boolean
  /** Watching: since when, and until when (the wake time, or the 12-hour cap). */
  since?: number
  until?: number
  /** The wake time last picked, as "07:30". */
  wakeTime: string
  /** What there is to watch tonight. */
  plan: {
    /** Claude Code sessions working now, by name. */
    working: string[]
    /** How many sessions are waiting on you now. */
    waiting: number
    /** Projects whose deploys Steward can see (linked to Vercel). */
    deploys: string[]
  }
  /** The Mac is on battery: it may sleep however Steward tries. */
  onBattery: boolean
  /** How the last Watch ended, while it's still worth saying (until the next one starts). */
  ended?: { at: number; why: WatchEnd }
  /** The newest night with a report kept, for "Last night" on the card. */
  lastNight?: string
}

/**
 * Overnight Watch's night report: what happened while you rested, from the night's log and Visual Review's store. A
 * template, no model call. Words only: an alert's title, never its detail.
 */
export interface NightReport {
  id: string
  /** "Good morning" for the newest night, "Saturday night" for an earlier one. */
  title: string
  /** When it was watched, as "11:10 PM to 7:02 AM". */
  span: string
  /** One line: "2 things needed you. 2 things changed.", or "Quiet night. Nothing needed you." */
  summary: string
  /** When Steward couldn't see, in words: the Mac slept, or Steward wasn't running. */
  gaps: string[]
  /** What needed you (a session waiting on you, a production deploy failing), and what came of it. */
  needed: { at: number; title: string; note: string }[]
  /** Sessions that finished. */
  finished: { at: number; title: string }[]
  /** Visual Reviews made during the night, and what became of each (gone: no longer kept). */
  reviews: { id: string; at: number; title: string; said: string | null; status: 'new' | 'good' | 'sent-back' | 'gone' }[]
  /** Deploys per project, oldest first. */
  deploys: { project: string; runs: { at: number; ok: boolean; production: boolean }[] }[]
  /** How many more of each there were than the lists hold. */
  more: { needed: number; finished: number }
  /** The nights kept before and after this one, to step through. */
  earlier: string | null
  later: string | null
}

/** Visual Review: one finished turn whose page looks different, waiting for a decision. */
export interface ReviewView {
  id: string
  project: string
  projectPath: string
  /** The address that was captured, as typed in Settings. */
  address: string
  createdAt: number
  /** The top of each page, small, as data URLs for the slider. `before` is null when there is no earlier picture. */
  before: string | null
  after: string
  /** When the before picture was taken: as the prompt was sent, the last time Steward looked, or never. */
  beforeFrom: 'turn-start' | 'last-look' | 'none'
  /** Page heights in pixels, so the card can say the page is taller now. */
  heightBefore: number | null
  heightAfter: number
  /** The full-page pictures on disk (the note for the session points at them). */
  files: { before: string | null; after: string }
  /** "Claude says": the start of Claude's last reply for the turn, or null when it said nothing worth showing. */
  said: string | null
  /** How many files the turn changed in the project's git checkout, or null when git couldn't say. */
  filesChanged: number | null
}

/**
 * What "Try it now" in Settings found: the page as Steward sees it, or why it couldn't. `note` says where the page ended up
 * when it isn't the address (a redirect), and `login` that it looks like a login page.
 */
export type ReviewTryResult =
  | { ok: true; image: string; width: number; height: number; ms: number; note?: string; login?: boolean }
  | { ok: false; error: string }

/** Visual Review looked when a turn ended and the page looks the same: a quiet line, so a check is never silent. */
export interface ReviewCheck {
  projectPath: string
  project: string
  /** The address it looked at. */
  address: string
  at: number
}

/**
 * Visual Review's history: one look at a project's page as a turn ended, and what it found, so a quiet turn can be
 * explained. review: the page changed and made a review (decided says what became of it, gone once it isn't kept).
 * same: it looked the same. failed: it couldn't be seen (text says why). login: all it found was a login page.
 */
export interface ReviewHistoryEntry {
  projectPath: string
  address: string
  at: number
  found: 'review' | 'same' | 'failed' | 'login'
  text?: string
  reviewId?: string
  decided?: 'new' | 'good' | 'sent-back' | 'gone'
}

/** Why Visual Review can't see a project's page right now: the last capture failed, or it only found a login page. Cleared by the next one that works. */
export interface ReviewProblem {
  projectPath: string
  project: string
  /** The address it tried. */
  address: string
  /** In plain words, such as "Nothing is answering at localhost:3000. Start the app, then try again." */
  reason: string
  login: boolean
  at: number
}

/** The "where you left off" card for a project. */
export interface LeftOff {
  project: string
  path: string
  isGit: boolean
  branch: string | null
  /** Newest first: short hash, subject, and how long ago. */
  commits: { hash: string; subject: string; when: string }[]
  uncommitted: { count: number; files: string[] }
  /** Commits not on the upstream yet; null when there's no upstream. */
  unpushed: number | null
  /** The last thing that project's Claude session said. */
  claude: { text: string; at: number } | null
}

/** The morning brief: the first panel open each day. Built from a template, no model call. */
export interface Brief {
  greeting: string
  date: string
  /** One line, e.g. "2 deploys went out, 1 failed. 3 sessions finished." */
  summary: string
  failed: DeployInfo[]
  ready: DeployInfo[]
  /** Claude Code sessions that finished since you were last here. */
  sessions: SessionView[]
  leftOff: LeftOff | null
  /** Open Dependabot PRs per project; null when gh isn't installed. */
  dependabot: { project: string; prs: { number: number; title: string; url: string }[] }[] | null
}

export interface SaveResult {
  dir: string
  files: string[]
  snippet: string
}

/** What a step of the agent's work is. */
export type ActivityKind =
  | 'thinking'
  | 'read-file'
  | 'list-files'
  | 'search-web'
  | 'fetch-page'
  | 'run-command'
  | 'screenshot'
  | 'add-image'
  | 'read-logs'
  | 'search-photos'

export type ActivityStatus = 'running' | 'done' | 'failed'

/**
 * One step of the agent's work. It's sent when it starts and again, with the same id, when it finishes
 * (and in between when there's more to show, like a search query arriving).
 */
export interface Activity {
  id: string
  kind: ActivityKind
  /** What's happening, in the right tense: "Searching the web", then "Searched the web". */
  label: string
  /**
   * The file, query, URL, command, host or project it's about. Files and folders are relative to the project;
   * a folder ends in a slash, except the project's top folder, which is the project's name.
   */
  target?: string
  status: ActivityStatus
  /** Why it failed, or a short note like "exit 1". */
  detail?: string
  /** Search results: the sites (search-web), or photo thumbnail URLs (search-photos). */
  results?: string[]
  /** run-command: it ran without a Run card, because Auto judged it safe, or it's on your list of commands. */
  ranBy?: 'auto' | 'list'
  /** A tray item it made (screenshot, add-image), so the panel can fly its thumbnail into the tray. */
  image?: string
}

export type AgentEvent =
  | { type: 'mood'; mood: Mood }
  | { type: 'text'; delta: string }
  | { type: 'activity'; activity: Activity }
  /** reason: Auto is on but this still asks, and why, in a few words ("pushing always asks"). */
  | { type: 'approval'; id: string; command: string; cwd: string; why?: string; reason?: string }
  | { type: 'approval-resolved'; id: string; approved: boolean }
  /** Command output as it arrives (chunk), then all of it once the command ends (exitCode set). */
  | { type: 'output'; activityId: string; command: string; chunk?: string; exitCode?: number | null; text?: string }
  | { type: 'stopped' }
  | { type: 'done' }
  | { type: 'error'; message: string }

/** How the panel is drawn: vibrant when macOS frosts the window behind the page, otherwise solid. */
export interface Appearance {
  vibrant: boolean
}

type Unsubscribe = () => void

/** The bridge the preload script exposes to the renderer as `window.steward`. */
export interface StewardAPI {
  dock: {
    expand(): Promise<void>
    collapse(): Promise<void>
    hide(): Promise<void>
    view(kind?: ViewerKind): Promise<void>
    onState(cb: (state: DockState) => void): Unsubscribe
    /** The tab being dragged up or down its edge: began, moved (dy points since it began), or ended. */
    drag(phase: 'start' | 'move' | 'end', dy?: number): void
    /** The tab back to the middle of the edge, and the panel back to where it opens (Settings → Steward). */
    resetPlace(): Promise<void>
    /** How far the tab and the nudge hang past the screen edge, in points; the page leaves that part empty. */
    overhang(): Promise<number>
    onOverhang(cb: (points: number) => void): Unsubscribe
    /** Docked in the notch, the closed panel's way back up into the notch has played: the window can go. */
    intoNotchEnded(): void
    /** The alert at the edge: how tall its words are, so its window grows to hold them rather than cut them off. */
    nudgeWords(height: number): void
    /** The panel being dragged by its top bar: began, or moved, with the pointer here (screen points), or ended. */
    dragPanel(phase: 'start' | 'move' | 'end', x?: number, y?: number): void
    /** The panel back where it opens: at its edge, or under the notch (double-click on the top bar). */
    resetPanel(): Promise<void>
    /** Whether the panel has been moved, so it opens and closes where it is. */
    onPlaced(cb: (placed: boolean) => void): () => void
    /** The window has gone, or gone to the tab, after the closed panel's way out: the page can draw what's next. */
    onLeft(cb: () => void): () => void
  }
  tray: {
    list(): Promise<TrayItem[]>
    addPaths(paths: string[]): Promise<void>
    addUrl(url: string, source?: string): Promise<void>
    addBytes(data: Uint8Array, mime: string, name?: string): Promise<void>
    remove(id: string): Promise<void>
    clear(): Promise<void>
    startDrag(ids: string[]): void
    dragEnded(): void
    saveToProject(ids: string[]): Promise<SaveResult | null>
    reveal(path: string): Promise<void>
    onChanged(cb: (items: TrayItem[]) => void): Unsubscribe
    pathForFile(file: File): string
  }
  agent: {
    send(text: string): Promise<void>
    approve(id: string, approved: boolean): Promise<void>
    cancel(): Promise<void>
    reset(): Promise<void>
    onEvent(cb: (event: AgentEvent) => void): Unsubscribe
  }
  settings: {
    get(): Promise<SettingsView>
    setApiKey(key: string): Promise<SettingsView>
    setUnsplashKey(key: string): Promise<SettingsView>
    setVercelToken(token: string): Promise<SettingsView>
    addProject(): Promise<SettingsView>
    /** Pick a folder, add it as a project if it's new, and switch to it. */
    addProjectAndSwitch(): Promise<SettingsView>
    /** Pick an app in Finder and add it to Step aside's list. */
    addStepAsideApp(): Promise<SettingsView>
    addProjectPath(path: string): Promise<SettingsView>
    removeProject(path: string): Promise<SettingsView>
    /** Visual Review's address for a project: an address on this Mac, or '' to turn it off. Throws when it isn't one. */
    setProjectUrl(path: string, url: string): Promise<SettingsView>
    setCurrentProject(path: string | null): Promise<SettingsView>
    setAllowlist(list: string[]): Promise<SettingsView>
    suggestProjects(): Promise<Project[]>
    update(patch: SettingsPatch): Promise<SettingsView>
    /** Change a shortcut: an accelerator, '' to turn it off, or null for Steward's default. Throws when it can't be used. */
    setShortcut(id: ShortcutId, accelerator: string | null): Promise<SettingsView>
    /** While a new shortcut is being pressed, Steward's global ones step aside so the keys reach the window. */
    recordShortcuts(recording: boolean): Promise<void>
    /** Every change, wherever it was made (the Settings window, the panel, the agent switching projects). */
    onChanged(cb: (settings: SettingsView) => void): Unsubscribe
    /** Open the Settings window, at a section, or bring it forward. */
    open(section?: SettingsSection): Promise<void>
    close(): Promise<void>
    /** For the Settings window: show this section (asked for while it was already open). */
    onSection(cb: (section: SettingsSection) => void): Unsubscribe
  }
  sessions: {
    list(): Promise<SessionView[]>
    dismiss(id: string): Promise<void>
    onChanged(cb: (sessions: SessionView[]) => void): Unsubscribe
  }
  alerts: {
    /** Alerts to show now: one urgent alert, or a batch. */
    onShow(cb: (alerts: AlertView[]) => void): Unsubscribe
    /** The character's event mood (mad, worried, celebrating, done), or null when nothing's going on. */
    onMood(cb: (mood: Mood | null) => void): Unsubscribe
    /** An alert's offer was taken on the notch island ("Want me to look?"): the panel runs it. */
    onAct(cb: (alert: AlertView) => void): Unsubscribe
  }
  deploys: {
    status(): Promise<DeployStatus>
  }
  /** Visual Review: what Claude changed on the running page. */
  review: {
    /** Reviews waiting for a decision, newest first. */
    list(): Promise<ReviewView[]>
    onChanged(cb: (reviews: ReviewView[]) => void): Unsubscribe
    /** Open big on the notch island: the panel opens this review in its viewer. */
    onOpen(cb: (id: string) => void): Unsubscribe
    /** Projects whose page Visual Review can't see right now, and why. */
    problems(): Promise<ReviewProblem[]>
    onProblems(cb: (problems: ReviewProblem[]) => void): Unsubscribe
    /** Projects whose page Visual Review checked after a turn and found unchanged (the newest check of each). */
    checks(): Promise<ReviewCheck[]>
    onChecks(cb: (checks: ReviewCheck[]) => void): Unsubscribe
    /** Capture a project's page once, so Settings can show it works. */
    tryIt(path: string): Promise<ReviewTryResult>
    markGood(id: string): Promise<void>
    /** Marks it sent back and copies the note for the session; resolves to what was copied. */
    sendBack(id: string, note: string): Promise<string>
    /** Open the full-page picture. */
    openFull(id: string, which: 'before' | 'after'): Promise<void>
    /** The looks after recent turns in a project, newest first. */
    history(projectPath: string): Promise<ReviewHistoryEntry[]>
    /** The history changed (a turn ended, a review was decided, or it was cleared): ask again. */
    onHistory(cb: () => void): Unsubscribe
    /** How many reviews are kept and how much space they take. */
    usage(): Promise<{ count: number; bytes: number }>
    /** Delete every review picture. */
    clear(): Promise<void>
  }
  /** Overnight Watch: Go rest, and Steward keeps the Mac awake and writes the night down. */
  watch: {
    get(): Promise<WatchView>
    /** Go rest, watching until this wake time ("07:30"). */
    start(wakeTime: string): Promise<WatchView>
    /** "I'm up", or Stop watching. */
    stop(why: 'up' | 'stopped'): Promise<WatchView>
    /** Remember the wake time picked on the card. */
    setWakeTime(wakeTime: string): Promise<WatchView>
    onChanged(cb: (view: WatchView) => void): Unsubscribe
    /** Goodnight from the menu bar: show the goodnight card. */
    onGoodnight(cb: () => void): Unsubscribe
    /** A night's report, or null when it isn't kept. */
    report(id: string): Promise<NightReport | null>
    /** How many nights' reports are kept. */
    nights(): Promise<number>
    /** Delete every night report (a night going on keeps its own). */
    clear(): Promise<void>
    /** Show this report: the night ended with the panel open, or the panel opened after it ended. */
    onReport(cb: (report: NightReport) => void): Unsubscribe
  }
  leftOff: {
    /** Shown when you switch projects or come back after 2+ hours. */
    onShow(cb: (card: LeftOff) => void): Unsubscribe
  }
  brief: {
    onShow(cb: (brief: Brief) => void): Unsubscribe
  }
  claude: {
    status(): Promise<ClaudeHookStatus>
    /** The exact JSON that connecting adds to ~/.claude/settings.json. */
    preview(): Promise<string>
    connect(): Promise<ClaudeHookStatus>
    disconnect(): Promise<ClaudeHookStatus>
  }
  appearance: {
    get(): Promise<Appearance>
    onChange(cb: (appearance: Appearance) => void): Unsubscribe
  }
  /** The MacBook notch, and Steward docked in it. */
  notch: {
    /** The notch on this Mac's screens right now, or null when none has one. */
    geometry(): Promise<NotchGeometry | null>
    onGeometry(cb: (notch: NotchGeometry | null) => void): Unsubscribe
    /** From the panel: the character's mood, so the notch shows the same one. */
    reportMood(mood: Mood, glint: PillGlint): void
    /** In the notch window: what to show, the cursor relative to the window (null when it's far), and a click. */
    state(): Promise<NotchState>
    onState(cb: (state: NotchState) => void): Unsubscribe
    onCursor(cb: (p: { x: number; y: number } | null) => void): Unsubscribe
    click(): void
    /** How the island's message's words fit (at: which message), measured on the page. */
    fit(at: number, fit: NonNullable<IslandNote['fit']>): void
    /** A button on the island's message (at: which message): Open, Later, Want me to look?, Allow, Deny, Looks good, Open big. */
    act(what: IslandAct, at: number): void
  }
  /** Only when needed: a one-time note, shown in the panel the first time it opens, and the tab's slide in and out. */
  presence: {
    onNote(cb: (text: string) => void): Unsubscribe
    /** Whether the page starts slid out (off the screen edge). */
    slid(): Promise<boolean>
    /** Slide out (to the screen edge) or back in; animate false jumps. The page does it, so the window never moves. */
    onSlide(cb: (slide: { out: boolean; animate: boolean }) => void): Unsubscribe
    /**
     * The slide out (or the fade, with Reduce Motion) has ended: the window can go. 'drawn': the page drew its end;
     * 'clock': its end time passed with no frame drawn (a page that isn't being drawn gets no transitionend).
     */
    slideEnded(by: 'drawn' | 'clock'): void
    /** The cursor came near the tab, or went away again (for Dim when idle). */
    onNear(cb: (near: boolean) => void): Unsubscribe
  }
  copyText(text: string): Promise<void>
}
