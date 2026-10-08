import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { safeStorage } from 'electron'
import type { Project, SettingsView } from '../shared/types'

export const DEFAULT_ALLOWLIST = ['git status', 'git diff', 'git log --oneline -20', 'npm test', 'npm run lint', 'npm run typecheck', 'ls']

type SecretKind = 'anthropic' | 'unsplash'

interface Stored {
  projects: Project[]
  currentProject: string | null
  allowlist: string[]
  /** Encrypted with the macOS keychain via safeStorage, base64. */
  secrets: Partial<Record<SecretKind, string>>
}

const defaults = (): Stored => ({ projects: [], currentProject: null, allowlist: [...DEFAULT_ALLOWLIST], secrets: {} })

export class SettingsStore {
  private data: Stored = defaults()

  constructor(
    private readonly file: string,
    readonly hotkey: string,
  ) {}

  async load(): Promise<void> {
    try {
      this.data = { ...defaults(), ...JSON.parse(await fs.readFile(this.file, 'utf8')) }
    } catch {
      this.data = defaults()
    }
  }

  view(): SettingsView {
    return {
      projects: this.data.projects,
      currentProject: this.data.currentProject,
      allowlist: this.data.allowlist,
      apiKeySource: process.env.ANTHROPIC_API_KEY ? 'env' : this.data.secrets.anthropic ? 'saved' : 'none',
      hasUnsplashKey: Boolean(this.unsplashKey()),
      hotkey: this.hotkey,
    }
  }

  apiKey(): string | undefined {
    return process.env.ANTHROPIC_API_KEY || this.decrypt(this.data.secrets.anthropic)
  }

  unsplashKey(): string | undefined {
    return process.env.UNSPLASH_ACCESS_KEY || this.decrypt(this.data.secrets.unsplash)
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

  private async save(): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true })
    await fs.writeFile(this.file, JSON.stringify(this.data, null, 2))
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
