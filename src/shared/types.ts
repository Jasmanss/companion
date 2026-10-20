/**
 * hidden: off screen entirely · collapsed: the peek at the edge · nudge: peeking out with a message, without focus ·
 * expanded: the panel · viewing: the large image viewer
 */
export type DockState = 'hidden' | 'collapsed' | 'nudge' | 'expanded' | 'viewing'

/**
 * What the character's face shows. Some come from real events: mad and then worried for a failed build, celebrating
 * for a deploy or merge, sleepy for the hour.
 */
export type Mood = 'resting' | 'idle' | 'listening' | 'thinking' | 'talking' | 'done' | 'needs-you' | 'worried' | 'mad' | 'celebrating' | 'sleepy'

/** Glass: a tinted lens. Flat: one solid color. Blocky: pixels. */
export type PillVersion = 'glass' | 'flat' | 'blocky'

export type PillColor = 'silver' | 'sky' | 'lilac' | 'mint' | 'peach' | 'graphite'

/** The color the panel's glass is tinted with. */
export type PanelTint = 'ice' | 'lilac' | 'mint' | 'peach' | 'graphite'

export type NotchStyle = 'chin' | 'wings'

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

/** What Settings can change in one go. Keys, projects and the allowlist have their own calls. */
export interface SettingsPatch {
  /** The panel stays open when you click elsewhere (the pin in its header). */
  keepPanelOpen?: boolean
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
  /** The matching project's name, or the folder name. */
  name: string
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
}

/** What "Try it now" in Settings found: the page as Steward sees it, or why it couldn't. */
export type ReviewTryResult = { ok: true; image: string; width: number; height: number; ms: number } | { ok: false; error: string }

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
  /** A tray item it made (screenshot, add-image), so the panel can fly its thumbnail into the tray. */
  image?: string
}

export type AgentEvent =
  | { type: 'mood'; mood: Mood }
  | { type: 'text'; delta: string }
  | { type: 'activity'; activity: Activity }
  | { type: 'approval'; id: string; command: string; cwd: string; why?: string }
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
    view(): Promise<void>
    onState(cb: (state: DockState) => void): Unsubscribe
    /** The tab being dragged up or down its edge: began, moved (dy points since it began), or ended. */
    drag(phase: 'start' | 'move' | 'end', dy?: number): void
    /** Back to the middle of the edge (Settings → Steward). */
    resetPlace(): Promise<void>
    /** How far the tab and the nudge hang past the screen edge, in points; the page leaves that part empty. */
    overhang(): Promise<number>
    onOverhang(cb: (points: number) => void): Unsubscribe
    /** Docked in the notch, the closed panel's way back up into the notch has played: the window can go. */
    intoNotchEnded(): void
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
  }
  deploys: {
    status(): Promise<DeployStatus>
  }
  /** Visual Review: what Claude changed on the running page. */
  review: {
    /** Reviews waiting for a decision, newest first. */
    list(): Promise<ReviewView[]>
    onChanged(cb: (reviews: ReviewView[]) => void): Unsubscribe
    /** Capture a project's page once, so Settings can show it works. */
    tryIt(path: string): Promise<ReviewTryResult>
    markGood(id: string): Promise<void>
    /** Marks it sent back and copies the note for the session; resolves to what was copied. */
    sendBack(id: string, note: string): Promise<string>
    /** Open the full-page picture. */
    openFull(id: string, which: 'before' | 'after'): Promise<void>
    /** How many reviews are kept and how much space they take. */
    usage(): Promise<{ count: number; bytes: number }>
    /** Delete every review picture. */
    clear(): Promise<void>
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
