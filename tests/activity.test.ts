import { describe, expect, it } from 'vitest'
import { activityLabel, resultSites, summarize, summaryText } from '../src/shared/activity'
import type { Activity, ActivityKind } from '../src/shared/types'
import { foldSteps, groupEntries, lingerFor, type Entry, type StepEntry } from '../src/renderer/src/chat-groups'

let n = 0
const step = (kind: ActivityKind, target?: string, status: Activity['status'] = 'done'): Activity => ({
  id: `a${n++}`,
  kind,
  label: activityLabel(kind, status),
  status,
  ...(target ? { target } : {}),
})

describe('summarize', () => {
  it('folds finished steps into one line, a part per kind in the order they happened', () => {
    const steps = [step('read-file', 'a.ts'), step('search-web', 'q'), step('read-file', 'b.ts'), step('run-command', 'npm test'), step('read-file', 'c.ts')]
    expect(summaryText(steps)).toBe('Read 3 files · Searched the web · Ran npm test')
  })

  it('leaves thinking out', () => {
    expect(summarize([step('thinking'), step('fetch-page', 'https://x.dev')]).map((p) => p.text)).toEqual(['Read 1 page'])
  })

  it('counts repeats', () => {
    const steps = [step('search-web'), step('search-web'), step('run-command', 'npm test'), step('run-command', 'npm run lint'), step('screenshot'), step('screenshot')]
    expect(summaryText(steps)).toBe('Searched the web 2 times · Ran 2 commands · Took 2 screenshots')
  })

  it('marks a kind failed when any of its steps failed', () => {
    const parts = summarize([step('run-command', 'npm test', 'failed'), step('read-file', 'a.ts')])
    expect(parts).toEqual([
      { text: 'Ran npm test', failed: true },
      { text: 'Read 1 file', failed: false },
    ])
    expect(summaryText([step('run-command', 'npm test', 'failed')])).toBe('Ran npm test (failed)')
  })

  it('shortens a long command', () => {
    expect(summarize([step('run-command', 'npx vitest run tests/activity.test.ts --reporter=verbose')])[0].text).toBe('Ran npx vitest run tests/activity.t…')
  })
})

describe('activityLabel', () => {
  it('says what is happening, then what happened', () => {
    expect(activityLabel('search-web', 'running')).toBe('Searching the web')
    expect(activityLabel('search-web', 'done')).toBe('Searched the web')
    expect(activityLabel('run-command', 'failed')).toBe('Ran')
  })
})

describe('resultSites', () => {
  it('pulls the sites out of web search results, each once, in order', () => {
    const results = [
      { type: 'web_search_result', url: 'https://www.dribbble.com/shots/1', title: 'a' },
      { type: 'web_search_result', url: 'https://developer.apple.com/design', title: 'b' },
      { type: 'web_search_result', url: 'https://dribbble.com/shots/2', title: 'c' },
      { type: 'web_search_result', title: 'no url' },
    ]
    expect(resultSites(results)).toEqual(['dribbble.com', 'developer.apple.com'])
  })

  it('stops at the limit and ignores anything that is not a list', () => {
    const many = Array.from({ length: 10 }, (_, i) => ({ url: `https://site${i}.com/` }))
    expect(resultSites(many, 3)).toEqual(['site0.com', 'site1.com', 'site2.com'])
    expect(resultSites({ type: 'web_search_tool_result_error', error_code: 'unavailable' })).toEqual([])
  })
})

const stepEntry = (id: number, activity: Activity, finishedAt?: number): StepEntry => ({ kind: 'step', id, activity, finishedAt })

describe('groupEntries', () => {
  it('puts steps in a row into one group between messages', () => {
    const entries: Entry[] = [
      { kind: 'user', id: 1, text: 'find pricing pages' },
      stepEntry(2, step('search-web')),
      stepEntry(3, step('fetch-page')),
      { kind: 'assistant', id: 4, text: 'Here', streaming: false },
      stepEntry(5, step('screenshot')),
    ]
    expect(groupEntries(entries).map((b) => (b.type === 'steps' ? b.steps.map((s) => s.id) : b.type))).toEqual(['entry', [2, 3], 'entry', [5]])
  })

  it('shows thinking only while it lasts, without splitting the steps around it', () => {
    const running = groupEntries([stepEntry(1, step('search-web')), stepEntry(2, step('thinking', undefined, 'running'))])
    expect(running.map((b) => b.type)).toEqual(['steps', 'thinking'])
    const over = groupEntries([stepEntry(1, step('search-web')), stepEntry(2, step('thinking')), stepEntry(3, step('read-file'))])
    expect(over).toHaveLength(1)
    expect(over[0].type === 'steps' && over[0].steps.map((s) => s.id)).toEqual([1, 3])
  })
})

describe('foldSteps', () => {
  it('keeps running steps and just-finished ones in full, and folds the rest', () => {
    const t = 100_000
    const steps = [
      stepEntry(1, step('read-file'), t - 5000),
      stepEntry(2, step('run-command', 'npm test'), t - 1000),
      stepEntry(3, step('search-web', 'q', 'running')),
    ]
    const { folded, live, next } = foldSteps(steps, t)
    expect(folded.map((s) => s.id)).toEqual([1])
    expect(live.map((s) => s.id)).toEqual([2, 3])
    expect(next).toBe(t - 1000 + lingerFor('run-command'))
  })

  it('has nothing left to wait for once everything has folded', () => {
    const { folded, next } = foldSteps([stepEntry(1, step('read-file'), 0)], 60_000)
    expect(folded).toHaveLength(1)
    expect(next).toBeNull()
  })
})
