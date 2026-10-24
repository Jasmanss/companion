// What the notch island shows (Settings → Steward → In the notch → Island): the Smart right side, from what Steward
// already hears. Pure, so it's tested without sessions running. The most pressing thing wins: a session (or Steward
// itself) waiting on you, then a review ready, then two working at once, then one working, then one that just
// finished. Nothing going on: no island, Steward peeks from the notch.
//
// "Working" is a turn: from the prompt being sent (the UserPromptSubmit hook) until Claude stops (Stop). The session
// strip doesn't keep those, so the island keeps its own.
//
// News gets a note, one line under the notch: a session finished, or a second project started while one works. It
// shows for a few seconds and then settles, the island going back to compact with the status on its right. With the
// cursor on the island it stays, and once the cursor leaves it stays a moment longer.
import type { HookPayload } from './hook-payload'
import type { IslandNote, IslandStatus, SessionView } from '../shared/types'

/** A session that finished shows a check this long, then the island goes. */
export const FINISHED_SHOW_MS = 20_000
/** A turn that never said it stopped (Claude Code quit, say) stops counting after this long. */
export const TURN_GIVE_UP_MS = 3 * 60 * 60 * 1000
/** A note shows this long, then the island settles to compact. */
export const NOTE_SHOW_MS = 4500
/** Once the cursor leaves the island, a note it kept stays this much longer, so it doesn't vanish from under the eye. */
export const NOTE_AFTER_HOVER_MS = 1500

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
  /** The note showing, if any (IslandNotes). */
  note?: IslandNote | null
  now: number
}

/** A hook event moves the turns on: a prompt starts one (unless it's going already), a real stop ends it. */
export function noteTurn(turns: Turns, event: HookPayload, now: number): Turns {
  if (event.hook_event_name === 'UserPromptSubmit') return turns[event.session_id] ? turns : { ...turns, [event.session_id]: now }
  if (event.hook_event_name === 'Stop' && !event.stop_hook_active) return Object.fromEntries(Object.entries(turns).filter(([id]) => id !== event.session_id))
  return turns
}

/** The status, with the note while one shows. Nothing going on, there's no island, so no note either. */
export function islandStatus(o: IslandInput): IslandStatus {
  const status = rightSide(o)
  return status.right && o.note ? { ...status, note: o.note } : status
}

function rightSide(o: IslandInput): IslandStatus {
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

/**
 * The note a hook event deserves, if any. turns: the turns going on before this event. A real stop is "Claude finished",
 * with the last thing it said. A prompt starting a new turn while another project works is "started".
 */
export function hookNote(event: HookPayload, o: { turns: Turns; agentBusy: boolean; name: string; detail?: string; now: number }): IslandNote | null {
  if (event.hook_event_name === 'Stop' && !event.stop_hook_active) return { kind: 'finished', name: o.name, text: o.detail ? `Claude finished · ${o.detail}` : 'Claude finished', at: o.now }
  if (event.hook_event_name !== 'UserPromptSubmit' || o.turns[event.session_id]) return null
  const others = Object.entries(o.turns).filter(([id, at]) => id !== event.session_id && o.now - at < TURN_GIVE_UP_MS).length + (o.agentBusy ? 1 : 0)
  return others ? { kind: 'started', name: o.name, text: 'started', at: o.now } : null
}

/** The island's note: shown for NOTE_SHOW_MS, kept while the cursor is on the island, then it settles. */
export class IslandNotes {
  private note: IslandNote | null = null
  private until = 0
  private hovered = false
  private timer: ReturnType<typeof setTimeout> | undefined

  /** changed: the note came or went, so the island should be worked out again. */
  constructor(private readonly o: { changed(): void; now?(): number }) {}

  get current(): IslandNote | null {
    return this.note
  }

  /** A new note takes the place of the one showing. */
  show(note: IslandNote): void {
    this.note = note
    this.arm(NOTE_SHOW_MS)
    this.o.changed()
  }

  /** The cursor came onto the island, or left it. */
  hover(on: boolean): void {
    this.hovered = on
    if (!on && this.note) this.arm(Math.max(this.until - this.now(), NOTE_AFTER_HOVER_MS))
  }

  /** Settle now (or only if it's this kind of note). */
  drop(kind?: IslandNote['kind']): void {
    if (!this.note || (kind && this.note.kind !== kind)) return
    clearTimeout(this.timer)
    this.note = null
    this.o.changed()
  }

  private arm(ms: number): void {
    this.until = this.now() + ms
    clearTimeout(this.timer)
    // Time's up with the cursor on it: it stays, and the cursor leaving gives it its last moment.
    this.timer = setTimeout(() => {
      if (!this.hovered) this.drop()
    }, ms)
  }

  private now(): number {
    return this.o.now?.() ?? Date.now()
  }
}
