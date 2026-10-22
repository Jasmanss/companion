import { nativeImage } from 'electron'
import { CARD_SHOT } from '../shared/review'

/**
 * The change gate: do two pictures of the page look different? Both are cut down to this width first (plain nativeImage
 * resize), so a pixel here is a 4 by 4 block of the real page, and compared pixel by pixel.
 */
export const GATE_WIDTH = 360
/** A screen of the page at that width is this tall. */
const GATE_SCREEN_ROWS = Math.round((GATE_WIDTH * CARD_SHOT.height) / CARD_SHOT.width)
/**
 * A pixel counts as changed when any colour is off by more than this (out of 255): the rendering of the same page twice
 * can differ a hair on the edges of text, and that is not a change.
 */
const CHANNEL_TOLERANCE = 24
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
}

/**
 * Compare two bitmaps of the same width. Rows that only one of them has (the page got taller or shorter) are all changed.
 * Different widths can't be lined up, so they count as changed outright.
 */
export function diffBitmaps(before: Bitmap, after: Bitmap, minPixels = GATE_MIN_PIXELS): Diff {
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
      Math.abs(before.data[i] - after.data[i]) > CHANNEL_TOLERANCE ||
      Math.abs(before.data[i + 1] - after.data[i + 1]) > CHANNEL_TOLERANCE ||
      Math.abs(before.data[i + 2] - after.data[i + 2]) > CHANNEL_TOLERANCE
    )
      changedPixels++
  }
  return { changed: changedPixels >= minPixels, changedPixels, minPixels, heights }
}

function small(png: Buffer): Bitmap {
  const image = nativeImage.createFromBuffer(png)
  const { width } = image.getSize()
  const reduced = width > GATE_WIDTH ? image.resize({ width: GATE_WIDTH, quality: 'good' }) : image
  const size = reduced.getSize()
  return { width: size.width, height: size.height, data: reduced.toBitmap() }
}

/** Does the page look different between two full-page pictures (PNG)? */
export function comparePictures(before: Buffer, after: Buffer): Diff {
  return diffBitmaps(small(before), small(after))
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
