import { describe, expect, it } from 'vitest'
import { changedRegions, CHANNEL_TOLERANCE, diffBitmaps, GATE_MIN_PIXELS, GATE_WIDTH, gateMinPixels, MAX_REGIONS, type Bitmap } from '../src/main/review-diff'
import { areasChangedLabel, noChangesReason } from '../src/shared/review'

/** A page at the gate's width: this many rows, one colour (blue, green, red), alpha opaque. */
function page(rows: number, [b, g, r]: [number, number, number] = [250, 250, 250]): Bitmap {
  const data = Buffer.alloc(GATE_WIDTH * rows * 4)
  for (let i = 0; i < data.length; i += 4) data.set([b, g, r, 255], i)
  return { width: GATE_WIDTH, height: rows, data }
}

/** Paint a box (in the gate's pixels) in a colour. */
function paint(bitmap: Bitmap, x: number, y: number, w: number, h: number, [b, g, r]: [number, number, number]): Bitmap {
  const data = Buffer.from(bitmap.data)
  for (let row = y; row < y + h; row++) for (let col = x; col < x + w; col++) data.set([b, g, r, 255], (row * bitmap.width + col) * 4)
  return { ...bitmap, data }
}

describe('diffBitmaps, the change gate', () => {
  it('says the same page is the same', () => {
    const a = page(225)
    const d = diffBitmaps(a, page(225))
    expect(d).toMatchObject({ changed: false, changedPixels: 0 })
  })

  it('ignores a hair of difference in colour, within the cutoff', () => {
    expect(CHANNEL_TOLERANCE).toBe(6)
    expect(diffBitmaps(page(225), page(225, [244, 246, 250])).changed).toBe(false)
  })

  it('counts a pale tint over the whole page, which the old cutoff of 24 missed', () => {
    expect(diffBitmaps(page(225), page(225, [240, 245, 250])).changed).toBe(true)
    expect(diffBitmaps(page(225), page(225, [240, 245, 250]), GATE_MIN_PIXELS, 24).changed).toBe(false)
  })

  it('ignores a few stray pixels', () => {
    expect(diffBitmaps(page(225), paint(page(225), 10, 10, 3, 3, [0, 0, 0])).changed).toBe(false)
  })

  it('catches a button that changed colour: about 128 by 32 pixels of the real page', () => {
    // Four real pixels make one of the gate's: the button is 32 by 8 here.
    const d = diffBitmaps(page(225), paint(page(225), 40, 120, 32, 8, [235, 111, 47]))
    expect(d.changedPixels).toBe(256)
    expect(d.minPixels).toBe(GATE_MIN_PIXELS)
    expect(d.changed).toBe(true)
    // A smaller one (a 100 by 28 icon) is under the line.
    expect(diffBitmaps(page(225), paint(page(225), 40, 120, 25, 7, [235, 111, 47])).changed).toBe(false)
  })

  it('catches a big change', () => {
    expect(diffBitmaps(page(225), page(225, [20, 20, 20])).changed).toBe(true)
  })

  it('counts a button on a long page as it does on a short one (the share is of a screen, not of the page)', () => {
    const tall = page(2000)
    expect(diffBitmaps(tall, paint(tall, 40, 900, 32, 8, [235, 111, 47])).changed).toBe(true)
  })

  it('treats a page that got taller or shorter as changed, and a hair of height as nothing much', () => {
    const d = diffBitmaps(page(225), page(375))
    expect(d.changed).toBe(true)
    expect(d.heights).toEqual([225, 375])
    expect(diffBitmaps(page(375), page(225)).changed).toBe(true)
    // One row more is 360 pixels: still a change, because the page did get taller.
    expect(diffBitmaps(page(225), page(226)).changed).toBe(true)
  })

  it('does not line up pictures of different widths: that is a change', () => {
    expect(diffBitmaps(page(225), { ...page(225), width: 300, data: Buffer.alloc(300 * 225 * 4) }).changed).toBe(true)
  })
})

/** haven's colours, as bitmap bytes (blue, green, red): its autumn wash #F4E6E1 and its surface #FBFBF8. */
const WASH: [number, number, number] = [0xe1, 0xe6, 0xf4]
const SURFACE: [number, number, number] = [0xf8, 0xfb, 0xfb]

/** A vertical fade from `from` to `to` over `rows` rows, reaching `to` at `end` (0 to 1) of the way down. */
function fade(rows: number, from: [number, number, number], to: [number, number, number], end = 1): Bitmap {
  const data = Buffer.alloc(GATE_WIDTH * rows * 4)
  for (let y = 0; y < rows; y++) {
    const t = Math.min(1, y / ((rows - 1) * end))
    const px = from.map((c, k) => Math.round(c + (to[k] - c) * t))
    for (let x = 0; x < GATE_WIDTH; x++) data.set([px[0], px[1], px[2], 255], (y * GATE_WIDTH + x) * 4)
  }
  return { width: GATE_WIDTH, height: rows, data }
}

describe('soft colour changes (the haven gradient)', () => {
  it('counts #F4E6E1 becoming #FBFBF8 over a button-sized area', () => {
    // 32 by 8 gate pixels: a 128 by 32 button of the real page. No colour moves by more than 23.
    const before = paint(page(225), 40, 120, 32, 8, WASH)
    const after = paint(page(225), 40, 120, 32, 8, SURFACE)
    expect(diffBitmaps(before, after)).toMatchObject({ changed: true, changedPixels: 256 })
    // The old cutoff could never see it.
    expect(diffBitmaps(before, after, GATE_MIN_PIXELS, 24)).toMatchObject({ changed: false, changedPixels: 0 })
  })

  it('counts the same fade reshaped (it reaches the surface at 45% instead of the bottom) across a hero', () => {
    // 100 gate rows: a 400 px tall hero. The biggest change is about 12 on one colour.
    const d = diffBitmaps(fade(100, WASH, SURFACE), fade(100, WASH, SURFACE, 0.45))
    expect(d.changed).toBe(true)
    expect(d.changedPixels).toBeGreaterThan(GATE_MIN_PIXELS * 10)
    expect(diffBitmaps(fade(100, WASH, SURFACE), fade(100, WASH, SURFACE, 0.45), GATE_MIN_PIXELS, 24).changed).toBe(false)
  })

  it('says the same fade drawn twice is the same', () => {
    expect(diffBitmaps(fade(100, WASH, SURFACE), fade(100, WASH, SURFACE))).toMatchObject({ changed: false, changedPixels: 0 })
  })
})

describe("the gate at a phone's width", () => {
  it('cuts every picture to a quarter, so a pixel is a 4 by 4 block at either width, and asks 0.3% of one screen', () => {
    expect(GATE_WIDTH).toBe(360)
    expect(GATE_MIN_PIXELS).toBe(243)
    // A phone's screen, 390 by 844, is 98 by 212 at the gate: 62 pixels are 0.3% of it.
    expect(gateMinPixels({ width: 390, height: 844 })).toBe(62)
    // So a button-sized change counts at either width: 128 by 32 of the page is 32 by 8 at the gate (256 pixels).
    expect(32 * 8).toBeGreaterThan(gateMinPixels({ width: 1440, height: 900 }))
  })
})

describe('where the page changed (Show changes)', () => {
  const ORANGE: [number, number, number] = [47, 111, 235]

  it('finds a button that changed, in the page\'s own pixels (four to one of the gate\'s)', () => {
    const regions = changedRegions(page(225), paint(page(225), 40, 120, 32, 8, ORANGE), 4)
    expect(regions).toEqual([{ x: 160, y: 480, width: 128, height: 32 }])
  })

  it('makes one area of changes close together, and two of changes apart, top to bottom', () => {
    // A label and the border under it, 4 small pixels apart: one change.
    const label = paint(paint(page(225), 40, 100, 30, 4, ORANGE), 40, 108, 30, 2, ORANGE)
    expect(changedRegions(page(225), label, 4)).toHaveLength(1)
    // A heading at the top and a card far below: two, the heading first. Outlines keep to a grid of 16 page pixels.
    const two = paint(paint(page(225), 200, 180, 40, 20, ORANGE), 20, 10, 100, 12, ORANGE)
    expect(changedRegions(page(225), two, 4).map((r) => r.y)).toEqual([32, 720])
  })

  it("groups in the page's own pixels at a phone's width too, so a layout change is not cut into pieces", () => {
    // A phone's page (390 wide) reduced to 360: a small pixel is about 1.08 of the page's. Two parts 16 small pixels
    // apart (17 page pixels) are one change, as they would be at the desktop's width.
    const scale = 390 / 360
    const pieces = paint(paint(page(800), 20, 100, 300, 40, ORANGE), 20, 156, 300, 40, ORANGE)
    expect(changedRegions(page(800), pieces, scale)).toHaveLength(1)
    // Far apart (100 page pixels) they stay two.
    const apart = paint(paint(page(800), 20, 100, 300, 40, ORANGE), 20, 240, 300, 40, ORANGE)
    expect(changedRegions(page(800), apart, scale)).toHaveLength(2)
  })

  it('leaves out a lone speck, and finds nothing on the same page', () => {
    expect(changedRegions(page(225), paint(page(225), 100, 100, 1, 1, ORANGE), 4)).toEqual([])
    expect(changedRegions(page(225), page(225), 4)).toEqual([])
    // A hair of difference in colour is within the cutoff, as for the gate.
    expect(changedRegions(page(225), page(225, [250 - CHANNEL_TOLERANCE, 250, 250]), 4)).toEqual([])
  })

  it('counts the rows a taller page added as changed all the way across', () => {
    expect(changedRegions(page(200), page(225), 4)).toEqual([{ x: 0, y: 800, width: 1440, height: 100 }])
  })

  it('makes the whole page one area when the widths differ', () => {
    const narrow: Bitmap = { width: 100, height: 50, data: Buffer.alloc(100 * 50 * 4) }
    expect(changedRegions(narrow, page(225), 4)).toEqual([{ x: 0, y: 0, width: 1440, height: 900 }])
  })

  it('keeps the biggest changes when there are too many, still top to bottom', () => {
    let many = page(1000)
    // Twenty little changes far apart, and one big one at the bottom.
    for (let i = 0; i < 20; i++) many = paint(many, 10 + (i % 4) * 90, 20 + Math.floor(i / 4) * 150, 4, 4, ORANGE)
    many = paint(many, 10, 900, 300, 60, ORANGE)
    const regions = changedRegions(page(1000), many, 4)
    expect(regions).toHaveLength(MAX_REGIONS)
    expect(regions.at(-1)).toMatchObject({ y: 3600, height: 240 })
    expect(regions.map((r) => r.y)).toEqual([...regions.map((r) => r.y)].sort((a, b) => a - b))
  })

  it('says it in words, and why there is nothing to show', () => {
    expect(areasChangedLabel(1)).toBe('1 area changed')
    expect(areasChangedLabel(3)).toBe('3 areas changed')
    expect(noChangesReason({ beforeFrom: 'turn-start', regions: [{}] })).toBeNull()
    expect(noChangesReason({ beforeFrom: 'none', regions: null })).toMatch(/no earlier picture/)
    expect(noChangesReason({ beforeFrom: 'last-look', regions: null })).toMatch(/older than "Show changes"/)
    expect(noChangesReason({ beforeFrom: 'turn-start', regions: [] })).toMatch(/No changed area/)
  })
})
