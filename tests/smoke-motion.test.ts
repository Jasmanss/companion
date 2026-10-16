import { describe, expect, it } from 'vitest'
import { judgeMotion, type Motion } from '../src/main/smoke-motion'

/** The tab sliding in on a 120 Hz Mac, as the smoke check measured it. */
const SMOOTH: Motion = { frames: 47, positions: 47, spanMs: 383, maxGapMs: 9, drawn: 84, watchedMs: 700, visibility: 'visible' }
/** What the macOS CI runner gave: the page drew twice and stopped. */
const STARVED: Motion = { frames: 0, positions: 1, spanMs: 0, maxGapMs: 0, drawn: 2, watchedMs: 700, visibility: 'visible' }

describe('judging a watched animation', () => {
  it('passes a slide drawn at many positions with frames a display refresh apart', () => {
    expect(judgeMotion('the tab sliding in', SMOOTH, false)).toEqual({
      result: 'smooth',
      line: 'motion the tab sliding in: 47 positions in 47 frames over 383 ms, longest wait between frames 9 ms',
    })
    // The same on CI: a runner that does draw is held to the same bar.
    expect(judgeMotion('the tab sliding in', SMOOTH, true).result).toBe('smooth')
  })

  it('fails a slide drawn in a few steps, or with a long stall, while the page was drawing', () => {
    const stepped = { ...SMOOTH, frames: 4, positions: 4, maxGapMs: 120 }
    for (const onCI of [false, true]) expect(judgeMotion('the tab sliding in', stepped, onCI).result).toBe('not smooth')
    expect(judgeMotion('x', { ...SMOOTH, maxGapMs: 61 }, false).result).toBe('not smooth')
    expect(judgeMotion('x', { ...SMOOTH, positions: 7 }, false).result).toBe('not smooth')
    // A page that drew but never moved: the animation didn't run.
    expect(judgeMotion('x', { ...SMOOTH, frames: 0, positions: 1, spanMs: 0, maxGapMs: 0 }, true).result).toBe('not smooth')
  })

  it('on a CI runner whose page hardly draws, says plainly that it could not measure, instead of passing or failing', () => {
    expect(judgeMotion('the tab sliding in', STARVED, true)).toEqual({
      result: 'not measurable',
      line: 'motion the tab sliding in: not measurable here: the page drew 2 frames in 700 ms (visible)',
    })
  })

  it('on a Mac with a screen, a page that hardly draws is a failure', () => {
    expect(judgeMotion('the tab sliding in', STARVED, false)).toEqual({
      result: 'not smooth',
      line: "motion the tab sliding in: the page drew 2 frames in 700 ms (visible), not at the display's rate",
    })
  })
})
