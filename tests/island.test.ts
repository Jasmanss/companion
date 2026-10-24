import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HookPayload } from '../src/main/hook-payload'
import { FINISHED_SHOW_MS, hookNote, IslandNotes, islandStatus, nextChange, NOTE_AFTER_HOVER_MS, NOTE_SHOW_MS, noteTurn, TURN_GIVE_UP_MS, type IslandInput } from '../src/main/island-status'
import { inBoxes, islandBoxes, islandLevel, islandParts, ISLAND_HOVER, ISLAND_NOTE_LINE, ISLAND_SIDE, ISLAND_WINDOW, NOTCH_LIP, NOTCH_WINDOW, PEEK_SCALE, PEEK_SIZE } from '../src/shared/notch'
import type { IslandNote, SessionState, SessionView } from '../src/shared/types'

/** The 14-inch MacBook Pro's notch. */
const NOTCH = { width: 185, height: 32 }
const HW = NOTCH.width / 2
/** How far Steward's Pill reaches from its center, at the notch's scale. */
const PILL_HALF = (PEEK_SIZE.width * PEEK_SCALE) / 2

describe('the island shape', () => {
  it('is just the notch at rest and asleep, and the compact island reaches 70 points past it on each side', () => {
    expect(islandParts('rest', NOTCH)).toMatchObject({ width: 185, height: 32, right: null })
    expect(islandParts('asleep', NOTCH)).toMatchObject({ width: 185, height: 32, right: null })
    const compact = islandParts('compact', NOTCH)
    expect(compact).toMatchObject({ width: 185 + 2 * ISLAND_SIDE, height: 32 })
    // About the design's 324 points, and it fits the notch window.
    expect(Math.abs(compact.width - 324)).toBeLessThanOrEqual(1)
    expect(islandParts('compact', NOTCH, true).width).toBeLessThan(NOTCH_WINDOW.width)
  })

  it('grows a little wider with the cursor on it, the status moving out with it', () => {
    const at = islandParts('compact', NOTCH)
    const hovered = islandParts('compact', NOTCH, true)
    expect(hovered.width - at.width).toBe(ISLAND_HOVER)
    expect(hovered.right!.x - at.right!.x).toBe(ISLAND_HOVER / 2)
    // Hovering doesn't grow anything at rest: Steward leans out instead.
    expect(islandParts('rest', NOTCH, true).width).toBe(185)
  })

  it('hides Steward fully behind the notch asleep, and shows part of it past the left edge at rest', () => {
    const asleep = islandParts('asleep', NOTCH).pill
    expect(asleep.x - PILL_HALF).toBeGreaterThan(-HW)
    for (const hover of [false, true]) {
      const { x } = islandParts('rest', NOTCH, hover).pill
      // Its left part out past the notch, the rest behind it.
      expect(x - PILL_HALF).toBeLessThan(-HW)
      expect(x + PILL_HALF).toBeGreaterThan(-HW)
    }
    // Leaning out with the cursor on it: further out, and tilted more.
    expect(islandParts('rest', NOTCH, true).pill.x).toBeLessThan(islandParts('rest', NOTCH).pill.x)
    expect(islandParts('rest', NOTCH, true).pill.rotate).toBeLessThan(islandParts('rest', NOTCH).pill.rotate)
  })

  it('puts Steward inside the compact island on the left, and the status inside it on the right', () => {
    const p = islandParts('compact', NOTCH)
    expect(p.pill.x - PILL_HALF).toBeGreaterThanOrEqual(-p.width / 2)
    expect(p.pill.x + PILL_HALF).toBeLessThanOrEqual(-HW)
    expect(p.right!.x).toBeGreaterThan(HW)
    expect(p.right!.x).toBeLessThan(p.width / 2)
    expect(p.pill.rotate).toBe(0)
  })

  it('grows into the note size for a short message: about 380 by 60, Steward and the status where compact has them', () => {
    const note = islandParts('note', NOTCH)
    const compact = islandParts('compact', NOTCH)
    expect(Math.abs(note.width - 380)).toBeLessThanOrEqual(1)
    expect(note.height).toBe(32 + ISLAND_NOTE_LINE)
    expect(Math.abs(note.height - 60)).toBeLessThanOrEqual(1)
    expect(note.width).toBeGreaterThan(islandParts('compact', NOTCH, true).width)
    expect(note.pill).toEqual(compact.pill)
    expect(note.right).toEqual(compact.right)
    // Hovering keeps it as it is: it doesn't widen again.
    expect(islandParts('note', NOTCH, true)).toEqual(note)
  })

  it("fits the island's window with room for the springs' overshoot, and takes clicks on the line under the notch", () => {
    const note = islandParts('note', NOTCH)
    expect(note.width * 1.1).toBeLessThan(ISLAND_WINDOW.width)
    expect(note.height * 1.1).toBeLessThan(ISLAND_WINDOW.height)
    const layout = { cx: ISLAND_WINDOW.width / 2, ...NOTCH }
    const boxes = islandBoxes(note, 'note', layout)
    expect(inBoxes({ x: layout.cx, y: 32 + 20 }, boxes)).toBe(true)
    expect(inBoxes({ x: layout.cx + 185, y: 10 }, boxes)).toBe(true)
    expect(inBoxes({ x: layout.cx + 200, y: 10 }, boxes)).toBe(false)
    expect(inBoxes({ x: layout.cx, y: 32 + 20 }, islandBoxes(islandParts('compact', NOTCH), 'compact', layout))).toBe(false)
  })

  it('is the chin while an alert is out under the notch, so the alert still joins it', () => {
    expect(islandLevel({ awake: true, nudge: true, right: 'working' })).toBe('chin')
    expect(islandLevel({ awake: true, nudge: true, right: 'working', note: true })).toBe('chin')
    expect(islandParts('chin', NOTCH)).toMatchObject({ width: 185, height: 32 + NOTCH_LIP, right: null })
  })

  it('picks the level from what is going on', () => {
    expect(islandLevel({ awake: false, nudge: false, right: 'working' })).toBe('asleep')
    expect(islandLevel({ awake: true, nudge: false, right: null })).toBe('rest')
    expect(islandLevel({ awake: true, nudge: false, right: 'needs' })).toBe('compact')
    expect(islandLevel({ awake: true, nudge: false, right: 'working', note: true })).toBe('note')
    // Asleep, or nothing going on, there's no note to show.
    expect(islandLevel({ awake: false, nudge: false, right: 'working', note: true })).toBe('asleep')
    expect(islandLevel({ awake: true, nudge: false, right: null, note: true })).toBe('rest')
  })

  it('takes clicks on the black and on Steward, not on the menu bar beside them', () => {
    const layout = { cx: 180, ...NOTCH }
    const rest = islandBoxes(islandParts('rest', NOTCH), 'rest', layout)
    expect(inBoxes({ x: 180, y: 10 }, rest)).toBe(true)
    expect(inBoxes({ x: 180 - 100, y: 16 }, rest)).toBe(true)
    expect(inBoxes({ x: 180 + 120, y: 16 }, rest)).toBe(false)
    const compact = islandBoxes(islandParts('compact', NOTCH), 'compact', layout)
    expect(inBoxes({ x: 180 + 150, y: 16 }, compact)).toBe(true)
    expect(inBoxes({ x: 180 + 170, y: 16 }, compact)).toBe(false)
    // Asleep it's only the notch, so what's under the menu bar beside it stays clickable.
    expect(inBoxes({ x: 180 - 100, y: 16 }, islandBoxes(islandParts('asleep', NOTCH), 'asleep', layout))).toBe(false)
  })
})

describe('what the island shows', () => {
  const session = (id: string, state: SessionState, updatedAt = 0): SessionView => ({ id, name: id, projectPath: null, cwd: `/p/${id}`, state, updatedAt })
  const input = (o: Partial<IslandInput>): IslandInput => ({ sessions: [], turns: {}, agentBusy: false, agentWaiting: false, reviews: 0, now: 100_000, ...o })
  const hook = (hook_event_name: 'UserPromptSubmit' | 'Stop', session_id: string, extra = {}) => ({ hook_event_name, session_id, cwd: '/p', ...extra }) as HookPayload

  it('shows nothing when nothing is going on', () => {
    expect(islandStatus(input({}))).toEqual({ right: null })
  })

  it('shows a spinner and the time while Claude works, from when the turn began', () => {
    expect(islandStatus(input({ turns: { a: 40_000 } }))).toEqual({ right: 'working', since: 40_000 })
    expect(islandStatus(input({ agentBusy: true, agentSince: 90_000 }))).toEqual({ right: 'working', since: 90_000 })
  })

  it('shows two at once with a count, and the longest-running time', () => {
    expect(islandStatus(input({ turns: { a: 40_000, b: 70_000 } }))).toEqual({ right: 'two', count: 2, since: 40_000 })
    expect(islandStatus(input({ turns: { a: 40_000 }, agentBusy: true, agentSince: 90_000 }))).toEqual({ right: 'two', count: 2, since: 40_000 })
  })

  it('puts what needs you first, then a review', () => {
    expect(islandStatus(input({ turns: { a: 1, b: 2 }, sessions: [session('c', 'needs-approval')], reviews: 1 })).right).toBe('needs')
    expect(islandStatus(input({ agentWaiting: true })).right).toBe('needs')
    expect(islandStatus(input({ sessions: [session('c', 'needs-input')] })).right).toBe('needs')
    expect(islandStatus(input({ turns: { a: 1, b: 2 }, reviews: 2 })).right).toBe('review')
  })

  it('shows a check for a while after a session finished, then nothing', () => {
    const done = [session('a', 'finished', 95_000)]
    expect(islandStatus(input({ sessions: done })).right).toBe('finished')
    expect(nextChange(input({ sessions: done }))).toBe(95_000 + FINISHED_SHOW_MS)
    expect(islandStatus(input({ sessions: done, now: 95_000 + FINISHED_SHOW_MS })).right).toBeNull()
    expect(nextChange(input({ sessions: done, now: 95_000 + FINISHED_SHOW_MS }))).toBeNull()
  })

  it('keeps a turn from the prompt until Claude really stops, and gives up on one that never stops', () => {
    let turns = noteTurn({}, hook('UserPromptSubmit', 'a'), 10)
    turns = noteTurn(turns, hook('UserPromptSubmit', 'a'), 20)
    expect(turns).toEqual({ a: 10 })
    // A Stop hook asked Claude to keep going: still the same turn.
    expect(noteTurn(turns, hook('Stop', 'a', { stop_hook_active: true }), 30)).toEqual({ a: 10 })
    expect(noteTurn(turns, hook('Stop', 'a'), 30)).toEqual({})
    expect(islandStatus(input({ turns: { a: 0 }, now: TURN_GIVE_UP_MS + 1 })).right).toBeNull()
  })
})

describe('the note', () => {
  const hook = (hook_event_name: 'UserPromptSubmit' | 'Stop', session_id: string, extra = {}) => ({ hook_event_name, session_id, cwd: '/p', ...extra }) as HookPayload
  const at = { agentBusy: false, name: 'haven', now: 100_000 }

  it('says a session finished, with the last thing Claude said', () => {
    expect(hookNote(hook('Stop', 'a'), { ...at, turns: { a: 1 }, detail: 'I made the button blue.' })).toEqual({ kind: 'finished', name: 'haven', text: 'finished · I made the button blue.', at: 100_000 })
    expect(hookNote(hook('Stop', 'a'), { ...at, turns: {} })?.text).toBe('finished')
    // A Stop hook asked Claude to keep going: not finished yet.
    expect(hookNote(hook('Stop', 'a', { stop_hook_active: true }), { ...at, turns: { a: 1 } })).toBeNull()
  })

  it('says a second project started while another works, and nothing for the first one', () => {
    expect(hookNote(hook('UserPromptSubmit', 'b'), { ...at, turns: { a: 90_000 } })).toEqual({ kind: 'started', name: 'haven', text: 'started', at: 100_000 })
    expect(hookNote(hook('UserPromptSubmit', 'b'), { ...at, turns: {}, agentBusy: true })?.kind).toBe('started')
    expect(hookNote(hook('UserPromptSubmit', 'a'), { ...at, turns: {} })).toBeNull()
    // The same turn going on, or the only other one long given up on: no news.
    expect(hookNote(hook('UserPromptSubmit', 'a'), { ...at, turns: { a: 90_000, b: 95_000 } })).toBeNull()
    expect(hookNote(hook('UserPromptSubmit', 'b'), { ...at, turns: { a: 100_000 - TURN_GIVE_UP_MS } })).toBeNull()
  })

  it('shows with the status, and not with nothing going on', () => {
    const note: IslandNote = { kind: 'finished', name: 'haven', text: 'Claude finished', at: 1 }
    const input = (o: Partial<IslandInput>): IslandInput => ({ sessions: [], turns: {}, agentBusy: false, agentWaiting: false, reviews: 0, now: 100_000, ...o })
    expect(islandStatus(input({ turns: { a: 1 }, note }))).toEqual({ right: 'working', since: 1, note })
    expect(islandStatus(input({ note }))).toEqual({ right: null })
  })

  describe('settling', () => {
    beforeEach(() => vi.useFakeTimers())
    afterEach(() => vi.useRealTimers())
    const note: IslandNote = { kind: 'started', name: 'api', text: 'started', at: 1 }

    it('settles after a few seconds', () => {
      const changed = vi.fn()
      const notes = new IslandNotes({ changed })
      notes.show(note)
      expect(notes.current).toEqual(note)
      vi.advanceTimersByTime(NOTE_SHOW_MS - 1)
      expect(notes.current).toEqual(note)
      vi.advanceTimersByTime(1)
      expect(notes.current).toBeNull()
      expect(changed).toHaveBeenCalledTimes(2)
    })

    it('stays while the cursor is on the island, and a moment longer once it leaves', () => {
      const notes = new IslandNotes({ changed: () => {} })
      notes.show(note)
      notes.hover(true)
      vi.advanceTimersByTime(NOTE_SHOW_MS * 3)
      expect(notes.current).toEqual(note)
      notes.hover(false)
      vi.advanceTimersByTime(NOTE_AFTER_HOVER_MS - 1)
      expect(notes.current).toEqual(note)
      vi.advanceTimersByTime(1)
      expect(notes.current).toBeNull()
    })

    it('keeps its own time when the cursor only passes over it early on', () => {
      const notes = new IslandNotes({ changed: () => {} })
      notes.show(note)
      vi.advanceTimersByTime(500)
      notes.hover(true)
      notes.hover(false)
      vi.advanceTimersByTime(NOTE_SHOW_MS - 501)
      expect(notes.current).toEqual(note)
      vi.advanceTimersByTime(1)
      expect(notes.current).toBeNull()
    })

    it('gives a new note its own time, and drops a finished note when a new turn starts', () => {
      const notes = new IslandNotes({ changed: () => {} })
      notes.show(note)
      vi.advanceTimersByTime(NOTE_SHOW_MS - 100)
      const finished: IslandNote = { kind: 'finished', name: 'haven', text: 'Claude finished', at: 2 }
      notes.show(finished)
      vi.advanceTimersByTime(NOTE_SHOW_MS - 1)
      expect(notes.current).toEqual(finished)
      notes.drop('started')
      expect(notes.current).toEqual(finished)
      notes.drop('finished')
      expect(notes.current).toBeNull()
    })
  })
})
