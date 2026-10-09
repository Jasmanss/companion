import type { Brief, DeployInfo, LeftOff, SessionView } from '../shared/types'

const DAY_MS = 24 * 60 * 60 * 1000

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

/** The local date as YYYY-MM-DD: the brief shows once per day. */
export function localDate(now: Date): string {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
}

/** "Since" for the brief: when you were last here, but never more than a day back. */
export function briefSince(lastSeenAt: number, now: number): number {
  return Math.max(lastSeenAt, now - DAY_MS)
}

interface Input {
  now: Date
  since: number
  deploys: DeployInfo[]
  sessions: SessionView[]
  leftOff: LeftOff | null
  /** null when gh isn't installed. */
  dependabot: Brief['dependabot']
}

/** The morning brief, from a template only: no model call, so it's free. */
export function buildBrief({ now, since, deploys, sessions, leftOff, dependabot }: Input): Brief {
  const recent = deploys.filter((d) => (d.ready ?? d.created) >= since)
  const failed = recent.filter((d) => d.state === 'ERROR')
  const ready = recent.filter((d) => d.state === 'READY')
  const finished = sessions.filter((s) => s.state === 'finished' && s.updatedAt >= since)
  const prCount = dependabot?.reduce((n, p) => n + p.prs.length, 0) ?? 0

  const parts: string[] = []
  if (ready.length || failed.length) {
    const went = ready.length ? `${plural(ready.length, 'deploy')} went out` : 'No deploys went out'
    parts.push(failed.length ? `${went}, ${failed.length} failed.` : `${went}.`)
  }
  if (finished.length) parts.push(`${plural(finished.length, 'session')} finished.`)
  if (prCount) parts.push(`${plural(prCount, 'Dependabot PR')} ${prCount === 1 ? 'is' : 'are'} open.`)

  return {
    greeting: now.getHours() < 12 ? 'Good morning' : now.getHours() < 18 ? 'Good afternoon' : 'Good evening',
    date: now.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }),
    summary: parts.length ? parts.join(' ') : 'Quiet since you were last here.',
    failed,
    ready,
    sessions: finished,
    leftOff,
    dependabot,
  }
}
