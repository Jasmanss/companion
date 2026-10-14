import type { CSSProperties } from 'react'
import type { Modifier } from '../../shared/shortcuts'

/** One key of the keyboard. */
export interface KeySpec {
  /** KeyboardEvent.code, or a name for keys a web page never hears (fn, Touch ID). */
  code: string
  label: string
  /** The second label: the shifted character, or a modifier's symbol. */
  sub?: string
  /** Width, in key widths. */
  u?: number
  /** A modifier: clicking it holds it down for the next key. */
  mod?: Modifier
  /** Can't be part of a shortcut (caps lock, fn, Touch ID). */
  dead?: boolean
  /** Where a wide key's label sits, like on a real keyboard. */
  align?: 'left' | 'right'
}

const key = (code: string, label: string, opts: Omit<KeySpec, 'code' | 'label'> = {}): KeySpec => ({ code, label, ...opts })
const letters = (row: string) => [...row].map((ch) => key(`Key${ch}`, ch))
const SHIFTED = '!@#$%^&*()'

/** A MacBook's US keyboard, row by row; every row is 15 keys wide. A pair is ↑ stacked over ↓. */
const ROWS: { short?: boolean; keys: (KeySpec | [KeySpec, KeySpec])[] }[] = [
  {
    short: true,
    keys: [
      key('Escape', 'esc', { u: 1.5, align: 'left' }),
      ...Array.from({ length: 12 }, (_, i) => key(`F${i + 1}`, `F${i + 1}`)),
      key('TouchID', '', { u: 1.5, dead: true }),
    ],
  },
  {
    keys: [
      key('Backquote', '`', { sub: '~' }),
      ...Array.from({ length: 10 }, (_, i) => key(`Digit${(i + 1) % 10}`, String((i + 1) % 10), { sub: SHIFTED[i] })),
      key('Minus', '-', { sub: '_' }),
      key('Equal', '=', { sub: '+' }),
      key('Backspace', 'delete', { u: 2, align: 'right' }),
    ],
  },
  {
    keys: [
      key('Tab', 'tab', { u: 1.5, align: 'left' }),
      ...letters('QWERTYUIOP'),
      key('BracketLeft', '[', { sub: '{' }),
      key('BracketRight', ']', { sub: '}' }),
      key('Backslash', '\\', { sub: '|', u: 1.5 }),
    ],
  },
  {
    keys: [
      key('CapsLock', 'caps lock', { u: 1.75, dead: true, align: 'left' }),
      ...letters('ASDFGHJKL'),
      key('Semicolon', ';', { sub: ':' }),
      key('Quote', "'", { sub: '"' }),
      key('Enter', 'return', { u: 2.25, align: 'right' }),
    ],
  },
  {
    keys: [
      key('ShiftLeft', 'shift', { u: 2.25, mod: 'Shift', sub: '⇧', align: 'left' }),
      ...letters('ZXCVBNM'),
      key('Comma', ',', { sub: '<' }),
      key('Period', '.', { sub: '>' }),
      key('Slash', '/', { sub: '?' }),
      key('ShiftRight', 'shift', { u: 2.75, mod: 'Shift', sub: '⇧', align: 'right' }),
    ],
  },
  {
    keys: [
      key('Fn', 'fn', { dead: true }),
      key('ControlLeft', 'control', { mod: 'Control', sub: '⌃' }),
      key('AltLeft', 'option', { mod: 'Alt', sub: '⌥' }),
      key('MetaLeft', 'command', { mod: 'Command', sub: '⌘', u: 1.25 }),
      key('Space', '', { u: 5.5 }),
      key('MetaRight', 'command', { mod: 'Command', sub: '⌘', u: 1.25 }),
      key('AltRight', 'option', { mod: 'Alt', sub: '⌥' }),
      key('ArrowLeft', '←'),
      [key('ArrowUp', '↑'), key('ArrowDown', '↓')],
      key('ArrowRight', '→'),
    ],
  },
]

/** A shortcut on the keyboard: its key gets a dot in its color. */
export interface KeyMark {
  color: string
  /** The key it ends in (KeyboardEvent.code). */
  code: string | null
  mods: Modifier[]
}

/**
 * A Mac keyboard showing shortcuts: each one's key carries a dot in its color, outlined ones show their modifiers
 * too, and keys being pressed (or clicked) push down and light up. Clicking a key reports it.
 */
export function Keyboard({
  marks,
  outlined,
  pressed,
  held,
  onKey,
}: {
  marks: KeyMark[]
  /** Shown in full, key and modifiers, in their color: the one you point at in the list, or the new shortcut. */
  outlined: KeyMark[]
  /** Keys down right now, by code. */
  pressed: ReadonlySet<string>
  /** Modifiers held on the keyboard or clicked on this one. */
  held: ReadonlySet<Modifier>
  onKey?: (key: KeySpec) => void
}) {
  const render = (k: KeySpec) => {
    const dots = marks.filter((m) => m.code === k.code)
    const ring = outlined.find((m) => (k.mod ? m.mods.includes(k.mod) : m.code === k.code))
    const down = k.mod ? held.has(k.mod) : pressed.has(k.code)
    const style = { flexGrow: k.u ?? 1, '--mark': dots[0]?.color, '--ring': ring?.color } as CSSProperties
    return (
      <button
        key={k.code}
        type="button"
        tabIndex={-1}
        className={['kb-key', k.mod && 'mod', k.dead && 'dead', k.align, dots.length && 'marked', ring && 'ring', down && 'down'].filter(Boolean).join(' ')}
        style={style}
        disabled={k.dead}
        onClick={() => onKey?.(k)}
      >
        {k.mod ? (
          <>
            <span className="kb-sym">{k.sub}</span>
            <small>{k.label}</small>
          </>
        ) : (
          <>
            {k.sub && <small>{k.sub}</small>}
            <span>{k.label}</span>
          </>
        )}
        {dots.length > 0 && (
          <span className="kb-dots">
            {dots.map((d, i) => (
              <i key={i} style={{ background: d.color }} />
            ))}
          </span>
        )}
      </button>
    )
  }
  return (
    <div className="kb" aria-hidden="true">
      {ROWS.map((row, r) => (
        <div key={r} className={`kb-row ${row.short ? 'short' : ''}`}>
          {row.keys.map((k) =>
            Array.isArray(k) ? (
              <div key={k[0].code} className="kb-stack">
                {k.map(render)}
              </div>
            ) : (
              render(k)
            ),
          )}
        </div>
      ))}
    </div>
  )
}
