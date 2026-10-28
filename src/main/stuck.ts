// Overnight Watch: a session that may be stuck. During a turn Steward hears a session only when it asks for something
// or stops, so a turn going on is quiet by nature. What it can also see is the session's log growing as Claude works
// (its size, never what's in it). No hook event and no growth for QUIET_MS is worth a word; for STUCK_MS it may be
// stuck. A long build or test run looks exactly the same, which is why the first step only waits for you (a text, once
// Phase 4 adds the phone) and only the second is urgent (a call).
import { promises as fs } from 'node:fs'

/** Quiet this long while working: worth a word. */
export const QUIET_MS = 45 * 60_000
/** Quiet this long: it may be stuck. */
export const STUCK_MS = 90 * 60_000
/** A session not heard from in this long is forgotten. */
const FORGET_MS = 12 * 60 * 60 * 1000

/** A step reached: a session quiet for 45 minutes, or 90. */
export interface StuckStep {
  id: string
  name: string
  /** Quiet since. */
  since: number
  minutes: 45 | 90
}

interface Seen {
  name: string
  transcript?: string
  /** Last heard from: a hook event, or its log growing. */
  at: number
  size: number | null
  /** The step already said for this quiet stretch, and the night it was said in. */
  step: 0 | 45 | 90
  stepFrom: number
}

export class StuckWatch {
  private seen = new Map<string, Seen>()

  constructor(private readonly deps: { size?(file: string): Promise<number | null> } = {}) {}

  /** Anything from a session (any hook event): it isn't stuck. Its name and log are kept for the looks. */
  heard(id: string, at: number, o: { name: string; transcript?: string }): void {
    const before = this.seen.get(id)
    this.seen.set(id, { name: o.name, transcript: o.transcript ?? before?.transcript, at, size: null, step: 0, stepFrom: 0 })
  }

  /**
   * One look at the sessions with a turn going on and not waiting on you (`working`), during a night that began at
   * `from`: quiet is counted from the later of the last thing heard and the night's start, so Go rest never finds a
   * session stuck already. Returns each step newly reached, once per quiet stretch and night.
   */
  async look(working: string[], now: number, from: number): Promise<StuckStep[]> {
    for (const [id, s] of this.seen) if (!working.includes(id) && now - s.at > FORGET_MS) this.seen.delete(id)
    const steps: StuckStep[] = []
    for (const id of working) {
      const s = this.seen.get(id)
      if (!s) continue
      const size = s.transcript ? await this.size(s.transcript) : null
      if (size !== null && s.size !== null && size !== s.size) {
        Object.assign(s, { at: now, size, step: 0 })
        continue
      }
      s.size = size ?? s.size
      if (s.stepFrom !== from) Object.assign(s, { step: 0, stepFrom: from })
      const since = Math.max(s.at, from)
      const quiet = now - since
      const step = quiet >= STUCK_MS ? 90 : quiet >= QUIET_MS ? 45 : 0
      if (step === 0 || step <= s.step) continue
      s.step = step
      steps.push({ id, name: s.name, since, minutes: step })
    }
    return steps
  }

  private size(file: string): Promise<number | null> {
    return this.deps.size ? this.deps.size(file) : fs.stat(file).then((s) => s.size, () => null)
  }
}

/** The on-screen alert for a step: a word at 45 minutes, urgent at 90. Words only: the session's name. */
export function stuckAlert(step: StuckStep): { key: string; level: 'urgent'; title: string; detail: string; mood?: 'worried' } {
  const key = `stuck:${step.id}:${step.since}:${step.minutes}`
  return step.minutes === 90
    ? { key, level: 'urgent', title: `${step.name} may be stuck`, detail: 'Nothing from it for 90 minutes while it was working.', mood: 'worried' }
    : { key, level: 'urgent', title: `${step.name} has been quiet for 45 minutes`, detail: 'It may be stuck, or running something long.' }
}
