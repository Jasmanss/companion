// Overnight Watch's night report: what happened while you rested, from the night's log (watch.ts) and Visual Review's
// store. A template like the morning brief, no model call, so it costs nothing. Words only: an alert's title, never its
// detail. It says plainly when Steward couldn't see, even when that makes the night look worse.
import type { NightReport } from '../shared/types'
import { urgencyOf, type WatchEvent } from './watch'

/** "3:10 AM", as the rest of Steward shows a time. */
export const clock = (at: number): string => new Date(at).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })

/** The same thing again this soon joins the first ("… (3 times)"). */
export const JOIN_MS = 10 * 60_000
/** Shorter than this, Steward not seeing isn't worth a line. */
export const GAP_MIN_MS = 60_000
/** Gaps this close together are one. */
const GAP_JOIN_MS = 2 * 60_000
/** The longest the lists get; the rest is a count. */
export const LIST_MAX = 20
const GAPS_MAX = 6

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`

export interface NightInput {
  id: string
  events: WatchEvent[]
  /** A Visual Review as the store has it now, or null when it's no longer kept. */
  review(id: string): { status: 'new' | 'good' | 'sent-back'; said?: string } | null
  now: number
  /** The newest night kept gets a greeting; an earlier one its weekday ("Saturday night"). */
  latest: boolean
  earlier: string | null
  later: string | null
}

/** When a night started, from its id (20261025-231000, local time), for a log that lost its first line. */
function idTime(id: string): number {
  const m = /^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})$/.exec(id)
  return m ? new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]).getTime() : 0
}

const greeting = (now: number) => {
  const h = new Date(now).getHours()
  return h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening'
}

/** A night that starts after midnight is still the evening before's ("Saturday night" at 1 AM on Sunday). */
const nightOf = (since: number) => `${new Date(since - 6 * 60 * 60 * 1000).toLocaleDateString([], { weekday: 'long' })} night`

interface Gap {
  from: number
  to: number
  slept: boolean
  away: boolean
}

/**
 * When Steward couldn't see: the Mac asleep (slept to woke) or Steward not running (a gap line, written when it started
 * again). A sleep that never woke is covered by the gap after it, or runs to the night's end. Close ones join; short
 * ones go.
 */
function gapsIn(events: WatchEvent[], endAt: number): Gap[] {
  const found: Gap[] = []
  events.forEach((e, i) => {
    if (e.type === 'gap') found.push({ from: e.from, to: e.at, slept: false, away: true })
    if (e.type !== 'slept') return
    const next = events.slice(i + 1).find((n) => n.type === 'woke' || n.type === 'gap' || n.type === 'end')
    if (next?.type === 'woke') found.push({ from: e.at, to: next.at, slept: true, away: false })
    else if (next?.type !== 'gap') found.push({ from: e.at, to: next?.at ?? endAt, slept: true, away: false })
    // A gap after it: the Mac slept, then Steward wasn't running. The gap line covers it from this sleep on.
    else found.push({ from: e.at, to: next.at, slept: true, away: true })
  })
  found.sort((a, b) => a.from - b.from)
  const joined: Gap[] = []
  for (const g of found) {
    const last = joined.at(-1)
    if (last && g.from - last.to <= GAP_JOIN_MS) {
      last.to = Math.max(last.to, g.to)
      last.slept ||= g.slept
      last.away ||= g.away
    } else joined.push({ ...g })
  }
  return joined.filter((g) => g.to - g.from >= GAP_MIN_MS)
}

function gapLine(g: Gap): string {
  const span = `${clock(g.from)} to ${clock(g.to)}`
  if (g.slept && g.away) return `Steward couldn't see ${span}: the Mac slept, and Steward wasn't running.`
  if (g.slept) return `The Mac slept ${span}. Steward couldn't see that time.`
  return `Steward wasn't running ${span}, so it saw nothing then.`
}

/** What a line that needed you is called in the report. */
function neededTitle(e: WatchEvent): string {
  switch (e.type) {
    case 'alert':
      return e.title
    case 'deploy':
      return `${e.project} production deploy failed`
    case 'ci':
      return `${e.project}: CI failed on main (${e.workflow})`
    case 'stuck':
      return e.minutes >= 90 ? `${e.name} may be stuck: nothing for ${e.minutes} minutes` : `${e.name} was quiet for ${e.minutes} minutes`
    default:
      return e.type
  }
}

/** The night report, from one night's log. */
export function buildNightReport({ id, events, review, now, latest, earlier, later }: NightInput): NightReport {
  const start = events.find((e) => e.type === 'start')
  const end = events.findLast((e) => e.type === 'end')
  const since = start?.at ?? events[0]?.at ?? idTime(id)
  const endAt = end?.at ?? events.at(-1)?.at ?? since
  const opened = events.filter((e) => e.type === 'opened').map((e) => e.at)

  // What came after: you looked at the panel, or the night ended with you there.
  const after = (at: number): string => {
    const look = opened.find((t) => t > at)
    if (look !== undefined) return `You opened Steward at ${clock(look)}.`
    if (end?.type === 'end' && end.why === 'back') return `You were back at ${clock(end.at)}.`
    if (end?.type === 'end' && end.why === 'up') return `You were up at ${clock(end.at)}.`
    return ''
  }

  const needed: (NightReport['needed'][number] & { last: number; times: number; base: string })[] = []
  const finished: NightReport['finished'] = []
  const reviews: NightReport['reviews'] = []
  const deploys = new Map<string, NightReport['deploys'][number]['runs']>()
  const ci = new Map<string, NightReport['ci'][number]['runs']>()
  const need = (at: number, title: string, did: string, urgent: boolean) => {
    const last = needed.at(-1)
    if (last && last.base === title && at - last.last <= JOIN_MS) {
      last.times++
      last.last = at
      last.title = `${title} (${last.times} times)`
      return
    }
    needed.push({ at, title, note: [did, after(at)].filter(Boolean).join(' '), urgent, last: at, times: 1, base: title })
  }

  for (const e of events) {
    const urgency = urgencyOf(e)
    if (urgency === 'urgent' || urgency === 'waiting') need(e.at, neededTitle(e), e.type === 'alert' ? (e.held ? 'Waited for you on screen.' : 'Showed on screen.') : '', urgency === 'urgent')
    if (e.type === 'deploy') deploys.set(e.project, [...(deploys.get(e.project) ?? []), { at: e.at, ok: e.ok, production: e.production }])
    else if (e.type === 'ci') ci.set(e.project, [...(ci.get(e.project) ?? []), { at: e.at, ok: e.ok, workflow: e.workflow }])
    else if (e.type === 'alert' && e.kind === 'finished') finished.push({ at: e.at, title: e.title })
    else if (e.type === 'alert' && e.kind === 'review' && e.review) {
      const r = review(e.review)
      reviews.push({ id: e.review, at: e.at, title: e.title, said: r?.said ?? null, status: r?.status ?? 'gone' })
    }
  }

  const gaps = gapsIn(events, endAt)
  const changed = Math.max(finished.length, reviews.length)
  const blind = gaps.length === 1 ? `Steward couldn't see ${clock(gaps[0].from)} to ${clock(gaps[0].to)}.` : gaps.length ? "Steward couldn't see part of the night." : ''
  const summary =
    !needed.length && !changed
      ? blind
        ? `Nothing needed you while Steward could see. ${blind.replace("Steward couldn't", "It couldn't")}`
        : 'Quiet night. Nothing needed you.'
      : [needed.length ? `${plural(needed.length, 'thing')} needed you.` : 'Nothing needed you.', changed ? `${plural(changed, 'thing')} changed.` : '', blind].filter(Boolean).join(' ')

  const gapLines = gaps.slice(0, GAPS_MAX).map(gapLine)
  if (gaps.length > GAPS_MAX) gapLines.push(`And ${plural(gaps.length - GAPS_MAX, 'more time')} it couldn't see.`)

  return {
    id,
    title: latest ? greeting(now) : nightOf(since),
    span: `${clock(since)} to ${clock(endAt)}`,
    summary,
    gaps: gapLines,
    needed: needed.slice(0, LIST_MAX).map(({ at, title, note, urgent }) => ({ at, title, note, urgent })),
    finished: finished.slice(0, LIST_MAX),
    reviews: reviews.slice(0, LIST_MAX),
    deploys: [...deploys].map(([project, runs]) => ({ project, runs })),
    ci: [...ci].map(([project, runs]) => ({ project, runs })),
    more: { needed: Math.max(0, needed.length - LIST_MAX), finished: Math.max(0, finished.length - LIST_MAX) },
    earlier,
    later,
  }
}
