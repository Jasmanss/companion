import { describe, expect, it } from 'vitest'
import { briefSince, buildBrief, localDate } from '../src/main/brief'
import { dependabotPRs, GH_COMMANDS, MergeTracker } from '../src/main/github'
import type { DeployInfo, SessionView } from '../src/shared/types'

const now = new Date(2026, 9, 9, 8, 30)
const since = now.getTime() - 10 * 60 * 60 * 1000
const deploy = (uid: string, state: string, at: number): DeployInfo => ({ uid, state, project: 'portalkit', projectPath: '/p', url: null, created: at, target: 'production' })
const session = (id: string, state: SessionView['state'], at: number): SessionView => ({ id, name: 'haven', projectPath: null, cwd: '/h', state, updatedAt: at })

describe('buildBrief', () => {
  it('sums up the night from a template', () => {
    const brief = buildBrief({
      now,
      since,
      deploys: [deploy('a', 'READY', since + 1), deploy('b', 'READY', since + 2), deploy('c', 'ERROR', since + 3), deploy('old', 'ERROR', since - 1)],
      sessions: [session('s1', 'finished', since + 5), session('s2', 'working', since + 5), session('s3', 'finished', since - 5)],
      leftOff: null,
      dependabot: [{ project: 'tally', prs: [{ number: 4, title: 'Bump next', url: 'https://github.com/x/tally/pull/4' }] }],
    })
    expect(brief.greeting).toBe('Good morning')
    expect(brief.date).toBe('Friday, October 9')
    expect(brief.summary).toBe('2 deploys went out, 1 failed. 1 session finished. 1 Dependabot PR is open.')
    expect(brief.failed.map((d) => d.uid)).toEqual(['c'])
    expect(brief.sessions.map((s) => s.id)).toEqual(['s1'])
  })

  it('says when it was quiet', () => {
    expect(buildBrief({ now, since, deploys: [], sessions: [], leftOff: null, dependabot: null }).summary).toBe('Quiet since you were last here.')
  })

  it('looks back to your last visit, but no more than a day', () => {
    expect(briefSince(since, now.getTime())).toBe(since)
    expect(briefSince(0, now.getTime())).toBe(now.getTime() - 24 * 60 * 60 * 1000)
    expect(localDate(now)).toBe('2026-10-09')
  })
})

describe('GitHub', () => {
  it('lists open Dependabot PRs with the fixed command, skipping projects where gh fails', async () => {
    const calls: (readonly string[])[] = []
    const result = await dependabotPRs(
      [
        { name: 'tally', path: '/t' },
        { name: 'local-only', path: '/l' },
      ],
      async (args, cwd) => {
        calls.push(args)
        if (cwd === '/l') throw new Error('no GitHub remote')
        return JSON.stringify([{ number: 4, title: 'Bump next from 15 to 16', url: 'https://github.com/me/tally/pull/4' }])
      },
    )
    expect(calls).toEqual([GH_COMMANDS.dependabot, GH_COMMANDS.dependabot])
    expect(result).toEqual([{ project: 'tally', prs: [{ number: 4, title: 'Bump next from 15 to 16', url: 'https://github.com/me/tally/pull/4' }] }])
  })

  it('celebrates only merges that happen while watching', () => {
    const tracker = new MergeTracker()
    expect(tracker.update('/t', [{ number: 3 }, { number: 2 }])).toEqual([])
    expect(tracker.update('/t', [{ number: 5 }, { number: 3 }])).toEqual([5])
    expect(tracker.update('/t', [{ number: 5 }])).toEqual([])
  })
})
