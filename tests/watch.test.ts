import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  ACTIVE_IDLE_S,
  alertKind,
  AWAY_IDLE_S,
  BACK_ACTIVE_MS,
  holdsAlerts,
  lookAt,
  newNight,
  parseWakeTime,
  wakeAt,
  WATCH_MAX_MS,
  WatchLog,
  type Night,
} from '../src/main/watch'

/** A local time on 2026-10-25. */
const at = (h: number, m = 0, day = 25) => new Date(2026, 9, day, h, m, 0, 0).getTime()

describe('the wake time', () => {
  it('reads "07:30" and nothing else', () => {
    expect(parseWakeTime('07:30')).toEqual({ h: 7, m: 30 })
    expect(parseWakeTime(' 23:05 ')).toEqual({ h: 23, m: 5 })
    for (const bad of ['7:30', '24:00', '07:60', '0730', '', 'soon', 730, null]) expect(parseWakeTime(bad)).toBeNull()
  })

  it('is the next time the clock shows it: tomorrow from the evening, today after midnight', () => {
    expect(wakeAt(at(23, 10), '07:30')).toBe(at(7, 30, 26))
    expect(wakeAt(at(1, 0), '07:30')).toBe(at(7, 30))
    // Less than a minute away is tomorrow's, not now (and tomorrow's is past the 12-hour cap).
    const now = at(7, 29) + 30_000
    expect(wakeAt(now, '07:30')).toBe(now + WATCH_MAX_MS)
    expect(wakeAt(at(7, 28), '07:30')).toBe(at(7, 30))
  })

  it('never makes a Watch longer than 12 hours', () => {
    expect(wakeAt(at(8, 0), '07:30')).toBe(at(8, 0) + WATCH_MAX_MS)
    expect(wakeAt(at(19, 30), '07:30')).toBe(at(7, 30, 26))
  })

  it('falls back to 7:30 for a wake time that does not read', () => {
    expect(wakeAt(at(23, 0), 'nonsense')).toBe(at(7, 30, 26))
  })
})

describe('a night', () => {
  const night = (o: Partial<Night> = {}): Night => ({ ...newNight(at(23, 10), '07:30'), ...o })

  it('is named after when it started, local time', () => {
    expect(newNight(at(23, 10) + 5000, '07:30')).toEqual({ id: '20261025-231005', since: at(23, 10) + 5000, until: at(7, 30, 26), away: false, activeSince: null })
  })

  it('ends at the wake time, or at the cap when the wake time was further', () => {
    expect(lookAt(night(), at(7, 30, 26), 900).end).toBe('wake-time')
    const long = newNight(at(8, 0), '07:30')
    expect(lookAt(long, at(20, 0), 900).end).toBe('cap')
    expect(lookAt(night(), at(3, 0, 26), 900).end).toBeNull()
  })

  it("doesn't count you at the Mac right after Go rest as being back", () => {
    let n = night()
    for (let t = at(23, 10); t < at(23, 20); t += 15_000) {
      const look = lookAt(n, t, 2)
      expect(look.end).toBeNull()
      n = look.night
    }
    expect(n.away).toBe(false)
  })

  it('ends once you are back: away first, then in use for two minutes', () => {
    let n = lookAt(night(), at(23, 30), AWAY_IDLE_S).night
    expect(n.away).toBe(true)
    // A key at 3 AM, then nothing: not back.
    n = lookAt(n, at(3, 0, 26), 5).night
    n = lookAt(n, at(3, 0, 26) + 40_000, ACTIVE_IDLE_S + 10).night
    expect(n.activeSince).toBeNull()
    // In use for two minutes: back.
    const start = at(6, 40, 26)
    let end = null
    for (let t = start; t <= start + BACK_ACTIVE_MS + 1; t += 15_000) {
      const look = lookAt(n, t, 3)
      n = look.night
      end = look.end
      if (end) break
    }
    expect(end).toBe('back')
    expect(n.activeSince).toBe(start - 3000)
  })

  it('holds alerts only while watching and nobody is at the Mac', () => {
    expect(holdsAlerts(true, AWAY_IDLE_S)).toBe(true)
    expect(holdsAlerts(true, AWAY_IDLE_S - 1)).toBe(false)
    expect(holdsAlerts(false, 10_000)).toBe(false)
  })

  it("knows an alert's kind from its key", () => {
    expect(alertKind('approval:s1:p1:npm test')).toBe('approval')
    expect(alertKind('review:20261024-101010-abcdef12')).toBe('review')
    expect(alertKind('')).toBe('alert')
  })
})

describe('the log', () => {
  const dirs: string[] = []
  afterEach(async () => {
    for (const d of dirs.splice(0)) await fs.rm(d, { recursive: true, force: true })
  })
  const temp = async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'steward-watch-'))
    dirs.push(dir)
    return dir
  }

  it('writes one line an event, in order, and reads them back', async () => {
    const log = new WatchLog(path.join(await temp(), 'watch'))
    void log.append('20261025-231000', { type: 'start', at: 1, until: 2, onBattery: false, sessionsWorking: 2 })
    void log.append('20261025-231000', { type: 'alert', at: 3, kind: 'approval', title: 'haven is waiting on you', level: 'urgent', held: true })
    await log.append('20261025-231000', { type: 'end', at: 4, why: 'up' })
    expect((await log.read('20261025-231000')).map((e) => e.type)).toEqual(['start', 'alert', 'end'])
  })

  it('skips a line cut off by a crash, and reads nothing for a night it never wrote', async () => {
    const dir = await temp()
    const log = new WatchLog(dir)
    await fs.writeFile(log.file('20261025-231000'), `${JSON.stringify({ type: 'beat', at: 5 })}\n{"type":"be`)
    expect(await log.read('20261025-231000')).toEqual([{ type: 'beat', at: 5 }])
    expect(await log.read('20261026-231000')).toEqual([])
  })

  it('keeps the newest 14 nights and nothing else of its own', async () => {
    const dir = await temp()
    const log = new WatchLog(dir)
    for (let d = 1; d <= 16; d++) await log.append(`202610${String(d).padStart(2, '0')}-230000`, { type: 'beat', at: d })
    await fs.writeFile(path.join(dir, 'notes.txt'), 'not a night')
    await log.prune()
    const left = (await fs.readdir(dir)).sort()
    expect(left).toHaveLength(15)
    expect(left[0]).toBe('20261003-230000.jsonl')
    expect(left).toContain('notes.txt')
  })

  it("never keeps an alert's detail: only its kind and title", async () => {
    const log = new WatchLog(await temp())
    await log.append('n', { type: 'alert', at: 1, kind: 'approval', title: 'haven is waiting on you', level: 'urgent', held: false })
    expect(await fs.readFile(log.file('n'), 'utf8')).not.toContain('detail')
  })
})
