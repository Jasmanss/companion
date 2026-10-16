// How the smoke check judges an animation it watched frame by frame: index.ts watches the page, this decides. Pure, so
// it's tested. A CI runner has no one at its screen and may hardly draw at all; that's said plainly, not passed or failed
// on made-up numbers. On a Mac with a screen, a page that hardly draws is a failure.

export interface Motion {
  /** Frames drawn while the thing moved, how many different positions it was drawn at, how long it took, and the longest wait between two frames. */
  frames: number
  positions: number
  spanMs: number
  maxGapMs: number
  /** Every frame the page drew while it was watched, moving or not, and for how long it was watched. */
  drawn: number
  watchedMs: number
  /** document.visibilityState at the end: "hidden" means Chromium thought no one could see the page. */
  visibility: string
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

export function judgeMotion(what: string, m: Motion, onCI: boolean): MotionVerdict {
  const drew = `the page drew ${m.drawn} frames in ${m.watchedMs} ms (${m.visibility})`
  if (m.drawn < STARVED_FRAMES) {
    return onCI
      ? { result: 'not measurable', line: `motion ${what}: not measurable here: ${drew}` }
      : { result: 'not smooth', line: `motion ${what}: ${drew}, not at the display's rate` }
  }
  const line = `motion ${what}: ${m.positions} positions in ${m.frames} frames over ${m.spanMs} ms, longest wait between frames ${m.maxGapMs} ms`
  if (m.positions < MIN_POSITIONS || m.maxGapMs > MAX_GAP_MS) return { result: 'not smooth', line: `${line}; ${drew}` }
  return { result: 'smooth', line }
}
