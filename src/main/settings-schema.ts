import { z } from 'zod'
import { isShortcutId, normalizeAccelerator } from '../shared/shortcuts'
import { parseAppAddress } from '../shared/review'
import { cleanFrost, cleanName, DEFAULT_STEWARD, isBundleId, MAX_NAME, PANEL_TINT_IDS, PILL_COLOR_IDS } from '../shared/steward'
import type { CommandMode, NotificationPrefs, Project, SettingsPatch, ShortcutId, StepAsideApp, StewardPrefs } from '../shared/types'
import { MAX_APPS, withApp } from './step-aside'

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
  /** Whether the chat asks before each command, or runs the safe ones itself. Ask each time unless it's been switched. */
  commandMode: CommandMode
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
  commandMode: 'ask',
  notifications: { ...DEFAULT_NOTIFICATIONS },
  shortcuts: {},
  steward: { ...DEFAULT_STEWARD },
})

const isProject = (p: unknown): p is Project => typeof (p as Project)?.name === 'string' && typeof (p as Project)?.path === 'string'

/** A project from a file: its name and path, and Visual Review's address only if it's still one on this Mac (a file can be edited by hand). */
function cleanProject({ name, path, url }: Project): Project {
  const address = typeof url === 'string' ? parseAppAddress(url) : null
  return address?.ok ? { name, path, url: address.url } : { name, path }
}

/** The choices each of the character's options has (the name is free text, the frost a number). */
const STEWARD_CHOICES = {
  version: ['glass', 'flat', 'blocky'],
  color: PILL_COLOR_IDS,
  glass: ['tinted', 'clear'],
  personality: ['calm', 'lively'],
  edge: ['right', 'left'],
  notchStyle: ['chin', 'wings'],
  size: ['small', 'medium'],
  tint: PANEL_TINT_IDS,
  presence: ['always', 'quiet'],
  alertPeek: ['needs-me', 'all', 'none'],
} as const

/**
 * What a settings file from before quiet mode gets for the options it doesn't have: today's behavior, not the fresh
 * install's (DEFAULT_STEWARD is quiet, with the eyes dimming), so the settings someone already has stay exactly as they are.
 */
const OLD_FILE_STEWARD = { presence: 'always', alertPeek: 'all', dimWhenIdle: false, hideFromScreenShare: false, hideInFullScreen: false } as const satisfies Pick<
  StewardPrefs,
  'presence' | 'alertPeek' | 'dimWhenIdle' | 'hideFromScreenShare' | 'hideInFullScreen'
>

const pick = <T extends string>(value: unknown, choices: readonly T[], fallback: T): T => ((choices as readonly unknown[]).includes(value) ? (value as T) : fallback)

/**
 * The character's options from a file: each one kept if it's one Steward knows, its default otherwise. A file that exists
 * but lacks the quiet-mode options (an older one, or one with a value that isn't one of Steward's) gets the old behavior;
 * a fresh install has no file, and gets DEFAULT_STEWARD as it is.
 */
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
    notch: typeof r.notch === 'boolean' ? r.notch : d.notch,
    notchStyle: pick(r.notchStyle, STEWARD_CHOICES.notchStyle, d.notchStyle),
    size: pick(r.size, STEWARD_CHOICES.size, d.size),
    tint: pick(r.tint, STEWARD_CHOICES.tint, d.tint),
    frost: r.frost === undefined ? d.frost : cleanFrost(r.frost),
    presence: pick(r.presence, STEWARD_CHOICES.presence, OLD_FILE_STEWARD.presence),
    alertPeek: pick(r.alertPeek, STEWARD_CHOICES.alertPeek, OLD_FILE_STEWARD.alertPeek),
    dimWhenIdle: typeof r.dimWhenIdle === 'boolean' ? r.dimWhenIdle : OLD_FILE_STEWARD.dimWhenIdle,
    hideFromScreenShare: typeof r.hideFromScreenShare === 'boolean' ? r.hideFromScreenShare : OLD_FILE_STEWARD.hideFromScreenShare,
    hideInFullScreen: typeof r.hideInFullScreen === 'boolean' ? r.hideInFullScreen : OLD_FILE_STEWARD.hideInFullScreen,
    hideInApps: cleanApps(r.hideInApps),
  }
}

/** Step aside's list from a file: apps with a real bundle id and a name, each once, at most MAX_APPS. */
function cleanApps(raw: unknown): StepAsideApp[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((a): a is StepAsideApp => !!a && typeof a === 'object' && isBundleId(a.id) && typeof a.name === 'string')
    .reduce((list: StepAsideApp[], a) => withApp(list, { id: a.id, name: a.name.slice(0, 80) }), [])
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
    projects: Array.isArray(r.projects) ? r.projects.filter(isProject).map(cleanProject) : d.projects,
    currentProject: typeof r.currentProject === 'string' ? r.currentProject : null,
    allowlist: Array.isArray(r.allowlist) ? r.allowlist.filter((c): c is string => typeof c === 'string') : d.allowlist,
    secrets,
    keepPanelOpen: typeof r.keepPanelOpen === 'boolean' ? r.keepPanelOpen : d.keepPanelOpen,
    // Anything but a plain "auto" asks: a file with a value Steward doesn't know never turns Auto on.
    commandMode: r.commandMode === 'auto' ? 'auto' : 'ask',
    notifications,
    shortcuts,
    steward: migrateSteward(r.steward),
  }
}

const Patch = z.strictObject({
  keepPanelOpen: z.boolean().optional(),
  commandMode: z.enum(['ask', 'auto']).optional(),
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
      notch: z.boolean(),
      notchStyle: z.enum(STEWARD_CHOICES.notchStyle),
      size: z.enum(STEWARD_CHOICES.size),
      tint: z.enum(STEWARD_CHOICES.tint),
      frost: z.number().int().min(0).max(100),
      presence: z.enum(STEWARD_CHOICES.presence),
      alertPeek: z.enum(STEWARD_CHOICES.alertPeek),
      dimWhenIdle: z.boolean(),
      hideFromScreenShare: z.boolean(),
      hideInFullScreen: z.boolean(),
      hideInApps: z
        .array(z.object({ id: z.string().refine(isBundleId), name: z.string().min(1).max(80) }))
        .max(MAX_APPS)
        .refine((list) => new Set(list.map((a) => a.id)).size === list.length),
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
