// Where the panel sits once it has been dragged somewhere, and dragging it there. Pure, so it's tested without a
// screen; the panel's page tells a click from a drag with isDrag, and index.ts moves the window and keeps the spots in
// app state. Until the panel is dragged, it has no spot and opens where it always did (at its edge, or under the notch).
import { isDrag, type Rect } from './tab-place'

export { isDrag }

/**
 * A saved spot: the panel's top left as a fraction (0 to 1) of the free room on its screen, the work area minus the
 * panel's size, across and down. So it survives a change of resolution or a Dock that appears, and always lands inside.
 */
export interface PanelSpot {
  x: number
  y: number
}

const fraction = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1

/** A spot read back from the state file: two numbers from 0 to 1, or it's dropped. */
export const isSpot = (v: unknown): v is PanelSpot => typeof v === 'object' && v !== null && fraction((v as PanelSpot).x) && fraction((v as PanelSpot).y)

/** The spots that make sense, from whatever was saved (by display id). */
export function spotsFrom(saved: unknown): Record<string, PanelSpot> {
  if (!saved || typeof saved !== 'object') return {}
  return Object.fromEntries(Object.entries(saved).filter(([, spot]) => isSpot(spot)).map(([id, spot]) => [id, { x: spot.x, y: spot.y }]))
}

const within = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))

/** The panel kept fully inside the work area (which leaves out the menu bar and the Dock), no bigger than it. */
export function clampPanel(area: Rect, r: Rect): Rect {
  const width = Math.min(r.width, area.width)
  const height = Math.min(r.height, area.height)
  return { x: Math.round(within(r.x, area.x, area.x + area.width - width)), y: Math.round(within(r.y, area.y, area.y + area.height - height)), width, height }
}

/** Where a saved spot puts a panel of this size on a screen with this work area. */
export function panelRect(area: Rect, size: { width: number; height: number }, spot: PanelSpot): Rect {
  const width = Math.min(size.width, area.width)
  const height = Math.min(size.height, area.height)
  return { x: Math.round(area.x + spot.x * (area.width - width)), y: Math.round(area.y + spot.y * (area.height - height)), width, height }
}

/** The spot to save for a panel at this rectangle (kept inside the work area first). No room one way: 0 that way. */
export function spotFor(area: Rect, r: Rect): PanelSpot {
  const c = clampPanel(area, r)
  const part = (offset: number, room: number) => (room > 0 ? Math.round((offset / room) * 1e6) / 1e6 : 0)
  return { x: part(c.x - area.x, area.width - c.width), y: part(c.y - area.y, area.height - c.height) }
}

/**
 * Which saved spot the panel opens at: the screen it was last left on, if that one is still connected and has a spot;
 * otherwise the screen it opens on anyway (fallback), if that one has a spot. Neither: null, so it isn't moved. A spot
 * for a screen that isn't connected stays saved for when it comes back.
 */
export function pickSpot(spots: Record<string, PanelSpot>, last: string | undefined, connected: string[], fallback: string): { display: string; spot: PanelSpot } | null {
  if (last && connected.includes(last) && spots[last]) return { display: last, spot: spots[last] }
  return spots[fallback] && connected.includes(fallback) ? { display: fallback, spot: spots[fallback] } : null
}

/**
 * One drag of the panel by its top bar. It starts from the window's place and where the pointer was pressed; every move
 * gives the window's new place for where the pointer is now, kept inside the work area of the screen it's over.
 */
export class PanelDrag {
  constructor(
    private readonly start: Rect,
    private readonly pointer: { x: number; y: number },
  ) {}

  move(to: { x: number; y: number }, area: Rect): Rect {
    return clampPanel(area, { ...this.start, x: this.start.x + to.x - this.pointer.x, y: this.start.y + to.y - this.pointer.y })
  }
}
