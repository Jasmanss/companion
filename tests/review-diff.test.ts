import { describe, expect, it } from 'vitest'
import { CHANNEL_TOLERANCE, diffBitmaps, GATE_MIN_PIXELS, GATE_WIDTH, type Bitmap } from '../src/main/review-diff'

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
