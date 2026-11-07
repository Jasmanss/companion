import type { Project, ReviewHold } from '../shared/types'
import type { HeldStop } from './hook-server'
import type { HookPayload } from './hook-payload'
import { matchProject } from './sessions'

type TurnStop = Extract<HookPayload, { hook_event_name: 'Stop' }>

/** How long Claude waits for the user once the review is ready. After that it stops, and Send it back copies a note again. */
export const HOLD_DECIDE_MS = 120_000
/** How long a look at the page may hold Claude before there's anything to decide. */
export const HOLD_LOOK_MS = 60_000
/** Claude Code ignores the ninth "keep going" of a turn in a row, and that note would be lost. So eight is all one turn can take. */
export const HOLD_MAX_SENDS = 8

const turnKey = (event: { session_id: string; prompt_id?: string }) => `${event.session_id}:${event.prompt_id ?? ''}`

interface Open {
  event: TurnStop
  held: HeldStop
  /** The review being waited on. None yet while the page is being looked at. */
  reviewId: string | null
  until: number
  timer: ReturnType<typeof setTimeout>
}

export interface HoldDeps {
  projects(): Project[]
  /** Nobody is there to answer tonight: no reason to hold anyone. */
  awayForTheNight?(): boolean
  /** Which reviews are being waited on changed. */
  onChange(): void
  now?(): number
  log?(message: string): void
}

/**
 * "Hold the session for my review". A project that asks for it gets a second Stop hook that stays open while Steward looks
 * at the page and then while the user decides, so that Send it back can answer it with their note and Claude carries on
 * in the same turn. Everything else lets Claude stop: no review to decide, Looks good, Later, the time limit, a new prompt.
 */
export class ReviewHolds {
  /** Per session: one Stop can be in the air at a time. */
  private open = new Map<string, Open>()
  /** Per turn, how many times Steward has sent it back. */
  private sends = new Map<string, number>()
  /** Can be shortened (the smoke does). */
  decideMs = HOLD_DECIDE_MS

  constructor(private readonly deps: HoldDeps) {}

  /** The hold hook arrived. Returns whether it's being held: it's answered at once unless this project asks for that and the turn can still be sent back. */
  begin(event: TurnStop, held: HeldStop): boolean {
    const project = matchProject(event.cwd, this.deps.projects())
    if (!project?.url || !project.hold || this.deps.awayForTheNight?.()) {
      held.answer(null)
      return false
    }
    if ((this.sends.get(turnKey(event)) ?? 0) >= HOLD_MAX_SENDS) {
      this.deps.log?.(`${project.name}: sent back ${HOLD_MAX_SENDS} times in one turn, which is all Claude Code takes, so Claude stops here`)
      held.answer(null)
      return false
    }
    this.release(event.session_id, null)
    const hold: Open = { event, held, reviewId: null, until: this.now() + HOLD_LOOK_MS, timer: this.limit(event.session_id, HOLD_LOOK_MS) }
    this.open.set(event.session_id, hold)
    held.whenGone(() => {
      if (this.open.get(event.session_id) !== hold) return
      this.deps.log?.(`${project.name}: the session stopped waiting (stop pressed, closed, or out of time)`)
      this.forget(event.session_id)
    })
    return true
  }

  /** The look at the page is over. With a review the wait for the user starts; with none there's nothing to wait for. */
  looked(event: { session_id: string; prompt_id?: string }, reviewId: string | null): void {
    const hold = this.open.get(event.session_id)
    if (!hold || hold.reviewId !== null || turnKey(hold.event) !== turnKey(event)) return
    if (reviewId === null) {
      this.release(event.session_id, null)
      return
    }
    clearTimeout(hold.timer)
    hold.reviewId = reviewId
    hold.until = this.now() + this.decideMs
    hold.timer = this.limit(event.session_id, this.decideMs)
    this.deps.onChange()
  }

  /** Is Claude waiting on this turn, so that the alert can say so? */
  holding(event: { session_id: string; prompt_id?: string }): boolean {
    const hold = this.open.get(event.session_id)
    return Boolean(hold && turnKey(hold.event) === turnKey(event))
  }

  /** What the card and the viewer show about this review, or null when Claude isn't waiting on it. */
  view(reviewId: string): ReviewHold | null {
    const hold = this.find(reviewId)
    return hold ? { until: hold.until } : null
  }

  /** The user's note goes to Claude. Returns the Stop it answered, or null when Claude isn't waiting any more, so the note has to be copied. */
  sendBack(reviewId: string, note: string): TurnStop | null {
    const hold = this.find(reviewId)
    if (!hold) return null
    const key = turnKey(hold.event)
    this.sends.set(key, (this.sends.get(key) ?? 0) + 1)
    this.release(hold.event.session_id, note)
    return hold.event
  }

  /** Looks good, or Later: Claude can stop. */
  letGo(reviewId: string): void {
    const hold = this.find(reviewId)
    if (hold) this.release(hold.event.session_id, null)
  }

  /** A new prompt in a session that's being held: the user is there and wants it back, so don't make that prompt wait. */
  promptSent(sessionId: string): void {
    this.release(sessionId, null)
  }

  letGoAll(): void {
    for (const sessionId of [...this.open.keys()]) this.release(sessionId, null)
  }

  /**
   * A Stop after Steward sent the turn back says a Stop hook asked Claude to carry on, and that's true, but for everything
   * else in Steward it's the end of a round of work like any other. Both hooks' copies of it get the same answer, so a
   * turn stays known here after it's let go. A new prompt has a new id.
   */
  ownStop<T extends HookPayload>(event: T): T {
    if (event.hook_event_name !== 'Stop' || !event.stop_hook_active || !this.sends.has(turnKey(event))) return event
    return { ...event, stop_hook_active: false }
  }

  /** A new turn in this session: the older ones' counts are done with. */
  turnBegan(event: { session_id: string; prompt_id?: string }): void {
    const prefix = `${event.session_id}:`
    for (const key of this.sends.keys()) if (key.startsWith(prefix) && key !== turnKey(event)) this.sends.delete(key)
  }

  private find(reviewId: string): Open | undefined {
    return [...this.open.values()].find((hold) => hold.reviewId === reviewId)
  }

  private limit(sessionId: string, ms: number): ReturnType<typeof setTimeout> {
    const timer = setTimeout(() => {
      this.deps.log?.('no answer in time, so Claude stops')
      this.release(sessionId, null)
    }, ms)
    timer.unref?.()
    return timer
  }

  private release(sessionId: string, note: string | null): void {
    const hold = this.open.get(sessionId)
    if (!hold) return
    hold.held.answer(note)
    this.forget(sessionId)
  }

  private forget(sessionId: string): void {
    const hold = this.open.get(sessionId)
    if (!hold) return
    clearTimeout(hold.timer)
    this.open.delete(sessionId)
    if (hold.reviewId !== null) this.deps.onChange()
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }
}

/**
 * The look each recent Stop started. The plain hook and the hold hook send the same words at the same moment, in either
 * order (tried: 2 ms apart, both ways round). The plain one starts the look, and the hold hook has to find it, even one
 * that's over already. A later Stop of the same turn is at least the user's decision away.
 */
export class RecentStops<T> {
  private looks = new Map<string, Promise<T>>()

  constructor(private readonly keepMs = 5000) {}

  remember(event: TurnStop, look: Promise<T>): Promise<T> {
    const key = stopKey(event)
    this.looks.set(key, look)
    const timer = setTimeout(() => {
      if (this.looks.get(key) === look) this.looks.delete(key)
    }, this.keepMs)
    timer.unref?.()
    return look
  }

  find(event: TurnStop): Promise<T> | undefined {
    return this.looks.get(stopKey(event))
  }
}

const stopKey = (event: TurnStop) => JSON.stringify([event.session_id, event.prompt_id, event.stop_hook_active ?? false, event.last_assistant_message])
