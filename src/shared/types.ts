/**
 * hidden: off screen entirely · collapsed: the peek at the edge · nudge: peeking out with a message, without focus ·
 * expanded: the panel · viewing: the large image viewer
 */
export type DockState = 'hidden' | 'collapsed' | 'nudge' | 'expanded' | 'viewing'

/** What the character's face shows. The last three come from real events: a failed build, a deploy or merge, the hour. */
export type Mood = 'resting' | 'idle' | 'listening' | 'thinking' | 'talking' | 'done' | 'needs-you' | 'worried' | 'celebrating' | 'sleepy'

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
}

export interface SettingsView {
  projects: Project[]
  currentProject: string | null
  allowlist: string[]
  /** Where the Anthropic API key comes from. */
  apiKeySource: 'env' | 'saved' | 'none'
  hasUnsplashKey: boolean
  hasVercelToken: boolean
  /** Registered global shortcuts in Electron accelerator form; empty when another app has them. */
  hotkeys: { open: string; hide: string }
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
  /** The backup kept from before Steward first changed the settings (file name). */
  backupFile: string
  serverRunning: boolean
  settingsFile: string
  error?: string
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

/** What a step of the agent's work is. read-file and list-files arrive with the file tools in phase 2. */
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
  /** The file, query, URL, command, host or project it's about. */
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
    setPinned(pinned: boolean): Promise<void>
    onState(cb: (state: DockState) => void): Unsubscribe
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
    addProjectPath(path: string): Promise<SettingsView>
    removeProject(path: string): Promise<SettingsView>
    setCurrentProject(path: string | null): Promise<SettingsView>
    setAllowlist(list: string[]): Promise<SettingsView>
    suggestProjects(): Promise<Project[]>
  }
  sessions: {
    list(): Promise<SessionView[]>
    dismiss(id: string): Promise<void>
    onChanged(cb: (sessions: SessionView[]) => void): Unsubscribe
  }
  alerts: {
    /** Alerts to show now: one urgent alert, or a batch. */
    onShow(cb: (alerts: AlertView[]) => void): Unsubscribe
    /** The face's event mood (worried, celebrating, done), or null when nothing's going on. */
    onMood(cb: (mood: Mood | null) => void): Unsubscribe
  }
  deploys: {
    status(): Promise<DeployStatus>
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
  copyText(text: string): Promise<void>
}
