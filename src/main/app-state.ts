import { promises as fs } from 'node:fs'
import { spotsFrom, type PanelSpot } from '../shared/panel-place'
import type { WatchEnd } from '../shared/types'
import type { Night, WatchSaved } from './watch'

interface State {
  /** When the panel was last open (closed, really): the start of "away". */
  lastSeenAt: number
  /** Local date (YYYY-MM-DD) of the last morning brief. */
  lastBriefDate?: string
  /** The one-time note about Steward hiding until it's needed has been shown. */
  presenceNoteSeen?: boolean
  /** The first-launch peek has been shown (it only ever shows once). */
  firstPeekShown?: boolean
  /** Where the tab sits on each display's edge, by display id: its center as a fraction of the work area's height. */
  tabPlaces?: Record<string, number>
  /** Where the panel was dragged to on each display, by display id (see shared/panel-place). None: it was never moved. */
  panelPlaces?: Record<string, PanelSpot>
  /** The display the panel was last left on. */
  panelDisplay?: string
  /** Overnight Watch: the night going on (so a restart carries on with it), the wake time last picked, the last end. */
  watch?: WatchSaved
}

const ENDS = new Set<WatchEnd>(['wake-time', 'up', 'stopped', 'back', 'cap'])

/** What was saved of the Watch, as far as it still reads: a night with the wrong shape is dropped. */
function watchFrom(saved: unknown): WatchSaved {
  const w = (saved ?? {}) as Partial<Record<keyof WatchSaved, unknown>>
  const n = w.night as Partial<Night> | undefined
  const night =
    n && typeof n.id === 'string' && /^\d{8}-\d{6}$/.test(n.id) && typeof n.since === 'number' && typeof n.until === 'number'
      ? { id: n.id, since: n.since, until: n.until, away: n.away === true, activeSince: typeof n.activeSince === 'number' ? n.activeSince : null }
      : undefined
  const e = w.ended as WatchSaved['ended'] | undefined
  const ended = e && typeof e.at === 'number' && ENDS.has(e.why) ? { at: e.at, why: e.why } : undefined
  const unseen = typeof w.unseen === 'string' && /^\d{8}-\d{6}$/.test(w.unseen) ? w.unseen : undefined
  return { night, wakeTime: typeof w.wakeTime === 'string' ? w.wakeTime : undefined, ended, unseen }
}

/** Small bits of state that should survive restarts. */
export class AppState {
  private data: State = { lastSeenAt: Date.now() }
  /** There was no state file: Steward has never run here (or never got as far as saving any). */
  missing = false

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    try {
      this.data = { ...this.data, ...(JSON.parse(await fs.readFile(this.file, 'utf8')) as Partial<State>) }
    } catch (err) {
      // first run
      this.missing = (err as NodeJS.ErrnoException).code === 'ENOENT'
    }
  }

  get lastSeenAt(): number {
    return this.data.lastSeenAt
  }

  get lastBriefDate(): string | undefined {
    return this.data.lastBriefDate
  }

  get presenceNoteSeen(): boolean {
    return this.data.presenceNoteSeen === true
  }

  get firstPeekShown(): boolean {
    return this.data.firstPeekShown === true
  }

  get tabPlaces(): Record<string, number> {
    const places = this.data.tabPlaces
    return places && typeof places === 'object' ? Object.fromEntries(Object.entries(places).filter(([, v]) => typeof v === 'number')) : {}
  }

  get panelPlaces(): Record<string, PanelSpot> {
    return spotsFrom(this.data.panelPlaces)
  }

  get watch(): WatchSaved {
    return watchFrom(this.data.watch)
  }

  get panelDisplay(): string | undefined {
    return typeof this.data.panelDisplay === 'string' ? this.data.panelDisplay : undefined
  }

  async update(patch: Partial<State>): Promise<void> {
    this.data = { ...this.data, ...patch }
    await fs.writeFile(this.file, JSON.stringify(this.data, null, 2)).catch(() => {})
  }
}
