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
//
// With a chat going, the cards fold into the status bar's one line of counts (statusCounts): what you open from it comes
// back above the thread, and so do one-time notes.
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

/** What the status bar opens above the thread: what waits on you, the sessions, or the tray. */
export type Unfolded = 'waiting' | 'sessions' | 'tray'

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
  /** A chat is going: the cards fold into the status bar. Only notes stay above it, and what the bar opened. */
  chatting: boolean
  unfolded?: Unfolded | null
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
    // Things to ask are for when nothing else is calling: the empty state, by the box.
    ...(c.chatting || (top && top.kind !== 'leftoff') ? [] : [card('try', false, 'wide')]),
  ]
  const all = top ? [{ ...top, size: 'promoted' as const }, ...rest] : rest
  if (!c.chatting) return all
  // Above a thread nothing is promoted or half width: it's the chat's place.
  return all.filter((x) => x.kind === 'note' || (c.unfolded === 'waiting' && x.urgent) || x.kind === c.unfolded).map((x) => ({ ...x, size: 'wide' as const }))
}

export interface StatusCounts {
  working: number
  waiting: number
  images: number
}

/**
 * The status bar's counts. Working: sessions working, and Steward's own chat while it works (not while it waits for your
 * Run: that's waiting). Waiting: sessions waiting for you, Run cards in the thread, reviews, a failed build.
 */
export function statusCounts(c: { sessions: Pick<SessionView, 'state'>[]; busy: boolean; approvals: number; reviews: number; failed: boolean; tray: number }): StatusCounts {
  const sessions = (...states: SessionView['state'][]) => c.sessions.filter((s) => states.includes(s.state)).length
  return {
    working: sessions('working') + (c.busy && c.approvals === 0 ? 1 : 0),
    waiting: sessions('needs-approval', 'needs-input') + c.approvals + c.reviews + (c.failed ? 1 : 0),
    images: c.tray,
  }
}

const card = (kind: CardKind, urgent = false, size: CardSize = 'wide'): Card => ({ kind, size, urgent })
