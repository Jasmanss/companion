import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { HookPayload } from '../src/main/hook-payload'
import { alertKind, alertNote, BIG_NOTE_MS, FINISHED_SHOW_MS, hookNote, IslandNotes, islandStatus, LONG_NOTE_MS, nextChange, NOTE_AFTER_HOVER_MS, NOTE_SHOW_MS, noteShowMs, noteSize, noteTurn, TURN_GIVE_UP_MS, type IslandInput } from '../src/main/island-status'
import { fadesFor, fitNote, inBoxes, islandBoxes, islandLevel, islandParts, ISLAND_AVATAR_IN, ISLAND_HOVER, ISLAND_LONG_LINES, ISLAND_NOTE_LINE, ISLAND_SIDE, ISLAND_WINDOW, joins, linesFor, NOTCH_LIP, NOTCH_WINDOW, PEEK_SCALE, PEEK_SIZE } from '../src/shared/notch'
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
    // Asleep, there's no note to show. With nothing else going on, a message still shows (good news, the catch-all).
    expect(islandLevel({ awake: false, nudge: false, right: 'working', note: true })).toBe('asleep')
    expect(islandLevel({ awake: true, nudge: false, right: null, note: true })).toBe('note')
    expect(islandLevel({ awake: true, nudge: false, right: null, note: 'long' })).toBe('long')
    expect(islandLevel({ awake: true, nudge: false, right: 'needs', note: 'approval' })).toBe('approval')
    expect(islandLevel({ awake: true, nudge: false, right: 'review', note: 'review' })).toBe('review')
    // The panel open at the side shows what's going on: the island steps back to Steward peeking, looking at it.
    expect(islandLevel({ awake: true, nudge: false, right: 'working', note: true, open: true })).toBe('rest')
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
    // A chat asking you something is a "?", below an approval.
    expect(islandStatus(input({ sessions: [session('c', 'needs-input')] })).right).toBe('asks')
    expect(islandStatus(input({ sessions: [session('c', 'needs-input'), session('d', 'needs-approval')] })).right).toBe('needs')
    expect(islandStatus(input({ turns: { a: 1 }, asked: true })).right).toBe('asks')
    expect(islandStatus(input({ turns: { a: 1, b: 2 }, reviews: 2 })).right).toBe('review')
  })

  it('shows a check for a while after a session finished, then nothing', () => {
    const done = [session('a', 'finished', 95_000)]
    expect(islandStatus(input({ sessions: done })).right).toBe('finished')
    // After a long turn, Steward is proud: a spark pops once by the check.
    expect(islandStatus(input({ sessions: done, proud: true }))).toEqual({ right: 'finished', spark: true })
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

  it("shows with the work's status; an alert's message shows on its own", () => {
    const note: IslandNote = { kind: 'finished', name: 'haven', text: 'Claude finished', at: 1 }
    const input = (o: Partial<IslandInput>): IslandInput => ({ sessions: [], turns: {}, agentBusy: false, agentWaiting: false, reviews: 0, now: 100_000, ...o })
    expect(islandStatus(input({ turns: { a: 1 }, note }))).toEqual({ right: 'working', since: 1, note })
    expect(islandStatus(input({ note }))).toEqual({ right: null })
    const alert: IslandNote = { kind: 'alert', name: 'Something new', text: '', at: 3 }
    expect(islandStatus(input({ note: alert }))).toEqual({ right: null, note: alert })
    // Good news has no status of its own: a spark while its note shows.
    const good: IslandNote = { kind: 'good', name: 'haven deployed', text: 'haven.vercel.app', at: 2 }
    expect(islandStatus(input({ note: good }))).toEqual({ right: 'good', note: good })
    expect(islandStatus(input({ note: good, turns: { a: 1 } })).right).toBe('working')
  })

  it('is the catch-all for an alert with no size of its own: its title and one line', () => {
    const note = alertNote({ key: 'something-new:1', title: 'Something new', detail: 'with a line' }, 5)
    expect(note).toEqual({ kind: 'alert', name: 'Something new', text: 'with a line', at: 5, key: 'something-new:1' })
    expect(alertNote({ key: 'x', title: 'Something new' }, 6).text).toBe('')
    expect(noteSize(note)).toBe('note')
    expect(noteShowMs(note)).toBe(NOTE_SHOW_MS)
  })

  it('opens every kind of alert as one of the island sizes', () => {
    const size = (key: string) => noteSize(alertNote({ key, title: 't' }, 1))
    expect(alertKind('approval:s1:p:npm install')).toBe('wait')
    expect(alertKind('input:s1:p:which one?')).toBe('input')
    expect(alertKind('agent-approval:7')).toBe('agent')
    expect(alertKind('deploy-failed:dpl_1')).toBe('failed')
    expect(alertKind('deploy-ready:dpl_2')).toBe('good')
    expect(alertKind('pr-merged:haven:12')).toBe('good')
    expect(alertKind('review:20261027-1')).toBe('review')
    expect(alertKind('first-peek')).toBe('first')
    for (const key of ['approval:s', 'input:s', 'agent-approval:1', 'deploy-failed:d']) expect(size(key)).toBe('approval')
    expect(size('review:1')).toBe('review')
    // The morning card after an Overnight Watch is the catch-all note: a click opens the panel, where the report is.
    expect(alertKind('night:20261025-231000')).toBe('alert')
    for (const key of ['deploy-ready:d', 'pr-merged:p', 'first-peek', 'finished:s:p', 'brand-new-kind:1', 'night:20261025-231000']) expect(size(key)).toBe('note')
    // The offer comes along: "Want me to look?"
    expect(alertNote({ key: 'deploy-failed:d', title: 'haven deploy failed', action: { label: 'Want me to look?', prompt: 'p' } }, 1).action).toBe('Want me to look?')
  })

  it('stays out longer for a long note, longer still for a big one or one too long', () => {
    expect(noteShowMs({ kind: 'good', fit: 'note' })).toBe(NOTE_SHOW_MS)
    expect(noteShowMs({ kind: 'good', fit: 'long' })).toBe(LONG_NOTE_MS)
    expect(noteShowMs({ kind: 'alert', fit: 'toolong' })).toBe(BIG_NOTE_MS)
    expect(noteSize({ kind: 'alert', fit: 'toolong' })).toBe('long')
    expect(noteShowMs({ kind: 'wait' })).toBe(BIG_NOTE_MS)
    expect(noteShowMs({ kind: 'review' })).toBe(BIG_NOTE_MS)
    expect(noteShowMs({ kind: 'first' })).toBe(10_000)
  })

  it('shows a failed build as a red mark, after what waits on you and before a review', () => {
    const input = (o: Partial<IslandInput>): IslandInput => ({ sessions: [], turns: {}, agentBusy: false, agentWaiting: false, reviews: 0, now: 100_000, ...o })
    expect(islandStatus(input({ failed: true, reviews: 1, turns: { a: 1 } })).right).toBe('failed')
    expect(islandStatus(input({ failed: true, agentWaiting: true })).right).toBe('needs')
    expect(islandStatus(input({ failed: true, asked: true })).right).toBe('asks')
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

  it('grows taller for a long note, and big for an approval or a review, with Steward joined', () => {
    const note = islandParts('note', NOTCH)
    const long = islandParts('long', NOTCH)
    expect(long).toMatchObject({ width: note.width, height: 32 + ISLAND_LONG_LINES, joined: false })
    expect(long.pill).toEqual(note.pill)
    // The design's sizes for a 185 by 32 notch: 380 by 94, 420 by 124, 440 by 172 (a point over from the notch's odd width).
    expect([long.width, long.height]).toEqual([381, 94])
    const approval = islandParts('approval', NOTCH)
    const review = islandParts('review', NOTCH)
    expect([approval.width, approval.height]).toEqual([421, 124])
    expect([review.width, review.height]).toEqual([441, 172])
    for (const big of [approval, review]) {
      expect(big.joined).toBe(true)
      // Steward's spot is inside the black's left part, below the notch; the status is at the top right.
      expect(big.pill.x).toBe(-big.width / 2 + ISLAND_AVATAR_IN)
      expect(big.pill.y).toBeGreaterThan(32)
      expect(big.pill.y + 26).toBeLessThan(big.height)
      expect(big.right!.x).toBeGreaterThan(big.width / 2 - 40)
      expect(big.right!.y).toBe(16)
      // With the springs' overshoot, it stays inside the window.
      expect(big.width * 1.1).toBeLessThan(ISLAND_WINDOW.width)
      expect(big.height * 1.1).toBeLessThan(ISLAND_WINDOW.height)
    }
    expect(review.pill.y).toBeLessThan(approval.pill.y + 40)
    expect(joins('approval') && joins('review') && !joins('note') && !joins('compact')).toBe(true)
  })

  it('takes clicks anywhere on a big island', () => {
    const layout = { cx: ISLAND_WINDOW.width / 2, ...NOTCH }
    const review = islandParts('review', NOTCH)
    const boxes = islandBoxes(review, 'review', layout)
    expect(inBoxes({ x: layout.cx - review.width / 2 + 10, y: review.height - 10 }, boxes)).toBe(true)
    expect(inBoxes({ x: layout.cx, y: review.height + 6 }, boxes)).toBe(false)
  })
})

describe("a note's words", () => {
  // Every letter 6 points wide, bold 7: easy to count.
  const measure = (text: string, bold: boolean) => text.length * (bold ? 7 : 6)
  const width = 353

  it('fit on one line when the title and the detail do', () => {
    expect(fitNote('haven', 'Claude finished · 3 files changed', width, measure)).toBe('note')
    expect(fitNote('A title alone', '', width, measure)).toBe('note')
  })

  it('make a long note when they need two or three lines, the title on its own', () => {
    // "companion: PR #39 merged" (24 letters, bold) and a PR title of about a line and a half.
    const title = 'companion: PR #39 merged'
    const pr = 'Main chat, Phase 1: take the hide button and the pin out of the header, and add the Ask | Auto switch'
    expect(fitNote(title, pr, width, measure)).toBe('long')
    expect(fitNote(title, 'a detail that is just too long to sit beside the title on one line', width, measure)).toBe('long')
  })

  it('are too long past three lines', () => {
    const long = 'Main chat, Phase 1: take the hide button and the pin out of the header, add the Ask | Auto switch by the message box, round the Send button, and label commands that ran on their own'
    expect(fitNote('companion: PR #39 merged', long, width, measure)).toBe('toolong')
  })

  it('wrap at spaces, and a word wider than a line takes the lines it fills', () => {
    const m = (t: string) => t.length * 10
    expect(linesFor('', 100, m)).toBe(0)
    expect(linesFor('aaaa bbbb', 100, m)).toBe(1)
    expect(linesFor('aaaa bbbb cccc', 100, m)).toBe(2)
    expect(linesFor('a'.repeat(25), 100, m)).toBe(3)
    expect(linesFor(`xx ${'a'.repeat(25)} yy`, 100, m)).toBe(4)
  })
})

describe('big messages and good news on the island', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())
  const wait: IslandNote = { kind: 'wait', name: 'haven is waiting on you', text: 'Bash: npm install', at: 1, key: 'approval:s1' }

  it('keeps a big one out for nine seconds, and a small note does not take its place', () => {
    const notes = new IslandNotes({ changed: () => {} })
    expect(notes.show(wait)).toBe(true)
    expect(notes.show({ kind: 'finished', name: 'api', text: 'finished', at: 2 })).toBe(false)
    expect(notes.current).toEqual(wait)
    vi.advanceTimersByTime(BIG_NOTE_MS - 1)
    expect(notes.current).toEqual(wait)
    vi.advanceTimersByTime(1)
    expect(notes.current).toBeNull()
    // Another big one does take its place.
    notes.show(wait)
    const review: IslandNote = { kind: 'review', name: 'haven changed', text: 'Review what Claude did?', at: 3, key: 'review:1' }
    expect(notes.show(review)).toBe(true)
    expect(notes.current).toEqual(review)
  })

  it('joins good news that comes within a moment into one note: "and 2 more"', () => {
    const notes = new IslandNotes({ changed: () => {} })
    const good = (at: number): IslandNote => ({ kind: 'good', name: `site ${at} deployed`, text: '', at, key: `deploy-ready:${at}` })
    notes.show(good(1))
    vi.advanceTimersByTime(1000)
    notes.show(good(2))
    notes.show(good(3))
    expect(notes.current).toMatchObject({ name: 'site 1 deployed', more: 2 })
    vi.advanceTimersByTime(NOTE_SHOW_MS - 1)
    expect(notes.current).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(notes.current).toBeNull()
  })

  it('stays out longer once the page says its words need the long note', () => {
    const notes = new IslandNotes({ changed: () => {} })
    const merged: IslandNote = { kind: 'good', name: 'companion: PR #39 merged', text: 'Main chat, Phase 1: …', at: 7 }
    notes.show(merged)
    vi.advanceTimersByTime(200)
    notes.fit(7, 'long')
    expect(notes.current?.fit).toBe('long')
    vi.advanceTimersByTime(LONG_NOTE_MS - 201)
    expect(notes.current).not.toBeNull()
    vi.advanceTimersByTime(1)
    expect(notes.current).toBeNull()
    // A fit for a message that's gone changes nothing.
    notes.fit(7, 'toolong')
    expect(notes.current).toBeNull()
  })

  it('ends the first launch\'s how-to once the cursor has touched it and left', () => {
    const notes = new IslandNotes({ changed: () => {} })
    notes.show({ kind: 'first', name: 'Rest the cursor on the notch', text: 'or press ⌥Space.', at: 1, key: 'first-peek' })
    vi.advanceTimersByTime(2000)
    notes.hover(true)
    vi.advanceTimersByTime(500)
    notes.hover(false)
    vi.advanceTimersByTime(NOTE_AFTER_HOVER_MS)
    expect(notes.current).toBeNull()
  })
})

describe('the island with Reduce Motion', () => {
  it('fades only when its shape or Steward moves: a new mood or status changes in place, and a fade on its way is not restarted', () => {
    const notch = { width: 185, height: 32 }
    expect(fadesFor(null, { level: 'rest', hover: false }, notch)).toBe(true)
    expect(fadesFor({ level: 'rest', hover: false }, { level: 'approval', hover: false }, notch)).toBe(true)
    expect(fadesFor({ level: 'compact', hover: false }, { level: 'compact', hover: true }, notch)).toBe(true)
    // The join sends the note, then the mood ("needs you"): the second is the same place, so no second fade.
    expect(fadesFor({ level: 'approval', hover: false }, { level: 'approval', hover: false }, notch)).toBe(false)
    // A note growing into a long note moves; the cursor on a note changes nothing about its shape.
    expect(fadesFor({ level: 'note', hover: false }, { level: 'long', hover: false }, notch)).toBe(true)
    expect(fadesFor({ level: 'note', hover: false }, { level: 'note', hover: true }, notch)).toBe(false)
  })
})
