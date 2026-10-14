import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  acceleratorFromKey,
  checkShortcut,
  codeOfKey,
  FIXED_SHORTCUTS,
  formatAccelerator,
  keyLabel,
  MODIFIER_SYMBOLS,
  MODIFIERS,
  parseAccelerator,
  shortcutInfo,
  SHORTCUTS,
  type Modifier,
} from '../../shared/shortcuts'
import type { SettingsView, ShortcutId } from '../../shared/types'
import { Keyboard, type KeyMark, type KeySpec } from './Keyboard'

const api = () => window.steward

/** Each shortcut's color, on the keyboard and in the list under it. */
export const SHORTCUT_COLORS: Record<ShortcutId, string> = {
  togglePanel: '#2f8fe8',
  hideFromEdge: '#7c5ce6',
  switchProject: '#239a5b',
  openSettings: '#d08a12',
}
const FIXED_COLOR = '#8a919e'
/** The new shortcut, as you press it. */
const NEW_COLOR = 'rgb(var(--live))'

const message = (err: unknown) => (err instanceof Error ? err.message.replace(/^Error invoking remote method '[^']+': (Error: )?/, '') : String(err))

function markOf(accelerator: string, color: string): KeyMark | null {
  const parsed = parseAccelerator(accelerator)
  return parsed && { color, code: codeOfKey(parsed.key), mods: parsed.mods }
}

/** An accelerator as keycaps: ⌥ then Space. */
export function Keys({ accelerator, dim = false }: { accelerator: string; dim?: boolean }) {
  const parsed = parseAccelerator(accelerator)
  if (!parsed) return null
  return (
    <span className={`set-keys ${dim ? 'dim' : ''}`} aria-label={formatAccelerator(accelerator)}>
      {parsed.mods.map((m) => (
        <kbd key={m}>{MODIFIER_SYMBOLS[m]}</kbd>
      ))}
      <kbd>{keyLabel(parsed.key)}</kbd>
    </span>
  )
}

const heldMods = (e: KeyboardEvent): Set<Modifier> => {
  const down: Record<Modifier, boolean> = { Control: e.ctrlKey, Alt: e.altKey, Shift: e.shiftKey, Command: e.metaKey }
  return new Set(MODIFIERS.filter((m) => down[m]))
}

/**
 * Changing a shortcut: a keyboard with every shortcut on it, and the new one as you press it (or click it on the
 * keyboard, for a combination another app catches first). Return saves, Esc cancels.
 */
export function ShortcutRecorder({
  id,
  settings,
  origin,
  leaving,
  onClose,
  onSaved,
}: {
  id: ShortcutId
  settings: SettingsView
  /** The button that opened it, which it grows out of and goes back into. */
  origin: DOMRect | null
  leaving: boolean
  onClose: () => void
  onSaved: (settings: SettingsView) => void
}) {
  const info = shortcutInfo(id)
  const now = settings.shortcuts[id]
  const [pending, setPending] = useState<string | null>(null)
  const [held, setHeld] = useState<Set<Modifier>>(new Set())
  const [clicked, setClicked] = useState<Set<Modifier>>(new Set())
  const [flash, setFlash] = useState<string | null>(null)
  const [pointing, setPointing] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const card = useRef<HTMLDivElement>(null)
  const flashTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const current = Object.fromEntries(SHORTCUTS.map((s) => [s.id, settings.shortcuts[s.id].accelerator])) as Record<ShortcutId, string>
  const check = pending ? checkShortcut(id, pending, current) : null
  const canSave = Boolean(pending && check && check.level !== 'error' && pending !== now.accelerator && !saving)

  const save = async (value: string | null) => {
    setSaving(true)
    setError(null)
    try {
      onSaved(await api().settings.setShortcut(id, value))
      onClose()
    } catch (err) {
      setError(message(err))
    } finally {
      setSaving(false)
    }
  }

  // The latest of these for the key listener, which is added once.
  const latest = useRef({ canSave, pending, save, onClose })
  useLayoutEffect(() => {
    latest.current = { canSave, pending, save, onClose }
  })

  const record = (accelerator: string, code: string) => {
    setPending(accelerator)
    setClicked(new Set())
    setError(null)
    setFlash(code)
    clearTimeout(flashTimer.current)
    flashTimer.current = setTimeout(() => setFlash(null), 260)
  }

  // Steward's global shortcuts step aside while this is open (and the window has focus), so the keys arrive here.
  useEffect(() => {
    if (leaving) return
    void api().settings.recordShortcuts(true)
    const onBlur = () => {
      setHeld(new Set())
      void api().settings.recordShortcuts(false)
    }
    const onFocus = () => void api().settings.recordShortcuts(true)
    window.addEventListener('blur', onBlur)
    window.addEventListener('focus', onFocus)
    return () => {
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('focus', onFocus)
      void api().settings.recordShortcuts(false)
    }
  }, [leaving])

  useEffect(() => {
    if (leaving) return
    const onKeyDown = (e: KeyboardEvent) => {
      // Every key is for the recorder, Tab and ⌘W included.
      e.preventDefault()
      e.stopPropagation()
      setHeld(heldMods(e))
      const plain = !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey
      if (plain && e.code === 'Escape') return latest.current.onClose()
      if (plain && e.code === 'Enter') {
        if (latest.current.canSave) void latest.current.save(latest.current.pending)
        return
      }
      const accelerator = acceleratorFromKey(e)
      if (accelerator) record(accelerator, e.code)
    }
    const onKeyUp = (e: KeyboardEvent) => {
      e.preventDefault()
      setHeld(heldMods(e))
    }
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    return () => {
      window.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', onKeyUp, true)
      clearTimeout(flashTimer.current)
    }
  }, [leaving])

  // Grow out of the Change button.
  useLayoutEffect(() => {
    const el = card.current
    if (!el || !origin) return
    const box = el.getBoundingClientRect()
    el.style.transformOrigin = `${origin.left + origin.width / 2 - box.left}px ${origin.top + origin.height / 2 - box.top}px`
    el.focus()
  }, [origin])

  /** Clicking the keyboard: modifiers stay down until a key finishes the shortcut. */
  const onKey = (k: KeySpec) => {
    if (k.mod) {
      const next = new Set(pending ? [] : clicked)
      if (next.has(k.mod)) next.delete(k.mod)
      else next.add(k.mod)
      setPending(null)
      setClicked(next)
      return
    }
    const mods = new Set([...clicked, ...held])
    const accelerator = acceleratorFromKey({ code: k.code, metaKey: mods.has('Command'), ctrlKey: mods.has('Control'), altKey: mods.has('Alt'), shiftKey: mods.has('Shift') })
    if (accelerator) record(accelerator, k.code)
  }

  const list = [
    ...SHORTCUTS.map((s) => ({ key: s.id, label: s.short, accelerator: settings.shortcuts[s.id].accelerator, color: SHORTCUT_COLORS[s.id] })),
    ...FIXED_SHORTCUTS.map((f) => ({ key: f.accelerator, label: f.short, accelerator: f.accelerator, color: FIXED_COLOR })),
  ]
  const marks = list.flatMap((item) => (item.accelerator ? (markOf(item.accelerator, item.color) ?? []) : []))
  const outlined = [pending ? markOf(pending, NEW_COLOR) : null, ...list.filter((l) => l.key === pointing).map((l) => markOf(l.accelerator, l.color))].filter((m): m is KeyMark => m !== null)
  const typing = new Set([...held, ...clicked])

  return createPortal(
    <div className={`rec-backdrop ${leaving ? 'leaving' : ''}`} onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="rec-card" ref={card} role="dialog" aria-modal="true" aria-labelledby="rec-title" tabIndex={-1}>
        <header className="rec-head">
          <span className="rec-dot" style={{ background: SHORTCUT_COLORS[id] }} aria-hidden="true" />
          <div>
            <h2 id="rec-title">{info.label}</h2>
            <p>{info.scope === 'anywhere' ? 'Works in every app.' : 'Works while the panel has focus.'} Press the new shortcut, or click it on the keyboard.</p>
          </div>
        </header>

        <div className="rec-readout" aria-live="polite">
          {pending ? (
            <Keys accelerator={pending} />
          ) : typing.size ? (
            <span className="set-keys">
              {MODIFIERS.filter((m) => typing.has(m)).map((m) => (
                <kbd key={m}>{MODIFIER_SYMBOLS[m]}</kbd>
              ))}
              <kbd className="waiting">…</kbd>
            </span>
          ) : now.accelerator ? (
            <Keys accelerator={now.accelerator} dim />
          ) : (
            <span className="rec-off">Off</span>
          )}
          <p className={`rec-check ${error ? 'error' : (check?.level ?? '')}`}>
            {error ??
              check?.message ??
              (typing.size ? 'Now the key to go with them.' : now.accelerator ? 'Its shortcut now.' : 'Turned off. Press a shortcut to turn it on.')}
          </p>
        </div>

        <Keyboard marks={marks} outlined={outlined} pressed={new Set(flash ? [flash] : [])} held={typing} onKey={onKey} />

        <ul className="rec-legend">
          {list.map((item) => (
            <li
              key={item.key}
              className={item.key === id ? 'this' : undefined}
              onMouseEnter={() => setPointing(item.key)}
              onMouseLeave={() => setPointing((p) => (p === item.key ? null : p))}
            >
              <i style={{ background: item.color }} aria-hidden="true" />
              <span>{item.label}</span>
              {item.accelerator ? <Keys accelerator={item.accelerator} /> : <span className="rec-off">Off</span>}
            </li>
          ))}
        </ul>

        <footer className="rec-actions">
          <button className="btn quiet" disabled={saving || !now.accelerator} onClick={() => void save('')}>
            Turn off
          </button>
          <button className="btn quiet" disabled={saving || now.isDefault} onClick={() => void save(null)}>
            Use default ({formatAccelerator(info.defaults[0])})
          </button>
          <span className="rec-spacer" />
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn primary" disabled={!canSave} onClick={() => void save(pending)}>
            Save
          </button>
        </footer>
      </div>
    </div>,
    document.body,
  )
}
