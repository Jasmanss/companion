import { describe, expect, it } from 'vitest'
import { rankCards, STALE_FINISHED_MS, statusCounts, type CardContext } from '../src/shared/cards'
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
    ])
    expect(show({ sessions: [session('needs-input')] })[0]).toBe('sessions:promoted!')
    expect(show({ reviews: 2, sessions: [session('finished')] })).toEqual(['review:promoted!', 'sessions:wide', 'leftoff:small', 'tray:small'])
    expect(show({ failed: true })[0]).toBe('failed:promoted!')
  })

  it('then finished sessions, but not one that finished more than a day ago', () => {
    expect(show({ sessions: [session('finished'), session('finished')] })).toEqual(['sessions:promoted', 'leftoff:small', 'tray:small'])
    expect(show({ sessions: [session('finished', STALE_FINISHED_MS + 1)] })).toEqual(['leftoff:promoted', 'sessions:wide', 'tray:small', 'try:wide'])
    // Working sessions are rows in the sessions card, not a reason to promote it.
    expect(show({ sessions: [session('working')] })[0]).toBe('leftoff:promoted')
  })

  it("then the day's first card: the night's report, or the morning brief (which already says where you left off)", () => {
    expect(show({ first: 'night' })).toEqual(['night:promoted', 'sessions:small', 'leftoff:small', 'tray:small'])
    expect(show({ first: 'brief' })).toEqual(['brief:promoted', 'sessions:small', 'tray:small'])
    expect(show({ first: 'brief', sessions: [session('finished')] })).toEqual(['sessions:promoted', 'brief:wide', 'tray:small'])
  })

  it('marks only what waits on you as urgent', () => {
    const urgent = (o: Partial<CardContext>) => rankCards(ctx(o)).filter((c) => c.urgent).map((c) => c.kind)
    expect(urgent({ sessions: [session('finished')], first: 'night', news: 2 })).toEqual([])
    expect(urgent({ reviews: 1, failed: true })).toEqual(['review', 'failed'])
  })

  it('shows notes, news and a full tray as wide cards, with nothing to promote when there is no project', () => {
    expect(show({ leftOff: false, notes: 1, news: 2, tray: 3 })).toEqual(['note:wide', 'sessions:small', 'news:wide', 'tray:wide', 'try:wide'])
  })

  it('offers things to try only in the empty state', () => {
    expect(show({}).at(-1)).toBe('try:wide')
    expect(show({ leftOff: false }).at(-1)).toBe('try:wide')
    expect(show({ reviews: 1 })).not.toContain('try:wide')
    expect(show({ sessions: [session('finished')] })).not.toContain('try:wide')
    expect(show({ first: 'brief' })).not.toContain('try:wide')
  })

  it('folds everything but the notes into the status bar while a chat goes on', () => {
    expect(show({ chatting: true })).toEqual([])
    expect(show({ chatting: true, reviews: 1, failed: true, sessions: [session('needs-approval')], tray: 3 })).toEqual([])
    expect(show({ chatting: true, reviews: 1, notes: 1 })).toEqual(['note:wide'])
  })

  it('opens above the thread what the status bar asks for, at full width', () => {
    const going = { chatting: true, reviews: 1, failed: true, sessions: [session('finished')], tray: 2 }
    expect(show({ ...going, unfolded: 'waiting' })).toEqual(['review:wide!', 'failed:wide!'])
    expect(show({ ...going, unfolded: 'sessions' })).toEqual(['sessions:wide'])
    expect(show({ ...going, unfolded: 'tray' })).toEqual(['tray:wide'])
    expect(show({ chatting: true, unfolded: 'tray' })).toEqual(['tray:wide'])
    expect(show({ chatting: true, unfolded: 'sessions' })).toEqual(['sessions:wide'])
    expect(show({ chatting: true, sessions: [session('needs-input')], unfolded: 'sessions' })).toEqual(['sessions:wide!'])
    expect(show({ chatting: true, sessions: [session('needs-input')], unfolded: 'waiting' })).toEqual(['sessions:wide!'])
  })
})

describe("the status bar's counts", () => {
  const counts = (o: Partial<Parameters<typeof statusCounts>[0]>) => statusCounts({ sessions: [], busy: false, approvals: 0, reviews: 0, failed: false, tray: 0, ...o })

  it('are all zero with nothing going on, a finished session being neither', () => {
    expect(counts({ sessions: [{ state: 'finished' }] })).toEqual({ working: 0, waiting: 0, images: 0 })
  })

  it('count the sessions working, and Steward itself while it works', () => {
    expect(counts({ sessions: [{ state: 'working' }, { state: 'working' }] }).working).toBe(2)
    expect(counts({ busy: true, sessions: [{ state: 'working' }] }).working).toBe(2)
  })

  it('count Steward as waiting, not working, while its Run card waits for you', () => {
    expect(counts({ busy: true, approvals: 1 })).toEqual({ working: 0, waiting: 1, images: 0 })
    expect(counts({ busy: true, approvals: 1, sessions: [{ state: 'working' }] }).working).toBe(1)
  })

  it('count everything that waits on you: sessions, Run cards, reviews and a failed build', () => {
    expect(counts({ sessions: [{ state: 'needs-approval' }, { state: 'needs-input' }], approvals: 1, reviews: 2, failed: true }).waiting).toBe(6)
  })

  it('count the images in the tray', () => {
    expect(counts({ tray: 4 }).images).toBe(4)
  })
})
