import { promises as fs } from 'node:fs'

interface State {
  /** When the panel was last open (closed, really): the start of "away". */
  lastSeenAt: number
  /** Local date (YYYY-MM-DD) of the last morning brief. */
  lastBriefDate?: string
  /** The one-time note about Steward hiding until it's needed has been shown. */
  presenceNoteSeen?: boolean
}

/** Small bits of state that should survive restarts. */
export class AppState {
  private data: State = { lastSeenAt: Date.now() }

  constructor(private readonly file: string) {}

  async load(): Promise<void> {
    try {
      this.data = { ...this.data, ...(JSON.parse(await fs.readFile(this.file, 'utf8')) as Partial<State>) }
    } catch {
      // first run
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

  async update(patch: Partial<State>): Promise<void> {
    this.data = { ...this.data, ...patch }
    await fs.writeFile(this.file, JSON.stringify(this.data, null, 2)).catch(() => {})
  }
}
