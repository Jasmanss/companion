import { z } from 'zod'
import { isShortcutId, normalizeAccelerator } from '../shared/shortcuts'
import { cleanFrost, cleanName, DEFAULT_STEWARD, MAX_NAME, PANEL_TINT_IDS, PILL_COLOR_IDS } from '../shared/steward'
import type { NotificationPrefs, Project, SettingsPatch, ShortcutId, StewardPrefs } from '../shared/types'

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
  /** Only the ones you changed: an accelerator, or '' for off. The rest use Steward's defaults. */
  shortcuts: Partial<Record<ShortcutId, string>>
  /** The character: how it looks and behaves, its name, and where it sits. */
  steward: StewardPrefs
}

export const defaultSettings = (): StoredSettings => ({
  projects: [],
  currentProject: null,
  allowlist: [...DEFAULT_ALLOWLIST],
  secrets: {},
  keepPanelOpen: false,
  notifications: { ...DEFAULT_NOTIFICATIONS },
  shortcuts: {},
  steward: { ...DEFAULT_STEWARD },
})

const isProject = (p: unknown): p is Project => typeof (p as Project)?.name === 'string' && typeof (p as Project)?.path === 'string'

/** The choices each of the character's options has (the name is free text, the frost a number). */
const STEWARD_CHOICES = {
  version: ['glass', 'flat', 'blocky'],
  color: PILL_COLOR_IDS,
  glass: ['tinted', 'clear'],
  personality: ['calm', 'lively'],
  edge: ['right', 'left'],
  size: ['small', 'medium'],
  tint: PANEL_TINT_IDS,
} as const

const pick = <T extends string>(value: unknown, choices: readonly T[], fallback: T): T => ((choices as readonly unknown[]).includes(value) ? (value as T) : fallback)

/** The character's options from a file: each one kept if it's one Steward knows, its default otherwise. */
function migrateSteward(raw: unknown): StewardPrefs {
  const d = DEFAULT_STEWARD
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {}
  return {
    version: pick(r.version, STEWARD_CHOICES.version, d.version),
    color: pick(r.color, STEWARD_CHOICES.color, d.color),
    glass: pick(r.glass, STEWARD_CHOICES.glass, d.glass),
    mouth: typeof r.mouth === 'boolean' ? r.mouth : d.mouth,
    personality: pick(r.personality, STEWARD_CHOICES.personality, d.personality),
    name: typeof r.name === 'string' ? cleanName(r.name) : d.name,
    edge: pick(r.edge, STEWARD_CHOICES.edge, d.edge),
    size: pick(r.size, STEWARD_CHOICES.size, d.size),
    tint: pick(r.tint, STEWARD_CHOICES.tint, d.tint),
    frost: r.frost === undefined ? d.frost : cleanFrost(r.frost),
  }
}

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
  const shortcuts: StoredSettings['shortcuts'] = {}
  if (r.shortcuts && typeof r.shortcuts === 'object' && !Array.isArray(r.shortcuts)) {
    for (const [id, value] of Object.entries(r.shortcuts)) {
      if (!isShortcutId(id) || typeof value !== 'string') continue
      // '' is "off"; anything else has to be a shortcut Steward can use.
      const accelerator = value === '' ? '' : normalizeAccelerator(value)
      if (accelerator !== null) shortcuts[id] = accelerator
    }
  }
  return {
    projects: Array.isArray(r.projects) ? r.projects.filter(isProject).map(({ name, path }) => ({ name, path })) : d.projects,
    currentProject: typeof r.currentProject === 'string' ? r.currentProject : null,
    allowlist: Array.isArray(r.allowlist) ? r.allowlist.filter((c): c is string => typeof c === 'string') : d.allowlist,
    secrets,
    keepPanelOpen: typeof r.keepPanelOpen === 'boolean' ? r.keepPanelOpen : d.keepPanelOpen,
    notifications,
    shortcuts,
    steward: migrateSteward(r.steward),
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
  steward: z
    .strictObject({
      version: z.enum(STEWARD_CHOICES.version),
      color: z.enum(STEWARD_CHOICES.color),
      glass: z.enum(STEWARD_CHOICES.glass),
      mouth: z.boolean(),
      personality: z.enum(STEWARD_CHOICES.personality),
      // Tidied (and an empty one made Steward again) when it's saved.
      name: z.string().max(MAX_NAME * 4),
      edge: z.enum(STEWARD_CHOICES.edge),
      size: z.enum(STEWARD_CHOICES.size),
      tint: z.enum(STEWARD_CHOICES.tint),
      frost: z.number().int().min(0).max(100),
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
