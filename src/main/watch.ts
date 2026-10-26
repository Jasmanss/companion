// Overnight Watch: "Go rest, I've got the build." From Go rest until the wake time (or "I'm up") Steward keeps the Mac
// awake and writes down what happens in a log, one file a night, so the morning can say what went on. On-screen alerts
// wait while nobody is at the Mac. Phase 1: no phone and no night report yet; the log is what it keeps.
//
// The rules are pure (a clock and the idle time are passed in), so they are tested without a Mac or a night. Words
// only in the log: an alert's kind and title, never its detail (an approval's detail can be the command, and commands
// can hold secrets).
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { WatchEnd } from '../shared/types'

/** A Watch never runs longer than this, whatever the wake time says. */
export const WATCH_MAX_MS = 12 * 60 * 60 * 1000
/** The Mac idle this long (seconds): nobody is there. Alerts wait, and a later return counts as being back. */
export const AWAY_IDLE_S = 5 * 60
/** Idle less than this at a look (seconds): the Mac is in use. */
export const ACTIVE_IDLE_S = 30
/** In use this long after being away: you're back, and the night is over. */
export const BACK_ACTIVE_MS = 2 * 60_000
/** How often the Watch looks at the clock and the idle time. */
export const WATCH_LOOK_MS = 15_000
/** How often it writes that it is still watching, so a gap (Steward not running) can be told afterwards. */
export const WATCH_BEAT_MS = 5 * 60_000
/** Nights of logs kept. */
export const NIGHTS_KEPT = 14
export const DEFAULT_WAKE_TIME = '07:30'

/** "07:30" (24-hour, as an <input type="time"> gives it) as hours and minutes, or null. */
export function parseWakeTime(text: unknown): { h: number; m: number } | null {
  const match = typeof text === 'string' ? /^([01]\d|2[0-3]):([0-5]\d)$/.exec(text.trim()) : null
  return match ? { h: Number(match[1]), m: Number(match[2]) } : null
}

/**
 * When a Watch started now with this wake time ends: the next time the clock (local time) shows it, at least a minute
 * from now, and never more than WATCH_MAX_MS after now.
 */
export function wakeAt(now: number, wakeTime: string): number {
  const t = parseWakeTime(wakeTime) ?? parseWakeTime(DEFAULT_WAKE_TIME)!
  const at = new Date(now)
  at.setHours(t.h, t.m, 0, 0)
  if (at.getTime() <= now + 60_000) at.setDate(at.getDate() + 1)
  return Math.min(at.getTime(), now + WATCH_MAX_MS)
}

/** One night's Watch, as kept across restarts. */
export interface Night {
  /** The log's name: when it started, local time, as 20261025-231000. */
  id: string
  since: number
  until: number
  /** Nobody has been at the Mac (idle AWAY_IDLE_S) since Go rest: from then on, coming back ends the night. */
  away: boolean
  /** Since when the Mac has been in use, after being away. */
  activeSince: number | null
}

export function newNight(now: number, wakeTime: string): Night {
  const d = new Date(now)
  const two = (n: number) => String(n).padStart(2, '0')
  const id = `${d.getFullYear()}${two(d.getMonth() + 1)}${two(d.getDate())}-${two(d.getHours())}${two(d.getMinutes())}${two(d.getSeconds())}`
  return { id, since: now, until: wakeAt(now, wakeTime), away: false, activeSince: null }
}

/**
 * One look during the night: the time is up (the wake time, or the 12-hour cap), or you're back (in use for
 * BACK_ACTIVE_MS after being away), or it goes on. Being at the Mac right after Go rest doesn't count as back: you have
 * to have been away first.
 */
export function lookAt(night: Night, now: number, idleS: number): { night: Night; end: WatchEnd | null } {
  if (now >= night.until) return { night, end: night.until - night.since >= WATCH_MAX_MS ? 'cap' : 'wake-time' }
  if (idleS >= AWAY_IDLE_S) return { night: { ...night, away: true, activeSince: null }, end: null }
  if (idleS >= ACTIVE_IDLE_S) return { night: { ...night, activeSince: null }, end: null }
  const activeSince = night.activeSince ?? now - idleS * 1000
  const next = { ...night, activeSince }
  return { night: next, end: night.away && now - activeSince >= BACK_ACTIVE_MS ? 'back' : null }
}

/** On-screen alerts wait while watching and nobody is at the Mac. Someone there sees them as usual. */
export const holdsAlerts = (watching: boolean, idleS: number): boolean => watching && idleS >= AWAY_IDLE_S

/** An alert's kind, from its key ("approval:s1:p1" is approval), for the log. */
export const alertKind = (key: string): string => key.split(':')[0] || 'alert'

/** What the log keeps, one JSON line each. */
export type WatchEvent =
  | { type: 'start'; at: number; until: number; onBattery: boolean; sessionsWorking: number }
  | { type: 'end'; at: number; why: WatchEnd }
  | { type: 'alert'; at: number; kind: string; title: string; level: string; held: boolean }
  /** The Mac went to sleep, and woke: Steward saw nothing in between. */
  | { type: 'slept'; at: number }
  | { type: 'woke'; at: number }
  | { type: 'power'; at: number; onBattery: boolean }
  /** Steward wasn't running from `from` until it started again, at `at`. */
  | { type: 'gap'; at: number; from: number }
  | { type: 'beat'; at: number }

const isEvent = (e: unknown): e is WatchEvent => typeof e === 'object' && e !== null && typeof (e as WatchEvent).type === 'string' && typeof (e as WatchEvent).at === 'number'

/** The nights' logs: <dir>/<night id>.jsonl, the newest NIGHTS_KEPT kept. Writes happen one after another. */
export class WatchLog {
  private writing: Promise<void> = Promise.resolve()

  constructor(private readonly dir: string) {}

  file(id: string): string {
    return path.join(this.dir, `${id}.jsonl`)
  }

  /** Add a line to a night's log. Never throws: a log that can't be written shouldn't stop the Watch. */
  append(id: string, event: WatchEvent): Promise<void> {
    const line = `${JSON.stringify(event)}\n`
    this.writing = this.writing.then(async () => {
      await fs.mkdir(this.dir, { recursive: true })
      await fs.appendFile(this.file(id), line)
    }).catch(() => {})
    return this.writing
  }

  /** A night's log, in order. Lines that don't read as events are skipped. */
  async read(id: string): Promise<WatchEvent[]> {
    await this.writing
    const text = await fs.readFile(this.file(id), 'utf8').catch(() => '')
    const events: WatchEvent[] = []
    for (const line of text.split('\n')) {
      if (!line.trim()) continue
      try {
        const event: unknown = JSON.parse(line)
        if (isEvent(event)) events.push(event)
      } catch {
        // a line cut off by a crash
      }
    }
    return events
  }

  /** Keep the newest NIGHTS_KEPT logs. */
  async prune(keep = NIGHTS_KEPT): Promise<void> {
    await this.writing
    const names = (await fs.readdir(this.dir).catch(() => [])).filter((n) => /^\d{8}-\d{6}\.jsonl$/.test(n)).sort()
    for (const name of names.slice(0, Math.max(0, names.length - keep))) await fs.rm(path.join(this.dir, name), { force: true })
  }
}
