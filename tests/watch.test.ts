import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  ACTIVE_IDLE_S,
  alertKind,
  AWAY_IDLE_S,
  BACK_ACTIVE_MS,
  holdsAlerts,
  lookAt,
  newNight,
  OvernightWatch,
  parseWakeTime,
  wakeAt,
  WATCH_LOOK_MS,
  WATCH_MAX_MS,
  WatchLog,
  type Night,
  type WatchSaved,
} from '../src/main/watch'

/** A local time on 2026-10-25. */
const at = (h: number, m = 0, day = 25) => new Date(2026, 9, day, h, m, 0, 0).getTime()
const MINUTE = 60_000

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

describe('the Watch', () => {
  const dirs: string[] = []
  const logs: WatchLog[] = []
  afterEach(async () => {
    vi.useRealTimers()
    // A night that just ended may still be writing its last lines.
    for (const l of logs.splice(0)) await l.settled()
    for (const d of dirs.splice(0)) await fs.rm(d, { recursive: true, force: true })
  })

  async function setup(saved: WatchSaved = {}, start = at(23, 10)) {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'steward-watch-'))
    dirs.push(dir)
    const state = { now: start, idle: 2, battery: false }
    const awake: boolean[] = []
    const saves: WatchSaved[] = []
    let changes = 0
    const log = new WatchLog(dir)
    logs.push(log)
    const watch = new OvernightWatch(
      {
        log,
        now: () => state.now,
        idleSeconds: () => state.idle,
        onBattery: () => state.battery,
        sessionsWorking: () => 2,
        keepAwake: (on) => awake.push(on),
        save: (s) => saves.push(s),
        changed: () => changes++,
      },
      saved,
    )
    /** Time passes: the clock moves and the looks every 15 s happen. */
    const pass = (ms: number, idle = state.idle) => {
      for (let t = 0; t < ms; t += WATCH_LOOK_MS) {
        state.now += WATCH_LOOK_MS
        state.idle = idle
        vi.advanceTimersByTime(WATCH_LOOK_MS)
      }
    }
    return { watch, log, state, awake, saves, pass, changes: () => changes }
  }

  it('starts at Go rest, keeps the Mac awake, and writes the first line', async () => {
    const { watch, log, awake, saves, changes } = await setup()
    expect(watch.watching).toBe(false)
    const night = watch.start('06:45')
    expect(night.until).toBe(at(6, 45, 26))
    expect(watch.watching).toBe(true)
    expect(awake).toEqual([true])
    expect(saves.at(-1)).toEqual({ night, wakeTime: '06:45', ended: undefined })
    expect(changes()).toBe(1)
    // Go rest again while watching: the same night.
    expect(watch.start('08:00')).toBe(night)
    expect((await log.read(night.id))[0]).toEqual({ type: 'start', at: at(23, 10), until: at(6, 45, 26), onBattery: false, sessionsWorking: 2 })
  })

  it("ends at the wake time and lets the Mac sleep again; I'm up and Stop end it too", async () => {
    const { watch, log, awake, pass, saves } = await setup()
    const night = watch.start('07:30')
    pass(8 * 60 * MINUTE + 20 * MINUTE, 900)
    expect(watch.watching).toBe(false)
    expect(watch.ended).toEqual({ at: at(7, 30, 26), why: 'wake-time' })
    expect(awake).toEqual([true, false])
    expect(saves.at(-1)).toEqual({ night: undefined, wakeTime: '07:30', ended: { at: at(7, 30, 26), why: 'wake-time' } })
    const events = await log.read(night.id)
    expect(events.at(-1)).toEqual({ type: 'end', at: at(7, 30, 26), why: 'wake-time' })
    // A heartbeat every 5 minutes, so a gap can be told later.
    expect(events.filter((e) => e.type === 'beat').length).toBeGreaterThan(90)

    watch.start('07:30')
    watch.stop('up')
    expect(watch.ended?.why).toBe('up')
    expect(awake).toEqual([true, false, true, false])
  })

  it('ends when you are back at the Mac after being away, and not before', async () => {
    const { watch, pass } = await setup()
    watch.start('07:30')
    pass(10 * MINUTE, 3) // still at the Mac after Go rest
    expect(watch.watching).toBe(true)
    pass(30 * MINUTE, 900) // away
    pass(BACK_ACTIVE_MS + WATCH_LOOK_MS, 3) // back
    expect(watch.watching).toBe(false)
    expect(watch.ended?.why).toBe('back')
  })

  it('writes down sleep, waking, power and alerts, without their details', async () => {
    const { watch, log, state } = await setup()
    const night = watch.start('07:30')
    watch.power('on-battery')
    watch.power('suspend')
    state.now = at(3, 0, 26)
    watch.power('resume')
    watch.alert({ key: 'approval:s1:p1:rm -rf build', title: 'haven is waiting on you', level: 'urgent' }, true)
    const events = await log.read(night.id)
    // Waking is also a look: hours went by, so a heartbeat too.
    expect(events.map((e) => e.type)).toEqual(['start', 'power', 'slept', 'woke', 'beat', 'alert'])
    expect(JSON.stringify(events)).not.toContain('rm -rf')
    expect(events.at(-1)).toMatchObject({ kind: 'approval', title: 'haven is waiting on you', held: true })
  })

  it('wakes up past the wake time and ends at it', async () => {
    const { watch, state } = await setup()
    watch.start('07:30')
    watch.power('suspend')
    state.now = at(9, 0, 26)
    watch.power('resume')
    expect(watch.ended).toEqual({ at: at(7, 30, 26), why: 'wake-time' })
  })

  it('holds alerts only while nobody is at the Mac', async () => {
    const { watch, state } = await setup()
    state.idle = 900
    expect(watch.holdsAlerts()).toBe(false)
    watch.start('07:30')
    expect(watch.holdsAlerts()).toBe(true)
    state.idle = 4
    expect(watch.holdsAlerts()).toBe(false)
  })

  it('goes on after a restart, saying Steward was not running; one that ran out is closed at its end', async () => {
    const first = await setup()
    const night = first.watch.start('07:30')
    first.pass(20 * MINUTE, 900)
    const lastSeen = (await first.log.read(night.id)).at(-1)!.at

    // Steward starts again at 1 AM, with the night saved and the same log folder.
    const resumed = new OvernightWatch({ log: first.log, now: () => at(1, 0, 26), idleSeconds: () => 900, onBattery: () => false, sessionsWorking: () => 0, keepAwake: () => {}, save: () => {}, changed: () => {} }, { night, wakeTime: '07:30' })
    await resumed.resume()
    expect(resumed.watching).toBe(true)
    expect((await first.log.read(night.id)).at(-1)).toEqual({ type: 'gap', at: at(1, 0, 26), from: lastSeen })
    resumed.stop('stopped')

    const late = new OvernightWatch({ log: first.log, now: () => at(10, 0, 26), idleSeconds: () => 900, onBattery: () => false, sessionsWorking: () => 0, keepAwake: () => {}, save: () => {}, changed: () => {} }, { night, wakeTime: '07:30' })
    await late.resume()
    expect(late.watching).toBe(false)
    expect(late.ended).toEqual({ at: at(7, 30, 26), why: 'wake-time' })
  })

  it('remembers the wake time picked, and ignores one that does not read', async () => {
    const { watch, saves } = await setup({ wakeTime: '06:30' })
    expect(watch.wakeTime).toBe('06:30')
    watch.setWakeTime('8:00')
    expect(watch.wakeTime).toBe('06:30')
    watch.setWakeTime('08:00')
    expect(saves.at(-1)?.wakeTime).toBe('08:00')
  })
})
