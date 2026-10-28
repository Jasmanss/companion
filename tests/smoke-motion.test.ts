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

/** The nudge under the notch with Reduce Motion on, on the CI runner (run 39657596430): 39 frames drawn, none of them different. */
const NOTHING_MOVED: Motion = { frames: 0, positions: 1, spanMs: 0, maxGapMs: 0, maxGapAtMs: 0, stuck: 0, stillGapMs: 35, drawn: 39, watchedMs: 800, visibility: 'visible' }
const FADEIN = { name: 'fadein', durationMs: 200 }

describe('when nothing moved in any frame the page drew', () => {
  it('says the element never came, if the page never had it', () => {
    const m = { ...NOTHING_MOVED, seen: { appeared: 0, animated: null } }
    for (const onCI of [true, false]) {
      expect(judgeMotion('a nudge coming out', m, onCI)).toMatchObject({ result: 'not smooth', line: expect.stringContaining('it never appeared in the page') })
    }
  })

  it("on a runner, says it could not measure a fade that was already over when the page drew its first frame of it", () => {
    const m = { ...NOTHING_MOVED, seen: { appeared: 39, animated: { ...FADEIN, finished: true } } }
    expect(judgeMotion('a nudge coming out', m, true)).toEqual({
      result: 'not measurable',
      line: 'motion a nudge coming out: not measurable here: its animation (fadein, 200 ms) was already over when the page drew its first frame of it; the page drew 39 frames in 800 ms (visible)',
    })
  })

  it('fails the same thing on a Mac with a screen, where the first frame is not that late', () => {
    const m = { ...NOTHING_MOVED, drawn: 93, seen: { appeared: 93, animated: { ...FADEIN, finished: true } } }
    expect(judgeMotion('a nudge coming out', m, false)).toMatchObject({ result: 'not smooth', line: expect.stringContaining('fadein of 200 ms, already over in its first frame') })
  })

  it('fails an element that was there with no animation at all, on a runner too, saying so', () => {
    const m = { ...NOTHING_MOVED, seen: { appeared: 39, animated: { name: '', durationMs: 0, finished: false } } }
    expect(judgeMotion('a nudge coming out', m, true)).toMatchObject({ result: 'not smooth', line: expect.stringContaining('it was in 39 of the frames, with an animation of 0 ms, still running in its first frame') })
  })

  it('without the page saying anything about the element, fails as it always did', () => {
    expect(judgeMotion('x', NOTHING_MOVED, true).result).toBe('not smooth')
    expect(judgeMotion('x', NOTHING_MOVED, false).result).toBe('not smooth')
  })
})

describe('a short fade on a CI runner', () => {
  /** A 200 ms fade on a runner drawing 40 frames a second: 8 frames at the most, a new position in each. */
  const SHORT: Motion = { frames: 7, positions: 7, spanMs: 190, maxGapMs: 30, maxGapAtMs: 60, stuck: 0, stillGapMs: 30, drawn: 32, watchedMs: 800, visibility: 'visible' }

  it("is held to the steps the runner could draw in it, not to 8", () => {
    expect(judgeMotion('a nudge going back', SHORT, true).result).toBe('smooth')
    expect(judgeMotion('a nudge going back', { ...SHORT, frames: 5, positions: 5 }, true).result).toBe('smooth')
    expect(judgeMotion('a nudge going back', { ...SHORT, frames: 4, positions: 4 }, true).result).toBe('smooth')
    expect(judgeMotion('a nudge going back', { ...SHORT, frames: 3, positions: 3 }, true)).toMatchObject({ result: 'not smooth', line: expect.stringContaining('fewer than 4 positions') })
  })

  it('still needs a new position in every frame it drew, and 3 at least', () => {
    expect(judgeMotion('x', { ...SHORT, stuck: 2 }, true).result).toBe('not smooth')
    expect(judgeMotion('x', { ...SHORT, frames: 2, positions: 2, spanMs: 40 }, true).result).toBe('not smooth')
  })

  it('is not held to less on a Mac with a screen', () => {
    expect(judgeMotion('x', { ...SMOOTH, frames: 5, positions: 5, drawn: 90 }, false).result).toBe('not smooth')
  })
})

describe('a fade that holds at a turning point, on a CI runner', () => {
  /**
   * Steward joining the island with Reduce Motion on PR #43 (run 40637273962, attempt 1): out, a hold while the island
   * changes shape (where the runner stalled 336 ms), and back. 17 frames, 7 positions, none stuck: about 10 frames held.
   * Here the stall is not counted as held, the least the hold could have been.
   */
  const JOIN: Motion = { frames: 17, positions: 7, spanMs: 587, maxGapMs: 336, maxGapAtMs: 251, stuck: 0, heldMs: 170, stillGapMs: 81, drawn: 28, watchedMs: 900, visibility: 'visible' }

  it('is held to the steps the runner could draw while it was changing, not while it held', () => {
    expect(judgeMotion('Steward joining the island', JOIN, true)).toMatchObject({ result: 'smooth', line: expect.stringContaining('over 587 ms (170 ms of it held at a turning point)') })
    // Attempt 2 of the same run.
    expect(judgeMotion('x', { ...JOIN, spanMs: 433, maxGapMs: 182, maxGapAtMs: 252, heldMs: 167, stillGapMs: 49, drawn: 37 }, true).result).toBe('smooth')
  })

  it('judges a motion with no hold as before, and still needs a new position in every frame it drew', () => {
    expect(judgeMotion('x', { ...JOIN, heldMs: 0 }, true)).toMatchObject({ result: 'not smooth', line: expect.stringContaining('fewer than 8 positions') })
    expect(judgeMotion('x', { ...JOIN, heldMs: undefined }, true).result).toBe('not smooth')
    expect(judgeMotion('x', { ...JOIN, stuck: 1 }, true).result).toBe('not smooth')
    // Held for nearly all of it: 3 positions at least, all the same.
    expect(judgeMotion('x', { ...JOIN, positions: 2, heldMs: 580 }, true).result).toBe('not smooth')
  })

  it('changes nothing on a Mac with a screen', () => {
    expect(judgeMotion('x', JOIN, false).result).toBe('not smooth')
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
    // Two frames held at 0, 16 ms each: the time it couldn't show a new step.
    expect(measureMotion(drawn(outAndBack), 1300, 'visible')).toMatchObject({ frames: 9, stuck: 0, heldMs: 32 })
  })

  it('carries what the page said about the element along', () => {
    const seen = { appeared: 3, animated: { name: 'fadein', durationMs: 200, finished: true } }
    expect(measureMotion(drawn([1, 1, 1], 20), 700, 'visible', seen)).toMatchObject({ frames: 0, seen })
    expect(measureMotion(drawn([0, 0.5, 1], 20), 700, 'visible')).not.toHaveProperty('seen')
  })

  it('says when nothing moved, with the longest wait the page had', () => {
    expect(measureMotion(drawn([1, 1, 1], 20), 700, 'visible')).toMatchObject({ frames: 0, positions: 1, stuck: 0, stillGapMs: 20, drawn: 3 })
  })
})
