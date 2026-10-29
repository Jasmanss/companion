import { nativeImage } from 'electron'
import { CARD_SHOT } from '../shared/review'
import type { ReviewRegion } from '../shared/types'

/**
 * The change gate: do two pictures of the page look different? Both are cut down to this width first (plain nativeImage
 * resize), so a pixel here is a 4 by 4 block of the real page, and compared pixel by pixel.
 */
export const GATE_WIDTH = 360
/** A screen of the page at that width is this tall. */
const GATE_SCREEN_ROWS = Math.round((GATE_WIDTH * CARD_SHOT.height) / CARD_SHOT.width)
/**
 * A pixel counts as changed when any colour is off by more than this (out of 255). Low, so a pale tint or a reshaped
 * gradient counts: haven's fade from #F4E6E1 to #FBFBF8 differs by at most 23 on any colour, and a reshaped fade by
 * about half that. A gate pixel is already the average of a 4 by 4 block, which smooths away the speckle of text edges
 * and gradient dithering. Measured by the smoke check (2026-10-22): the same text page and the same soft fade, each
 * captured twice, differ in 0 pixels at every cutoff from 0 to 24; that fade reshaped differs in 29,025 at 6, 16,190 at
 * 8, 252 at 12 and 0 at 24, against 243 needed.
 */
export const CHANNEL_TOLERANCE = 6
/**
 * The page "looks different" when about 0.3% of a screen's pixels changed (a 128 by 32 pixel button, about). It is a share of
 * one screen, not of the whole page, so a button that changed on a long page still counts. Tuned on real pages later.
 */
export const GATE_SHARE = 0.003
export const GATE_MIN_PIXELS = Math.round(GATE_WIDTH * GATE_SCREEN_ROWS * GATE_SHARE)

/** Raw pixels, four bytes each (blue, green, red, alpha), as nativeImage.toBitmap gives them. */
export interface Bitmap {
  width: number
  height: number
  data: Buffer
}

export interface Diff {
  /** The page looks different. */
  changed: boolean
  changedPixels: number
  /** How many changed pixels it takes to count. */
  minPixels: number
  /** The pictures' heights, in the gate's small pixels. */
  heights: [number, number]
  /** Where it changed, in the page's own pixels, top to bottom (comparePictures finds them). */
  regions?: ReviewRegion[]
}

/**
 * Compare two bitmaps of the same width. Rows that only one of them has (the page got taller or shorter) are all changed.
 * Different widths can't be lined up, so they count as changed outright.
 */
export function diffBitmaps(before: Bitmap, after: Bitmap, minPixels = GATE_MIN_PIXELS, tolerance = CHANNEL_TOLERANCE): Diff {
  const heights: [number, number] = [before.height, after.height]
  if (before.width !== after.width) {
    const changedPixels = Math.max(before.width * before.height, after.width * after.height)
    return { changed: true, changedPixels, minPixels, heights }
  }
  const { width } = before
  const shared = Math.min(before.height, after.height)
  let changedPixels = Math.abs(before.height - after.height) * width
  const end = shared * width * 4
  for (let i = 0; i < end; i += 4) {
    if (
      Math.abs(before.data[i] - after.data[i]) > tolerance ||
      Math.abs(before.data[i + 1] - after.data[i + 1]) > tolerance ||
      Math.abs(before.data[i + 2] - after.data[i + 2]) > tolerance
    )
      changedPixels++
  }
  return { changed: changedPixels >= minPixels, changedPixels, minPixels, heights }
}

/**
 * Changed pixels are grouped on a grid of cells this many of the page's own pixels wide, at either width (a small pixel is
 * 4 of the page's at the desktop's width, and about 1 at a phone's).
 */
const CELL_PX = 16
/** A cell with fewer changed pixels than this is a speck, not a change. */
const CELL_MIN_PIXELS = 2
/** Changes this close (in the page's pixels, any way) are one area: a button's label and its border are one change. */
const JOIN_PX = 32
/** The most areas kept: the biggest changes, shown top to bottom. */
export const MAX_REGIONS = 12

/**
 * Where two small bitmaps of the same width differ, as rectangles in the page's own pixels (`scale` page pixels to a
 * small one). Rows only one of them has (the page got taller or shorter) are changed all the way across. Different
 * widths can't be lined up: the whole page is one area.
 */
export function changedRegions(before: Bitmap, after: Bitmap, scale: number, tolerance = CHANNEL_TOLERANCE): ReviewRegion[] {
  const height = Math.max(before.height, after.height)
  const page = (x: number, y: number, w: number, h: number): ReviewRegion => ({ x: Math.round(x * scale), y: Math.round(y * scale), width: Math.round(w * scale), height: Math.round(h * scale) })
  if (before.width !== after.width) return [page(0, 0, Math.max(before.width, after.width), height)]
  const { width } = before
  const shared = Math.min(before.height, after.height)
  const cell = Math.max(1, Math.round(CELL_PX / scale))
  const joinCells = Math.max(1, Math.ceil(JOIN_PX / (cell * scale)))
  const cols = Math.ceil(width / cell)
  const rows = Math.ceil(height / cell)
  const counts = new Uint32Array(cols * rows)
  for (let y = 0; y < height; y++) {
    const row = Math.floor(y / cell) * cols
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4
      const differs =
        y >= shared ||
        Math.abs(before.data[i] - after.data[i]) > tolerance ||
        Math.abs(before.data[i + 1] - after.data[i + 1]) > tolerance ||
        Math.abs(before.data[i + 2] - after.data[i + 2]) > tolerance
      if (differs) counts[row + Math.floor(x / cell)]++
    }
  }
  // Group the changed cells: each group's bounds, and how many pixels changed in it.
  const seen = new Uint8Array(cols * rows)
  const groups: { c0: number; r0: number; c1: number; r1: number; pixels: number }[] = []
  for (let start = 0; start < counts.length; start++) {
    if (seen[start] || counts[start] < CELL_MIN_PIXELS) continue
    const group = { c0: cols, r0: rows, c1: -1, r1: -1, pixels: 0 }
    const stack = [start]
    seen[start] = 1
    while (stack.length) {
      const at = stack.pop()!
      const c = at % cols
      const r = Math.floor(at / cols)
      group.c0 = Math.min(group.c0, c)
      group.c1 = Math.max(group.c1, c)
      group.r0 = Math.min(group.r0, r)
      group.r1 = Math.max(group.r1, r)
      group.pixels += counts[at]
      for (let dr = -joinCells; dr <= joinCells; dr++)
        for (let dc = -joinCells; dc <= joinCells; dc++) {
          const nc = c + dc
          const nr = r + dr
          if (nc < 0 || nr < 0 || nc >= cols || nr >= rows) continue
          const next = nr * cols + nc
          if (!seen[next] && counts[next] >= CELL_MIN_PIXELS) {
            seen[next] = 1
            stack.push(next)
          }
        }
    }
    groups.push(group)
  }
  return groups
    .sort((a, b) => b.pixels - a.pixels)
    .slice(0, MAX_REGIONS)
    .map((g) => {
      const x = g.c0 * cell
      const y = g.r0 * cell
      return page(x, y, Math.min(width, (g.c1 + 1) * cell) - x, Math.min(height, (g.r1 + 1) * cell) - y)
    })
    .sort((a, b) => a.y - b.y || a.x - b.x)
}

function small(png: Buffer): Bitmap & { scale: number } {
  const image = nativeImage.createFromBuffer(png)
  const { width } = image.getSize()
  const reduced = width > GATE_WIDTH ? image.resize({ width: GATE_WIDTH, quality: 'good' }) : image
  const size = reduced.getSize()
  return { width: size.width, height: size.height, data: reduced.toBitmap(), scale: width / size.width }
}

/** Does the page look different between two full-page pictures (PNG), and where? */
export function comparePictures(before: Buffer, after: Buffer): Diff {
  const [a, b] = [small(before), small(after)]
  const diff = diffBitmaps(a, b)
  return { ...diff, regions: diff.changed ? changedRegions(a, b, b.scale) : [] }
}

/** How many small pixels differ at each of these cutoffs: for the smoke check to log where the noise is. */
export function changedAt(before: Buffer, after: Buffer, tolerances: number[]): number[] {
  const [a, b] = [small(before), small(after)]
  return tolerances.map((tolerance) => diffBitmaps(a, b, GATE_MIN_PIXELS, tolerance).changedPixels)
}

/** How big a card picture is: the top of the page, this wide. The card is 16:10, so it is this tall at most. */
const CARD_WIDTH = 760

/** The top 16:10 of a full-page picture, small, as a JPEG for the card's slider. */
export function cardPicture(png: Buffer): Buffer {
  const image = nativeImage.createFromBuffer(png)
  const { width, height } = image.getSize()
  const top = image.crop({ x: 0, y: 0, width, height: Math.min(height, Math.round((width * CARD_SHOT.height) / CARD_SHOT.width)) })
  return (width > CARD_WIDTH ? top.resize({ width: CARD_WIDTH, quality: 'good' }) : top).toJPEG(80)
}
