// Overnight Watch: "Go rest, I've got the build." From Go rest until the wake time (or "I'm up") Steward keeps the Mac
// awake and writes down what happens in a log, one file a night, so the morning can say what went on (night-report.ts).
// On-screen alerts wait while nobody is at the Mac. What each line means overnight is urgencyOf's to say. No phone yet.
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
/** Opening the panel more often than this is written down once. */
export const OPENED_EVERY_MS = 60_000
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
  /** review: a Visual Review's id, so the report can show its card. */
  | { type: 'alert'; at: number; kind: string; title: string; level: string; held: boolean; review?: string }
  /** The panel opened: someone looked. */
  | { type: 'opened'; at: number }
  /** A deploy went out (ok) or failed: the project's name and whether it was production, nothing more. */
  | { type: 'deploy'; at: number; project: string; ok: boolean; production: boolean }
  /** A run on main ended green (ok) or red: the project and the workflow's name. */
  | { type: 'ci'; at: number; project: string; workflow: string; ok: boolean }
  /** A session working with nothing from it for this many minutes (stuck.ts). */
  | { type: 'stuck'; at: number; name: string; minutes: number }
  /** The Mac went to sleep, and woke: Steward saw nothing in between. */
  | { type: 'slept'; at: number }
  | { type: 'woke'; at: number }
  | { type: 'power'; at: number; onBattery: boolean }
  /** Steward wasn't running from `from` until it started again, at `at`. */
  | { type: 'gap'; at: number; from: number }
  | { type: 'beat'; at: number }

/** How much an event matters overnight: urgent (Phase 4 calls), waiting on you (Phase 4 texts), or the report's only. */
export type Urgency = 'urgent' | 'waiting' | 'report'

/** Alerts that wait on you: a session wanting your OK or your input, and Steward's own requests. */
const WAITING_KINDS = new Set(['approval', 'input', 'agent-approval'])

/**
 * How much a line of the log matters: a production deploy failing, CI going red on main and a session quiet for 90
 * minutes are urgent; a session waiting on you, or quiet for 45, waits on you; a session finishing, a review, a branch
 * deploy and a green run are the report's. null: not news (the Watch's own lines, and alerts whose source writes its
 * own line, like a deploy's).
 */
export function urgencyOf(e: WatchEvent): Urgency | null {
  switch (e.type) {
    case 'alert':
      return WAITING_KINDS.has(e.kind) ? 'waiting' : e.kind === 'finished' || e.kind === 'review' ? 'report' : null
    case 'deploy':
      return !e.ok && e.production ? 'urgent' : 'report'
    case 'ci':
      return e.ok ? 'report' : 'urgent'
    case 'stuck':
      return e.minutes >= 90 ? 'urgent' : 'waiting'
    default:
      return null
  }
}

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

  /** Once every line asked for so far is written. */
  settled(): Promise<void> {
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

  /** The nights kept, newest first. */
  async list(): Promise<string[]> {
    await this.writing
    const names = await fs.readdir(this.dir).catch(() => [])
    return names
      .filter((n) => /^\d{8}-\d{6}\.jsonl$/.test(n))
      .map((n) => n.slice(0, -'.jsonl'.length))
      .sort()
      .reverse()
  }

  /** Keep the newest NIGHTS_KEPT logs. */
  async prune(keep = NIGHTS_KEPT): Promise<void> {
    for (const id of (await this.list()).slice(keep)) await fs.rm(this.file(id), { force: true })
  }

  /** "Clear night reports": every night goes, except the one named (a night going on). */
  async clear(except?: string): Promise<void> {
    for (const id of await this.list()) if (id !== except) await fs.rm(this.file(id), { force: true })
  }
}

export interface WatchDeps {
  log: WatchLog
  now?(): number
  /** Seconds since the Mac was last used (powerMonitor.getSystemIdleTime). */
  idleSeconds(): number
  onBattery(): boolean
  /** How many Claude Code sessions are working now, for the log's first line. */
  sessionsWorking(): number
  /** Keep the Mac from sleeping, or let it again (powerSaveBlocker). */
  keepAwake(on: boolean): void
  /** Keep what survives a restart: the night going on, the wake time picked, how the last one ended. */
  save(state: WatchSaved): void
  /** Watching started, stopped, or the wake time changed: tell the panel and the menu bar. */
  changed(): void
  /** A night ended: its report is ready to be built once the log has settled. */
  ended?(night: Night, why: WatchEnd): void
}

export interface WatchSaved {
  night?: Night
  wakeTime?: string
  ended?: { at: number; why: WatchEnd }
  /** The night whose report hasn't been seen yet. */
  unseen?: string
}

/**
 * The Watch itself: Go rest starts a night, the look every WATCH_LOOK_MS ends it, and what happens meanwhile goes in
 * its log. One blocker keeps the Mac awake for exactly as long as a night goes on.
 */
export class OvernightWatch {
  private current: Night | null = null
  private wake: string
  private last: WatchSaved['ended']
  private timer: ReturnType<typeof setInterval> | undefined
  private lastBeat = 0
  private lastOpened = 0
  private unseenId: string | undefined

  constructor(
    private readonly deps: WatchDeps,
    saved: WatchSaved = {},
  ) {
    this.wake = parseWakeTime(saved.wakeTime) ? saved.wakeTime! : DEFAULT_WAKE_TIME
    this.last = saved.ended
    this.current = saved.night ?? null
    this.unseenId = saved.unseen
  }

  get watching(): boolean {
    return this.current !== null
  }

  get night(): Night | null {
    return this.current
  }

  get wakeTime(): string {
    return this.wake
  }

  get ended(): WatchSaved['ended'] {
    return this.last
  }

  /** The night that ended whose report hasn't been seen yet. */
  get unseen(): string | undefined {
    return this.unseenId
  }

  /** Its report was shown (or the reports were cleared). */
  seen(): void {
    if (this.unseenId === undefined) return
    this.unseenId = undefined
    this.save()
  }

  /**
   * At launch, with a night saved from before: it goes on if there's time left (the log says Steward wasn't running
   * meanwhile), or it is closed at its end time.
   */
  async resume(): Promise<void> {
    const night = this.current
    if (!night) return
    const now = this.now()
    const events = await this.deps.log.read(night.id)
    const lastSeen = events.at(-1)?.at ?? night.since
    if (now >= night.until) {
      await this.deps.log.append(night.id, { type: 'gap', at: night.until, from: lastSeen })
      this.finish(night, night.until, night.until - night.since >= WATCH_MAX_MS ? 'cap' : 'wake-time')
      return
    }
    await this.deps.log.append(night.id, { type: 'gap', at: now, from: lastSeen })
    this.run()
  }

  /** Go rest: a night starts now, until the wake time (also remembered for next time). */
  start(wakeTime: string): Night {
    if (this.current) return this.current
    if (parseWakeTime(wakeTime)) this.wake = wakeTime
    const now = this.now()
    const night = newNight(now, this.wake)
    this.current = night
    this.last = undefined
    this.unseenId = undefined
    // The first line, before anything else this night writes; then the oldest nights beyond NIGHTS_KEPT go.
    void this.deps.log.append(night.id, { type: 'start', at: now, until: night.until, onBattery: this.deps.onBattery(), sessionsWorking: this.deps.sessionsWorking() })
    void this.deps.log.prune()
    this.run()
    return night
  }

  /** Stop watching, or "I'm up". */
  stop(why: 'stopped' | 'up'): void {
    if (this.current) this.finish(this.current, this.now(), why)
  }

  /** One look: the time, and whether you're back. Also writes the heartbeat. */
  look(): void {
    const night = this.current
    if (!night) return
    const now = this.now()
    const { night: next, end } = lookAt(night, now, this.deps.idleSeconds())
    if (end) return this.finish(next, end === 'back' ? now : Math.min(now, next.until), end)
    if (next.away !== night.away || next.activeSince !== night.activeSince) {
      this.current = next
      if (next.away !== night.away) this.save()
    }
    if (now - this.lastBeat >= WATCH_BEAT_MS) {
      this.lastBeat = now
      void this.deps.log.append(next.id, { type: 'beat', at: now })
    }
  }

  /** The Mac went to sleep or woke, or went on or off battery. */
  power(kind: 'suspend' | 'resume' | 'on-battery' | 'on-ac'): void {
    const night = this.current
    if (!night) return
    const at = this.now()
    if (kind === 'suspend') void this.deps.log.append(night.id, { type: 'slept', at })
    else if (kind === 'resume') {
      void this.deps.log.append(night.id, { type: 'woke', at })
      // It may have slept past the wake time.
      this.look()
    } else void this.deps.log.append(night.id, { type: 'power', at, onBattery: kind === 'on-battery' })
  }

  /** An alert came while watching: its kind and title go in the log, and whether it waited (nobody at the Mac). */
  alert(a: { key: string; title: string; level: string }, held: boolean): void {
    const night = this.current
    if (!night) return
    const kind = alertKind(a.key)
    const review = kind === 'review' ? a.key.slice('review:'.length) : ''
    void this.deps.log.append(night.id, { type: 'alert', at: this.now(), kind, title: a.title, level: a.level, held, ...(review ? { review } : {}) })
  }

  /** The panel opened while watching: someone looked. Written down once a minute at most. */
  opened(): void {
    const night = this.current
    const at = this.now()
    if (!night || at - this.lastOpened < OPENED_EVERY_MS) return
    this.lastOpened = at
    void this.deps.log.append(night.id, { type: 'opened', at })
  }

  /** A deploy went out or failed while watching. */
  deploy(d: { project: string; ok: boolean; production: boolean }): void {
    const night = this.current
    if (night) void this.deps.log.append(night.id, { type: 'deploy', at: this.now(), project: d.project, ok: d.ok, production: d.production })
  }

  /** A run on main ended while watching. */
  ci(c: { project: string; workflow: string; ok: boolean }): void {
    const night = this.current
    if (night) void this.deps.log.append(night.id, { type: 'ci', at: this.now(), project: c.project, workflow: c.workflow, ok: c.ok })
  }

  /** A session has been quiet this long while working. */
  stuck(s: { name: string; minutes: number }): void {
    const night = this.current
    if (night) void this.deps.log.append(night.id, { type: 'stuck', at: this.now(), name: s.name, minutes: s.minutes })
  }

  /** Once every line written so far is in the log. */
  settled(): Promise<void> {
    return this.deps.log.settled()
  }

  /** On-screen alerts wait now: watching, and nobody at the Mac. */
  holdsAlerts(): boolean {
    return holdsAlerts(this.watching, this.deps.idleSeconds())
  }

  /** Remember a wake time picked on the card without starting. */
  setWakeTime(wakeTime: string): void {
    if (!parseWakeTime(wakeTime) || wakeTime === this.wake) return
    this.wake = wakeTime
    this.save()
    this.deps.changed()
  }

  private run(): void {
    this.deps.keepAwake(true)
    clearInterval(this.timer)
    this.timer = setInterval(() => this.look(), WATCH_LOOK_MS)
    this.timer.unref?.()
    this.lastBeat = this.now()
    this.save()
    this.deps.changed()
  }

  private finish(night: Night, at: number, why: WatchEnd): void {
    clearInterval(this.timer)
    this.timer = undefined
    this.current = null
    this.last = { at, why }
    this.unseenId = night.id
    void this.deps.log.append(night.id, { type: 'end', at, why })
    this.deps.keepAwake(false)
    this.save()
    this.deps.changed()
    this.deps.ended?.(night, why)
  }

  private save(): void {
    this.deps.save({ night: this.current ?? undefined, wakeTime: this.wake, ended: this.last, unseen: this.unseenId })
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }
}
