import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { safeStorage } from 'electron'
import type { NotificationPrefs, Project, SettingsPatch, SettingsView } from '../shared/types'
import { decryptLegacySecret } from './migrate'
import { defaultSettings, migrateSettings, type SecretKind, type StoredSettings } from './settings-schema'

/** What the view shows that the settings file doesn't hold. */
export type SystemInfo = Pick<SettingsView, 'hotkeys' | 'openAtLogin' | 'version'>

export class SettingsStore {
  private data: StoredSettings = defaultSettings()

  constructor(
    private readonly file: string,
    private readonly system: () => SystemInfo,
    /** After every saved change, so every window can show it. */
    private readonly onChange: () => void = () => {},
  ) {}

  async load(): Promise<void> {
    try {
      this.data = migrateSettings(JSON.parse(await fs.readFile(this.file, 'utf8')))
    } catch {
      this.data = defaultSettings()
    }
  }

  view(): SettingsView {
    return {
      projects: this.data.projects,
      currentProject: this.data.currentProject,
      allowlist: this.data.allowlist,
      apiKeySource: process.env.ANTHROPIC_API_KEY ? 'env' : this.data.secrets.anthropic ? 'saved' : 'none',
      hasUnsplashKey: Boolean(this.unsplashKey()),
      hasVercelToken: Boolean(this.vercelToken()),
      keepPanelOpen: this.data.keepPanelOpen,
      notifications: this.data.notifications,
      ...this.system(),
      home: os.homedir(),
    }
  }

  apiKey(): string | undefined {
    return process.env.ANTHROPIC_API_KEY || this.decrypt(this.data.secrets.anthropic)
  }

  unsplashKey(): string | undefined {
    return process.env.UNSPLASH_ACCESS_KEY || this.decrypt(this.data.secrets.unsplash)
  }

  vercelToken(): string | undefined {
    return process.env.VERCEL_TOKEN || this.decrypt(this.data.secrets.vercel)
  }

  async setSecret(kind: SecretKind, value: string): Promise<void> {
    const trimmed = value.trim()
    this.data.secrets[kind] = trimmed ? this.encrypt(trimmed) : undefined
    await this.save()
  }

  projects(): Project[] {
    return this.data.projects
  }

  currentProject(): Project | null {
    return this.data.projects.find((p) => p.path === this.data.currentProject) ?? null
  }

  allowlist(): string[] {
    return this.data.allowlist
  }

  keepPanelOpen(): boolean {
    return this.data.keepPanelOpen
  }

  notifications(): NotificationPrefs {
    return this.data.notifications
  }

  /** The switches in Settings. Open at login lives in macOS, so the caller handles that one. */
  async update(patch: Omit<SettingsPatch, 'openAtLogin'>): Promise<void> {
    if (patch.keepPanelOpen !== undefined) this.data.keepPanelOpen = patch.keepPanelOpen
    if (patch.notifications) this.data.notifications = { ...this.data.notifications, ...patch.notifications }
    await this.save()
  }

  async addProject(projectPath: string): Promise<void> {
    if (!this.data.projects.some((p) => p.path === projectPath)) {
      this.data.projects.push({ name: path.basename(projectPath), path: projectPath })
    }
    this.data.currentProject ??= projectPath
    await this.save()
  }

  async removeProject(projectPath: string): Promise<void> {
    this.data.projects = this.data.projects.filter((p) => p.path !== projectPath)
    if (this.data.currentProject === projectPath) this.data.currentProject = this.data.projects[0]?.path ?? null
    await this.save()
  }

  async setCurrentProject(projectPath: string | null): Promise<void> {
    if (projectPath && !this.data.projects.some((p) => p.path === projectPath)) throw new Error('Unknown project')
    this.data.currentProject = projectPath
    await this.save()
  }

  async setAllowlist(list: string[]): Promise<void> {
    this.data.allowlist = list.map((s) => s.trim()).filter(Boolean)
    await this.save()
  }

  /** Folders in ~/Documents and ~/Desktop that look like code projects and aren't added yet. */
  async suggestProjects(): Promise<Project[]> {
    const found: Project[] = []
    for (const root of [path.join(os.homedir(), 'Documents'), path.join(os.homedir(), 'Desktop')]) {
      const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.startsWith('.')) continue
        const dir = path.join(root, entry.name)
        if (this.data.projects.some((p) => p.path === dir)) continue
        const looksLikeCode = await Promise.any(['package.json', '.git'].map((m) => fs.access(path.join(dir, m)))).then(() => true, () => false)
        if (looksLikeCode) found.push({ name: entry.name, path: dir })
      }
    }
    return found
  }

  /**
   * After the rename, the copied keys are still encrypted for the old app's keychain entry. Re-encrypt each one
   * for Steward's; any that can't be read stay as they are, and Settings asks for them again. Returns how many moved.
   */
  async migrateLegacySecrets(legacyKeychainPassword: string): Promise<number> {
    let moved = 0
    for (const kind of Object.keys(this.data.secrets) as SecretKind[]) {
      const value = this.data.secrets[kind]
      if (!value) continue
      try {
        this.data.secrets[kind] = this.encrypt(decryptLegacySecret(Buffer.from(value, 'base64'), legacyKeychainPassword))
        moved++
      } catch {
        // left as is
      }
    }
    if (moved) await this.save()
    return moved
  }

  private async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true })
    await fs.writeFile(this.file, JSON.stringify(this.data, null, 2))
    this.onChange()
  }

  private encrypt(value: string): string {
    if (!safeStorage.isEncryptionAvailable()) throw new Error('Keychain encryption is not available')
    return safeStorage.encryptString(value).toString('base64')
  }

  private decrypt(value: string | undefined): string | undefined {
    if (!value) return undefined
    try {
      return safeStorage.decryptString(Buffer.from(value, 'base64'))
    } catch {
      return undefined
    }
  }
}
