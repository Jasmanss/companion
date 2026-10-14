import { z } from 'zod'
import type { NotificationPrefs, Project, SettingsPatch } from '../shared/types'

export const DEFAULT_ALLOWLIST = ['git status', 'git diff', 'git log --oneline -20', 'npm test', 'npm run lint', 'npm run typecheck', 'ls']

export type SecretKind = 'anthropic' | 'unsplash' | 'vercel'

export const DEFAULT_NOTIFICATIONS: NotificationPrefs = {
  sessionNeedsMe: true,
  sessionFinished: true,
  buildFailed: true,
  celebrations: true,
  morningBrief: true,
  leftOff: true,
}

/** What settings.json holds. */
export interface StoredSettings {
  projects: Project[]
  currentProject: string | null
  allowlist: string[]
  /** Encrypted with the macOS keychain via safeStorage, base64. */
  secrets: Partial<Record<SecretKind, string>>
  keepPanelOpen: boolean
  notifications: NotificationPrefs
}

export const defaultSettings = (): StoredSettings => ({
  projects: [],
  currentProject: null,
  allowlist: [...DEFAULT_ALLOWLIST],
  secrets: {},
  keepPanelOpen: false,
  notifications: { ...DEFAULT_NOTIFICATIONS },
})

const isProject = (p: unknown): p is Project => typeof (p as Project)?.name === 'string' && typeof (p as Project)?.path === 'string'

/**
 * A settings file from any version, made whole: fields it doesn't have yet (like the notification switches) get
 * their defaults, one at a time, and anything that isn't the right shape falls back rather than being trusted.
 */
export function migrateSettings(raw: unknown): StoredSettings {
  const d = defaultSettings()
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return d
  const r = raw as Record<string, unknown>
  const secrets: StoredSettings['secrets'] = {}
  if (r.secrets && typeof r.secrets === 'object') {
    for (const kind of ['anthropic', 'unsplash', 'vercel'] as const) {
      const value = (r.secrets as Record<string, unknown>)[kind]
      if (typeof value === 'string' && value) secrets[kind] = value
    }
  }
  const notifications = { ...d.notifications }
  if (r.notifications && typeof r.notifications === 'object') {
    for (const key of Object.keys(notifications) as (keyof NotificationPrefs)[]) {
      const value = (r.notifications as Record<string, unknown>)[key]
      if (typeof value === 'boolean') notifications[key] = value
    }
  }
  return {
    projects: Array.isArray(r.projects) ? r.projects.filter(isProject).map(({ name, path }) => ({ name, path })) : d.projects,
    currentProject: typeof r.currentProject === 'string' ? r.currentProject : null,
    allowlist: Array.isArray(r.allowlist) ? r.allowlist.filter((c): c is string => typeof c === 'string') : d.allowlist,
    secrets,
    keepPanelOpen: typeof r.keepPanelOpen === 'boolean' ? r.keepPanelOpen : d.keepPanelOpen,
    notifications,
  }
}

const Patch = z.strictObject({
  keepPanelOpen: z.boolean().optional(),
  openAtLogin: z.boolean().optional(),
  notifications: z
    .strictObject({
      sessionNeedsMe: z.boolean(),
      sessionFinished: z.boolean(),
      buildFailed: z.boolean(),
      celebrations: z.boolean(),
      morningBrief: z.boolean(),
      leftOff: z.boolean(),
    })
    .partial()
    .optional(),
})

/** A change from the Settings window, checked: only known fields, of the right type. Throws otherwise. */
export function parseSettingsPatch(input: unknown): SettingsPatch {
  const parsed = Patch.safeParse(input)
  if (!parsed.success) throw new Error("That setting isn't one Steward knows")
  return parsed.data
}
