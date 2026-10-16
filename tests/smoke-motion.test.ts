import { describe, expect, it } from 'vitest'
import { judgeMotion, measureMotion, type Motion, type Sample } from '../src/main/smoke-motion'

/** The tab sliding in on a 120 Hz Mac, as the smoke check measured it. */
const SMOOTH: Motion = { frames: 47, positions: 47, spanMs: 383, maxGapMs: 9, maxGapAtMs: 0, stuck: 0, stillGapMs: 9, drawn: 84, watchedMs: 700, visibility: 'visible' }
/** What the macOS CI runner gave: the page drew twice and stopped. */
const STARVED: Motion = { frames: 0, positions: 1, spanMs: 0, maxGapMs: 0, maxGapAtMs: 0, stuck: 0, stillGapMs: null, drawn: 2, watchedMs: 700, visibility: 'visible' }
/** The fade on the macOS CI runner (run 38852242586): a new opacity in all 19 frames, one 100 ms wait between two of them. */
const CI_FADE: Motion = { frames: 19, positions: 19, spanMs: 383, maxGapMs: 100, maxGapAtMs: 0, stuck: 0, stillGapMs: 95, drawn: 33, watchedMs: 700, visibility: 'visible' }

describe('judging a watched animation on a Mac', () => {
  it('passes a slide drawn at many positions with frames a display refresh apart', () => {
    expect(judgeMotion('the tab sliding in', SMOOTH, false)).toEqual({
      result: 'smooth',
      line: 'motion the tab sliding in: 47 positions in 47 frames over 383 ms; longest wait between frames 9 ms while it moved (0 ms in), 9 ms while it was still',
    })
  })

  it('fails a slide drawn in a few steps, or with a long stall, while the page was drawing', () => {
    expect(judgeMotion('x', { ...SMOOTH, frames: 4, positions: 4, maxGapMs: 120 }, false).result).toBe('not smooth')
    expect(judgeMotion('x', { ...SMOOTH, maxGapMs: 61 }, false).result).toBe('not smooth')
    expect(judgeMotion('x', { ...SMOOTH, positions: 7 }, false).result).toBe('not smooth')
    // The CI runner's fade, on a Mac with a screen: a 100 ms wait is a stutter there.
    expect(judgeMotion('x', CI_FADE, false).result).toBe('not smooth')
  })

  it('fails a page that hardly draws', () => {
    expect(judgeMotion('the tab sliding in', STARVED, false)).toEqual({
      result: 'not smooth',
      line: "motion the tab sliding in: the page drew 2 frames in 700 ms (visible), not at the display's rate",
    })
  })
})

describe('judging a watched animation on a CI runner', () => {
  it('passes a fade with a new position in every frame the page drew, logging a long wait instead of failing on it', () => {
    expect(judgeMotion('the tab sliding in', CI_FADE, true)).toEqual({
      result: 'smooth',
      line:
        'motion the tab sliding in: 19 positions in 19 frames over 383 ms; longest wait between frames 100 ms while it moved (0 ms in), 95 ms while it was still; ' +
        'a new position in every frame the page drew (on CI the waits are logged, not judged); the page drew 33 frames in 700 ms (visible)',
    })
    expect(judgeMotion('x', SMOOTH, true).result).toBe('smooth')
  })

  it('fails an animation that stood still in frames the page drew, or moved in too few steps, or never moved', () => {
    const stepped = { ...CI_FADE, frames: 19, positions: 5, stuck: 14 }
    expect(judgeMotion('x', stepped, true)).toMatchObject({ result: 'not smooth', line: expect.stringContaining('14 of those frames showed no new position mid-motion') })
    expect(judgeMotion('x', { ...CI_FADE, frames: 4, positions: 4 }, true).result).toBe('not smooth')
    expect(judgeMotion('x', { ...CI_FADE, frames: 0, positions: 1, spanMs: 0, maxGapMs: 0 }, true).result).toBe('not smooth')
  })

  it('says plainly that it could not measure when the page hardly draws, instead of passing or failing', () => {
    expect(judgeMotion('the tab sliding in', STARVED, true)).toEqual({
      result: 'not measurable',
      line: 'motion the tab sliding in: not measurable here: the page drew 2 frames in 700 ms (visible)',
    })
  })
})

/** Frames `every` ms apart from `start`, one per value. */
const drawn = (values: (string | number)[], every = 16, start = 0): Sample[] => values.map((v, i) => [start + i * every, String(v)])

describe('measuring what a page drew', () => {
  it('runs from the last still frame to the frame the value last changed in, and times the waits inside and outside it', () => {
    const fade = [0, 0, 0, 0.1, 0.25, 0.45, 0.65, 0.8, 0.9, 0.97, 1, 1, 1]
    const m = measureMotion(drawn(fade), 700, 'visible')
    expect(m).toMatchObject({ frames: 9, positions: 9, spanMs: 128, maxGapMs: 16, stuck: 0, stillGapMs: 16, drawn: 13 })
  })

  it('finds the longest wait while it moved, and how far in it began', () => {
    const samples = drawn([0, 0.2, 0.4, 0.6, 0.8, 1])
    for (let i = 3; i < samples.length; i++) samples[i][0] += 84 // the page didn't draw for 100 ms after 0.4
    expect(measureMotion(samples, 700, 'visible')).toMatchObject({ maxGapMs: 100, maxGapAtMs: 32, stuck: 0, stillGapMs: null })
  })

  it('counts frames that repeat the last position mid-motion as stuck: a fade stepped from a timer, or a stall', () => {
    const stepped = [0, 0, 0.25, 0.25, 0.25, 0.5, 0.5, 0.5, 0.75, 0.75, 0.75, 1, 1, 1]
    expect(measureMotion(drawn(stepped), 700, 'visible')).toMatchObject({ frames: 11, positions: 5, stuck: 6 })
    const stall = ['matrix(1, 0, 0, 1, 168, 0)', 'matrix(1, 0, 0, 1, 120, 0)', 'matrix(1, 0, 0, 1, 70.5, 0)', 'matrix(1, 0, 0, 1, 70.5, 0)', 'matrix(1, 0, 0, 1, 20, 0)', 'none']
    expect(measureMotion(drawn(stall), 700, 'visible')).toMatchObject({ frames: 6, positions: 5, stuck: 1 })
  })

  it("doesn't count holding at a turning point: the notch's fade goes out, holds while the shape changes, and comes back", () => {
    const outAndBack = [1, 1, 0.6, 0.2, 0, 0, 0, 0.3, 0.7, 1, 1]
    expect(measureMotion(drawn(outAndBack), 1300, 'visible')).toMatchObject({ frames: 9, stuck: 0 })
  })

  it('says when nothing moved, with the longest wait the page had', () => {
    expect(measureMotion(drawn([1, 1, 1], 20), 700, 'visible')).toMatchObject({ frames: 0, positions: 1, stuck: 0, stillGapMs: 20, drawn: 3 })
  })
})
