import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlertQueue, alertSwitch, withNotificationPrefs } from '../src/main/alerts'
import type { HookPayload } from '../src/main/hook-payload'
import { SessionTracker } from '../src/main/sessions'
import { DEFAULT_NOTIFICATIONS } from '../src/main/settings-schema'
import type { AlertView, NotificationPrefs } from '../src/shared/types'

describe('AlertQueue', () => {
  let shown: AlertView[][]
  let queue: AlertQueue

  beforeEach(() => {
    vi.useFakeTimers()
    shown = []
    queue = new AlertQueue({ show: (alerts) => shown.push(alerts), batchMs: 1000 })
  })
  afterEach(() => vi.useRealTimers())

  it('shows urgent alerts at once', () => {
    queue.push({ key: 'a', level: 'urgent', title: 'Portlkit is waiting on you' })
    expect(shown).toHaveLength(1)
    expect(shown[0][0].title).toBe('Portlkit is waiting on you')
  })

  it('never shows the same alert twice', () => {
    expect(queue.push({ key: 'a', level: 'urgent', title: 'one' })).toBe(true)
    expect(queue.push({ key: 'a', level: 'urgent', title: 'one again' })).toBe(false)
    expect(shown).toHaveLength(1)
    expect(queue.recent()).toHaveLength(1)
  })

  it('batches normal alerts into one showing', () => {
    queue.push({ key: 'f1', level: 'normal', title: 'steward finished' })
    queue.push({ key: 'f2', level: 'normal', title: 'Portlkit finished' })
    queue.push({ key: 'f1', level: 'normal', title: 'steward finished' })
    expect(shown).toHaveLength(0)
    vi.advanceTimersByTime(1000)
    expect(shown).toHaveLength(1)
    expect(shown[0].map((a) => a.title)).toEqual(['steward finished', 'Portlkit finished'])
  })

  it('takes back an alert still waiting for its batch, but not one already shown', () => {
    queue.push({ key: 'finished:s1:p1', level: 'normal', title: 'haven finished' })
    queue.push({ key: 'finished:s2:p1', level: 'normal', title: 'site finished' })
    expect(queue.withdraw((a) => a.key === 'finished:s1:p1')).toBe(1)
    vi.advanceTimersByTime(1000)
    expect(shown).toEqual([[expect.objectContaining({ key: 'finished:s2:p1' })]])
    expect(queue.withdraw((a) => a.key === 'finished:s2:p1')).toBe(0)
    // With nothing left waiting, no empty batch shows later.
    queue.push({ key: 'finished:s3:p1', level: 'normal', title: 'docs finished' })
    queue.withdraw(() => true)
    vi.advanceTimersByTime(5000)
    expect(shown).toHaveLength(1)
  })

  it('flushes the batch early on request, and keeps quiet alerts to the history', () => {
    queue.push({ key: 'f1', level: 'normal', title: 'finished' })
    queue.push({ key: 'q1', level: 'quiet', title: 'short turn finished' })
    queue.flush()
    expect(shown).toEqual([[expect.objectContaining({ key: 'f1' })]])
    vi.advanceTimersByTime(5000)
    expect(shown).toHaveLength(1)
    expect(queue.recent().map((a) => a.key)).toEqual(['q1', 'f1'])
  })
})

describe('notification switches', () => {
  const allOff: NotificationPrefs = { sessionNeedsMe: false, sessionFinished: false, buildFailed: false, celebrations: false, morningBrief: false, leftOff: false }

  it("know a Claude Code session's alerts by the keys the session tracker gives them", async () => {
    const tracker = new SessionTracker({ projects: () => [], now: () => 10 * 60_000 })
    const event = (e: Partial<HookPayload> & Pick<HookPayload, 'hook_event_name'>) => ({ session_id: 's1', cwd: '/Users/me/haven', prompt_id: 'p1', ...e }) as HookPayload
    const approval = await tracker.apply(event({ hook_event_name: 'PermissionRequest', tool_name: 'Bash', tool_input: { command: 'npm test' } }))
    const input = await tracker.apply(event({ hook_event_name: 'Notification', message: 'Which file?' }))
    const finished = await tracker.apply(event({ hook_event_name: 'Stop' }))
    expect([approval, input, finished].map((a) => alertSwitch(a!.key))).toEqual(['sessionNeedsMe', 'sessionNeedsMe', 'sessionFinished'])
  })

  it('know deploys and merges by the keys Steward gives them, and leave its own requests to no switch', () => {
    expect(alertSwitch('deploy-failed:dpl_abc')).toBe('buildFailed')
    // Overnight Watch: CI red on main is a build failing; a session that may be stuck is a session needing you.
    expect(alertSwitch('ci-failed:/Users/me/haven:40633993398')).toBe('buildFailed')
    expect(alertSwitch('stuck:s1:1000:90')).toBe('sessionNeedsMe')
    expect(alertSwitch('deploy-ready:dpl_abc')).toBe('celebrations')
    expect(alertSwitch('pr-merged:/Users/me/haven:12')).toBe('celebrations')
    expect(alertSwitch('agent-approval:3f2a')).toBeNull()
    // Giving a project an address turned Visual Review on: no switch hides its reviews.
    expect(alertSwitch('review:20261024-101010-abcdef12')).toBeNull()
  })

  it("keep an alert whose switch is off from peeking out, and nothing else changes", () => {
    const failed = { key: 'deploy-failed:dpl_abc', level: 'urgent' as const, title: 'haven deploy failed', mood: 'worried' as const }
    expect(withNotificationPrefs(failed, DEFAULT_NOTIFICATIONS)).toEqual(failed)
    expect(withNotificationPrefs(failed, { ...DEFAULT_NOTIFICATIONS, buildFailed: false })).toEqual({ ...failed, level: 'quiet' })
    // Steward asking for your OK always peeks out.
    const ask = { key: 'agent-approval:3f2a', level: 'urgent' as const, title: 'Steward needs your OK' }
    expect(withNotificationPrefs(ask, allOff)).toEqual(ask)
  })

  it('a switched-off alert never reaches the screen', () => {
    const shown: AlertView[][] = []
    const queue = new AlertQueue({ show: (alerts) => shown.push(alerts), batchMs: 0 })
    expect(queue.push(withNotificationPrefs({ key: 'approval:s1:p1:Bash', level: 'urgent', title: 'haven is waiting on you' }, allOff))).toBe(true)
    queue.flush()
    expect(shown).toEqual([])
  })
})

