const MODIFIERS: Record<string, string> = { Control: '⌃', Alt: '⌥', Shift: '⇧', Command: '⌘' }

/** "Alt+Shift+Space" → "⌥⇧ Space" */
export function formatHotkey(accelerator: string): string {
  const parts = accelerator.split('+')
  const key = parts.pop()
  return `${parts.map((m) => MODIFIERS[m] ?? m).join('')} ${key}`
}
