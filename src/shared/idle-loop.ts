// Steward's idle loop (docs/briefs/steward-reactions.md, Phase R2; design/pill/reactions.js is the working model).
// While nothing is going on, the eyes already blink, glance and follow the cursor on their own (pill/eyes). On top of
// that, now and then, one small move: ponder, look around or a small smile, and rarely a yawn or a stretch. It's meant
// to be calm and never distracting:
//
//   - only on the calm faces (idle in the panel, resting at the edge or the notch): never while a chat works, a reaction
//     plays, an alert is out, you type, or late at night;
//   - nothing in the 20 seconds after anything happened, then one move every 10 to 25 seconds, never the same twice in
//     a row; the big ones (yawn, stretch) only after 2 quiet minutes and at most one every 4 minutes;
//   - after 5 quiet minutes it dozes: no more moves until something happens;
//   - none while the eyes are dimmed, with Reduce Motion, or unless Settings → Steward → Liveliness is Calm.
//
// Each move is a mood of its own for its few seconds; only the face moves (the island and the panel never change for
// one). Pure, with the clock and the random given, so the rules are tested without waiting.
import type { Mood } from './types'

export type Liveliness = 'calm' | 'quiet' | 'off'
export type IdleMove = 'ponder' | 'lookaround' | 'smile' | 'yawn' | 'stretch' | 'slowblink'
/** Where the face is: the Pill in the panel's header, or at rest (the tab at the edge, the notch). */
export type IdleSpot = 'panel' | 'peek'

interface MoveSpec {
  id: IdleMove
  /** How likely, against the others. */
  weight: number
  ms: number
  /** Needs 2 quiet minutes, and at most one big move every 4 minutes. */
  big: boolean
  /** At rest it plays as this instead: the yawn needs a mouth and room, so there it's one slow, long blink. */
  peekAs?: IdleMove
}

export const IDLE_MOVES: readonly MoveSpec[] = [
  { id: 'lookaround', weight: 4, ms: 2_400, big: false },
  { id: 'smile', weight: 3, ms: 1_600, big: false },
  { id: 'ponder', weight: 4, ms: 2_400, big: false },
  { id: 'yawn', weight: 2, ms: 2_600, big: true, peekAs: 'slowblink' },
  { id: 'stretch', weight: 2, ms: 1_800, big: true },
]
const MS: Record<IdleMove, number> = { ...(Object.fromEntries(IDLE_MOVES.map((m) => [m.id, m.ms])) as Record<IdleMove, number>), slowblink: 1_600 }

/** Nothing in this long after anything happened. */
export const FIRST_QUIET_MS = 20_000
/** Between one move's end and the next one's start, at random. */
export const GAP_MS: readonly [number, number] = [10_000, 25_000]
/** The yawn and the stretch: only after this long quiet, and at most one of them this often. */
export const BIG_AFTER_MS = 120_000
export const BIG_EVERY_MS = 240_000
/** Quiet this long, it dozes off: no more moves until something happens. */
export const DOZE_AFTER_MS = 300_000

/** The faces the loop plays on: nothing going on, in the panel (idle) or tucked away (resting). */
const CALM: ReadonlySet<Mood> = new Set(['idle', 'resting'])
const MOVES: ReadonlySet<Mood> = new Set<IdleMove>([...IDLE_MOVES.map((m) => m.id), 'slowblink'])
export const isIdleMove = (mood: Mood): mood is IdleMove => MOVES.has(mood)

/** At rest (the tab, the notch) a yawn is a slow blink: no room for a mouth. The notch shows it so whatever the panel picked. */
export const atRest = (mood: Mood): Mood => (mood === 'yawn' ? 'slowblink' : mood)

/**
 * For a face that's sent the moves rather than picking them (the notch): whether the move in `mood` plays there. One
 * plays only if it arrives while the eyes are free for it, and stops for good once they aren't (it never starts halfway).
 */
export const movePlays = (before: { mood: Mood; plays: boolean }, mood: Mood, free: boolean): boolean => (before.mood !== mood ? isIdleMove(mood) && free : before.plays && free)

export interface IdleState {
  /** When the quiet these moves belong to began: a new quiet starts over with its own first wait. */
  quietSince: number | null
  last: IdleMove | null
  lastBigAt: number | null
  /** When the next move may start. */
  nextAt: number
}
export const IDLE_START: IdleState = { quietSince: null, last: null, lastBigAt: null, nextAt: 0 }

export interface IdleInput {
  liveliness: Liveliness
  /** The face without the loop's moves. */
  mood: Mood
  spot: IdleSpot
  reduced: boolean
  /** The eyes are dimmed (Dim when idle), or the cursor is on them: they're busy following it. */
  dimmed: boolean
  /** An alert is out (peeking at the edge, or a note in the island). */
  alertOut: boolean
  /** When the face (or an alert) last changed: anything happening starts the quiet over. */
  quietSince: number
}

export interface IdleStep {
  /** The move to play now, until `until`, or null. */
  move: IdleMove | null
  until: number | null
  /** When to look again (after this move, the next move's time), or null: nothing until the input changes. */
  at: number | null
  state: IdleState
}

/** What the idle loop does at `now` (ms). rand gives 0 to 1. */
export function idleStep(s: IdleState, now: number, rand: () => number, o: IdleInput): IdleStep {
  const none = (state: IdleState, at: number | null = null): IdleStep => ({ move: null, until: null, at, state })
  if (o.liveliness !== 'calm' || o.reduced || o.dimmed || o.alertOut || !CALM.has(o.mood)) return none(s)
  // A new quiet: the first move waits the 20 seconds, and then a gap's worth at random, so it isn't on the dot.
  const state = s.quietSince === o.quietSince ? { ...s } : { ...s, quietSince: o.quietSince, nextAt: o.quietSince + FIRST_QUIET_MS + rand() * (GAP_MS[1] - GAP_MS[0]) }
  const quiet = now - o.quietSince
  if (quiet >= DOZE_AFTER_MS) return none(state)
  if (now < state.nextAt) return none(state, state.nextAt)
  const bigOk = quiet >= BIG_AFTER_MS && (state.lastBigAt === null || now - state.lastBigAt >= BIG_EVERY_MS)
  const pool = IDLE_MOVES.filter((m) => m.id !== state.last && (!m.big || bigOk))
  let r = rand() * pool.reduce((sum, m) => sum + m.weight, 0)
  const pick = pool.find((m) => (r -= m.weight) <= 0) ?? pool[pool.length - 1]
  const move = o.spot === 'peek' && pick.peekAs ? pick.peekAs : pick.id
  const until = now + MS[move]
  state.last = pick.id
  if (pick.big) state.lastBigAt = now
  state.nextAt = until + GAP_MS[0] + rand() * (GAP_MS[1] - GAP_MS[0])
  return { move, until, at: state.nextAt, state }
}
