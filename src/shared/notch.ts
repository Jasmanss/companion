// Steward docked in the MacBook notch: its sizes and its shape, shared by the main process (which lets clicks through
// everywhere but the shape) and the notch window (which draws it). Designed in design/notch.html.
//
// The notch is pure black, so the character's body becomes a black shape with the real notch, and its color becomes
// the light of its eyes. Chin: the notch grows a lip below it, as wide as the notch, with the eyes in it. Wings: one
// eye on each side of the notch, in the menu bar; the thinking dots and the talking mouth need the middle, so for
// those it grows the chin too.
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

/** Moods whose face needs the middle: the thinking dots, the talking mouth. */
const MIDDLE: ReadonlySet<Mood> = new Set(['thinking', 'talking'])
export const needsMiddle = (mood: Mood): boolean => MIDDLE.has(mood)

/** The black, for a style and mood: how far down the lip reaches (from the top), and how wide the wings are (0: none). */
export interface NotchShape {
  lip: number
  wings: number
}
export function notchShape(style: NotchStyle, mood: Mood, notch: { width: number; height: number }): NotchShape {
  const middle = needsMiddle(mood)
  // Talking's mouth sits under the eyes, so the lip grows a little to make room.
  const chin = notch.height + NOTCH_LIP + (mood === 'talking' ? 5 : 0)
  if (style === 'wings') return { lip: middle ? chin : notch.height, wings: notch.width + 2 * NOTCH_WING }
  return { lip: chin, wings: 0 }
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
