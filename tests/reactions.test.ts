import { describe, expect, it } from 'vitest'
import type { HookPayload } from '../src/main/hook-payload'
import { BACK_AFTER_S, cameBack, HOLD_MS, idleLookMs, nextReactionChange, pickReaction, turnTier, type ReactionInput } from '../src/main/reactions'
import { SessionActivity, STOPS_KEPT_MS, type StopSeen } from '../src/main/session-activity'
import { endsAsking } from '../src/shared/review'
import type { SessionState, SessionView } from '../src/shared/types'

const NOW = 1_000_000
const session = (id: string, state: SessionState): SessionView => ({ id, name: id, projectPath: null, cwd: `/p/${id}`, state, updatedAt: NOW })
const stop = (id: string, agoMs: number, turnMs: number | null, asked = false): StopSeen => ({ id, at: NOW - agoMs, turnMs, asked })
const input = (o: Partial<ReactionInput>): ReactionInput => ({ event: null, sessions: [], turns: {}, stops: [], agentWaiting: false, backAt: null, now: NOW, ...o })
const mood = (o: Partial<ReactionInput>) => pickReaction(input(o)).mood

describe("Steward's reactions", () => {
  it('greets a finished turn by its length: a nod under 15 s, proud from 5 minutes, done between and when unknown', () => {
    expect(turnTier(14_900)).toBe('nod')
    expect(turnTier(15_000)).toBe('done')
    expect(turnTier(299_000)).toBe('done')
    expect(turnTier(300_000)).toBe('proud')
    expect(turnTier(null)).toBe('done')
    expect(mood({ stops: [stop('a', 1_000, 8_000)] })).toBe('nod')
    expect(mood({ stops: [stop('a', 1_000, 60_000)] })).toBe('done')
    expect(mood({ stops: [stop('a', 1_000, 400_000)] })).toBe('proud')
    expect(mood({ stops: [stop('a', 1_000, null)] })).toBe('done')
  })

  it('shows each one-shot for its hold, then lets it go', () => {
    expect(mood({ stops: [stop('a', HOLD_MS.nod - 1, 8_000)] })).toBe('nod')
    expect(mood({ stops: [stop('a', HOLD_MS.nod, 8_000)] })).toBeNull()
    expect(mood({ stops: [stop('a', HOLD_MS.proud - 1, 400_000)] })).toBe('proud')
    expect(mood({ stops: [stop('a', HOLD_MS.proud, 400_000)] })).toBeNull()
    expect(mood({ backAt: NOW - HOLD_MS.hello + 1 })).toBe('hello')
    expect(mood({ backAt: NOW - HOLD_MS.hello })).toBeNull()
    // The next look is when the earliest hold ends.
    expect(nextReactionChange(input({ stops: [stop('a', 1_000, 8_000), stop('b', 1_000, 400_000)] }))).toBe(NOW - 1_000 + HOLD_MS.nod)
    expect(nextReactionChange(input({}))).toBeNull()
  })

  it('puts what needs you first, then what just happened, then what is going on', () => {
    const busy = { turns: { a: NOW - 5_000, b: NOW - 3_000 } }
    expect(mood({ event: 'mad', sessions: [session('c', 'needs-approval')] })).toBe('mad')
    expect(mood({ ...busy, sessions: [session('c', 'needs-approval')], event: 'celebrating' })).toBe('needs-you')
    expect(mood({ agentWaiting: true })).toBe('needs-you')
    expect(mood({ ...busy, sessions: [session('c', 'needs-input')] })).toBe('confused')
    expect(mood({ ...busy, stops: [stop('c', 1_000, 400_000, true)], event: 'celebrating' })).toBe('confused')
    expect(mood({ ...busy, stops: [stop('c', 1_000, 400_000)], event: 'celebrating' })).toBe('celebrating')
    expect(mood({ ...busy, stops: [stop('c', 1_000, 400_000), stop('d', 1_000, 60_000)] })).toBe('proud')
    expect(mood({ ...busy, stops: [stop('c', 1_000, 60_000)], backAt: NOW - 1_000 })).toBe('done')
    expect(mood({ ...busy, backAt: NOW - 1_000, event: 'worried' })).toBe('hello')
    expect(mood({ ...busy, event: 'worried' })).toBe('worried')
    expect(mood(busy)).toBe('juggling')
    expect(mood({ turns: { a: NOW - 5_000 } })).toBe('focused')
    expect(mood({})).toBeNull()
  })

  it("doesn't queue a one-shot that lost: once its hold is over it's gone", () => {
    const finished = stop('a', HOLD_MS.done + 500, 60_000)
    // While the approval waited, the done had its moment and lost it.
    expect(mood({ stops: [finished], sessions: [session('c', 'needs-approval')] })).toBe('needs-you')
    expect(mood({ stops: [finished] })).toBeNull()
  })

  it('counts only the turns that are really going on', () => {
    expect(mood({ turns: { a: NOW - 4 * 60 * 60_000 } })).toBeNull()
    expect(mood({ turns: { a: NOW - 4 * 60 * 60_000, b: NOW - 1_000 } })).toBe('focused')
  })
})

describe('what a chat has been doing', () => {
  const hook = (hook_event_name: 'UserPromptSubmit' | 'Stop', session_id: string, extra = {}) => ({ hook_event_name, session_id, cwd: '/p', ...extra }) as HookPayload

  it('keeps how long each turn was, and whether it ended by asking you something', () => {
    const a = new SessionActivity()
    a.note(hook('UserPromptSubmit', 's1'), 1_000)
    a.note(hook('Stop', 's1', { last_assistant_message: 'Which file did you mean, page.tsx or layout.tsx?' }), 21_000)
    expect(a.stops).toEqual([{ id: 's1', at: 21_000, turnMs: 20_000, asked: true }])
    expect(a.turns).toEqual({})
    // A stop with no turn start (the hook isn't installed): the length is unknown.
    a.note(hook('Stop', 's2', { last_assistant_message: 'I fixed it.' }), 22_000)
    expect(a.stops.at(-1)).toEqual({ id: 's2', at: 22_000, turnMs: null, asked: false })
    // A Stop hook keeping Claude going isn't a stop.
    a.note(hook('Stop', 's3', { stop_hook_active: true }), 23_000)
    expect(a.stops).toHaveLength(2)
  })

  it("gives each chat's newest stop, until it starts a new turn, and forgets stops after ten minutes", () => {
    const a = new SessionActivity()
    a.note(hook('Stop', 's1'), 1_000)
    a.note(hook('Stop', 's1'), 2_000)
    expect(a.lastStops().map((s) => s.at)).toEqual([2_000])
    a.note(hook('UserPromptSubmit', 's1'), 3_000)
    expect(a.lastStops()).toEqual([])
    a.note(hook('Stop', 's2'), 3_000 + STOPS_KEPT_MS)
    expect(a.stops.map((s) => s.id)).toEqual(['s2'])
  })
})

describe('a question at the end of a reply', () => {
  it('is a question that asks you something, read like the "Claude says" note', () => {
    expect(endsAsking('I found two configs. Which one should the build use?')).toBe(true)
    expect(endsAsking('**Two options:**\n\n- `vite.config.ts`\n- `webpack.config.js`\n\nWhich one do you use?')).toBe(true)
    expect(endsAsking('Done. The tests pass.')).toBe(false)
    expect(endsAsking('Is it fixed? Yes, the tests pass now.')).toBe(false)
    expect(endsAsking(null)).toBe(false)
  })

  it("isn't an offer like \"Want me to commit this?\": that only means it's your turn", () => {
    expect(endsAsking('I changed the heading.\n\nWant me to commit this?')).toBe(false)
    expect(endsAsking('Should I also update the README?')).toBe(false)
    expect(endsAsking('Would you like me to push it?')).toBe(false)
  })
})

describe('back at the Mac', () => {
  it('is a return after ten minutes or more away', () => {
    expect(cameBack(BACK_AFTER_S + 30, 2)).toBe(true)
    expect(cameBack(BACK_AFTER_S - 1, 0)).toBe(false)
    expect(cameBack(BACK_AFTER_S + 30, BACK_AFTER_S + 31)).toBe(false)
    expect(cameBack(null, 0)).toBe(false)
  })

  it('looks every second once a return would count, and rarely otherwise', () => {
    expect(idleLookMs(10)).toBe(15_000)
    expect(idleLookMs(BACK_AFTER_S)).toBe(1_000)
  })
})
