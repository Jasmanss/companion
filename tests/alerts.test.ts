import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AlertQueue } from '../src/main/alerts'
import type { AlertView } from '../src/shared/types'

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
