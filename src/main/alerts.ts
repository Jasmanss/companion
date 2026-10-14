import type { AlertLevel, AlertView, Mood, NotificationPrefs } from '../shared/types'

export interface AlertInput {
  /** Identifies the event: an alert whose key was already seen is dropped. */
  key: string
  level: AlertLevel
  title: string
  detail?: string
  mood?: Mood
  scope?: string
  action?: { label: string; prompt: string }
}

/**
 * Which switch in Settings → Notifications an alert answers to, from its key. Steward's own requests (it needs your
 * OK to run a command) answer to none: they always peek out.
 */
export function alertSwitch(key: string): keyof NotificationPrefs | null {
  if (key.startsWith('approval:') || key.startsWith('input:')) return 'sessionNeedsMe'
  if (key.startsWith('finished:')) return 'sessionFinished'
  if (key.startsWith('deploy-failed:')) return 'buildFailed'
  if (key.startsWith('deploy-ready:') || key.startsWith('pr-merged:')) return 'celebrations'
  return null
}

/** An alert whose switch is off still happens (the face reacts, the panel's lists show it) but doesn't peek out. */
export function withNotificationPrefs(input: AlertInput, prefs: NotificationPrefs): AlertInput {
  const key = alertSwitch(input.key)
  return key && !prefs[key] ? { ...input, level: 'quiet' } : input
}

interface Deps {
  /** Show these now: a single urgent alert, or a batch of normal ones. */
  show(alerts: AlertView[]): void
  /** How long normal alerts wait for company before they're shown together. */
  batchMs?: number
  now?(): number
}

const MAX_KEYS = 2000
const HISTORY = 50

/**
 * The one queue every alert goes through. Quiet unless it matters: urgent alerts show at once, normal ones
 * are batched, quiet ones only land in the history, and an alert never shows twice.
 */
export class AlertQueue {
  private seen = new Set<string>()
  private pending: AlertView[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  private nextId = 1
  private history: AlertView[] = []

  constructor(private readonly deps: Deps) {}

  /** Returns false when the alert is a repeat and was dropped. */
  push(input: AlertInput): boolean {
    if (this.seen.has(input.key)) return false
    this.seen.add(input.key)
    // Sets iterate in insertion order, so this drops the oldest key.
    if (this.seen.size > MAX_KEYS) this.seen.delete(this.seen.values().next().value!)

    const alert: AlertView = { ...input, id: this.nextId++, at: this.deps.now?.() ?? Date.now() }
    this.history = [alert, ...this.history].slice(0, HISTORY)
    if (alert.level === 'urgent') this.deps.show([alert])
    else if (alert.level === 'normal') {
      this.pending.push(alert)
      this.timer ??= setTimeout(() => this.flush(), this.deps.batchMs ?? 20_000)
    }
    return true
  }

  /** Show whatever normal alerts are waiting, now. */
  flush(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (this.pending.length) this.deps.show(this.pending)
    this.pending = []
  }

  /** Newest first. */
  recent(): AlertView[] {
    return this.history
  }
}
