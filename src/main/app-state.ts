import { promises as fs } from 'node:fs'

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

  async update(patch: Partial<State>): Promise<void> {
    this.data = { ...this.data, ...patch }
    await fs.writeFile(this.file, JSON.stringify(this.data, null, 2)).catch(() => {})
  }
}
