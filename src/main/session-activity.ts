// What the chats have been doing lately, from the hooks Steward already gets: when each turn began (UserPromptSubmit)
// and each real stop (Stop), how long that turn was, and whether Claude ended by asking you something. The notch island
// reads the turns going on; Steward's reactions (main/reactions.ts) read the stops too.
import { endsAsking } from '../shared/review'
import type { HookPayload } from './hook-payload'
import { noteTurn, type Turns } from './island-status'

/** Stops are kept this long. */
export const STOPS_KEPT_MS = 10 * 60_000

/** A real stop: which chat, when, how long its turn was (null without the turn-start hook), and whether it asked you something. */
export interface StopSeen {
  id: string
  at: number
  turnMs: number | null
  asked: boolean
}

export class SessionActivity {
  /** The turns going on, by session: when each began. */
  turns: Turns = {}
  /** The stops in the last ten minutes, oldest first. */
  stops: StopSeen[] = []

  /** A hook event: a prompt starts a turn, a real stop ends it and is kept. */
  note(event: HookPayload, now: number): void {
    if (event.hook_event_name === 'Stop' && !event.stop_hook_active) {
      const began = this.turns[event.session_id]
      this.stops = [...this.stops.filter((s) => now - s.at < STOPS_KEPT_MS), { id: event.session_id, at: now, turnMs: began === undefined ? null : now - began, asked: endsAsking(event.last_assistant_message) }]
    }
    this.turns = noteTurn(this.turns, event, now)
  }

  /** Each chat's newest stop, unless it has started a new turn since. */
  lastStops(): StopSeen[] {
    const last = new Map<string, StopSeen>()
    for (const s of this.stops) last.set(s.id, s)
    return [...last.values()].filter((s) => this.turns[s.id] === undefined || this.turns[s.id] < s.at)
  }

  /** Forget everything (the smoke check starts clean). */
  reset(): void {
    this.turns = {}
    this.stops = []
  }
}
