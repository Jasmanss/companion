// Steward docked in the MacBook notch: its sizes and its shape, shared by the main process (which lets clicks through
// everywhere but the shape) and the notch window (which draws it). Designed in design/notch.html.
//
// The notch is pure black, so the character's body becomes a black shape with the real notch, and its color becomes
// the light of its eyes. Chin: the notch grows a lip below it, as wide as the notch, with the eyes in it. Wings: one
// eye on each side of the notch, in the menu bar; the thinking dots and the talking mouth need the middle, so for
// those it grows the chin too. Asleep, it's only the notch's own black. With the cursor on it, it grows a little.
import type { Mood, NotchLayout, NotchStyle } from './types'

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
/** hover: the cursor is on it, so it grows a little (the chin taller, or the wings wider). Only while awake. */
export function notchShape(style: NotchStyle, mood: Mood, notch: { width: number; height: number }, awake = true, hover = false): NotchShape {
  // Asleep (Only when needed, at rest): exactly the notch, no chin and no wings, so nothing under it is covered.
  if (!awake) return { lip: notch.height, wings: 0 }
  const middle = needsMiddle(mood)
  // Talking's mouth sits under the eyes, so the lip grows a little to make room.
  const chin = notch.height + NOTCH_LIP + (mood === 'talking' ? 5 : 0)
  if (style === 'wings') return { lip: middle ? chin : notch.height, wings: notch.width + 2 * NOTCH_WING + (hover ? NOTCH_HOVER_WINGS : 0) }
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
export const inBoxes = (p: { x: number; y: number }, boxes: Box[]): boolean => boxes.some((b) => p.x >= b.x && p.x <= b.x + b.width && p.y >= b.y && p.y <= b.y + b.height)
