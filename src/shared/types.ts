export type DockState = 'collapsed' | 'expanded'

/** What the character's face shows. */
export type Mood = 'resting' | 'idle' | 'listening' | 'thinking' | 'talking' | 'done' | 'needs-you'

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
  hotkey: string
}

export interface SaveResult {
  dir: string
  files: string[]
  snippet: string
}

export type AgentEvent =
  | { type: 'mood'; mood: Mood }
  | { type: 'text'; delta: string }
  | { type: 'activity'; text: string }
  | { type: 'approval'; id: string; command: string; cwd: string; why?: string }
  | { type: 'approval-resolved'; id: string; approved: boolean }
  | { type: 'output'; command: string; exitCode: number | null; text: string }
  | { type: 'done' }
  | { type: 'error'; message: string }

type Unsubscribe = () => void

/** The bridge the preload script exposes to the renderer as `window.companion`. */
export interface CompanionAPI {
  dock: {
    expand(): Promise<void>
    collapse(): Promise<void>
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
    addProject(): Promise<SettingsView>
    addProjectPath(path: string): Promise<SettingsView>
    removeProject(path: string): Promise<SettingsView>
    setCurrentProject(path: string | null): Promise<SettingsView>
    setAllowlist(list: string[]): Promise<SettingsView>
    suggestProjects(): Promise<Project[]>
  }
  copyText(text: string): Promise<void>
}
