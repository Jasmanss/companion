// What the notch island shows (Settings → Steward → In the notch → Island): the Smart right side, from what Steward
// already hears. Pure, so it's tested without sessions running. The most pressing thing wins: a session (or Steward
// itself) waiting on you, then a review ready, then two working at once, then one working, then one that just
// finished. Nothing going on: no island, Steward peeks from the notch.
//
// "Working" is a turn: from the prompt being sent (the UserPromptSubmit hook) until Claude stops (Stop). The session
// strip doesn't keep those, so the island keeps its own.
import type { HookPayload } from './hook-payload'
import type { IslandStatus, SessionView } from '../shared/types'

/** A session that finished shows a check this long, then the island goes. */
export const FINISHED_SHOW_MS = 20_000
/** A turn that never said it stopped (Claude Code quit, say) stops counting after this long. */
export const TURN_GIVE_UP_MS = 3 * 60 * 60 * 1000

/** The turns going on, by session id: when each began. */
export type Turns = Record<string, number>

export interface IslandInput {
  /** The session strip's sessions: the ones waiting on you, and the ones that finished. */
  sessions: SessionView[]
  turns: Turns
  /** Steward's own agent is working, and since when; or waiting for your OK to run a command. */
  agentBusy: boolean
  agentSince?: number
  agentWaiting: boolean
  /** Visual Review: reviews waiting for a decision. */
  reviews: number
  now: number
}

/** A hook event moves the turns on: a prompt starts one (unless it's going already), a real stop ends it. */
export function noteTurn(turns: Turns, event: HookPayload, now: number): Turns {
  if (event.hook_event_name === 'UserPromptSubmit') return turns[event.session_id] ? turns : { ...turns, [event.session_id]: now }
  if (event.hook_event_name === 'Stop' && !event.stop_hook_active) return Object.fromEntries(Object.entries(turns).filter(([id]) => id !== event.session_id))
  return turns
}

export function islandStatus(o: IslandInput): IslandStatus {
  const waiting = new Set(o.sessions.filter((s) => s.state === 'needs-approval' || s.state === 'needs-input').map((s) => s.id))
  if (o.agentWaiting || waiting.size) return { right: 'needs' }
  if (o.reviews > 0) return { right: 'review' }
  const starts = Object.entries(o.turns)
    .filter(([id, at]) => !waiting.has(id) && o.now - at < TURN_GIVE_UP_MS)
    .map(([, at]) => at)
  if (o.agentBusy && o.agentSince !== undefined) starts.push(o.agentSince)
  // The longest-running turn's time.
  const since = starts.length ? Math.min(...starts) : undefined
  const count = starts.length
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
