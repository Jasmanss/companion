import { constants, promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { z } from 'zod'
import { HOOK_PATH } from './hook-server'

export const CLAUDE_SETTINGS_FILE = path.join(os.homedir(), '.claude', 'settings.json')
export const HOOK_EVENTS = ['PermissionRequest', 'Notification', 'Stop'] as const
const HOOK_TIMEOUT_SECONDS = 5

type Settings = Record<string, unknown>

// Only the parts Companion reads are checked; everything else in an entry is kept as is.
const HookEntry = z.looseObject({ type: z.string() })
const HookGroup = z.looseObject({ matcher: z.string().optional(), hooks: z.array(HookEntry) })
const Hooks = z.record(z.string(), z.array(HookGroup))
type Hooks = z.infer<typeof Hooks>

/**
 * What each hook runs: post the hook's JSON to Companion with the token from its data folder, or do nothing
 * if Companion isn't running. Prints nothing and always exits 0, so it never changes what Claude Code does.
 */
export function hookCommand(dataDir: string, home = os.homedir()): string {
  if (/["$`\\]/.test(dataDir)) throw new Error(`Can't build a hook command for ${dataDir}`)
  const dir = dataDir.startsWith(home + path.sep) ? `$HOME${dataDir.slice(home.length)}` : dataDir
  return (
    `d="${dir}"; [ -r "$d/hook-token" ] && /usr/bin/curl -s -m 1 -o /dev/null -X POST "http://127.0.0.1:$(cat "$d/hook-port")${HOOK_PATH}"` +
    ` -H "Authorization: Bearer $(cat "$d/hook-token")" -H "Content-Type: application/json" --data-binary @-; exit 0`
  )
}

const isCompanionHook = (hook: { type: string; [key: string]: unknown }) => typeof hook.command === 'string' && hook.command.includes(HOOK_PATH)

function hooksOf(settings: Settings): Hooks {
  if (settings.hooks === undefined) return {}
  const parsed = Hooks.safeParse(settings.hooks)
  if (!parsed.success) throw new Error("The hooks section of ~/.claude/settings.json isn't in the shape Companion expects, so it was left alone.")
  return parsed.data
}

/** The settings with Companion's hooks added. Existing hooks and every other key are kept; adding twice changes nothing. */
export function withCompanionHooks(settings: Settings, command: string): Settings {
  const hooks = hooksOf(settings)
  for (const event of HOOK_EVENTS) {
    const groups = hooks[event] ?? []
    if (!groups.some((g) => g.hooks.some(isCompanionHook))) groups.push({ hooks: [{ type: 'command', command, timeout: HOOK_TIMEOUT_SECONDS }] })
    hooks[event] = groups
  }
  return { ...settings, hooks }
}

/** The settings with only Companion's hooks taken out. */
export function withoutCompanionHooks(settings: Settings): Settings {
  if (settings.hooks === undefined) return settings
  const hooks = hooksOf(settings)
  for (const [event, groups] of Object.entries(hooks)) {
    const kept = groups.map((g) => ({ ...g, hooks: g.hooks.filter((h) => !isCompanionHook(h)) })).filter((g) => g.hooks.length > 0)
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

export function hasCompanionHooks(settings: Settings): boolean {
  try {
    const hooks = hooksOf(settings)
    return HOOK_EVENTS.every((event) => hooks[event]?.some((g) => g.hooks.some(isCompanionHook)))
  } catch {
    return false
  }
}

/** Exactly what connecting adds, for the preview. */
export function hooksPreview(command: string): string {
  return JSON.stringify(withCompanionHooks({}, command), null, 2)
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
    throw new Error(`${file} isn't valid JSON, so Companion won't change it.`)
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) throw new Error(`${file} isn't a JSON object, so Companion won't change it.`)
  return json as Settings
}

/** Write the settings back: a one-time backup of the original first, then an atomic replace. */
export async function writeClaudeSettings(settings: Settings, file = CLAUDE_SETTINGS_FILE): Promise<void> {
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.copyFile(file, `${file}.before-companion`, constants.COPYFILE_EXCL).catch(() => {}) // no original, or already backed up
  const mode = await fs.stat(file).then(
    (s) => s.mode & 0o777,
    () => 0o600,
  )
  const tmp = `${file}.companion-tmp`
  await fs.writeFile(tmp, `${JSON.stringify(settings, null, 2)}\n`, { mode })
  await fs.rename(tmp, file)
}
