import { describe, expect, it } from 'vitest'
import { findNotch, parseProbe, probeScreens, type ScreenProbe } from '../src/main/notch'
import { inBoxes, notchBoxes, notchShape, NOTCH_LIP, NOTCH_WING } from '../src/shared/notch'

/** What macOS reports for the 14-inch MacBook Pro at its default 1512 x 982, measured on the user's Mac (Mac16,1). */
const MBP14: ScreenProbe = { id: 1, frame: [0, 0, 1512, 982], safeTop: 32, left: [0, 950, 663.5, 32], right: [848.5, 950, 663.5, 32] }
const EXTERNAL: ScreenProbe = { id: 2, frame: [1512, 0, 2560, 1440], safeTop: 0, left: null, right: null }
const displays = [{ id: 1, bounds: { x: 0, y: 0 } }, { id: 2, bounds: { x: 1512, y: 0 } }]

describe('finding the notch', () => {
  it("reads the notch from the strips beside it and the top safe area: 185 x 32 points, centered", () => {
    expect(findNotch([MBP14], displays)).toEqual({ displayId: 1, x: 663.5, y: 0, width: 185, height: 32 })
  })

  it('finds none on an external display, in the scaled mode that hides the notch, or with the lid closed', () => {
    expect(findNotch([EXTERNAL], displays)).toBeNull()
    // The mode below the camera: the screen starts under the notch, so macOS reports no safe area and no strips.
    expect(findNotch([{ ...MBP14, frame: [0, 0, 1512, 945], safeTop: 0, left: null, right: null }], displays)).toBeNull()
    // Lid closed: the built-in screen isn't there at all.
    expect(findNotch([EXTERNAL], [displays[1]])).toBeNull()
    expect(findNotch([], displays)).toBeNull()
  })

  it('places it on the built-in screen wherever that sits among several, matching displays by id', () => {
    const left = [{ id: 2, bounds: { x: 0, y: 0 } }, { id: 1, bounds: { x: -1512, y: 180 } }]
    expect(findNotch([EXTERNAL, { ...MBP14, frame: [-1512, -180, 1512, 982], left: [-1512, 770, 663.5, 32], right: [-663.5, 770, 663.5, 32] }], left)).toEqual({ displayId: 1, x: -848.5, y: 180, width: 185, height: 32 })
    expect(findNotch([MBP14], [{ id: 9, bounds: { x: 0, y: 0 } }])).toBeNull()
  })

  it('ignores answers that make no sense rather than trusting them', () => {
    expect(findNotch([{ ...MBP14, right: [700, 950, 812, 32] }], displays)).toBeNull()
    expect(findNotch([{ ...MBP14, safeTop: 400 }], displays)).toBeNull()
  })

  it("parses the script's answer, dropping anything malformed", () => {
    expect(parseProbe(JSON.stringify([MBP14, EXTERNAL]))).toEqual([MBP14, EXTERNAL])
    expect(parseProbe(JSON.stringify([{ id: 'x', frame: [0, 0, 1, 1], safeTop: 0 }, { id: 3, frame: [0, 0], safeTop: 0 }, { ...MBP14, left: 'x' }]))).toEqual([{ ...MBP14, left: null }])
    for (const junk of ['', 'not json', '{}', 'null', '[1,2]']) expect(parseProbe(junk), junk).toEqual([])
  })

  it('asks macOS through osascript, and finds nothing if that fails', async () => {
    const calls: string[][] = []
    const ok = await probeScreens(async (file, args) => {
      calls.push([file, ...args.slice(0, 2)])
      return JSON.stringify([MBP14])
    })
    expect(ok).toEqual([MBP14])
    expect(calls).toEqual([['/usr/bin/osascript', '-l', 'JavaScript']])
    expect(await probeScreens(async () => Promise.reject(new Error('osascript is gone')))).toEqual([])
  })
})

describe('the shape in the notch', () => {
  const notch = { width: 185, height: 32 }
  const layout = { cx: 180, ...notch }

  it('grows a chin as wide as the notch, a little taller while talking', () => {
    expect(notchShape('chin', 'idle', notch)).toEqual({ lip: 32 + NOTCH_LIP, wings: 0 })
    expect(notchShape('chin', 'talking', notch).lip).toBe(32 + NOTCH_LIP + 5)
  })

  it('puts wings in the menu bar, and grows the chin only for the dots and the mouth', () => {
    expect(notchShape('wings', 'idle', notch)).toEqual({ lip: 32, wings: 185 + 2 * NOTCH_WING })
    expect(notchShape('wings', 'thinking', notch).lip).toBe(32 + NOTCH_LIP)
    expect(notchShape('wings', 'sleepy', notch).lip).toBe(32)
  })

  it('asleep (Only when needed, at rest) is exactly the notch: no chin, no wings, in either style and every mood', () => {
    for (const style of ['chin', 'wings'] as const) {
      for (const mood of ['idle', 'resting', 'thinking', 'talking', 'needs-you', 'sleepy'] as const) {
        expect(notchShape(style, mood, notch, false), `${style} ${mood}`).toEqual({ lip: notch.height, wings: 0 })
      }
    }
    // Awake is what it always was.
    expect(notchShape('chin', 'idle', notch, true)).toEqual(notchShape('chin', 'idle', notch))
    expect(notchShape('wings', 'idle', notch, true)).toEqual({ lip: 32, wings: 185 + 2 * NOTCH_WING })
  })

  it('asleep, the black takes clicks only over the notch itself, so the browser tabs under it stay clickable', () => {
    const asleep = notchBoxes(notchShape('chin', 'idle', notch, false), layout)
    expect(asleep).toEqual([{ x: 180 - 185 / 2, y: 0, width: 185, height: 32 }])
    expect(inBoxes({ x: 180, y: 16 }, asleep)).toBe(true)
    expect(inBoxes({ x: 180, y: 33 }, asleep)).toBe(false)
    expect(inBoxes({ x: 180 - 100, y: 16 }, asleep)).toBe(false)
  })

  it('takes clicks only on the black: never on the menu bar beside a chin', () => {
    const chin = notchBoxes(notchShape('chin', 'idle', notch), layout)
    expect(inBoxes({ x: 180, y: 45 }, chin)).toBe(true)
    expect(inBoxes({ x: 180, y: 60 }, chin)).toBe(false)
    expect(inBoxes({ x: 180 - 100, y: 16 }, chin)).toBe(false)
    const wings = notchBoxes(notchShape('wings', 'idle', notch), layout)
    expect(inBoxes({ x: 180 - 100, y: 16 }, wings)).toBe(true)
    expect(inBoxes({ x: 180, y: 45 }, wings)).toBe(false)
    expect(inBoxes({ x: 180 - 130, y: 16 }, wings)).toBe(false)
  })
})
