// What the notch island shows (Settings → Steward → In the notch → Island): the Smart right side, from what Steward
// already tracks. Pure, so it's tested without sessions running. The most pressing thing wins: a session (or Steward
// itself) waiting on you, then a review ready, then two projects working at once, then one working, then one that just
// finished. Nothing going on: no island, Steward peeks from the notch.
import type { IslandStatus, SessionView } from '../shared/types'

/** A session that finished shows a check this long, then the island goes. */
export const FINISHED_SHOW_MS = 20_000

export interface IslandInput {
  sessions: SessionView[]
  /** Steward's own agent is working, or waiting for your OK to run a command. */
  agentBusy: boolean
  agentWaiting: boolean
  /** Visual Review: reviews waiting for a decision. */
  reviews: number
  /** When each working session (by id), and Steward's agent, started working. */
  since: Record<string, number>
  agentSince?: number
  now: number
}

export function islandStatus(o: IslandInput): IslandStatus {
  if (o.agentWaiting || o.sessions.some((s) => s.state === 'needs-approval' || s.state === 'needs-input')) return { right: 'needs' }
  if (o.reviews > 0) return { right: 'review' }
  const working = o.sessions.filter((s) => s.state === 'working')
  const starts = [...working.map((s) => o.since[s.id]), o.agentBusy ? o.agentSince : undefined].filter((t): t is number => typeof t === 'number')
  // The longest-running turn's time.
  const since = starts.length ? Math.min(...starts) : undefined
  const count = working.length + (o.agentBusy ? 1 : 0)
  if (count >= 2) return { right: 'two', count, since }
  if (count === 1) return { right: 'working', since }
  if (o.sessions.some((s) => s.state === 'finished' && o.now - s.updatedAt < FINISHED_SHOW_MS)) return { right: 'finished' }
  return { right: null }
}

/** When the finished check should go (so the island is worked out again then), or null if nothing is waiting to go. */
export function nextChange(o: IslandInput): number | null {
  const ends = o.sessions.filter((s) => s.state === 'finished' && o.now - s.updatedAt < FINISHED_SHOW_MS).map((s) => s.updatedAt + FINISHED_SHOW_MS)
  return ends.length ? Math.min(...ends) : null
}

/**
 * Keeps when each session started working: a session that starts working is noted now, one that stops is forgotten.
 * Returns the new record (the old one is left as it was).
 */
export function noteWorking(since: Record<string, number>, sessions: SessionView[], now: number): Record<string, number> {
  const next: Record<string, number> = {}
  for (const s of sessions) if (s.state === 'working') next[s.id] = since[s.id] ?? now
  return next
}
