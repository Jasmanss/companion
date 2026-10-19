import { describe, expect, it } from 'vitest'
import { clampTop, isDrag, placeFor, TabDrag, topAround, topFor } from '../src/shared/tab-place'

/** The 14-inch MacBook Pro's work area: under the 33-point menu bar, with the Dock hidden. */
const AREA = { x: 0, y: 33, width: 1512, height: 949 }
const TAB = 132

describe('a press on the tab', () => {
  it('is a drag only once it has moved more than 5 points; less is still a click', () => {
    expect(isDrag(0, 5)).toBe(false)
    expect(isDrag(3, 4)).toBe(false)
    expect(isDrag(0, 6)).toBe(true)
    expect(isDrag(0, -6)).toBe(true)
  })
})

describe('where the tab sits along its edge', () => {
  it('is the middle with no saved place, as before the tab could move, and for a place that makes no sense', () => {
    const middle = Math.round(33 + 949 / 2 - TAB / 2)
    expect(topFor(AREA, TAB, undefined)).toBe(middle)
    for (const junk of [NaN, -0.2, 1.4]) expect(topFor(AREA, TAB, junk)).toBe(middle)
  })

  it('comes back from a saved place, at another resolution too', () => {
    const top = 600
    const place = placeFor(AREA, TAB, top)
    expect(topFor(AREA, TAB, place)).toBe(top)
    // The same display at a bigger resolution: the same share of the way down.
    const bigger = { x: 0, y: 25, width: 1800, height: 1144 }
    const there = topFor(bigger, TAB, place)
    expect((there + TAB / 2 - bigger.y) / bigger.height).toBeCloseTo((top + TAB / 2 - AREA.y) / AREA.height, 3)
  })

  it('goes right up to the menu bar and down to the Dock, but never under them', () => {
    expect(clampTop(AREA, TAB, 0)).toBe(33)
    expect(clampTop(AREA, TAB, 2000)).toBe(33 + 949 - TAB)
    // A saved place at the very top or bottom of a taller screen is pulled back in on a shorter one.
    expect(topFor(AREA, TAB, 0)).toBe(33)
    expect(topFor(AREA, TAB, 1)).toBe(33 + 949 - TAB)
    // With the Dock at the bottom, the work area is shorter, and so is how far down it goes.
    const withDock = { ...AREA, height: 949 - 70 }
    expect(topFor(withDock, TAB, placeFor(AREA, TAB, 2000))).toBe(33 + 879 - TAB)
  })
})

describe('the tab coming to the cursor', () => {
  it('has the cursor at its middle, shifted just enough to stay inside the work area', () => {
    const at = (cursorY: number) => clampTop(AREA, TAB, cursorY - TAB / 2)
    expect(at(500)).toBe(434)
    // Near the menu bar and near the bottom, it stops at the work area, and the cursor is still over it.
    expect(at(40)).toBe(33)
    expect(at(975)).toBe(33 + 949 - TAB)
    for (const y of [40, 500, 975]) expect(y >= at(y) && y <= at(y) + TAB).toBe(true)
  })
})

describe('dragging the tab', () => {
  it('follows the cursor up and down, clamped while dragging, not after', () => {
    const drag = new TabDrag(400, AREA, TAB)
    expect(drag.move(0)).toBe(400)
    expect(drag.move(-120)).toBe(280)
    expect(drag.move(-1000)).toBe(33)
    expect(drag.move(1000)).toBe(33 + 949 - TAB)
    // Back again from past the end: no lag from having been held at the edge.
    expect(drag.move(50)).toBe(450)
  })
})

describe('the panel, placed from the tab', () => {
  it('is centered on the tab, but kept inside the work area', () => {
    const panel = 760
    // Tab at 400: its center is 466, so the panel's top is 466 - 380 = 86, inside 57 to 198.
    expect(topAround(AREA, 400, TAB, panel, 24)).toBe(86)
    expect(topAround(AREA, 33, TAB, panel, 24)).toBe(33 + 24)
    expect(topAround(AREA, 33 + 949 - TAB, TAB, panel, 24)).toBe(33 + 949 - 24 - panel)
  })
})
