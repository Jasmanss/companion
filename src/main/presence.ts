// The rules for Presence "Only when needed": when Steward comes out of hiding, when it goes back, and which alerts are
// worth peeking out for. Pure, so they're tested without a screen; index.ts and the notch window feed them the cursor
// and the clock, and do what they say.
import { formatAccelerator } from '../shared/shortcuts'
import type { AlertPeek, AlertView } from '../shared/types'
import { alertSwitch } from './alerts'

/** The cursor within this many points of the screen edge Steward is on is pushing against it. */
export const EDGE_ZONE = 2
/** Around the tab's saved spot (this far above and below its center) a push comes out sooner. */
export const EDGE_BAND = 40
/** How long the push (or, in the notch, the cursor resting on it) lasts before Steward comes out. */
export const EDGE_DWELL_MS = 300
export const NOTCH_DWELL_MS = 250
/** A push anywhere else along the edge lasts longer: the price of the bigger zone. */
export const EDGE_FAR_DWELL_MS = 500
/** A push is the cursor held still: moving more than this starts it over, so dragging a scrollbar or sliding along the edge never counts. */
export const EDGE_STILL = 6
/** Once the tab is out, a new push counts only after the cursor has been this far from the edge. */
export const EDGE_REARM = 8
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

/** How far the cursor is from the edge Steward is on. */
const edgeGap = (cursor: Point, screen: Rect, edge: 'left' | 'right'): number => (edge === 'right' ? screen.x + screen.width - cursor.x : cursor.x - screen.x)

/** Where the push counts: the edge Steward is on, on its screen and work area, and where the tab's saved spot is. */
export interface EdgeAt {
  screen: Rect
  /** The screen's work area: no menu bar band, no Dock. */
  area: Rect
  edge: 'left' | 'right'
  /** The middle of the tab's saved spot (where it was dragged to), in screen coordinates. */
  savedCenterY: number
  /** The Dock sits on Steward's edge, which is then the Dock's: only the band around the saved spot counts, as before. */
  dockOnEdge: boolean
}

/**
 * The push zone: against the edge Steward is on, anywhere along the work area's height, so never in the menu bar band
 * and never beside a Dock at the bottom. With the Dock on the same edge, only the band around the tab's saved spot.
 */
export function inEdgeZone(cursor: Point, at: EdgeAt): boolean {
  if (!inRect(cursor, at.screen) || edgeGap(cursor, at.screen, at.edge) > EDGE_ZONE) return false
  if (at.dockOnEdge) return Math.abs(cursor.y - at.savedCenterY) <= EDGE_BAND
  return cursor.y >= at.area.y && cursor.y <= at.area.y + at.area.height
}

/** A push along the edge: where the cursor is being held (null: it isn't), and whether a push counts yet. */
export interface EdgePush {
  from: Point | null
  armed: boolean
}
export const freshPush = (): EdgePush => ({ from: null, armed: true })

/** What one look along the edge says, for stepPresence: pushing or not, how long the push has to last, and whether it starts over. */
export interface EdgeLook {
  push: EdgePush
  inZone: boolean
  dwellMs: number
  restart: boolean
}

/**
 * One look at the cursor along the edge. It's pushing when it's in the zone, held still (within EDGE_STILL), and armed:
 * while the tab is out a push can't count, and once it tucks away the cursor has to leave the edge (EDGE_REARM) before
 * one does, so a cursor resting on a scrollbar doesn't bring the tab back every couple of seconds. Near the saved spot
 * the push lasts EDGE_DWELL_MS, anywhere else EDGE_FAR_DWELL_MS.
 */
export function pushAlongEdge(p: EdgePush, cursor: Point, at: EdgeAt, revealed: boolean): EdgeLook {
  const away = !inRect(cursor, at.screen) || edgeGap(cursor, at.screen, at.edge) > EDGE_REARM
  const armed = away || (p.armed && !revealed)
  if (!armed || !inEdgeZone(cursor, at)) return { push: { from: null, armed }, inZone: false, dwellMs: EDGE_DWELL_MS, restart: false }
  const restart = !p.from || Math.hypot(cursor.x - p.from.x, cursor.y - p.from.y) > EDGE_STILL
  const from = restart || !p.from ? cursor : p.from
  const dwellMs = Math.abs(from.y - at.savedCenterY) <= EDGE_BAND ? EDGE_DWELL_MS : EDGE_FAR_DWELL_MS
  return { push: { from, armed }, inZone: true, dwellMs, restart }
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
  /** How long the push has to last: EDGE_DWELL_MS or EDGE_FAR_DWELL_MS on the edge, NOTCH_DWELL_MS in the notch. */
  dwellMs: number
  /** Hiding: the push moved, so it starts over (pushAlongEdge). */
  restart?: boolean
}
export interface PresenceStep {
  state: PresenceState
  change: 'reveal' | 'tuck' | null
}

/**
 * One look at the cursor. Hiding, a push that lasts dwellMs comes out; leaving cancels it, and moving starts it over.
 * Showing, the tuck timer runs while the cursor is away and everything is at rest, and the panel, a nudge or the agent
 * working all hold it off.
 * Something happening that isn't a push (the agent starts working) brings it out too.
 */
export function stepPresence(s: PresenceState, i: PresenceInput): PresenceStep {
  const stay = (state: PresenceState): PresenceStep => ({ state, change: null })
  if (!i.quiet || i.hidden) return stay(asleep())
  if (!s.revealed) {
    if (!i.rest) return { state: { revealed: true, since: null }, change: 'reveal' }
    if (!i.inZone) return stay(asleep())
    const since = i.restart ? i.now : (s.since ?? i.now)
    return i.now - since >= i.dwellMs ? { state: { revealed: true, since: null }, change: 'reveal' } : stay({ revealed: false, since })
  }
  if (!i.rest || i.onIt) return stay({ revealed: true, since: null })
  const since = s.since ?? i.now
  return i.now - since >= TUCK_MS ? { state: asleep(), change: 'tuck' } : stay({ revealed: true, since })
}

/** How long until the next look: sooner in the push zone, where the dwell is being timed. */
export const nextLookMs = (s: PresenceState, i: Pick<PresenceInput, 'inZone'>): number => (!s.revealed && i.inZone ? WATCH_ZONE_MS : WATCH_MS)

/* ---------- Alerts that peek out ---------- */

/**
 * Steward's own request (it needs your OK to run a command) blocks work like a session waiting on you does. A Visual
 * Review waits for your decision too: you turned it on by giving the project an address, so it counts the same.
 */
const needsMe = (key: string): boolean => alertSwitch(key) === 'sessionNeedsMe' || key.startsWith('agent-approval:') || key.startsWith('review:')

/**
 * Whether an alert peeks out from where Steward sits, for the "Alerts that peek out" choice. island: Steward is the notch
 * island, whose note says a session finished, so that alert doesn't come out under the notch as well.
 */
export function peeksOut(key: string, choice: AlertPeek, island = false): boolean {
  if (choice === 'none' || (island && key.startsWith('finished:'))) return false
  if (choice === 'all') return true
  return needsMe(key)
}

/**
 * Alerts that made it through the queue (Settings → Notifications has already silenced the types switched off), split
 * into the ones that peek out and the ones that wait in the menu bar until the panel opens.
 */
export function splitAlerts(list: AlertView[], choice: AlertPeek, island = false): { peek: AlertView[]; held: AlertView[] } {
  const peek: AlertView[] = []
  const held: AlertView[] = []
  for (const alert of list) (peeksOut(alert.key, choice, island) ? peek : held).push(alert)
  return { peek, held }
}

/**
 * In the notch island, the alerts it shows as itself instead of under the notch: a Visual Review, as the island's
 * catch-all note (its title and one line) until island Phase 3 gives reviews a size of their own. So the old alert
 * under the notch never shows for one.
 */
export const islandShows = (key: string): boolean => key.startsWith('review:')

/** The most alerts waiting for the panel. The oldest go first. */
export const MAX_HELD = 20

/**
 * The menu bar's title: how many sessions are waiting on you, and a plain dot when a quieter alert is waiting too. A
 * moon first while Overnight Watch is on.
 */
export function menuBarTitle(waiting: number, held: number, watching = false): string {
  return [watching ? '☾' : '', waiting > 0 ? String(waiting) : '', held > 0 ? '•' : ''].filter(Boolean).join(' ')
}

/* ---------- The first-time note ---------- */

/**
 * The one-time note in the panel the first time Steward is hiding: one short line saying how to bring it out. hotkey is
 * the opening shortcut, or '' if it's off. Beside another screen the cursor passes through the edge, so it isn't offered.
 */
export function presenceNote(o: NoteFor): string {
  const { title, how } = presenceNoteParts(o)
  return `${title} ${how}`
}

/** dockOnEdge: the Dock sits on that edge, so a push counts only at the tab's spot, not anywhere along it. */
type NoteFor = { where: 'left' | 'right' | 'notch'; hotkey: string; besideScreen: boolean; dockOnEdge?: boolean }

/** The note in two parts, for the first-launch peek: what's happening, and how to bring Steward out. */
export function presenceNoteParts(o: NoteFor): { title: string; how: string } {
  // A no-break space inside the shortcut, so it never wraps between the symbol and the key.
  const hotkey = o.hotkey ? formatAccelerator(o.hotkey).replace(' ', '\u00a0') : ''
  const key = hotkey ? `press ${hotkey}` : 'use the menu bar icon'
  const push = o.where === 'notch' ? 'Rest the cursor on the notch' : o.dockOnEdge ? `Push the ${o.where} edge` : `Push anywhere on the ${o.where} edge`
  const how = o.besideScreen && o.where !== 'notch' ? `${hotkey ? `Press ${hotkey}` : 'Use the menu bar icon'}.` : `${push} or ${key}.`
  return { title: 'Hides until you need it.', how }
}

/**
 * The first-launch peek's note. Under the notch it has one short line, so it leads with how to bring Steward out (the
 * whole note doesn't fit); at the edge it's the note in its two parts.
 */
export function firstPeekNote(o: NoteFor): { title: string; detail: string } {
  if (o.where !== 'notch') {
    const { title, how } = presenceNoteParts(o)
    return { title, detail: how }
  }
  const hotkey = o.hotkey ? formatAccelerator(o.hotkey).replace(' ', '\u00a0') : ''
  return { title: 'Rest the cursor on the notch', detail: hotkey ? `or press ${hotkey}.` : 'or use the menu bar icon.' }
}

/* ---------- The first-launch peek ---------- */

/** How long the first-launch peek stays out, at least, unless the cursor has been on it. */
export const FIRST_PEEK_HOLD_MS = 10_000

/**
 * The first launch of a fresh install, hiding until needed: the tab comes out once on its own, with the note, so a new
 * user sees where Steward lives. Never on an install that already had settings or state, never in Always visible, never twice.
 */
export const showFirstPeek = (o: { freshInstall: boolean; quiet: boolean; shown: boolean }): boolean => o.freshInstall && o.quiet && !o.shown

/**
 * The first-launch peek is over (it goes back to being the tab, which then tucks away like any reveal) once the cursor
 * isn't on it and either it has been on it already or the peek has been out for FIRST_PEEK_HOLD_MS.
 */
export const firstPeekOver = (o: { startedAt: number; touched: boolean; onIt: boolean; now: number }): boolean =>
  !o.onIt && (o.touched || o.now - o.startedAt >= FIRST_PEEK_HOLD_MS)
