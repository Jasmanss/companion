import type { AlertPeek, PanelTint, PillColor, Presence, StepAsideApp, StewardPrefs } from './types'

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

/**
 * The panel's tints, from the glass redesign. Each is RGB triplets for the CSS tokens: tint (the glass), glow
 * (accents, and text on dark glass), ink (text on light glass), soft (quiet text on dark glass) and live (the live
 * dot and switches on light glass, a deeper glow). Ice comes first: it's the default.
 */
export const PANEL_TINT_IDS = ['ice', 'lilac', 'mint', 'peach', 'graphite'] as const satisfies readonly PanelTint[]

export const PANEL_TINTS: { id: PanelTint; name: string; tint: string; glow: string; ink: string; soft: string; live: string }[] = [
  { id: 'ice', name: 'Ice', tint: '200, 228, 255', glow: '96, 190, 255', ink: '18, 70, 120', soft: '178, 220, 255', live: '26, 140, 255' },
  { id: 'lilac', name: 'Lilac', tint: '222, 212, 255', glow: '168, 140, 255', ink: '70, 46, 150', soft: '214, 202, 255', live: '124, 92, 255' },
  { id: 'mint', name: 'Mint', tint: '198, 242, 224', glow: '70, 214, 160', ink: '12, 90, 64', soft: '170, 238, 210', live: '14, 150, 98' },
  { id: 'peach', name: 'Peach', tint: '255, 218, 200', glow: '255, 146, 104', ink: '136, 52, 22', soft: '255, 206, 186', live: '222, 88, 40' },
  // The design's graphite glow is a very light gray, which all but vanishes as a focus ring on light glass; this is a
  // step deeper, and still light enough for accents on dark glass.
  { id: 'graphite', name: 'Graphite', tint: '168, 176, 190', glow: '160, 172, 194', ink: '30, 34, 42', soft: '214, 220, 232', live: '86, 96, 116' },
]

export const panelTint = (id: PanelTint) => PANEL_TINTS.find((t) => t.id === id) ?? PANEL_TINTS[0]

/** Frost runs from 0 (clear) to 100 (frosted); 50 is the panel as it was before it could change. */
export const DEFAULT_FROST = 50

/** A frost value from anywhere, made whole: a whole number from 0 to 100, or the default if it isn't a number. */
export function cleanFrost(raw: unknown): number {
  return typeof raw === 'number' && Number.isFinite(raw) ? Math.round(Math.min(100, Math.max(0, raw))) : DEFAULT_FROST
}

/**
 * How opaque the panel's fill is over macOS's frost, for a frost value: 0.12 when clear, 0.72 when frosted, 0.42 by
 * default. macOS does the blur itself, so this is how milky the glass looks, not how blurred.
 */
export const frostFill = (frost: number): number => Math.round((0.12 + (0.6 * cleanFrost(frost)) / 100) * 1000) / 1000

/** The CSS custom properties for the panel's tint and frost. */
export function panelVars({ tint, frost }: Pick<StewardPrefs, 'tint' | 'frost'>): Record<string, string> {
  const t = panelTint(tint)
  return { '--tint': t.tint, '--glow': t.glow, '--ink': t.ink, '--soft': t.soft, '--live-light': t.live, '--frost': String(frostFill(frost)) }
}

/** Which alerts peek out, by default, for each Presence: only a session that needs me when quiet, everything switched on when always visible. */
export const DEFAULT_ALERT_PEEK: Record<Presence, AlertPeek> = { quiet: 'needs-me', always: 'all' }

/** Switching Presence: an alert choice still on the old Presence's default moves to the new one's; one someone picked stays. */
export const alertPeekAfterSwitch = (from: Presence, to: Presence, current: AlertPeek): AlertPeek => (current === DEFAULT_ALERT_PEEK[from] ? DEFAULT_ALERT_PEEK[to] : current)

export const DEFAULT_NAME = 'Steward'
export const MAX_NAME = 24

export const DEFAULT_STEWARD: StewardPrefs = {
  version: 'glass',
  color: 'silver',
  glass: 'tinted',
  mouth: true,
  personality: 'lively',
  liveliness: 'calm',
  name: DEFAULT_NAME,
  edge: 'right',
  notch: false,
  notchStyle: 'chin',
  size: 'small',
  tint: 'ice',
  frost: DEFAULT_FROST,
  // A fresh install is quiet. A settings file from before these existed keeps today's behavior instead: see
  // OLD_FILE_STEWARD in main/settings-schema.
  presence: 'quiet',
  alertPeek: DEFAULT_ALERT_PEEK.quiet,
  dimWhenIdle: true,
  hideFromScreenShare: true,
  hideInFullScreen: true,
  hideInApps: [],
}

/** A bundle id as macOS writes them, like com.apple.iWork.Keynote. */
export const isBundleId = (s: unknown): s is string => typeof s === 'string' && s.length <= 255 && /^[A-Za-z0-9][A-Za-z0-9.-]*$/.test(s)

/** Offered in Settings for Step aside's list, one click each: presenting and calls. */
export const SUGGESTED_STEP_ASIDE_APPS: StepAsideApp[] = [
  { id: 'com.apple.iWork.Keynote', name: 'Keynote' },
  { id: 'us.zoom.xos', name: 'Zoom' },
  { id: 'com.apple.FaceTime', name: 'FaceTime' },
]

export const colorHex = (id: PillColor): string => (PILL_COLORS.find((c) => c.id === id) ?? PILL_COLORS[0]).hex

/** A name as typed, tidied: one line, no control characters, at most MAX_NAME characters. Empty is Steward. */
export function cleanName(raw: string): string {
  // eslint-disable-next-line no-control-regex
  const name = [...raw.replace(/[\u0000-\u001f\u007f-\u009f\u2028\u2029]/g, ' ').replace(/\s+/g, ' ').trim()].slice(0, MAX_NAME).join('').trim()
  return name || DEFAULT_NAME
}

/** The alert peeking out at the screen edge is this wide (its window, less the part past the edge). */
export const NUDGE_WIDTH = 340

/** The tab at the screen edge, and the character in it, for each size. */
export const TAB_SIZES = {
  small: { tab: { width: 56, height: 132 }, pill: { width: 50, height: 44 } },
  // 64 wide gives the blocky version whole 4 pixel cells, like the panel's header.
  medium: { tab: { width: 70, height: 160 }, pill: { width: 64, height: 56 } },
} as const
