// The rules for Presence "Only when needed": when Steward comes out of hiding, when it goes back, and which alerts are
// worth peeking out for. Pure, so they're tested without a screen; index.ts and the notch window feed them the cursor
// and the clock, and do what they say.
import { formatAccelerator } from '../shared/shortcuts'
import type { AlertPeek, AlertView } from '../shared/types'
import { alertSwitch } from './alerts'

/** The cursor within this many points of the screen edge, inside the tab's band, is pushing against Steward. */
export const EDGE_ZONE = 2
/** How far above and below the tab's center the push counts. Anywhere else on the edge (a scrollbar, a side panel) does nothing. */
export const EDGE_BAND = 40
/** How long the push (or, in the notch, the cursor resting on it) lasts before Steward comes out. */
export const EDGE_DWELL_MS = 300
export const NOTCH_DWELL_MS = 250
/** How long after the cursor leaves that Steward goes back. */
export const TUCK_MS = 1500
/** How often the cursor is checked while Steward is hidden, and while it's at the push zone. */
export const WATCH_MS = 200
export const WATCH_ZONE_MS = 50

export interface Point {
  x: number
  y: number
}
export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export const inRect = (p: Point, r: Rect, margin = 0): boolean => p.x >= r.x - margin && p.x <= r.x + r.width + margin && p.y >= r.y - margin && p.y <= r.y + r.height + margin

/** The push zone on a screen: against the edge Steward is on, within the band around the tab's center (centerY, in screen coordinates). */
export function inEdgeZone(cursor: Point, screen: Rect, edge: 'left' | 'right', centerY: number): boolean {
  if (!inRect(cursor, screen)) return false
  const gap = edge === 'right' ? screen.x + screen.width - cursor.x : cursor.x - screen.x
  return gap <= EDGE_ZONE && Math.abs(cursor.y - centerY) <= EDGE_BAND
}

/** Another screen touches the edge Steward is on, so the cursor passes through it instead of pushing (the Dock has the same limit). */
export function screenBeside(primary: Rect, others: Rect[], edge: 'left' | 'right'): boolean {
  return others.some((o) => {
    const touches = edge === 'right' ? Math.abs(o.x - (primary.x + primary.width)) <= 1 : Math.abs(o.x + o.width - primary.x) <= 1
    return touches && o.y < primary.y + primary.height && o.y + o.height > primary.y
  })
}

/** Where Steward is hiding or showing. since: when the push began (hiding), or when the cursor left (showing); null when neither is running. */
export interface PresenceState {
  revealed: boolean
  since: number | null
}
export const asleep = (): PresenceState => ({ revealed: false, since: null })

export interface PresenceInput {
  now: number
  /** Presence is "Only when needed". */
  quiet: boolean
  /** Manually hidden: off until it's brought back, so nothing here reveals it. */
  hidden: boolean
  /** Panel closed, no nudge showing, the agent not working. */
  rest: boolean
  /** Hiding: the cursor is in the push zone (on the edge) or resting on the notch. */
  inZone: boolean
  /** Showing: the cursor is on the tab, or on the notch's shape. */
  onIt: boolean
  /** How long the push has to last: EDGE_DWELL_MS, or NOTCH_DWELL_MS in the notch. */
  dwellMs: number
}
export interface PresenceStep {
  state: PresenceState
  change: 'reveal' | 'tuck' | null
}

/**
 * One look at the cursor. Hiding, a push that lasts dwellMs comes out; leaving cancels it. Showing, the tuck timer runs
 * while the cursor is away and everything is at rest, and the panel, a nudge or the agent working all hold it off.
 * Something happening that isn't a push (the agent starts working) brings it out too.
 */
export function stepPresence(s: PresenceState, i: PresenceInput): PresenceStep {
  const stay = (state: PresenceState): PresenceStep => ({ state, change: null })
  if (!i.quiet || i.hidden) return stay(asleep())
  if (!s.revealed) {
    if (!i.rest) return { state: { revealed: true, since: null }, change: 'reveal' }
    if (!i.inZone) return stay(asleep())
    const since = s.since ?? i.now
    return i.now - since >= i.dwellMs ? { state: { revealed: true, since: null }, change: 'reveal' } : stay({ revealed: false, since })
  }
  if (!i.rest || i.onIt) return stay({ revealed: true, since: null })
  const since = s.since ?? i.now
  return i.now - since >= TUCK_MS ? { state: asleep(), change: 'tuck' } : stay({ revealed: true, since })
}

/** How long until the next look: sooner in the push zone, where the dwell is being timed. */
export const nextLookMs = (s: PresenceState, i: Pick<PresenceInput, 'inZone'>): number => (!s.revealed && i.inZone ? WATCH_ZONE_MS : WATCH_MS)

/* ---------- Alerts that peek out ---------- */

/** Steward's own request (it needs your OK to run a command) blocks work like a session waiting on you does. */
const needsMe = (key: string): boolean => alertSwitch(key) === 'sessionNeedsMe' || key.startsWith('agent-approval:')

/** Whether an alert peeks out from where Steward sits, for the "Alerts that peek out" choice. */
export function peeksOut(key: string, choice: AlertPeek): boolean {
  if (choice === 'all') return true
  if (choice === 'none') return false
  return needsMe(key)
}

/**
 * Alerts that made it through the queue (Settings → Notifications has already silenced the types switched off), split
 * into the ones that peek out and the ones that wait in the menu bar until the panel opens.
 */
export function splitAlerts(list: AlertView[], choice: AlertPeek): { peek: AlertView[]; held: AlertView[] } {
  const peek: AlertView[] = []
  const held: AlertView[] = []
  for (const alert of list) (peeksOut(alert.key, choice) ? peek : held).push(alert)
  return { peek, held }
}

/** The most alerts waiting for the panel. The oldest go first. */
export const MAX_HELD = 20

/** The menu bar's title: how many sessions are waiting on you, and a plain dot when a quieter alert is waiting too. */
export function menuBarTitle(waiting: number, held: number): string {
  return [waiting > 0 ? String(waiting) : '', held > 0 ? '•' : ''].filter(Boolean).join(' ')
}

/* ---------- The first-time note ---------- */

/**
 * The one-time note in the panel the first time Steward is hiding: one short line saying how to bring it out. hotkey is
 * the opening shortcut, or '' if it's off. Beside another screen the cursor passes through the edge, so it isn't offered.
 */
export function presenceNote(o: { where: 'left' | 'right' | 'notch'; hotkey: string; besideScreen: boolean }): string {
  // A no-break space inside the shortcut, so it never wraps between the symbol and the key.
  const hotkey = o.hotkey ? formatAccelerator(o.hotkey).replace(' ', '\u00a0') : ''
  const key = hotkey ? `press ${hotkey}` : 'use the menu bar icon'
  const push = o.where === 'notch' ? 'Rest the cursor on the notch' : `Push the ${o.where} edge`
  return o.besideScreen && o.where !== 'notch' ? `Hides until you need it. ${hotkey ? `Press ${hotkey}` : 'Use the menu bar icon'}.` : `Hides until you need it. ${push} or ${key}.`
}
