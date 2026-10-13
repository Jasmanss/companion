import type { Activity, ActivityKind, ActivityStatus } from './types'

/** Each kind of step's label while it runs, and once it's over (a failed step keeps that label and gets a ✗). */
const LABELS: Record<ActivityKind, [running: string, finished: string]> = {
  thinking: ['Thinking', 'Thought'],
  'read-file': ['Reading', 'Read'],
  'list-files': ['Listing', 'Listed'],
  'search-web': ['Searching the web', 'Searched the web'],
  'fetch-page': ['Reading', 'Read'],
  'run-command': ['Running', 'Ran'],
  screenshot: ['Screenshotting', 'Screenshotted'],
  'add-image': ['Adding to the tray', 'Added to the tray'],
  'read-logs': ['Reading the build log', 'Read the build log'],
  'search-photos': ['Searching photos', 'Searched photos'],
}

export function activityLabel(kind: ActivityKind, status: ActivityStatus): string {
  return LABELS[kind][status === 'running' ? 0 : 1]
}

/** A site's name for showing: the hostname without "www.". */
export function siteOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** The sites in a web search's results, in order, each once, at most `max`. */
export function resultSites(results: unknown, max = 6): string[] {
  if (!Array.isArray(results)) return []
  const sites: string[] = []
  for (const r of results) {
    const url = (r as { url?: unknown } | null)?.url
    if (typeof url !== 'string') continue
    const site = siteOf(url)
    if (!sites.includes(site)) sites.push(site)
    if (sites.length >= max) break
  }
  return sites
}

/** What the context pill shows the agent is on: a file, a folder, a page, a command, a search, or something else. */
export interface Touch {
  kind: 'file' | 'folder' | 'page' | 'command' | 'query' | 'other'
  text: string
}

/** The thing a step is on, for the context pill; null when there's nothing to show (thinking, the project's top folder). */
export function touchOf(step: Activity): Touch | null {
  if (!step.target) return null
  switch (step.kind) {
    case 'thinking':
      return null
    case 'read-file':
      return { kind: 'file', text: step.target }
    case 'list-files':
      // The project's top folder is the project's name, which the pill already shows.
      return step.target.endsWith('/') ? { kind: 'folder', text: step.target } : null
    case 'fetch-page':
      return { kind: 'page', text: step.target.replace(/^https?:\/\/(www\.)?/, '') }
    case 'run-command':
      return { kind: 'command', text: step.target }
    case 'search-web':
    case 'search-photos':
      return { kind: 'query', text: step.target }
    default:
      return { kind: 'other', text: step.target }
  }
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const short = (text: string | undefined, max = 32) => (!text ? '' : text.length > max ? `${text.slice(0, max - 1)}…` : text)

export interface SummaryPart {
  text: string
  failed: boolean
}

/**
 * Finished steps as one quiet line, a part per kind in the order they first happened:
 * "Read 3 files · Searched the web · Ran npm test". Thinking isn't counted.
 */
export function summarize(steps: Activity[]): SummaryPart[] {
  const order: ActivityKind[] = []
  const byKind = new Map<ActivityKind, Activity[]>()
  for (const step of steps) {
    if (step.kind === 'thinking') continue
    if (!byKind.has(step.kind)) {
      byKind.set(step.kind, [])
      order.push(step.kind)
    }
    byKind.get(step.kind)!.push(step)
  }
  return order.map((kind) => {
    const xs = byKind.get(kind)!
    const n = xs.length
    const text = {
      'read-file': `Read ${plural(n, 'file')}`,
      'list-files': n === 1 ? 'Listed files' : `Listed ${n} folders`,
      'search-web': n === 1 ? 'Searched the web' : `Searched the web ${n} times`,
      'fetch-page': `Read ${plural(n, 'page')}`,
      'run-command': n === 1 && xs[0].target ? `Ran ${short(xs[0].target)}` : `Ran ${plural(n, 'command')}`,
      screenshot: `Took ${plural(n, 'screenshot')}`,
      'add-image': `Added ${plural(n, 'image')}`,
      'read-logs': n === 1 ? 'Read the build log' : `Read ${n} build logs`,
      'search-photos': n === 1 ? 'Searched photos' : `Searched photos ${n} times`,
      thinking: '',
    }[kind]
    return { text, failed: xs.some((x) => x.status === 'failed') }
  })
}

/** The summary as plain text, for screen readers and titles. */
export const summaryText = (steps: Activity[]) =>
  summarize(steps)
    .map((p) => (p.failed ? `${p.text} (failed)` : p.text))
    .join(' · ')
