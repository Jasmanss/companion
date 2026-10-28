import { describe, expect, it } from 'vitest'
import { ciResult, CiTracker, GH_COMMANDS, GIT_REMOTE, isGitHubRemote, mainRuns, parseCiRuns, type CiRun } from '../src/main/github'
import { QUIET_MS, STUCK_MS, stuckAlert, StuckWatch } from '../src/main/stuck'

const MINUTE = 60_000
const run = (id: number, status: string, conclusion = ''): CiRun => ({ databaseId: id, workflowName: 'CI', status, conclusion, updatedAt: '2026-10-28T04:49:06Z' })

describe('CI on main', () => {
  it('only ever runs read-only commands with fixed arguments, and never asks for a commit message', () => {
    expect(GH_COMMANDS.ciMain).toEqual(['run', 'list', '--branch', 'main', '--json', 'databaseId,workflowName,status,conclusion,updatedAt', '--limit', '10'])
    expect(GH_COMMANDS.ciMain.join(' ')).not.toMatch(/displayTitle|headSha|url/)
    expect(GIT_REMOTE).toEqual(['remote', 'get-url', 'origin'])
  })

  it('reads a run as red, green, or neither (still going, cancelled, skipped)', () => {
    expect(ciResult(run(1, 'completed', 'failure'))).toBe('red')
    expect(ciResult(run(1, 'completed', 'timed_out'))).toBe('red')
    expect(ciResult(run(1, 'completed', 'startup_failure'))).toBe('red')
    expect(ciResult(run(1, 'completed', 'success'))).toBe('green')
    expect(ciResult(run(1, 'in_progress'))).toBeNull()
    expect(ciResult(run(1, 'queued'))).toBeNull()
    expect(ciResult(run(1, 'completed', 'cancelled'))).toBeNull()
    expect(ciResult(run(1, 'completed', 'skipped'))).toBeNull()
  })

  it("reads what gh printed, dropping what doesn't read, and nothing for a repo with no runs", async () => {
    const out = JSON.stringify([run(2, 'completed', 'failure'), { databaseId: 'x' }, run(1, 'completed', 'success')])
    expect(parseCiRuns(out).map((r) => r.databaseId)).toEqual([2, 1])
    expect(parseCiRuns('[]')).toEqual([])
    expect(parseCiRuns('{"message":"no"}')).toEqual([])
    const gh = async (args: readonly string[], cwd: string) => (args === GH_COMMANDS.ciMain && cwd === '/p' ? out : '')
    expect((await mainRuns({ name: 'p', path: '/p' }, gh)).length).toBe(2)
  })

  it('takes note at the first look, then says once when a run ends red or green, oldest first', () => {
    const tracker = new CiTracker()
    const changes = (runs: CiRun[], path = '/p') => tracker.update(path, runs).map((c) => [c.kind, c.run.databaseId])
    // The red run already there at Go rest is not news.
    expect(changes([run(2, 'completed', 'failure'), run(1, 'completed', 'success')])).toEqual([])
    // One still going isn't either, until it ends.
    expect(changes([run(4, 'in_progress'), run(3, 'completed', 'failure'), run(2, 'completed', 'failure')])).toEqual([['failed', 3]])
    expect(changes([run(5, 'completed', 'success'), run(4, 'completed', 'success'), run(3, 'completed', 'failure')])).toEqual([
      ['passed', 4],
      ['passed', 5],
    ])
    // Never twice, and each project on its own.
    expect(changes([run(5, 'completed', 'success')])).toEqual([])
    expect(changes([run(9, 'completed', 'failure')], '/q')).toEqual([])
  })

  it('knows a GitHub origin from any other', () => {
    for (const url of ['https://github.com/Jasmanss/companion.git', 'https://github.com/a/b', 'git@github.com:a/b.git', 'ssh://git@github.com/a/b.git\n', 'https://token@github.com/a/b.git'])
      expect(isGitHubRemote(url)).toBe(true)
    for (const url of ['https://gitlab.com/a/b.git', 'git@bitbucket.org:a/b.git', 'https://github.com.evil.example/a/b', '/Users/me/repo', '']) expect(isGitHubRemote(url)).toBe(false)
  })
})

describe('a session that may be stuck', () => {
  const night = 1_000_000
  function setup() {
    const sizes: Record<string, number | null> = { '/t/s1.jsonl': 100 }
    const watch = new StuckWatch({ size: async (f) => sizes[f] ?? null })
    watch.heard('s1', night - 5 * MINUTE, { name: 'Fix the header · my-site', transcript: '/t/s1.jsonl' })
    return { watch, sizes }
  }

  it('says a word at 45 minutes of nothing, and that it may be stuck at 90, once each', async () => {
    const { watch } = setup()
    expect(await watch.look(['s1'], night + 30 * MINUTE, night)).toEqual([])
    expect(await watch.look(['s1'], night + QUIET_MS, night)).toEqual([{ id: 's1', name: 'Fix the header · my-site', since: night, minutes: 45 }])
    expect(await watch.look(['s1'], night + 60 * MINUTE, night)).toEqual([])
    expect((await watch.look(['s1'], night + STUCK_MS, night)).map((s) => s.minutes)).toEqual([90])
    expect(await watch.look(['s1'], night + 3 * STUCK_MS, night)).toEqual([])
  })

  it('counts from Go rest, not from before it, so a night never starts with a session stuck', async () => {
    const { watch } = setup()
    expect(await watch.look(['s1'], night, night)).toEqual([])
    expect(await watch.look(['s1'], night + QUIET_MS - 1, night)).toEqual([])
  })

  it('starts over when anything comes from the session, or its log grows', async () => {
    const { watch, sizes } = setup()
    await watch.look(['s1'], night + 10 * MINUTE, night)
    watch.heard('s1', night + 40 * MINUTE, { name: 'Fix the header · my-site' })
    expect(await watch.look(['s1'], night + 50 * MINUTE, night)).toEqual([])
    expect((await watch.look(['s1'], night + 85 * MINUTE, night)).map((s) => s.minutes)).toEqual([45])
    // Claude writing to its log: it's working, not stuck.
    sizes['/t/s1.jsonl'] = 900
    expect(await watch.look(['s1'], night + 120 * MINUTE, night)).toEqual([])
    expect(await watch.look(['s1'], night + 160 * MINUTE, night)).toEqual([])
    expect((await watch.look(['s1'], night + 166 * MINUTE, night)).map((s) => [s.minutes, s.since])).toEqual([[45, night + 120 * MINUTE]])
  })

  it('only looks at the sessions working, and says 90 straight away if it has been that long', async () => {
    const { watch } = setup()
    expect(await watch.look([], night + STUCK_MS, night)).toEqual([])
    expect(await watch.look(['unknown'], night + STUCK_MS, night)).toEqual([])
    expect((await watch.look(['s1'], night + STUCK_MS, night)).map((s) => s.minutes)).toEqual([90])
  })

  it('starts the steps over on the next night', async () => {
    const { watch } = setup()
    await watch.look(['s1'], night + STUCK_MS, night)
    const next = night + 24 * 60 * MINUTE
    expect(await watch.look(['s1'], next + 10 * MINUTE, next)).toEqual([])
    expect((await watch.look(['s1'], next + QUIET_MS, next)).map((s) => s.minutes)).toEqual([45])
  })

  it('is a word at 45 and urgent at 90, by name only', () => {
    const at45 = stuckAlert({ id: 's1', name: 'haven', since: night, minutes: 45 })
    const at90 = stuckAlert({ id: 's1', name: 'haven', since: night, minutes: 90 })
    expect(at45).toMatchObject({ key: `stuck:s1:${night}:45`, title: 'haven has been quiet for 45 minutes' })
    expect(at90).toMatchObject({ key: `stuck:s1:${night}:90`, level: 'urgent', title: 'haven may be stuck', mood: 'worried' })
  })
})
