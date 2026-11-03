import { describe, expect, it } from 'vitest'
import { rankCards, STALE_FINISHED_MS, type CardContext } from '../src/shared/cards'
import type { SessionState } from '../src/shared/types'

const NOW = 10 * STALE_FINISHED_MS
const ctx = (o: Partial<CardContext>): CardContext => ({ sessions: [], reviews: 0, failed: false, news: 0, first: null, leftOff: true, tray: 0, notes: 0, chatting: false, now: NOW, ...o })
const session = (state: SessionState, agoMs = 60_000) => ({ state, updatedAt: NOW - agoMs })
/** The cards as "kind:size", "!" for urgent. */
const show = (o: Partial<CardContext>) => rankCards(ctx(o)).map((c) => `${c.kind}:${c.size}${c.urgent ? '!' : ''}`)

describe('the panel cards, one promoted', () => {
  it('promotes where you left off when nothing is going on, so there is always a first card', () => {
    expect(show({})).toEqual(['leftoff:promoted', 'sessions:small', 'tray:small', 'try:wide'])
  })

  it('promotes what waits on you first: a session waiting, then a review, then a failed build', () => {
    expect(show({ sessions: [session('needs-approval'), session('finished')], reviews: 1, failed: true })).toEqual([
      'sessions:promoted!',
      'review:wide!',
      'failed:wide!',
      'leftoff:small',
      'tray:small',
      'try:wide',
    ])
    expect(show({ sessions: [session('needs-input')] })[0]).toBe('sessions:promoted!')
    expect(show({ reviews: 2, sessions: [session('finished')] })).toEqual(['review:promoted!', 'sessions:wide', 'leftoff:small', 'tray:small', 'try:wide'])
    expect(show({ failed: true })[0]).toBe('failed:promoted!')
  })

  it('then finished sessions, but not one that finished more than a day ago', () => {
    expect(show({ sessions: [session('finished'), session('finished')] })).toEqual(['sessions:promoted', 'leftoff:small', 'tray:small', 'try:wide'])
    expect(show({ sessions: [session('finished', STALE_FINISHED_MS + 1)] })).toEqual(['leftoff:promoted', 'sessions:wide', 'tray:small', 'try:wide'])
    // Working sessions are rows in the sessions card, not a reason to promote it.
    expect(show({ sessions: [session('working')] })[0]).toBe('leftoff:promoted')
  })

  it("then the day's first card: the night's report, or the morning brief (which already says where you left off)", () => {
    expect(show({ first: 'night' })).toEqual(['night:promoted', 'sessions:small', 'leftoff:small', 'tray:small', 'try:wide'])
    expect(show({ first: 'brief' })).toEqual(['brief:promoted', 'sessions:small', 'tray:small', 'try:wide'])
    expect(show({ first: 'brief', sessions: [session('finished')] })).toEqual(['sessions:promoted', 'brief:wide', 'tray:small', 'try:wide'])
  })

  it('marks only what waits on you as urgent', () => {
    const urgent = (o: Partial<CardContext>) => rankCards(ctx(o)).filter((c) => c.urgent).map((c) => c.kind)
    expect(urgent({ sessions: [session('finished')], first: 'night', news: 2 })).toEqual([])
    expect(urgent({ reviews: 1, failed: true })).toEqual(['review', 'failed'])
  })

  it('shows notes, news and a full tray as wide cards, with nothing to promote when there is no project', () => {
    expect(show({ leftOff: false, notes: 1, news: 2, tray: 3 })).toEqual(['note:wide', 'sessions:small', 'news:wide', 'tray:wide', 'try:wide'])
  })

  it('keeps only what waits on you, and the notes, above a chat going on', () => {
    expect(show({ chatting: true })).toEqual([])
    expect(show({ chatting: true, reviews: 1, notes: 1, sessions: [session('finished')] })).toEqual(['review:promoted!', 'note:wide'])
  })
})
