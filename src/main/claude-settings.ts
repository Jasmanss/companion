import { constants, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { HOOK_PATH } from './hook-server'

export const CLAUDE_SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json')
export const HOOK_EVENTS = ['PermissionRequest', 'Notification', 'Stop'] as const
const HOOK_TIMEOUT_SECONDS = 5

type Settings = Record<string, unknown>

// Only the parts Steward reads are checked; everything else in an entry is kept as is.
const HookEntry = z.looseObject({ type: z.string() })
const HookGroup = z.looseObject({ matcher: z.string().optional(), hooks: z.array(HookEntry) })
const Hooks = z.record(z.string(), z.array(HookGroup))
type Hooks = z.infer<typeof Hooks>

/**
 * What each hook runs: post the hook's JSON to Steward with the token from its data folder, or do nothing
 * if Steward isn't running. Prints nothing and always exits 0, so it never changes what Claude Code does.
 */
export function hookCommand(dataDir: string, home = os.homedir()): string {
  if (/["$`\\]/.test(dataDir)) throw new Error(`Can't build a hook command for ${dataDir}`)
  const dir = dataDir.startsWith(home + path.sep) ? `$HOME${dataDir.slice(home.length)}` : dataDir
  return (
    `d="${dir}"; [ -r "$d/hook-token" ] && /usr/bin/curl -s -m 1 -o /dev/null -X POST "http://127.0.0.1:$(cat "$d/hook-port")${HOOK_PATH}"` +
    ` -H "Authorization: Bearer $(cat "$d/hook-token")" -H "Content-Type: application/json" --data-binary @-; exit 0`
  )
}

/**
 * Ours, whichever data folder it points at. Every version of the command posts to HOOK_PATH, including the ones
 * installed before the rename, which read the token and port from the old data folder.
 */
const isStewardHook = (hook: { type: string; [key: string]: unknown }) => typeof hook.command === 'string' && hook.command.includes(HOOK_PATH)

/**
 * current: each event has exactly one of our hooks, running this command · outdated: ours are there but point
 * somewhere else (such as the data folder from before the rename), are missing for an event, or are doubled · missing: none of ours.
 */
export type HookState = 'missing' | 'current' | 'outdated'

function hooksOf(settings: Settings): Hooks {
  if (settings.hooks === undefined) return {}
  const parsed = Hooks.safeParse(settings.hooks)
  if (!parsed.success) throw new Error("The hooks section of ~/.claude/settings.json isn't in the shape Steward expects, so it was left alone.")
  return parsed.data
}

/**
 * The settings with Steward's hooks in place. An existing hook of ours (an older command, say) is updated where it
 * is, any extra copies are dropped, and it's added only if there was none. Other hooks and keys are kept as they are.
 */
export function withStewardHooks(settings: Settings, command: string): Settings {
  const hooks = hooksOf(settings)
  for (const event of HOOK_EVENTS) {
    let placed = false
    const groups = (hooks[event] ?? []).flatMap((group) => {
      const kept = group.hooks.flatMap((hook) => {
        if (!isStewardHook(hook)) return [hook]
        if (placed) return []
        placed = true
        return [{ ...hook, type: 'command', command, timeout: HOOK_TIMEOUT_SECONDS }]
      })
      return kept.length ? [{ ...group, hooks: kept }] : []
    })
    if (!placed) groups.push({ hooks: [{ type: 'command', command, timeout: HOOK_TIMEOUT_SECONDS }] })
    hooks[event] = groups
  }
  return { ...settings, hooks }
}

/** The settings with only Steward's hooks taken out. */
export function withoutStewardHooks(settings: Settings): Settings {
  if (settings.hooks === undefined) return settings
  const hooks = hooksOf(settings)
  for (const [event, groups] of Object.entries(hooks)) {
    const kept = groups.map((g) => ({ ...g, hooks: g.hooks.filter((h) => !isStewardHook(h)) })).filter((g) => g.hooks.length > 0)
    if (kept.length) hooks[event] = kept
    else delete hooks[event]
  }
  const out: Settings = {}
  for (const [key, value] of Object.entries(settings)) {
    if (key !== 'hooks') out[key] = value
    else if (Object.keys(hooks).length) out.hooks = hooks
  }
  return out
}

export function hookState(settings: Settings, command: string): HookState {
  let hooks: Hooks
  try {
    hooks = hooksOf(settings)
  } catch {
    return 'missing'
  }
  const ours = HOOK_EVENTS.map((event) => (hooks[event] ?? []).flatMap((g) => g.hooks.filter(isStewardHook)))
  if (ours.every((list) => list.length === 0)) return 'missing'
  return ours.every((list) => list.length === 1 && list[0].command === command) ? 'current' : 'outdated'
}

/** Exactly what connecting adds, for the preview. */
export function hooksPreview(command: string): string {
  return JSON.stringify(withStewardHooks({}, command), null, 2)
}

export async function readClaudeSettings(file = CLAUDE_SETTINGS_FILE): Promise<Settings> {
  let raw: string
  try {
    raw = await fs.readFile(file, 'utf8')
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'ENOENT') return {}
    throw err
  }
  if (!raw.trim()) return {}
  let json: unknown
  try {
    json = JSON.parse(raw)
  } catch {
    throw new Error(`${file} isn't valid JSON, so Steward won't change it.`)
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error(`${file} isn't a JSON object, so Steward won't change it.`)
  return json as Settings
}

/**
 * The one backup of the settings from before Steward first changed them. A backup made under the app's old name
 * is that backup, so it's used rather than making a second one from already-changed settings.
 */
const BACKUP_SUFFIXES = ['.before-steward', '.before-companion']

export async function backupFile(file = CLAUDE_SETTINGS_FILE): Promise<string> {
  for (const suffix of BACKUP_SUFFIXES) {
    const candidate = `${file}${suffix}`
    if (await fs.access(candidate).then(() => true, () => false)) return candidate
  }
  return `${file}${BACKUP_SUFFIXES[0]}`
}

/** Write the settings back: a one-time backup of the original first, then an atomic replace. */
export async function writeClaudeSettings(settings: Settings, file = CLAUDE_SETTINGS_FILE): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.copyFile(file, await backupFile(file), constants.COPYFILE_EXCL).catch(() => {}) // no original, or already backed up
  const mode = await fs.stat(file).then(
    (s) => s.mode & 0o777,
    () => 0o600,
  )
  const tmp = `${file}.steward-tmp`
  await fs.writeFile(tmp, `${JSON.stringify(settings, null, 2)}\n`, { mode })
  await fs.rename(tmp, file)
}
