// How the smoke check judges an animation it watched frame by frame: index.ts watches the page, this measures and
// decides. Pure, so it's tested. A CI runner has no one at its screen and may hardly draw at all; that's said plainly,
// not passed or failed on made-up numbers. On a Mac with a screen, a page that hardly draws is a failure.

export interface Motion {
  /** Frames drawn while the thing moved, how many different positions it was drawn at, how long it took, and the longest wait between two frames. */
  frames: number
  positions: number
  spanMs: number
  maxGapMs: number
  /** How far into the motion that longest wait began. */
  maxGapAtMs: number
  /** Frames drawn mid-motion that showed the same position as the frame before: the page drew, the thing didn't move. */
  stuck: number
  /**
   * How long of it the thing held at a turning point (the notch's fade with Reduce Motion goes out, holds while the
   * shape changes, and comes back): time it couldn't show a new position in. Absent: not measured.
   */
  heldMs?: number
  /** The longest wait between two frames while the thing was still (before or after it moved); null if there were none. */
  stillGapMs: number | null
  /** Every frame the page drew while it was watched, moving or not, and for how long it was watched. */
  drawn: number
  watchedMs: number
  /** document.visibilityState at the end: "hidden" means Chromium thought no one could see the page. */
  visibility: string
  /** What the page said about the watched element itself (absent when the caller didn't ask). */
  seen?: Seen
}

/**
 * The watched element as the page saw it: in how many of the drawn frames it existed at all, and its animation as of the
 * first frame it was in (a CSS animation or transition: its name, its length, and whether it was already over by then).
 * It tells an animation that never ran from one that ran before the page drew anything to measure.
 */
export interface Seen {
  appeared: number
  animated: { name: string; durationMs: number; finished: boolean } | null
}

/** One drawn frame: its time, and the watched value (a computed transform or opacity) in it. */
export type Sample = [ms: number, value: string]

/** The numbers in a computed value: "matrix(1, 0, 0, 1, 42.5, 0)" is six, "0.25" is one, "none" is none. */
const numbers = (v: string): number[] => (v.match(/-?\d*\.?\d+(?:e[-+]?\d+)?/gi) ?? []).map(Number)

const longestGap = (s: Sample[]): number | null => (s.length < 2 ? null : Math.max(...s.slice(1).map((x, i) => x[0] - s[i][0])))

/**
 * Turns the frames a page drew into a Motion. The motion runs from the last frame before the value first changed to the
 * frame it last changed in. A frame that repeats the one before counts as stuck only if it's mid-motion: somewhere
 * strictly between the furthest points it reached. Holding at a turning point isn't stuck: the notch's fade (with
 * Reduce Motion) goes out, holds while the shape changes, and comes back.
 */
export function measureMotion(samples: Sample[], watchedMs: number, visibility: string, element?: Seen): Motion {
  const seen = { drawn: samples.length, watchedMs, visibility, ...(element ? { seen: element } : {}) }
  const changed = samples.map((s, i) => (i > 0 && s[1] !== samples[i - 1][1] ? i : -1)).filter((i) => i >= 0)
  if (!changed.length) {
    const still = longestGap(samples)
    return { frames: 0, positions: 1, spanMs: 0, maxGapMs: 0, maxGapAtMs: 0, stuck: 0, heldMs: 0, stillGapMs: still === null ? null : Math.round(still), ...seen }
  }
  const from = changed[0] - 1
  const to = changed.at(-1)!
  const moving = samples.slice(from, to + 1)
  const gaps = moving.slice(1).map((s, i) => s[0] - moving[i][0])
  const worst = gaps.indexOf(Math.max(...gaps))
  const values = moving.map((s) => numbers(s[1]))
  const midMotion = (v: number[]): boolean =>
    v.some((x, k) => {
      const same = values.filter((w) => w.length === v.length).map((w) => w[k])
      return x > Math.min(...same) && x < Math.max(...same)
    })
  const repeats = (i: number) => i > 0 && moving[i][1] === moving[i - 1][1]
  const stuck = moving.filter((_, i) => repeats(i) && midMotion(values[i])).length
  const heldMs = moving.reduce((sum, _, i) => (repeats(i) && !midMotion(values[i]) ? sum + gaps[i - 1] : sum), 0)
  const stillGaps = [longestGap(samples.slice(0, from + 1)), longestGap(samples.slice(to))].filter((g): g is number => g !== null)
  return {
    frames: moving.length,
    positions: new Set(moving.map((s) => s[1])).size,
    spanMs: Math.round(moving.at(-1)![0] - moving[0][0]),
    maxGapMs: Math.round(gaps[worst]),
    maxGapAtMs: Math.round(moving[worst][0] - moving[0][0]),
    stuck,
    heldMs: Math.round(heldMs),
    stillGapMs: stillGaps.length ? Math.round(Math.max(...stillGaps)) : null,
    ...seen,
  }
}

/** Fewer frames than this in a watch means the page wasn't being drawn: a screen draws 40 or more in that time. */
export const STARVED_FRAMES = 12
/** Smooth: drawn at this many positions at least, never waiting longer than this between frames. */
export const MIN_POSITIONS = 8
export const MAX_GAP_MS = 60

export interface MotionVerdict {
  result: 'smooth' | 'not smooth' | 'not measurable'
  line: string
}

/**
 * On a Mac with a screen: at least MIN_POSITIONS positions and no wait over MAX_GAP_MS between frames. On a CI runner
 * the runner decides when the page gets to draw, so a long wait there says more about the runner than the app. There,
 * every frame the page drew mid-motion has to show a new position, at MIN_POSITIONS positions at least; the waits, while
 * it moved and while it was still, are logged next to each other so a stutter of the app's own still shows. A fade too
 * short for the runner to draw MIN_POSITIONS steps in is held to what it could draw (at least 3, and a new one in every frame),
 * counted over the time it was changing: while it holds at a turning point it can't show a new step.
 */
export function judgeMotion(what: string, m: Motion, onCI: boolean): MotionVerdict {
  const drew = `the page drew ${m.drawn} frames in ${m.watchedMs} ms (${m.visibility})`
  if (m.drawn < STARVED_FRAMES) {
    return onCI
      ? { result: 'not measurable', line: `motion ${what}: not measurable here: ${drew}` }
      : { result: 'not smooth', line: `motion ${what}: ${drew}, not at the display's rate` }
  }
  const still = m.stillGapMs === null ? 'no frames while it was still' : `${m.stillGapMs} ms while it was still`
  const held = m.heldMs ? ` (${m.heldMs} ms of it held at a turning point)` : ''
  const line = `motion ${what}: ${m.positions} positions in ${m.frames} frames over ${m.spanMs} ms${held}; longest wait between frames ${m.maxGapMs} ms while it moved (${m.maxGapAtMs} ms in), ${still}`
  const a = m.seen?.animated
  // Nothing moved in any frame. What the page said about the element tells why: it never came, or its animation ran out
  // before the first frame the page drew (a runner is slow to draw a window it has just been shown).
  if (m.frames === 0 && m.seen) {
    if (m.seen.appeared === 0) return { result: 'not smooth', line: `${line}; it never appeared in the page; ${drew}` }
    const animation = a ? `${a.name || 'an animation'} of ${a.durationMs} ms, ${a.finished ? 'already over' : 'still running'} in its first frame` : 'no animation on it'
    if (onCI && a?.finished) {
      return { result: 'not measurable', line: `motion ${what}: not measurable here: its animation (${a.name || 'unnamed'}, ${a.durationMs} ms) was already over when the page drew its first frame of it; ${drew}` }
    }
    return { result: 'not smooth', line: `${line}; it was in ${m.seen.appeared} of the frames, with ${animation}; ${drew}` }
  }
  if (!onCI) {
    if (m.positions < MIN_POSITIONS || m.maxGapMs > MAX_GAP_MS) return { result: 'not smooth', line: `${line}; ${drew}` }
    return { result: 'smooth', line }
  }
  if (m.stuck > 0) return { result: 'not smooth', line: `${line}; ${m.stuck} of those frames showed no new position mid-motion; ${drew}` }
  // A short fade can only show as many steps as the runner drew in it: a 200 ms fade at 40 frames a second is 8 at most.
  // A fade that goes out, holds and comes back is counted over the time it was changing, not the time it held.
  const changingMs = m.spanMs - (m.heldMs ?? 0)
  const enough = Math.min(MIN_POSITIONS, Math.max(3, Math.floor((0.6 * changingMs * m.drawn) / m.watchedMs)))
  if (m.positions < enough) return { result: 'not smooth', line: `${line}; fewer than ${enough} positions; ${drew}` }
  return { result: 'smooth', line: `${line}; a new position in every frame the page drew (on CI the waits are logged, not judged); ${drew}` }
}
