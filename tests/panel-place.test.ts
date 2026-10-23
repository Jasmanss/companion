import { describe, expect, it } from 'vitest'
import { clampPanel, clearOfPanel, isDrag, PanelDrag, panelRect, pickSpot, spotFor, spotsFrom } from '../src/shared/panel-place'

/** The 14-inch MacBook Pro's work area under its 33-point menu bar, with the Dock at the bottom. */
const AREA = { x: 0, y: 33, width: 1512, height: 867 }
const SIZE = { width: 400, height: 760 }
const inside = (r: { x: number; y: number; width: number; height: number }, a = AREA) =>
  r.x >= a.x && r.y >= a.y && r.x + r.width <= a.x + a.width && r.y + r.height <= a.y + a.height

describe('where a moved panel goes', () => {
  it('comes back to the same place it was saved at', () => {
    for (const at of [
      { x: 0, y: 33 },
      { x: 300, y: 80 },
      { x: 1112, y: 140 },
      { x: 557, y: 100 },
    ]) {
      const r = { ...at, ...SIZE }
      expect(panelRect(AREA, SIZE, spotFor(AREA, r))).toEqual(r)
    }
  })

  it('lands 2 points off when it is saved against one work area and opened against another that starts 2 points higher (the CI notch case)', () => {
    // The CI runner: the notch window's area (33 pt menu bar) saved the spot, a screen lookup with the runner's 31 pt put it back.
    const pretend = { x: 0, y: 33, width: 1280, height: 672 }
    const real = { x: 0, y: 31, width: 1280, height: 674 }
    const size = (a: { height: number }) => ({ width: 400, height: Math.min(760, a.height - 48) })
    const dragged = { x: 12, y: 81, ...size(pretend) }
    const spot = spotFor(pretend, dragged)
    expect(panelRect(pretend, size(pretend), spot)).toEqual(dragged)
    expect(panelRect(real, size(real), spot)).toEqual({ x: 12, y: 79, width: 400, height: 626 })
  })

  it('puts 0 and 1 on the edges of the work area', () => {
    expect(panelRect(AREA, SIZE, { x: 0, y: 0 })).toEqual({ x: 0, y: 33, ...SIZE })
    expect(panelRect(AREA, SIZE, { x: 1, y: 1 })).toEqual({ x: 1512 - 400, y: 33 + 867 - 760, ...SIZE })
  })

  it('is always inside the work area, also a smaller one than it was saved on, and never taller than it', () => {
    const spot = spotFor(AREA, { x: 1112, y: 140, ...SIZE })
    // The Dock grew, and the resolution went down.
    const smaller = { x: 0, y: 25, width: 1280, height: 700 }
    const r = panelRect(smaller, { width: 400, height: Math.min(760, smaller.height - 48) }, spot)
    expect(inside(r, smaller)).toBe(true)
    expect(r.x).toBe(1280 - 400)
    // A work area shorter than the panel: as tall as it, at its top.
    const short = { x: 0, y: 25, width: 1280, height: 500 }
    expect(panelRect(short, SIZE, spot)).toEqual({ x: 880, y: 25, width: 400, height: 500 })
  })

  it('saves a panel dragged partly off the screen as the nearest place inside it', () => {
    expect(spotFor(AREA, { x: -300, y: -50, ...SIZE })).toEqual({ x: 0, y: 0 })
    expect(spotFor(AREA, { x: 5000, y: 5000, ...SIZE })).toEqual({ x: 1, y: 1 })
  })

  it('works on a screen to the left of the main one, and above it', () => {
    const left = { x: -1920, y: -200, width: 1920, height: 1055 }
    const r = { x: -1000, y: 50, ...SIZE }
    expect(panelRect(left, SIZE, spotFor(left, r))).toEqual(r)
    expect(inside(clampPanel(left, { x: 200, y: -900, ...SIZE }), left)).toBe(true)
  })
})

describe('the saved spots', () => {
  it('drops what makes no sense: not numbers, outside 0 to 1, not an object', () => {
    expect(spotsFrom({ 1: { x: 0.2, y: 0.5 }, 2: { x: '0.2', y: 0.5 }, 3: { x: 1.2, y: 0.5 }, 4: { x: 0.1 }, 5: null, 6: { x: NaN, y: 0 } })).toEqual({ 1: { x: 0.2, y: 0.5 } })
    expect(spotsFrom(undefined)).toEqual({})
    expect(spotsFrom('nope')).toEqual({})
  })

  it('opens on the screen it was left on, if that one is connected; otherwise the one it opens on anyway', () => {
    const spots = { 1: { x: 0.2, y: 0.5 }, 2: { x: 0.9, y: 0.1 } }
    expect(pickSpot(spots, '2', ['1', '2'], '1')).toEqual({ display: '2', spot: spots[2] })
    // Screen 2 isn't connected: its spot is ignored, but kept.
    expect(pickSpot(spots, '2', ['1'], '1')).toEqual({ display: '1', spot: spots[1] })
    expect(spots[2]).toEqual({ x: 0.9, y: 0.1 })
    // No spot where it opens: it isn't moved, it opens where it always did.
    expect(pickSpot({ 2: spots[2] }, '2', ['1'], '1')).toBeNull()
    expect(pickSpot({}, undefined, ['1'], '1')).toBeNull()
  })
})

describe('dragging the panel', () => {
  it('counts only a press that moves more than 5 points', () => {
    expect(isDrag(3, 4)).toBe(false)
    expect(isDrag(4, 4)).toBe(true)
  })

  it('follows the pointer, and stops at the edges of the work area', () => {
    const drag = new PanelDrag({ x: 1104, y: 70, ...SIZE }, { x: 1200, y: 90 })
    expect(drag.move({ x: 1100, y: 130 }, AREA)).toEqual({ x: 1004, y: 110, ...SIZE })
    expect(drag.move({ x: 5000, y: 5000 }, AREA)).toEqual({ x: 1112, y: 140, ...SIZE })
    expect(drag.move({ x: -5000, y: -5000 }, AREA)).toEqual({ x: 0, y: 33, ...SIZE })
  })
})

describe('Settings next to the open panel', () => {
  const SETTINGS = { width: 720, height: 560 }
  const overlap = (a: { x: number; width: number }, b: { x: number; width: number }) => a.x < b.x + b.width && b.x < a.x + a.width

  it('opens centered with no panel open, or when the panel is out of its way', () => {
    const centered = { x: 396, y: 33 + 154, ...SETTINGS }
    expect(clearOfPanel(AREA, SETTINGS, null)).toEqual(centered)
    expect(clearOfPanel(AREA, SETTINGS, { x: 1600, y: 0, ...SIZE })).toEqual(centered)
  })

  it('opens beside a panel at the right or left edge, clear of it', () => {
    const right = { x: 1104, y: 81, ...SIZE }
    const at = clearOfPanel(AREA, SETTINGS, right)
    expect(overlap(at, right)).toBe(false)
    expect(at.x + at.width).toBe(1104 - 16)
    const left = { x: 8, y: 81, ...SIZE }
    expect(clearOfPanel(AREA, SETTINGS, left).x).toBe(8 + 400 + 16)
  })

  it('opens beside a panel dragged anywhere, when there is room, on the side nearer the middle', () => {
    const moved = { x: 200, y: 60, ...SIZE }
    const at = clearOfPanel(AREA, SETTINGS, moved)
    expect(overlap(at, moved)).toBe(false)
    expect(at.x).toBe(200 + 400 + 16)
    expect(at.x + at.width).toBeLessThanOrEqual(1512 - 24)
  })

  it('stays centered when there is no room beside the panel (under the notch on a 14-inch screen)', () => {
    const underNotch = { x: 556, y: 33, ...SIZE }
    expect(clearOfPanel(AREA, SETTINGS, underNotch)).toEqual({ x: 396, y: 33 + 154, ...SETTINGS })
    // A wider screen has the room.
    const wide = { x: 0, y: 25, width: 2560, height: 1390 }
    const panel = { x: 1080, y: 25, ...SIZE }
    expect(overlap(clearOfPanel(wide, SETTINGS, panel), panel)).toBe(false)
  })
})
