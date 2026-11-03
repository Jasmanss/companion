import type { Mood } from '../shared/types'

/** How long each event mood shows. Worried stays until good news for the same project, or this long. */
const HOLD_MS: Partial<Record<Mood, number>> = { celebrating: 12_000, done: 5_000, mad: 6_000, worried: 30 * 60_000 }
const STICKY = new Set<Mood>(['worried'])

interface Entry {
  mood: Mood
  scope?: string
  at: number
  until: number
}

/** Which face real events call for right now. Short moods (mad among them) win while they last; worried waits underneath. */
export class MoodBoard {
  private entries: Entry[] = []

  apply(mood: Mood | undefined, scope: string | undefined, now: number): void {
    const hold = mood && HOLD_MS[mood]
    if (!mood || !hold) return
    // A deploy that's ready (or a merge) for a project ends the worry about that project.
    if (mood === 'celebrating' && scope) this.clear(scope)
    // Something broke: mad for a moment, then worried until it's fixed.
    if (mood === 'mad') this.apply('worried', scope, now)
    this.entries = this.entries.filter((e) => !(e.mood === mood && e.scope === scope))
    this.entries.push({ mood, scope, at: now, until: now + hold })
  }

  /** Forget the worry for one scope. */
  clear(scope: string): void {
    this.entries = this.entries.filter((e) => !(STICKY.has(e.mood) && e.scope === scope))
  }

  current(now: number): Mood | null {
    this.entries = this.entries.filter((e) => e.until > now)
    const newest = (list: Entry[]) => list.reduce<Entry | null>((best, e) => (!best || e.at >= best.at ? e : best), null)
    return (newest(this.entries.filter((e) => !STICKY.has(e.mood))) ?? newest(this.entries))?.mood ?? null
  }

  /** A deploy failed and nothing for that project has worked since (mad, then worried), whatever face shows on top. */
  troubled(now: number): boolean {
    return this.entries.some((e) => (e.mood === 'mad' || e.mood === 'worried') && e.until > now)
  }

  /** When the current mood might change next, if ever. */
  nextChange(now: number): number | null {
    const future = this.entries.map((e) => e.until).filter((t) => t > now)
    return future.length ? Math.min(...future) : null
  }
}
