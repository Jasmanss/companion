// Steward's reactions to the chats (docs/briefs/steward-reactions.md; design/pill/reactions.js is the working model):
// one mood for the whole face from everything going on. Things that need you outrank things that just happened, which
// outrank things that are only going on:
//
//   mad (a deploy just failed) · needs you (an approval) · confused (a chat asks you something) · celebrating (a deploy
//   or a merge) · proud, done, nod (a chat stopped, by how long its turn was) · hello (you're back) · worried (deploy
//   trouble) · juggling (two or more chats working) · focused (one working) · nothing (the panel decides: idle, resting)
//
// A one-shot (nod, done, proud, hello, a question) shows for its hold from when it happened. If something above it wins
// meanwhile, it isn't queued: once its hold is over it's gone. Pure, so it's tested without sessions running.
//
// What the signals can't tell: a stop means Claude stopped replying, not that it worked; a long turn isn't a better
// one; a question is read from the wording of the last reply; and a chat working looks the same whether it's thinking,
// running a long command or stuck.
import type { Mood, SessionView } from '../shared/types'
import { TURN_GIVE_UP_MS, type Turns } from './island-status'
import type { StopSeen } from './session-activity'

/** A turn under this long ends in a nod; this long or more, proud; in between, the usual done. */
export const NOD_UNDER_MS = 15_000
export const PROUD_FROM_MS = 300_000
/** How long each one-shot shows, from when it happened. */
export const HOLD_MS = { nod: 2_500, done: 5_000, proud: 7_000, asked: 10_000, hello: 3_000 } as const
/** Away from the Mac this long, coming back gets a hello. */
export const BACK_AFTER_S = 600

export type Tier = 'nod' | 'done' | 'proud'
/** How a finished turn is greeted, by its length. Without the turn-start hook the length is unknown: the usual done. */
export const turnTier = (turnMs: number | null): Tier => (turnMs === null ? 'done' : turnMs < NOD_UNDER_MS ? 'nod' : turnMs >= PROUD_FROM_MS ? 'proud' : 'done')

export interface ReactionInput {
  /** What deploys and merges call for (MoodBoard): mad, celebrating or worried. */
  event: Mood | null
  sessions: SessionView[]
  /** The turns going on, and each chat's newest stop (SessionActivity). */
  turns: Turns
  stops: StopSeen[]
  /** Steward's own agent waits for your OK to run a command. */
  agentWaiting: boolean
  /** When you came back to the Mac after a while away, if you did. */
  backAt: number | null
  now: number
}

export interface Reaction {
  /** null: nothing from the chats; the panel picks idle, resting or sleepy. */
  mood: Mood | null
  /** Why, for the smoke check and for anyone reading the logs. */
  why: string
}

export function pickReaction(o: ReactionInput): Reaction {
  const within = (at: number, hold: number) => o.now - at < hold
  if (o.event === 'mad') return { mood: 'mad', why: 'a deploy just failed' }
  if (o.agentWaiting || o.sessions.some((s) => s.state === 'needs-approval')) return { mood: 'needs-you', why: 'a chat waits for your OK' }
  if (o.sessions.some((s) => s.state === 'needs-input')) return { mood: 'confused', why: 'a chat waits for your input' }
  if (o.stops.some((s) => s.asked && within(s.at, HOLD_MS.asked))) return { mood: 'confused', why: 'a chat stopped with a question' }
  if (o.event === 'celebrating') return { mood: 'celebrating', why: 'a deploy went live or a PR merged' }
  for (const tier of ['proud', 'done', 'nod'] as const)
    if (o.stops.some((s) => !s.asked && turnTier(s.turnMs) === tier && within(s.at, HOLD_MS[tier]))) return { mood: tier, why: `a chat stopped (${tier})` }
  if (o.backAt !== null && within(o.backAt, HOLD_MS.hello)) return { mood: 'hello', why: "you're back at the Mac" }
  if (o.event === 'worried') return { mood: 'worried', why: 'deploy trouble is still open' }
  const working = Object.values(o.turns).filter((at) => o.now - at < TURN_GIVE_UP_MS).length
  if (working >= 2) return { mood: 'juggling', why: `${working} chats are working` }
  if (working === 1) return { mood: 'focused', why: 'a chat is working' }
  return { mood: null, why: 'nothing going on' }
}

/** When a one-shot's hold ends next (so the face is worked out again then), or null. */
export function nextReactionChange(o: ReactionInput): number | null {
  const ends = [...o.stops.map((s) => s.at + (s.asked ? HOLD_MS.asked : HOLD_MS[turnTier(s.turnMs)])), ...(o.backAt !== null ? [o.backAt + HOLD_MS.hello] : [])].filter((t) => t > o.now)
  return ends.length ? Math.min(...ends) : null
}

/** For the notch island's right side: a chat stopped a moment ago asking you something (a "?"), or after a long turn (a spark). */
export function recentStops(stops: StopSeen[], now: number): { asked: boolean; proud: boolean } {
  return {
    asked: stops.some((s) => s.asked && now - s.at < HOLD_MS.asked),
    proud: stops.some((s) => !s.asked && turnTier(s.turnMs) === 'proud' && now - s.at < HOLD_MS.proud),
  }
}

/** The Mac's idle time went from a long while to less: you're back. Seconds, as powerMonitor gives them. */
export const cameBack = (beforeS: number | null, nowS: number): boolean => beforeS !== null && beforeS >= BACK_AFTER_S && nowS < beforeS

/** How often to look at the idle time: every second once a return would count, otherwise every 15 seconds. */
export const idleLookMs = (idleS: number): number => (idleS >= BACK_AFTER_S - 20 ? 1_000 : 15_000)
