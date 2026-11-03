// How the smoke check measures Steward's eyes following a cursor that sweeps past the notch (island Phase 3, the eye
// jitter fix): index.ts moves a pretend cursor and records where the eyes were drawn on every frame the page drew; this
// says how often they moved and how far in one frame. Pure, so it's tested.

/** One drawn frame: its time, and where across the eyes were in it (the middle of the pair, page points). Only across: a blink moves their middle up and down. */
export type EyeSample = [ms: number, x: number]

export interface EyeSweep {
  /** Frames the page drew while the cursor moved. */
  frames: number
  /** Of those, the frames where the eyes were drawn somewhere new. */
  moved: number
  /** The longest time the eyes held still between two moves, while the cursor kept moving. */
  longestHoldMs: number
  /** The biggest move in one frame, and the average move of the frames that moved, in points. */
  maxStep: number
  meanStep: number
}

/** Moves smaller than this (in points) are the same place: layout's rounding noise. A smooth follow moves far less than a pixel a frame, so this is tiny. */
const SAME = 0.002

export function measureEyeSweep(samples: EyeSample[]): EyeSweep {
  let moved = 0
  let maxStep = 0
  let sum = 0
  let longestHoldMs = 0
  let lastMoveAt = samples[0]?.[0] ?? 0
  for (let i = 1; i < samples.length; i++) {
    const [t, x] = samples[i]
    const step = Math.abs(x - samples[i - 1][1])
    if (step < SAME) continue
    moved++
    sum += step
    maxStep = Math.max(maxStep, step)
    longestHoldMs = Math.max(longestHoldMs, t - lastMoveAt)
    lastMoveAt = t
  }
  const r = (v: number) => Math.round(v * 100) / 100
  return { frames: Math.max(0, samples.length - 1), moved, longestHoldMs: Math.round(longestHoldMs), maxStep: r(maxStep), meanStep: r(moved ? sum / moved : 0) }
}

export const describeEyeSweep = (s: EyeSweep): string =>
  `${s.moved} of ${s.frames} frames moved the eyes; longest hold ${s.longestHoldMs} ms; biggest step ${s.maxStep} pt, average ${s.meanStep} pt`
