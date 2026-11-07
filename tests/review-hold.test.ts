import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Project } from '../src/shared/types'
import type { HeldStop } from '../src/main/hook-server'
import { HOLD_DECIDE_MS, HOLD_LOOK_MS, HOLD_MAX_SENDS, RecentStops, ReviewHolds } from '../src/main/review-hold'

const CWD = '/Users/me/haven'
const stop = (prompt = 'p1', extra: { stop_hook_active?: boolean; last_assistant_message?: string; session_id?: string } = {}) => ({
  hook_event_name: 'Stop' as const,
  session_id: 's1',
  prompt_id: prompt,
  cwd: CWD,
  ...extra,
})

function heldStop() {
  const answers: (string | null)[] = []
  let gone: (() => void) | undefined
  const held: HeldStop = {
    answer: (note) => {
      answers.push(note)
    },
    whenGone: (then) => {
      gone = then
    },
  }
  return { held, answers, goAway: () => gone?.() }
}

describe('ReviewHolds', () => {
  let projects: Project[]
  let away: boolean
  let changes: number
  let holds: ReviewHolds

  beforeEach(() => {
    vi.useFakeTimers()
    projects = [{ name: 'haven', path: CWD, url: 'http://localhost:3000', hold: true }]
    away = false
    changes = 0
    holds = new ReviewHolds({ projects: () => projects, awayForTheNight: () => away, onChange: () => changes++ })
  })
  afterEach(() => vi.useRealTimers())

  /** A Stop held and a review found: Claude is waiting on the user. */
  const waitingOn = (reviewId: string, prompt = 'p1', extra = {}) => {
    const hook = heldStop()
    expect(holds.begin(stop(prompt, extra), hook.held)).toBe(true)
    holds.looked(stop(prompt, extra), reviewId)
    return hook
  }

  it.each([
    ['a project not asking', () => (projects = [{ name: 'haven', path: CWD, url: 'http://localhost:3000' }])],
    ['a project with no address', () => (projects = [{ name: 'haven', path: CWD, hold: true }])],
    ['a folder in no project', () => (projects = [])],
    ['a night under Overnight Watch', () => (away = true)],
  ])('lets Claude stop at once for %s', (_what, arrange) => {
    arrange()
    const hook = heldStop()
    expect(holds.begin(stop(), hook.held)).toBe(false)
    expect(hook.answers).toEqual([null])
  })

  it('holds while the page is looked at, and lets go when there is nothing to decide', () => {
    const hook = heldStop()
    expect(holds.begin(stop(), hook.held)).toBe(true)
    expect(hook.answers).toEqual([])
    expect(holds.holding(stop())).toBe(true)
    holds.looked(stop(), null)
    expect(hook.answers).toEqual([null])
    expect(holds.holding(stop())).toBe(false)
  })

  it('gives up on a look that takes too long', () => {
    const hook = heldStop()
    holds.begin(stop(), hook.held)
    vi.advanceTimersByTime(HOLD_LOOK_MS - 1)
    expect(hook.answers).toEqual([])
    vi.advanceTimersByTime(1)
    expect(hook.answers).toEqual([null])
  })

  it('with a review waits for the user, and says until when', () => {
    const start = Date.now()
    const hook = waitingOn('r1')
    expect(hook.answers).toEqual([])
    expect(holds.view('r1')).toEqual({ until: start + HOLD_DECIDE_MS })
    expect(holds.view('r2')).toBeNull()
    expect(changes).toBe(1)
  })

  it('stops waiting at the time limit, and Send it back has to copy from then on', () => {
    const hook = waitingOn('r1')
    vi.advanceTimersByTime(HOLD_DECIDE_MS - 1)
    expect(hook.answers).toEqual([])
    vi.advanceTimersByTime(1)
    expect(hook.answers).toEqual([null])
    expect(holds.view('r1')).toBeNull()
    expect(holds.sendBack('r1', 'too late')).toBeNull()
    expect(hook.answers).toEqual([null])
    expect(changes).toBe(2)
  })

  it('sends the note to Claude and hands back the Stop it answered', () => {
    const hook = waitingOn('r1')
    expect(holds.sendBack('r1', 'Make it blue')).toMatchObject({ session_id: 's1', prompt_id: 'p1', cwd: CWD })
    expect(hook.answers).toEqual(['Make it blue'])
    expect(holds.view('r1')).toBeNull()
    expect(holds.sendBack('r1', 'again')).toBeNull()
    // No answer is left to fire later.
    vi.advanceTimersByTime(HOLD_DECIDE_MS)
    expect(hook.answers).toEqual(['Make it blue'])
  })

  it('lets Claude stop on Looks good or Later', () => {
    const hook = waitingOn('r1')
    holds.letGo('r2')
    expect(hook.answers).toEqual([])
    holds.letGo('r1')
    expect(hook.answers).toEqual([null])
  })

  it('lets go when a new prompt is typed into the session, and only that session', () => {
    const hook = waitingOn('r1')
    holds.promptSent('other')
    expect(hook.answers).toEqual([])
    holds.promptSent('s1')
    expect(hook.answers).toEqual([null])
  })

  it('forgets a hook that went away (stop pressed, session closed), without answering it', () => {
    const hook = waitingOn('r1')
    const before = changes
    hook.goAway()
    expect(holds.view('r1')).toBeNull()
    expect(hook.answers).toEqual([])
    expect(changes).toBe(before + 1)
    vi.advanceTimersByTime(HOLD_DECIDE_MS)
    expect(hook.answers).toEqual([])
  })

  it('a hook gone from an older Stop does not end a newer hold', () => {
    const older = waitingOn('r1')
    const newer = waitingOn('r2')
    expect(older.answers).toEqual([null])
    older.goAway()
    expect(holds.view('r2')).not.toBeNull()
    expect(newer.answers).toEqual([])
  })

  it('a late look of another turn does not touch the hold', () => {
    const hook = heldStop()
    holds.begin(stop('p2'), hook.held)
    holds.looked(stop('p1'), null)
    expect(hook.answers).toEqual([])
  })

  it('only the first look counts, since the hold hook asks again in case it came late', () => {
    const hook = waitingOn('r1')
    holds.looked(stop(), null)
    holds.looked(stop(), 'r2')
    expect(hook.answers).toEqual([])
    expect(holds.view('r1')).not.toBeNull()
  })

  it(`takes ${HOLD_MAX_SENDS} send-backs in a turn, and never the ninth, which Claude Code would drop`, () => {
    for (let i = 1; i <= HOLD_MAX_SENDS; i++) {
      const hook = waitingOn(`r${i}`, 'p1', { stop_hook_active: i > 1 })
      holds.sendBack(`r${i}`, `round ${i}`)
      expect(hook.answers).toEqual([`round ${i}`])
    }
    const hook = heldStop()
    expect(holds.begin(stop('p1', { stop_hook_active: true }), hook.held)).toBe(false)
    expect(hook.answers).toEqual([null])
    // The next turn starts over.
    holds.turnBegan({ session_id: 's1', prompt_id: 'p2' })
    expect(holds.begin(stop('p2'), heldStop().held)).toBe(true)
  })

  it('reads a Stop after its own send-back as a real end, and no other Stop', () => {
    const asked = stop('p1', { stop_hook_active: true })
    expect(holds.ownStop(asked)).toBe(asked)
    waitingOn('r1')
    holds.sendBack('r1', 'note')
    expect(holds.ownStop(asked).stop_hook_active).toBe(false)
    // Each hook of the same Stop gets the same answer, even after the first one let Claude go.
    holds.begin(holds.ownStop(asked), heldStop().held)
    holds.looked(asked, null)
    expect(holds.ownStop(asked).stop_hook_active).toBe(false)
    const elsewhere = stop('p9', { stop_hook_active: true })
    expect(holds.ownStop(elsewhere)).toBe(elsewhere)
    const prompt = { hook_event_name: 'UserPromptSubmit' as const, session_id: 's1', prompt_id: 'p1', cwd: CWD }
    expect(holds.ownStop(prompt)).toBe(prompt)
  })

  it('lets everyone go at once', () => {
    const one = waitingOn('r1')
    const hook = heldStop()
    holds.begin(stop('p1', { session_id: 's2' }), hook.held)
    holds.letGoAll()
    expect(one.answers).toEqual([null])
    expect(hook.answers).toEqual([null])
  })

  it('the time limit can be shortened', () => {
    holds.decideMs = 500
    const hook = waitingOn('r1')
    vi.advanceTimersByTime(500)
    expect(hook.answers).toEqual([null])
  })
})

describe('RecentStops', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('finds the look of the same Stop only, for a while', async () => {
    const looks = new RecentStops<string>(1000)
    const said = stop('p1', { last_assistant_message: 'done' })
    expect(looks.find(said)).toBeUndefined()
    await looks.remember(said, Promise.resolve('look'))
    await expect(looks.find({ ...said })).resolves.toBe('look')
    expect(looks.find(stop('p2', { last_assistant_message: 'done' }))).toBeUndefined()
    expect(looks.find(stop('p1', { last_assistant_message: 'something else' }))).toBeUndefined()
    expect(looks.find(stop('p1', { last_assistant_message: 'done', stop_hook_active: true }))).toBeUndefined()
    vi.advanceTimersByTime(1000)
    expect(looks.find(said)).toBeUndefined()
  })
})
