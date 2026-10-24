// Steward docked in the MacBook notch: its sizes and its shape, shared by the main process (which lets clicks through
// everywhere but the shape) and the notch window (which draws it). Designed in design/notch.html.
//
// The notch is pure black, so the character's body becomes a black shape with the real notch, and its color becomes
// the light of its eyes. Chin: the notch grows a lip below it, as wide as the notch, with the eyes in it. Wings: one
// eye on each side of the notch, in the menu bar; the thinking dots and the talking mouth need the middle, so for
// those it grows the chin too. Asleep, it's only the notch's own black. With the cursor on it, it grows a little. An
// alert comes out under it, below the menu bar, joined to the chin (Wings grows its chin for that too).
//
// The island (the third style): one black shape joined to the notch, sized by what's going on (design/showcase,
// section 7, "Peeking, as one joined island"). At rest there's no island and Steward peeks out from behind the notch's
// left edge; while Claude works the compact island grows out of the notch, Steward steps into its left side and the
// status sits on its right.
import type { IslandRight, Mood, NotchGeometry, NotchLayout, NotchStyle } from './types'

/** How tall the eyes are, in points; the lip and the wings are sized from it. */
export const NOTCH_EYE = 14
/** The chin below the notch. */
export const NOTCH_LIP = NOTCH_EYE + 8
/** Each wing beside the notch. */
export const NOTCH_WING = NOTCH_EYE + 14
/** The black's bottom corners. The real notch's radius isn't reported anywhere; 10 matched by eye. */
export const NOTCH_RADIUS = 10
/** The window along the top of the screen that holds it, centered on the notch. */
export const NOTCH_WINDOW = { width: 360, height: 96 } as const
/** Hovered (the cursor on the black, Always visible): the chin this much taller, or the wings this much wider in all. */
export const NOTCH_HOVER_LIP = 4
export const NOTCH_HOVER_WINGS = 8

/** Moods whose face needs the middle: the thinking dots, the talking mouth. */
const MIDDLE: ReadonlySet<Mood> = new Set(['thinking', 'talking'])
export const needsMiddle = (mood: Mood): boolean => MIDDLE.has(mood)

/** The black, for a style and mood: how far down the lip reaches (from the top), and how wide the wings are (0: none). */
export interface NotchShape {
  lip: number
  wings: number
}
/**
 * hover: the cursor is on it, so it grows a little (the chin taller, or the wings wider). Only while awake. nudge: an
 * alert is out under it, joined to the chin, so Wings shows its chin too.
 */
export function notchShape(style: NotchStyle, mood: Mood, notch: { width: number; height: number }, awake = true, hover = false, nudge = false): NotchShape {
  // Asleep (Only when needed, at rest): exactly the notch, no chin and no wings, so nothing under it is covered.
  if (!awake) return { lip: notch.height, wings: 0 }
  const middle = needsMiddle(mood)
  // Talking's mouth sits under the eyes, so the lip grows a little to make room.
  const chin = notch.height + NOTCH_LIP + (mood === 'talking' ? 5 : 0)
  if (style === 'wings') return { lip: middle || nudge ? chin : notch.height, wings: notch.width + 2 * NOTCH_WING + (hover ? NOTCH_HOVER_WINGS : 0) }
  return { lip: chin + (hover ? NOTCH_HOVER_LIP : 0), wings: 0 }
}

/** The cursor on the black this long before it counts as hovering, and off it this long before it stops, so the edge of the black never flickers. */
export const HOVER_IN_MS = 80
export const HOVER_OUT_MS = 250

/** Hovering or not, and since when the cursor has been saying otherwise (null: it agrees). */
export interface HoverState {
  hover: boolean
  since: number | null
}
export const noHover = (): HoverState => ({ hover: false, since: null })

/** One look: over is whether the cursor is on the black now. It switches only once it has said so for long enough. */
export function stepHover(s: HoverState, over: boolean, now: number): HoverState {
  if (over === s.hover) return { hover: s.hover, since: null }
  const since = s.since ?? now
  return now - since >= (over ? HOVER_IN_MS : HOVER_OUT_MS) ? { hover: over, since: null } : { hover: s.hover, since }
}

/**
 * Where something that comes out of the notch goes (the panel, a nudge): centered under the notch on the
 * notch's own screen, its top at the top of that screen's work area (just under the menu bar), kept inside the work
 * area with margin points to spare at the sides.
 */
export function underNotch(notch: { x: number; width: number }, area: Box, size: { width: number; height: number }, margin = 8): Box {
  const width = Math.min(size.width, area.width - 2 * margin)
  const height = Math.min(size.height, area.height)
  const centered = notch.x + notch.width / 2 - width / 2
  const x = Math.round(Math.min(area.x + area.width - margin - width, Math.max(area.x + margin, centered)))
  return { x, y: area.y, width, height }
}

/** A nudge under the notch: its black reaches this far below the chin, room for one line of text. */
export const NOTCH_NUDGE_BELOW = 30
/** Where its black starts: this far under the menu bar line, joined to the chin by concave corners this size. */
export const NOTCH_NUDGE_FILLET = 8

/**
 * Where a nudge goes in the notch: centered under it, its top at the menu bar line (it never covers the menu bar), and
 * tall enough to reach NOTCH_NUDGE_BELOW under the chin, where its one line of text sits.
 */
export function nudgeUnderNotch(notch: NotchGeometry, area: Box, width: number): Box {
  const bottom = notch.y + notch.height + NOTCH_LIP + NOTCH_NUDGE_BELOW
  return underNotch(notch, area, { width, height: Math.max(NOTCH_NUDGE_FILLET + NOTCH_NUDGE_BELOW, bottom - area.y) })
}

export interface Box {
  x: number
  y: number
  width: number
  height: number
}
/** Where the black is, in window coordinates: the only place the window takes clicks. */
export function notchBoxes(shape: NotchShape, l: NotchLayout): Box[] {
  const boxes: Box[] = [{ x: l.cx - l.width / 2, y: 0, width: l.width, height: shape.lip }]
  if (shape.wings) boxes.push({ x: l.cx - shape.wings / 2, y: 0, width: shape.wings, height: l.height })
  return boxes
}
/* ---------- The island ---------- */

/** How far the compact island reaches past the notch on each side, in points: Steward on the left, the status on the right. */
export const ISLAND_SIDE = 70
/** Hovered, the compact island is this much wider in all, and the status moves out by half of it. */
export const ISLAND_HOVER = 12
/** The island's bottom corners. */
export const ISLAND_RADIUS = 24
/** Steward's Pill (64 by 54 points, the panel header's) at the notch is drawn at this scale. */
export const PEEK_SCALE = 0.8
export const PEEK_SIZE = { width: 64, height: 54 } as const

/**
 * asleep: Steward tucked behind the notch (Only when needed, at rest). rest: no island, Steward peeks. compact: the island
 * is out, Steward in its left side, the status on its right. chin: an alert is out under the notch (the 3b nudge), so
 * the black is the chin it joins, with Steward peeking beside it.
 */
export type IslandLevel = 'asleep' | 'rest' | 'compact' | 'chin'

export function islandLevel(o: { awake: boolean; nudge: boolean; right: IslandRight | null }): IslandLevel {
  if (o.nudge) return 'chin'
  if (!o.awake) return 'asleep'
  return o.right ? 'compact' : 'rest'
}

/** Where things are for a level, from the notch's center (x) and the top of the screen (y), in points. */
export interface IslandParts {
  /** The black shape: as wide and tall as the notch means no island. */
  width: number
  height: number
  /** Steward's Pill: its center, scale and tilt (degrees). */
  pill: { x: number; y: number; scale: number; rotate: number }
  /** The status's center, or null when it isn't shown. */
  right: { x: number; y: number } | null
}

/**
 * The island's size and where Steward and the status go (design/showcase/peeking.js). Steward peeks at rest from just
 * past the notch's left edge, tilted, leaning out further with the cursor on it; it steps into the compact island's left
 * side; asleep it's tucked fully behind the notch. Hovered, the compact island widens a little.
 */
export function islandParts(level: IslandLevel, notch: { width: number; height: number }, hover = false): IslandParts {
  const hw = notch.width / 2
  const y = notch.height / 2
  const pill = (x: number, rotate = 0) => ({ x, y, scale: PEEK_SCALE, rotate })
  if (level === 'asleep') return { width: notch.width, height: notch.height, pill: pill(-hw + 26.5), right: null }
  if (level === 'chin') return { width: notch.width, height: notch.height + NOTCH_LIP, pill: pill(-hw - 7.5, -8), right: null }
  if (level === 'rest') return { width: notch.width, height: notch.height, pill: hover ? pill(-hw - 15.5, -12) : pill(-hw - 7.5, -8), right: null }
  return { width: notch.width + 2 * ISLAND_SIDE + (hover ? ISLAND_HOVER : 0), height: notch.height, pill: pill(-hw - 34), right: { x: hw + 34 + (hover ? ISLAND_HOVER / 2 : 0), y } }
}

/** Where the island takes clicks, in window coordinates: the black shape, and Steward wherever it peeks. */
export function islandBoxes(parts: IslandParts, level: IslandLevel, l: NotchLayout): Box[] {
  const boxes: Box[] = [{ x: l.cx - parts.width / 2, y: 0, width: parts.width, height: parts.height }]
  if (level !== 'asleep') boxes.push({ x: l.cx + parts.pill.x - 28, y: 0, width: 56, height: parts.pill.y + 24 })
  return boxes
}

export const inBoxes = (p: { x: number; y: number }, boxes: Box[]): boolean => boxes.some((b) => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height)
