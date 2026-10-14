import type { PillColor, StewardPrefs } from './types'

/** The character's colors, at most six. Silver comes first: it's the default. */
export const PILL_COLOR_IDS = ['silver', 'sky', 'lilac', 'mint', 'peach', 'graphite'] as const satisfies readonly PillColor[]

export const PILL_COLORS: { id: PillColor; name: string; hex: string }[] = [
  { id: 'silver', name: 'Silver', hex: '#c7ccd5' },
  { id: 'sky', name: 'Sky', hex: '#94c5f5' },
  { id: 'lilac', name: 'Lilac', hex: '#c9bcff' },
  { id: 'mint', name: 'Mint', hex: '#8fe0c0' },
  { id: 'peach', name: 'Peach', hex: '#f6ab8c' },
  { id: 'graphite', name: 'Graphite', hex: '#4a4f5c' },
]

export const DEFAULT_NAME = 'Steward'
export const MAX_NAME = 24

export const DEFAULT_STEWARD: StewardPrefs = {
  version: 'glass',
  color: 'silver',
  glass: 'tinted',
  mouth: true,
  personality: 'lively',
  name: DEFAULT_NAME,
  edge: 'right',
  size: 'small',
}

export const colorHex = (id: PillColor): string => (PILL_COLORS.find((c) => c.id === id) ?? PILL_COLORS[0]).hex

/** A name as typed, tidied: one line, no control characters, at most MAX_NAME characters. Empty is Steward. */
export function cleanName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const name = [...raw.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, MAX_NAME).join('').trim()
  return name || DEFAULT_NAME
}

/** The tab at the screen edge, and the character in it, for each size. */
export const TAB_SIZES = {
  small: { tab: { width: 56, height: 132 }, pill: { width: 50, height: 44 } },
  // 64 wide gives the blocky version whole 4 pixel cells, like the panel's header.
  medium: { tab: { width: 70, height: 160 }, pill: { width: 64, height: 56 } },
} as const
