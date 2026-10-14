import { describe, expect, it } from 'vitest'
import {
  acceleratorFromKey,
  checkShortcut,
  codeOfKey,
  formatAccelerator,
  normalizeAccelerator,
  parseAccelerator,
  resolveShortcuts,
  SHORTCUTS,
} from '../src/shared/shortcuts'
import type { ShortcutId } from '../src/shared/types'

const press = (code: string, mods: { meta?: boolean; ctrl?: boolean; alt?: boolean; shift?: boolean } = {}) => ({
  code,
  metaKey: Boolean(mods.meta),
  ctrlKey: Boolean(mods.ctrl),
  altKey: Boolean(mods.alt),
  shiftKey: Boolean(mods.shift),
})

/** What each shortcut is with nothing changed (and macOS giving Steward the first defaults). */
const defaults = Object.fromEntries(SHORTCUTS.map((s) => [s.id, s.defaults[0]])) as Record<ShortcutId, string>

describe('reading key presses', () => {
  it('turns a press into an accelerator, modifiers in Apple’s order', () => {
    expect(acceleratorFromKey(press('Space', { alt: true }))).toBe('Alt+Space')
    expect(acceleratorFromKey(press('KeyK', { meta: true, shift: true, ctrl: true }))).toBe('Control+Shift+Command+K')
    expect(acceleratorFromKey(press('Comma', { meta: true }))).toBe('Command+,')
    expect(acceleratorFromKey(press('ArrowUp', { ctrl: true }))).toBe('Control+Up')
    expect(acceleratorFromKey(press('F5'))).toBe('F5')
  })

  it('goes by where the key is, so ⌥K is K and not the character it types', () => {
    expect(acceleratorFromKey({ ...press('KeyK', { alt: true }), key: '˚' } as ReturnType<typeof press>)).toBe('Alt+K')
  })

  it('has nothing for a modifier on its own, or a key a shortcut can’t end in', () => {
    expect(acceleratorFromKey(press('MetaLeft', { meta: true }))).toBeNull()
    expect(acceleratorFromKey(press('CapsLock'))).toBeNull()
  })
})

describe('accelerators', () => {
  it('spells each one a single way, whatever it was written as', () => {
    expect(normalizeAccelerator('CmdOrCtrl+shift+k')).toBe('Shift+Command+K')
    expect(normalizeAccelerator('Option+Space')).toBe('Alt+Space')
    expect(normalizeAccelerator('Command+Control+Alt+Shift+Esc')).toBe('Control+Alt+Shift+Command+Escape')
    expect(normalizeAccelerator('ctrl+f12')).toBe('Control+F12')
    expect(normalizeAccelerator('Hyper+K')).toBeNull()
    expect(normalizeAccelerator('Command+Plus')).toBeNull()
  })

  it('shows them the Mac way', () => {
    expect(formatAccelerator('Alt+Shift+Space')).toBe('⌥⇧ Space')
    expect(formatAccelerator('Command+K')).toBe('⌘K')
    expect(formatAccelerator('Control+Return')).toBe('⌃↩')
    expect(formatAccelerator('F5')).toBe('F5')
  })

  it('knows which key on the keyboard each one ends in', () => {
    expect(parseAccelerator('Alt+Space')).toEqual({ mods: ['Alt'], key: 'Space' })
    expect(['K', ',', 'Return', 'Up', '`'].map(codeOfKey)).toEqual(['KeyK', 'Comma', 'Enter', 'ArrowUp', 'Backquote'])
  })
})

describe('checkShortcut', () => {
  const check = (id: ShortcutId, a: string) => checkShortcut(id, a, defaults)

  it('takes a free one', () => {
    expect(check('togglePanel', 'Control+Alt+K').level).toBe('ok')
    expect(check('switchProject', 'Command+J').level).toBe('ok')
    expect(check('switchProject', 'F6').level).toBe('ok')
  })

  it('refuses one Steward already uses, or every Mac app does', () => {
    expect(check('switchProject', 'Command+,')).toEqual({ level: 'error', message: '⌘, is already set for Settings.' })
    expect(check('openSettings', 'Command+V')).toEqual({ level: 'error', message: "⌘V already adds what's on the clipboard to the tray." })
    expect(check('switchProject', 'Command+C').message).toBe('⌘C copies in every app.')
    expect(check('togglePanel', 'Command+Q').level).toBe('error')
  })

  it('refuses what would get in the way of typing', () => {
    expect(check('switchProject', 'K').level).toBe('error')
    expect(check('switchProject', 'Shift+K').level).toBe('error')
  })

  it('refuses a global ⌘-letter, which would take that shortcut from every app, but allows ⌘Space and F-keys', () => {
    expect(check('togglePanel', 'Command+J').message).toBe('Add ⌃ or ⌥: ⌘J everywhere would take it from every other app.')
    expect(check('togglePanel', 'Shift+Command+J').level).toBe('error')
    expect(check('togglePanel', 'Control+Command+J').level).toBe('ok')
    expect(check('togglePanel', 'F7').level).toBe('ok')
  })

  it('warns, without refusing, about what macOS uses for itself', () => {
    expect(check('togglePanel', 'Command+Space')).toEqual({
      level: 'warning',
      message: 'macOS uses ⌘ Space for Spotlight. Pick it only if you’ve turned that off in System Settings.',
    })
    expect(check('hideFromEdge', 'Control+Up').level).toBe('warning')
  })

  it('says so when it’s the shortcut it already has', () => {
    expect(check('togglePanel', 'Alt+Space')).toEqual({ level: 'ok', message: '⌥ Space is its shortcut now.' })
  })
})

describe('resolveShortcuts', () => {
  it('uses the defaults macOS let Steward have, and says when it got none', () => {
    const r = resolveShortcuts({}, { togglePanel: 'Control+Alt+Space' })
    expect(r.togglePanel).toEqual({ accelerator: 'Control+Alt+Space', isDefault: true, active: true })
    expect(r.hideFromEdge).toEqual({ accelerator: 'Alt+Shift+Space', isDefault: true, active: false })
    expect(r.switchProject).toEqual({ accelerator: 'Command+K', isDefault: true, active: true })
  })

  it('uses yours, and knows which are off or didn’t register', () => {
    const r = resolveShortcuts({ togglePanel: 'Control+Alt+K', hideFromEdge: '', switchProject: 'Command+J' }, { togglePanel: 'Control+Alt+K' })
    expect(r.togglePanel).toEqual({ accelerator: 'Control+Alt+K', isDefault: false, active: true })
    expect(r.hideFromEdge).toEqual({ accelerator: '', isDefault: false, active: false })
    expect(r.switchProject).toEqual({ accelerator: 'Command+J', isDefault: false, active: true })
    expect(resolveShortcuts({ togglePanel: 'Control+Alt+K' }, {}).togglePanel.active).toBe(false)
  })
})
