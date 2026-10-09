import { describe, expect, it } from 'vitest'
import { sliceCrop } from '../src/main/screenshot'

describe('sliceCrop', () => {
  it('keeps whole slices while scrolling normally', () => {
    expect(sliceCrop(0, 0, 900, 3000)).toEqual({ top: 0, height: 900 })
    expect(sliceCrop(900, 900, 900, 3000)).toEqual({ top: 0, height: 900 })
  })

  it('skips rows already captured when the browser clamps the last scroll', () => {
    // Page is 2500px: asking for 1800 lands at 1600, and 1600-1800 is already in the picture.
    expect(sliceCrop(1800, 1600, 900, 2500)).toEqual({ top: 200, height: 700 })
  })

  it('stops at the height limit', () => {
    expect(sliceCrop(7200, 7200, 900, 8000)).toEqual({ top: 0, height: 800 })
    expect(sliceCrop(8000, 8000, 900, 8000)).toBeNull()
  })
})
