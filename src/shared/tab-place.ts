// Where the tab sits along its screen edge, and dragging it there. Pure, so it's tested without a screen; the tab's page
// tells a click from a drag with it, and index.ts moves the window and keeps the places in app state. Written so the
// planned drag into the notch can use the same pieces.

/** A rectangle in screen points (Electron's Rectangle has the same shape). */
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

/** A press that moves more than this many points is a drag; anything less is still a click that opens the panel. */
export const DRAG_THRESHOLD = 5

export const isDrag = (dx: number, dy: number): boolean => Math.hypot(dx, dy) > DRAG_THRESHOLD

/** The tab's top, kept fully inside the work area (which already leaves out the menu bar, the notch band and the Dock). */
export function clampTop(area: Rect, height: number, top: number): number {
  return Math.round(Math.min(area.y + area.height - height, Math.max(area.y, top)))
}

/**
 * A saved place is the tab's center as a fraction of the work area's height, so it survives a change of resolution. No
 * saved place (or one that isn't a number from 0 to 1) is the middle, as before the tab could move.
 */
export function topFor(area: Rect, height: number, place: number | undefined): number {
  const fraction = typeof place === 'number' && place >= 0 && place <= 1 ? place : 0.5
  return clampTop(area, height, area.y + fraction * area.height - height / 2)
}

/** The place to save for a tab whose top is here. */
export function placeFor(area: Rect, height: number, top: number): number {
  const center = clampTop(area, height, top) + height / 2
  return Math.round(((center - area.y) / area.height) * 10_000) / 10_000
}

/**
 * Something taller than the tab (the panel), centered on the tab but kept margin points inside the work area. The nudge
 * doesn't need this: it's the tab grown sideways, as tall as it, so it shares its top.
 */
export function topAround(area: Rect, tabTop: number, tabHeight: number, height: number, margin: number): number {
  const centered = tabTop + tabHeight / 2 - height / 2
  return Math.round(Math.min(area.y + area.height - margin - height, Math.max(area.y + margin, centered)))
}

/**
 * One drag of the tab: up and down only, along its edge. It starts at the tab's top, and every move gives the new top,
 * clamped while dragging so the tab never goes under the menu bar or the Dock.
 */
export class TabDrag {
  constructor(
    private readonly startTop: number,
    private readonly area: Rect,
    private readonly height: number,
  ) {}

  /** dy: how far the cursor has moved since the drag began, in points. */
  move(dy: number): number {
    return clampTop(this.area, this.height, this.startTop + dy)
  }
}
