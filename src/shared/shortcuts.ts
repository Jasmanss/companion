import type { ShortcutId, ShortcutView } from './types'

/**
 * Shortcuts are kept as Electron accelerators ("Alt+Shift+Space"), with modifiers in Apple's order (⌃⌥⇧⌘), so
 * the same text can be registered, compared and shown.
 */
export type Modifier = 'Control' | 'Alt' | 'Shift' | 'Command'
export const MODIFIERS: Modifier[] = ['Control', 'Alt', 'Shift', 'Command']
export const MODIFIER_SYMBOLS: Record<Modifier, string> = { Control: '⌃', Alt: '⌥', Shift: '⇧', Command: '⌘' }

export const GLOBAL_SHORTCUTS = ['togglePanel', 'hideFromEdge'] as const
export type GlobalShortcutId = (typeof GLOBAL_SHORTCUTS)[number]
export const isGlobalShortcut = (id: ShortcutId): id is GlobalShortcutId => (GLOBAL_SHORTCUTS as readonly string[]).includes(id)

export interface ShortcutInfo {
  id: ShortcutId
  label: string
  /** For the list under the keyboard. */
  short: string
  /** Anywhere on the Mac (registered with macOS), or only while the panel has focus. */
  scope: 'anywhere' | 'panel'
  /**
   * The first one macOS registers is used. macOS hardly ever refuses one: it doesn't refuse a shortcut another app
   * has registered too, so Steward can't tell when one is taken (checked on macOS 27 with Electron 44).
   */
  defaults: string[]
}

export const SHORTCUTS: ShortcutInfo[] = [
  { id: 'togglePanel', label: 'Open or tuck away the panel', short: 'Open or tuck away', scope: 'anywhere', defaults: ['Alt+Space', 'Control+Alt+Space'] },
  {
    id: 'hideFromEdge',
    label: 'Hide from the screen edge, and bring it back',
    short: 'Hide from the edge',
    scope: 'anywhere',
    defaults: ['Alt+Shift+Space', 'Control+Alt+Shift+Space'],
  },
  { id: 'switchProject', label: 'Switch project', short: 'Switch project', scope: 'panel', defaults: ['Command+K'] },
  { id: 'openSettings', label: 'Settings', short: 'Settings', scope: 'panel', defaults: ['Command+,'] },
]
export const isShortcutId = (value: unknown): value is ShortcutId => SHORTCUTS.some((s) => s.id === value)
export const shortcutInfo = (id: ShortcutId) => SHORTCUTS.find((s) => s.id === id)!

/** The keys every Mac app relies on. Shown alongside Steward's own, never changed. */
export const FIXED_SHORTCUTS = [
  { label: "Add what's on the clipboard to the tray", short: 'Paste into the tray', accelerator: 'Command+V', does: "adds what's on the clipboard to the tray" },
  { label: 'Tuck the panel away, or close Settings', short: 'Tuck away, close Settings', accelerator: 'Escape', does: 'tucks the panel away and closes Settings' },
  { label: 'Close Settings', short: 'Close Settings', accelerator: 'Command+W', does: 'closes Settings' },
]

interface KeyName {
  /** The accelerator's name for it. */
  key: string
  /** What's printed on the keycap. */
  label: string
}

/** Keys a shortcut can end in, by KeyboardEvent.code: where the key is, not what it types (⌥K types "˚"). */
const KEYS: Record<string, KeyName> = {
  Space: { key: 'Space', label: 'Space' },
  Enter: { key: 'Return', label: '↩' },
  Tab: { key: 'Tab', label: '⇥' },
  Backspace: { key: 'Backspace', label: '⌫' },
  Escape: { key: 'Escape', label: 'esc' },
  ArrowUp: { key: 'Up', label: '↑' },
  ArrowDown: { key: 'Down', label: '↓' },
  ArrowLeft: { key: 'Left', label: '←' },
  ArrowRight: { key: 'Right', label: '→' },
  Minus: { key: '-', label: '-' },
  Equal: { key: '=', label: '=' },
  BracketLeft: { key: '[', label: '[' },
  BracketRight: { key: ']', label: ']' },
  Backslash: { key: '\\', label: '\\' },
  Semicolon: { key: ';', label: ';' },
  Quote: { key: "'", label: "'" },
  Comma: { key: ',', label: ',' },
  Period: { key: '.', label: '.' },
  Slash: { key: '/', label: '/' },
  Backquote: { key: '`', label: '`' },
}
for (let c = 65; c <= 90; c++) KEYS[`Key${String.fromCharCode(c)}`] = { key: String.fromCharCode(c), label: String.fromCharCode(c) }
for (let d = 0; d <= 9; d++) KEYS[`Digit${d}`] = { key: String(d), label: String(d) }
for (let f = 1; f <= 12; f++) KEYS[`F${f}`] = { key: `F${f}`, label: `F${f}` }

const CODE_OF_KEY = new Map(Object.entries(KEYS).map(([code, { key }]) => [key, code]))

/** The KeyboardEvent.code of an accelerator's key ("Space" → "Space", "K" → "KeyK"), or null. */
export const codeOfKey = (key: string): string | null => CODE_OF_KEY.get(key) ?? null

/** The keycap label for a key ("Return" → "↩"). */
export const keyLabel = (key: string): string => KEYS[codeOfKey(key) ?? '']?.label ?? key

const MODIFIER_ALIASES: Record<string, Modifier> = {
  command: 'Command',
  cmd: 'Command',
  commandorcontrol: 'Command',
  cmdorctrl: 'Command',
  meta: 'Command',
  super: 'Command',
  control: 'Control',
  ctrl: 'Control',
  alt: 'Alt',
  option: 'Alt',
  altgr: 'Alt',
  shift: 'Shift',
}
const KEY_ALIASES: Record<string, string> = { esc: 'Escape', escape: 'Escape', enter: 'Return', return: 'Return', space: 'Space', tab: 'Tab', backspace: 'Backspace', up: 'Up', down: 'Down', left: 'Left', right: 'Right' }

/** An accelerator taken apart, written any way ("cmdorctrl+shift+k"), or null if it isn't one Steward can use. */
export function parseAccelerator(accelerator: string): { mods: Modifier[]; key: string } | null {
  const parts = accelerator.split('+').map((p) => p.trim())
  const last = parts.pop()
  if (!last) return null
  const mods = new Set<Modifier>()
  for (const part of parts) {
    const mod = MODIFIER_ALIASES[part.toLowerCase()]
    if (!mod) return null
    mods.add(mod)
  }
  const key = KEY_ALIASES[last.toLowerCase()] ?? (last.length === 1 ? last.toUpperCase() : /^f\d{1,2}$/i.test(last) ? last.toUpperCase() : last)
  if (!codeOfKey(key)) return null
  return { mods: MODIFIERS.filter((m) => mods.has(m)), key }
}

/** One spelling per shortcut: ⌃⌥⇧⌘ order and Electron's key names. Null when it isn't a usable accelerator. */
export function normalizeAccelerator(accelerator: string): string | null {
  const parsed = parseAccelerator(accelerator)
  return parsed && [...parsed.mods, parsed.key].join('+')
}

/** A key press as an accelerator, or null for a modifier on its own or a key a shortcut can't end in. */
export function acceleratorFromKey(e: { code: string; metaKey: boolean; ctrlKey: boolean; altKey: boolean; shiftKey: boolean }): string | null {
  const name = KEYS[e.code]
  if (!name) return null
  const held: Record<Modifier, boolean> = { Control: e.ctrlKey, Alt: e.altKey, Shift: e.shiftKey, Command: e.metaKey }
  return [...MODIFIERS.filter((m) => held[m]), name.key].join('+')
}

/** "Alt+Shift+Space" → "⌥⇧ Space", "Command+K" → "⌘K", "" → "". */
export function formatAccelerator(accelerator: string): string {
  const parsed = parseAccelerator(accelerator)
  if (!parsed) return accelerator
  const mods = parsed.mods.map((m) => MODIFIER_SYMBOLS[m]).join('')
  const key = keyLabel(parsed.key)
  return mods && key.length > 1 ? `${mods} ${key}` : `${mods}${key}`
}

const normalized = (table: Record<string, string>) => Object.fromEntries(Object.entries(table).map(([a, why]) => [normalizeAccelerator(a)!, why]))

/** What these do in every Mac app. Steward never takes them. */
const APP_SHORTCUTS = normalized({
  'Command+C': 'copies',
  'Command+V': 'pastes',
  'Command+X': 'cuts',
  'Command+A': 'selects all',
  'Command+Z': 'undoes',
  'Shift+Command+Z': 'redoes',
  'Command+Q': 'quits apps',
  'Command+W': 'closes windows',
  'Command+H': 'hides apps',
  'Command+M': 'minimizes windows',
  'Command+Tab': 'switches apps',
  'Command+`': 'switches windows',
  'Command+S': 'saves',
  'Command+F': 'finds',
  'Command+N': 'opens a new window',
  'Command+T': 'opens a new tab',
  'Command+P': 'prints',
  'Command+O': 'opens files',
  'Alt+Command+Escape': 'opens Force Quit',
})

/** What macOS itself uses these for, out of the box. Usable, if you've turned macOS's off. */
const MACOS_SHORTCUTS = normalized({
  'Command+Space': 'Spotlight',
  'Alt+Command+Space': 'Finder search',
  'Control+Space': 'switching input sources',
  'Control+Alt+Space': 'switching input sources',
  'Control+Command+Space': 'the emoji picker',
  'Shift+Command+3': 'screenshots',
  'Shift+Command+4': 'screenshots',
  'Shift+Command+5': 'screenshots',
  'Control+Command+Q': 'locking the screen',
  'Control+Command+F': 'full screen',
  'Control+Up': 'Mission Control',
  'Control+Down': 'App Exposé',
  'Control+Left': 'moving between Spaces',
  'Control+Right': 'moving between Spaces',
  'Alt+Command+D': 'showing and hiding the Dock',
})

export interface ShortcutCheck {
  /** ok: fine. warning: works, but read this first. error: can't be saved. */
  level: 'ok' | 'warning' | 'error'
  message: string
}

/**
 * Whether a shortcut can be used for this action. Blocks what would break typing or other apps, and what's already
 * one of Steward's; warns about what macOS uses for itself. Other apps' global shortcuts can't be seen at all.
 */
export function checkShortcut(id: ShortcutId, accelerator: string, current: Partial<Record<ShortcutId, string>>): ShortcutCheck {
  const parsed = parseAccelerator(accelerator)
  if (!parsed) return { level: 'error', message: "That isn't a key a shortcut can end in." }
  const a = [...parsed.mods, parsed.key].join('+')
  const shown = formatAccelerator(a)
  const info = shortcutInfo(id)
  if (current[id] === a) return { level: 'ok', message: `${shown} is its shortcut now.` }
  const other = SHORTCUTS.find((s) => s.id !== id && current[s.id] === a)
  if (other) return { level: 'error', message: `${shown} is already set for ${other.label}.` }
  const fixed = FIXED_SHORTCUTS.find((f) => f.accelerator === a)
  if (fixed) return { level: 'error', message: `${shown} already ${fixed.does}.` }
  if (APP_SHORTCUTS[a]) return { level: 'error', message: `${shown} ${APP_SHORTCUTS[a]} in every app.` }
  const fkey = /^F\d+$/.test(parsed.key)
  if (!fkey && !parsed.mods.some((m) => m !== 'Shift')) return { level: 'error', message: 'Add ⌘, ⌃ or ⌥, so it doesn’t get in the way of typing.' }
  // Anywhere, ⌘ (or ⇧⌘) and a letter would take that shortcut from every app.
  if (info.scope === 'anywhere' && !fkey && parsed.key !== 'Space' && !parsed.mods.includes('Control') && !parsed.mods.includes('Alt')) {
    return { level: 'error', message: `Add ⌃ or ⌥: ${shown} everywhere would take it from every other app.` }
  }
  const macos = MACOS_SHORTCUTS[a]
  if (macos) return { level: 'warning', message: `macOS uses ${shown} for ${macos}. Pick it only if you’ve turned that off in System Settings.` }
  return {
    level: 'ok',
    message:
      info.scope === 'anywhere' ? `${shown} is free in Steward. Steward can’t see other apps’ shortcuts, so if it doesn’t respond, pick another.` : `${shown} is free.`,
  }
}

/**
 * Each shortcut as it is now: what you set (or turned off), else the default macOS let Steward have. Global ones
 * are active only when macOS registered them.
 */
export function resolveShortcuts(custom: Partial<Record<ShortcutId, string>>, registered: Partial<Record<GlobalShortcutId, string>>): Record<ShortcutId, ShortcutView> {
  const out = {} as Record<ShortcutId, ShortcutView>
  for (const { id, defaults } of SHORTCUTS) {
    const set = custom[id]
    if (isGlobalShortcut(id)) {
      const got = registered[id] ?? ''
      if (set === undefined) out[id] = { accelerator: got || defaults[0], isDefault: true, active: Boolean(got) }
      else out[id] = { accelerator: set, isDefault: false, active: Boolean(set) && got === set }
    } else if (set === undefined) out[id] = { accelerator: defaults[0], isDefault: true, active: true }
    else out[id] = { accelerator: set, isDefault: false, active: Boolean(set) }
  }
  return out
}
