// The panel's home as cards, one promoted (design/main-chat.html, Direction F, "Cards, one promoted"; the brief
// docs/briefs/main-chat-redesign.md, Phase M2). Every block is the same tile. The most important one grows to full
// width, moves to the top and gets an accent border; the rest stay small, in a fixed order below. Pure, so the rule is
// tested without the panel.
//
// The rank: waiting on you first (a session waiting for your OK or your input, a review, a failed build), then
// sessions that finished (within a day: an old one drops below where you left off), then the day's first card (the
// night's report, or the morning brief), then where you left off. The first of those that exists is promoted, so
// there's always one clear thing first. Only the waiting-on-you ones are marked urgent (the orange border and label):
// a promoted card is not always urgent.
import type { SessionView } from './types'

/**
 * sessions: Claude Code sessions (waiting ones and finished ones). review: Visual Review's card. failed: a build that
 * failed. news: other alerts that waited for the panel (a deploy, a merge). brief and night: the day's first card.
 * leftoff: where you left off. tray: the image tray. try: things to ask (with no chat going). note: one-time notes.
 */
export type CardKind = 'sessions' | 'review' | 'failed' | 'news' | 'brief' | 'night' | 'leftoff' | 'tray' | 'try' | 'note'
/** promoted: full width, first, with its heading and actions. wide: full width. small: half. */
export type CardSize = 'promoted' | 'wide' | 'small'

export interface Card {
  kind: CardKind
  size: CardSize
  /** Waiting on you: the orange border and "Waiting on you" label. */
  urgent: boolean
}

/** A session that finished longer ago than this isn't promoted over where you left off. */
export const STALE_FINISHED_MS = 24 * 60 * 60 * 1000

export interface CardContext {
  sessions: Pick<SessionView, 'state' | 'updatedAt'>[]
  /** Reviews waiting for a decision (not put off for later). */
  reviews: number
  /** A failed build's alert is waiting. */
  failed: boolean
  /** Other alerts that waited for the panel. */
  news: number
  /** The day's first card: the night's report, the morning brief, or neither. */
  first: 'night' | 'brief' | null
  /** Where you left off is known for the current project (and Notifications shows it). */
  leftOff: boolean
  /** Images in the tray. */
  tray: number
  /** One-time notes showing (how to bring Steward back, a review decided, no API key). */
  notes: number
  /** A chat is going: only what's waiting on you (and notes) stays above it. */
  chatting: boolean
  now: number
}

export function rankCards(c: CardContext): Card[] {
  const waiting = c.sessions.some((s) => s.state === 'needs-approval' || s.state === 'needs-input')
  const finished = c.sessions.some((s) => s.state === 'finished' && c.now - s.updatedAt < STALE_FINISHED_MS)
  // The brief already says where you left off, so that card waits while the brief shows.
  const leftOff = c.leftOff && c.first !== 'brief'
  const ranked: Card[] = [
    ...(waiting ? [card('sessions', true)] : []),
    ...(c.reviews > 0 ? [card('review', true)] : []),
    ...(c.failed ? [card('failed', true)] : []),
    ...(finished && !waiting ? [card('sessions')] : []),
    ...(c.first ? [card(c.first)] : []),
    ...(leftOff ? [card('leftoff')] : []),
  ]
  const top = ranked[0]
  const has = (kind: CardKind) => top?.kind === kind
  const rest: Card[] = [
    ...(c.notes > 0 ? [card('note', false, 'wide')] : []),
    ...ranked.filter((r) => r.urgent && r !== top).map((r) => ({ ...r, size: 'wide' as const })),
    ...(has('sessions') || waiting ? [] : [card('sessions', false, c.sessions.length > 0 ? 'wide' : 'small')]),
    ...(c.news > 0 ? [card('news', false, 'wide')] : []),
    ...(c.first && !has(c.first) ? [card(c.first, false, 'wide')] : []),
    ...(leftOff && !has('leftoff') ? [card('leftoff', false, 'small')] : []),
    card('tray', false, c.tray > 0 ? 'wide' : 'small'),
    ...(c.chatting ? [] : [card('try', false, 'wide')]),
  ]
  const all = top ? [{ ...top, size: 'promoted' as const }, ...rest] : rest
  // A chat going: the cards fold away (the status bar is Phase M3), but what's waiting on you and the notes stay.
  return c.chatting ? all.filter((x) => x.urgent || x.kind === 'note') : all
}

const card = (kind: CardKind, urgent = false, size: CardSize = 'wide'): Card => ({ kind, size, urgent })
