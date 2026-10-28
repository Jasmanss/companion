import { describe, expect, it } from 'vitest'
import { buildNightReport, clock, GAP_MIN_MS, JOIN_MS, LIST_MAX, type NightInput } from '../src/main/night-report'
import type { WatchEvent } from '../src/main/watch'

/** A local time on the night of 2026-10-25 (after midnight is the 26th). */
const at = (h: number, m = 0) => new Date(2026, 9, h < 12 ? 26 : 25, h, m, 0, 0).getTime()
const MINUTE = 60_000

const start: WatchEvent = { type: 'start', at: at(23, 10), until: at(7, 30), onBattery: false, sessionsWorking: 2 }
const end = (h: number, m: number, why: 'wake-time' | 'up' | 'stopped' | 'back' | 'cap' = 'wake-time'): WatchEvent => ({ type: 'end', at: at(h, m), why })
const alert = (h: number, m: number, kind: string, title: string, held = true, review?: string): WatchEvent => ({ type: 'alert', at: at(h, m), kind, title, level: 'urgent', held, ...(review ? { review } : {}) })

const report = (events: WatchEvent[], o: Partial<NightInput> = {}) =>
  buildNightReport({ id: '20261025-231000', events, review: () => null, now: at(7, 40), latest: true, earlier: null, later: null, ...o })

describe('the night report', () => {
  it('says a quiet night is quiet, from when it started to when it ended', () => {
    const r = report([start, { type: 'beat', at: at(23, 15) }, end(7, 30)])
    expect(r).toMatchObject({ title: 'Good morning', span: `${clock(at(23, 10))} to ${clock(at(7, 30))}`, summary: 'Quiet night. Nothing needed you.', gaps: [], needed: [], finished: [], reviews: [], deploys: [] })
  })

  it('counts what needed you and what changed, in one line', () => {
    const r = report([
      start,
      alert(23, 58, 'finished', 'Fix the header · my-site finished', false),
      alert(1, 5, 'approval', 'steward-app is waiting on you'),
      alert(2, 0, 'input', 'haven needs your input'),
      alert(3, 0, 'finished', 'haven finished'),
      end(7, 30),
    ])
    expect(r.summary).toBe('2 things needed you. 2 things changed.')
    expect(r.needed.map((n) => n.title)).toEqual(['steward-app is waiting on you', 'haven needs your input'])
    expect(r.finished).toEqual([
      { at: at(23, 58), title: 'Fix the header · my-site finished' },
      { at: at(3, 0), title: 'haven finished' },
    ])
    expect(report([start, alert(1, 5, 'approval', 'x is waiting on you'), end(7, 30)]).summary).toBe('1 thing needed you.')
    expect(report([start, alert(1, 5, 'finished', 'x finished'), end(7, 30)]).summary).toBe('Nothing needed you. 1 thing changed.')
  })

  it('says what Steward did with each and what came after: you opened the panel, or you were back', () => {
    const events: WatchEvent[] = [start, alert(1, 5, 'approval', 'a is waiting on you'), { type: 'opened', at: at(1, 20) }, alert(2, 0, 'input', 'b needs your input', false), end(7, 2, 'back')]
    expect(report(events).needed.map((n) => n.note)).toEqual([`Waited for you on screen. You opened Steward at ${clock(at(1, 20))}.`, `Showed on screen. You were back at ${clock(at(7, 2))}.`])
    expect(report([start, alert(2, 0, 'approval', 'a is waiting on you'), end(7, 30, 'up')]).needed[0].note).toBe(`Waited for you on screen. You were up at ${clock(at(7, 30))}.`)
    // At the wake time with nobody there, nothing came after yet.
    expect(report([start, alert(2, 0, 'approval', 'a is waiting on you'), end(7, 30)]).needed[0].note).toBe('Waited for you on screen.')
  })

  it('joins the same thing again within 10 minutes, and keeps it apart after that', () => {
    const events: WatchEvent[] = [start, alert(1, 0, 'approval', 'a is waiting on you'), alert(1, 4, 'approval', 'a is waiting on you'), alert(1, 12, 'approval', 'a is waiting on you')]
    expect(report([...events, end(7, 30)]).needed.map((n) => n.title)).toEqual(['a is waiting on you (3 times)'])
    expect(report([...events, { ...(alert(1, 12, 'approval', 'a is waiting on you') as object), at: at(1, 12) + JOIN_MS + 1 } as WatchEvent, end(7, 30)]).needed).toHaveLength(2)
    expect(report([...events, end(7, 30)]).summary).toBe('1 thing needed you.')
  })

  it('puts a failed production deploy under needed you, and every deploy in its project strip', () => {
    const r = report([
      start,
      { type: 'deploy', at: at(0, 30), project: 'my-site', ok: true, production: false },
      { type: 'deploy', at: at(2, 14), project: 'my-site', ok: false, production: true },
      { type: 'deploy', at: at(3, 0), project: 'haven', ok: false, production: false },
      end(7, 30),
    ])
    expect(r.needed.map((n) => n.title)).toEqual(['my-site production deploy failed'])
    expect(r.deploys).toEqual([
      {
        project: 'my-site',
        runs: [
          { at: at(0, 30), ok: true, production: false },
          { at: at(2, 14), ok: false, production: true },
        ],
      },
      { project: 'haven', runs: [{ at: at(3, 0), ok: false, production: false }] },
    ])
  })

  it("shows the night's Visual Reviews as they stand now, and says when one is no longer kept", () => {
    const store: Record<string, { status: 'new' | 'good' | 'sent-back'; said?: string }> = {
      '20261025-235800-aaaaaaaa': { status: 'new', said: 'Made the hero green.' },
      '20261026-010000-bbbbbbbb': { status: 'good' },
    }
    const r = report(
      [
        start,
        alert(23, 58, 'review', 'my-site changed', true, '20261025-235800-aaaaaaaa'),
        alert(1, 0, 'review', 'my-site changed', true, '20261026-010000-bbbbbbbb'),
        alert(2, 0, 'review', 'haven changed', true, '20261026-020000-cccccccc'),
        end(7, 30),
      ],
      { review: (id) => store[id] ?? null },
    )
    expect(r.reviews).toEqual([
      { id: '20261025-235800-aaaaaaaa', at: at(23, 58), title: 'my-site changed', said: 'Made the hero green.', status: 'new' },
      { id: '20261026-010000-bbbbbbbb', at: at(1, 0), title: 'my-site changed', said: null, status: 'good' },
      { id: '20261026-020000-cccccccc', at: at(2, 0), title: 'haven changed', said: null, status: 'gone' },
    ])
    // A review is a closer look at a turn that finished: the count doesn't add them up twice.
    expect(r.summary).toBe('Nothing needed you. 3 things changed.')
    expect(report([start, alert(23, 58, 'finished', 'my-site finished'), alert(23, 58, 'review', 'my-site changed', true, '20261025-235800-aaaaaaaa'), end(7, 30)]).summary).toBe(
      'Nothing needed you. 1 thing changed.',
    )
  })

  it('says plainly when the Mac slept, even on a night that looks quiet', () => {
    const r = report([start, { type: 'slept', at: at(3, 10) }, { type: 'woke', at: at(6, 55) }, end(7, 30)])
    expect(r.gaps).toEqual([`The Mac slept ${clock(at(3, 10))} to ${clock(at(6, 55))}. Steward couldn't see that time.`])
    expect(r.summary).toBe(`Nothing needed you while Steward could see. It couldn't see ${clock(at(3, 10))} to ${clock(at(6, 55))}.`)
    const busy = report([start, alert(1, 0, 'approval', 'a is waiting on you'), { type: 'slept', at: at(3, 10) }, { type: 'woke', at: at(6, 55) }, end(7, 30)])
    expect(busy.summary).toBe(`1 thing needed you. Steward couldn't see ${clock(at(3, 10))} to ${clock(at(6, 55))}.`)
  })

  it('says when Steward was not running, and joins a sleep into the gap after it', () => {
    expect(report([start, { type: 'gap', at: at(1, 40), from: at(1, 0) }, end(7, 30)]).gaps).toEqual([`Steward wasn't running ${clock(at(1, 0))} to ${clock(at(1, 40))}, so it saw nothing then.`])
    // It slept and Steward was quit meanwhile: one gap, from the sleep to when it ran again.
    const both = report([start, { type: 'slept', at: at(2, 0) }, { type: 'gap', at: at(5, 0), from: at(2, 0) }, end(7, 30)])
    expect(both.gaps).toEqual([`Steward couldn't see ${clock(at(2, 0))} to ${clock(at(5, 0))}: the Mac slept, and Steward wasn't running.`])
    // A sleep that never woke, as far as the log knows, runs to the night's end.
    expect(report([start, { type: 'slept', at: at(6, 0) }, end(7, 30)]).gaps).toHaveLength(1)
  })

  it('leaves out a sleep too short to matter, and says "part of the night" for several', () => {
    const blink: WatchEvent[] = [{ type: 'slept', at: at(1, 0) }, { type: 'woke', at: at(1, 0) + GAP_MIN_MS - 1000 }]
    expect(report([start, ...blink, end(7, 30)]).gaps).toEqual([])
    const two = report([start, { type: 'slept', at: at(1, 0) }, { type: 'woke', at: at(1, 30) }, { type: 'slept', at: at(4, 0) }, { type: 'woke', at: at(5, 0) }, end(7, 30)])
    expect(two.gaps).toHaveLength(2)
    expect(two.summary).toBe("Nothing needed you while Steward could see. It couldn't see part of the night.")
    // Two sleeps a minute apart are one.
    expect(report([start, { type: 'slept', at: at(1, 0) }, { type: 'woke', at: at(1, 30) }, { type: 'slept', at: at(1, 31) }, { type: 'woke', at: at(2, 0) }, end(7, 30)]).gaps).toHaveLength(1)
  })

  it('keeps the lists short and counts the rest', () => {
    const many = Array.from({ length: LIST_MAX + 5 }, (_, i): WatchEvent => ({ type: 'alert', at: at(1, 0) + i * 11 * MINUTE, kind: 'approval', title: `s${i} is waiting on you`, level: 'urgent', held: true }))
    const r = report([start, ...many, end(7, 30)])
    expect(r.needed).toHaveLength(LIST_MAX)
    expect(r.more.needed).toBe(5)
    expect(r.summary).toBe(`${LIST_MAX + 5} things needed you.`)
  })

  it('never says more about an alert than its title, whatever else is in the log', () => {
    const r = report([start, { ...(alert(1, 0, 'approval', 'a is waiting on you') as object), detail: 'rm -rf build' } as unknown as WatchEvent, end(7, 30)])
    expect(JSON.stringify(r)).not.toContain('rm -rf')
  })

  it('calls an earlier night by its evening, and knows the nights either side', () => {
    expect(report([start, end(7, 30)], { latest: false }).title).toBe(`${new Date(at(23, 10)).toLocaleDateString([], { weekday: 'long' })} night`)
    // A Go rest after midnight is still the evening before's night.
    const late: WatchEvent = { ...start, at: at(1, 30) } as WatchEvent
    expect(report([late, end(7, 30)], { latest: false }).title).toBe(`${new Date(at(23, 10)).toLocaleDateString([], { weekday: 'long' })} night`)
    expect(report([start, end(7, 30)], { now: at(15, 0) }).title).toBe('Good afternoon')
    expect(report([start, end(7, 30)], { earlier: '20261024-230000', later: null })).toMatchObject({ earlier: '20261024-230000', later: null })
  })

  it("makes do with a log that lost its first or last line", () => {
    expect(report([alert(1, 0, 'finished', 'a finished'), { type: 'beat', at: at(3, 0) }]).span).toBe(`${clock(at(1, 0))} to ${clock(at(3, 0))}`)
    expect(report([]).span).toBe(`${clock(at(23, 10))} to ${clock(at(23, 10))}`)
  })
})
