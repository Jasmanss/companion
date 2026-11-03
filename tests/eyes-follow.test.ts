import { describe, expect, it } from 'vitest'
import { createEyes, CURSOR_STILL_S, eyesWait, REST_FAR, REST_NEAR, setMood, setStyle, stepEyes, type EyesState } from '../src/renderer/src/pill/eyes'
import { measureEyeSweep, type EyeSample } from '../src/main/smoke-eyes'
import type { Mood } from '../src/shared/types'

/** Eyes in a mood, stepped for a second with no cursor, at 60 frames a second. */
function settled(mood: Mood, steady = true): { st: EyesState; t: number } {
  const st = createEyes(3)
  setStyle(st, { steady })
  setMood(st, mood)
  let t = 0
  for (let i = 0; i < 60; i++) stepEyes(st, (t += 1 / 60), 1 / 60, null)
  return { st, t }
}

describe('how often the eyes draw', () => {
  it('draws every frame while the cursor is near, and goes back to the slow rate when it leaves', () => {
    expect(eyesWait({ mood: 'resting', reduced: false, tucked: true, near: true })).toBe(0)
    expect(eyesWait({ mood: 'idle', reduced: false, tucked: true, near: true })).toBe(0)
    expect(eyesWait({ mood: 'resting', reduced: false, tucked: true, near: false })).toBe(0.1)
    expect(eyesWait({ mood: 'idle', reduced: false, tucked: true, near: false })).toBeCloseTo(1 / 30)
    expect(eyesWait({ mood: 'sleepy', reduced: false, tucked: true })).toBe(0.05)
    // Asleep or dimmed, nothing is drawn, near or not.
    expect(eyesWait({ mood: 'idle', reduced: false, tucked: true, near: true, idle: true })).toBe(0.25)
  })

  it("keeps the panel's own pace: every frame, resting and reduced motion 10 a second", () => {
    expect(eyesWait({ mood: 'idle', reduced: false, tucked: false })).toBe(0)
    expect(eyesWait({ mood: 'resting', reduced: false, tucked: false })).toBe(0.1)
    expect(eyesWait({ mood: 'idle', reduced: true, tucked: false })).toBe(0.1)
  })
})

describe('the eyes following the cursor in the notch', () => {
  it('never glances away from a cursor moving near them, and glances again once it has been still', () => {
    const { st, t: t0 } = settled('idle')
    let t = t0
    let glances = 0
    // Ten seconds of the cursor moving slowly to and fro beside the eyes: idle would glance two or three times.
    for (let i = 0; i < 600; i++) {
      stepEyes(st, (t += 1 / 60), 1 / 60, { x: 0.5 * Math.sin(t), y: 0.2 })
      if (t < st.glance.until) glances++
    }
    expect(glances).toBe(0)
    // The cursor holds still: after a moment the glances come back.
    for (let i = 0; i < 60 * 12; i++) {
      stepEyes(st, (t += 1 / 60), 1 / 60, { x: 0.5 * Math.sin(t0 + 10), y: 0.2 })
      if (t < st.glance.until) glances++
    }
    expect(glances).toBeGreaterThan(0)
  })

  it('stops a glance that was going when the cursor starts moving', () => {
    const { st, t: t0 } = settled('idle')
    let t = t0
    st.glance.until = t + 1
    st.glance.x = -0.8
    stepEyes(st, (t += 1 / 60), 1 / 60, { x: 0.4, y: 0 })
    stepEyes(st, (t += 1 / 60), 1 / 60, { x: 0.45, y: 0 })
    expect(st.glance.until).toBeLessThanOrEqual(t)
  })

  it('keeps no lazy resting glance while the cursor moves near', () => {
    const { st, t: t0 } = settled('resting')
    let t = t0
    let glancing = 0
    for (let i = 0; i < 60 * 20; i++) {
      stepEyes(st, (t += 1 / 60), 1 / 60, { x: 0.3 * Math.sin(t), y: 0.3 })
      if (t < st.rest.until) glancing++
    }
    expect(glancing).toBe(0)
    expect(CURSOR_STILL_S).toBeGreaterThan(0)
  })

  it('glances as before in the panel, which is not steady', () => {
    const { st, t: t0 } = settled('idle', false)
    let t = t0
    let glances = 0
    for (let i = 0; i < 600; i++) {
      stepEyes(st, (t += 1 / 60), 1 / 60, { x: 0.5 * Math.sin(t), y: 0.2 })
      if (t < st.glance.until) glances++
    }
    expect(glances).toBeGreaterThan(0)
  })

  it('resting: the aim blends in as the cursor comes near, with no jump at a line', () => {
    // A cursor sweeping slowly from far left to far right just under the eyes: the aim never jumps in one frame.
    const { st, t: t0 } = settled('resting')
    let t = t0
    let before = st.look.x
    let biggest = 0
    const xs: number[] = []
    for (let i = 0; i <= 600; i++) {
      const x = -3 + (6 * i) / 600
      stepEyes(st, (t += 1 / 60), 1 / 60, { x, y: 0.3 })
      biggest = Math.max(biggest, Math.abs(st.look.x - before))
      before = st.look.x
      xs.push(st.look.x)
    }
    expect(biggest).toBeLessThan(0.02)
    // It did follow: the aim went left of its resting spot near the left of the eyes, and right of it on the right.
    expect(Math.min(...xs)).toBeLessThan(0)
    expect(Math.max(...xs)).toBeGreaterThan(0.15)
    expect(REST_NEAR).toBeLessThan(REST_FAR)
  })
})

describe("the smoke check's eye sweep", () => {
  it('counts every frame that moved the eyes, however little, and the longest hold between moves', () => {
    // Eyes drawn ten times a second on a 120 Hz page: long holds, then steps.
    const stepped: EyeSample[] = Array.from({ length: 120 }, (_, i) => [i * 8.3, Math.floor(i / 12) * 0.5])
    const s = measureEyeSweep(stepped)
    expect(s.moved).toBe(9)
    expect(s.longestHoldMs).toBeGreaterThan(90)
    expect(s.maxStep).toBe(0.5)
    // Every frame, 0.03 points a frame: all of them move, no hold.
    const smooth = measureEyeSweep(Array.from({ length: 120 }, (_, i) => [i * 8.3, i * 0.03] as EyeSample))
    expect(smooth.moved).toBe(119)
    expect(smooth.longestHoldMs).toBeLessThan(10)
  })
})
