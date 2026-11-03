import type { Activity, ActivityKind } from '../../shared/types'

export interface StepEntry {
  kind: 'step'
  id: number
  activity: Activity
  /** When it finished (ms), for how long it stays in full before folding into the summary line. */
  finishedAt?: number
  /** run-command: the output so far, then all of it, and the exit code once it ends. */
  output?: string
  exitCode?: number | null
}

export type Entry =
  | { kind: 'user'; id: number; text: string }
  | { kind: 'assistant'; id: number; text: string; streaming: boolean }
  | StepEntry
  /** reason: in Auto, why this one still asks. */
  | { kind: 'approval'; id: number; approvalId: string; command: string; cwd: string; why?: string; reason?: string; status: 'pending' | 'approved' | 'declined' }
  | { kind: 'notice'; id: number; text: string }
  | { kind: 'error'; id: number; text: string }

export type Block =
  | { type: 'entry'; entry: Exclude<Entry, StepEntry> }
  /** Thinking shows only while it lasts. */
  | { type: 'thinking'; entry: StepEntry }
  /** Steps in a row, between messages. */
  | { type: 'steps'; key: number; steps: StepEntry[] }

/** The chat as blocks: steps in a row are one group; a thinking step that's still running stands on its own. */
export function groupEntries(entries: Entry[]): Block[] {
  const blocks: Block[] = []
  let group: StepEntry[] = []
  const close = () => {
    if (group.length) blocks.push({ type: 'steps', key: group[0].id, steps: group })
    group = []
  }
  for (const entry of entries) {
    if (entry.kind !== 'step') {
      close()
      blocks.push({ type: 'entry', entry })
    } else if (entry.activity.kind === 'thinking') {
      // Finished thinking leaves no trace, so the steps either side of it end up in one group.
      if (entry.activity.status !== 'running') continue
      close()
      blocks.push({ type: 'thinking', entry })
    } else group.push(entry)
  }
  close()
  return blocks
}

/** How long a finished step stays in full, so its ending (a ✓, the sites popping in, a screenshot flying) is seen. */
const LINGER: Partial<Record<ActivityKind, number>> = { 'run-command': 2600, screenshot: 2400, 'add-image': 2400, 'search-web': 3000, 'search-photos': 2200 }
export const lingerFor = (kind: ActivityKind) => LINGER[kind] ?? 1600

/**
 * Which steps of a group are folded into its summary line by now, which still show in full, and when the next one
 * folds (null when nothing is waiting to). Running steps always show in full.
 */
export function foldSteps(steps: StepEntry[], now: number): { folded: StepEntry[]; live: StepEntry[]; next: number | null } {
  const folded: StepEntry[] = []
  const live: StepEntry[] = []
  let next: number | null = null
  for (const step of steps) {
    const at = step.activity.status === 'running' || step.finishedAt === undefined ? null : step.finishedAt + lingerFor(step.activity.kind)
    if (at !== null && at <= now) folded.push(step)
    else {
      live.push(step)
      if (at !== null) next = next === null ? at : Math.min(next, at)
    }
  }
  return { folded, live, next }
}
