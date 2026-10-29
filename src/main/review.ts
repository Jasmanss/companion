import type { Project, ReviewCheck, ReviewHistoryEntry, ReviewProblem, ReviewTryResult, ReviewView } from '../shared/types'
import { addressLabel, landingNote, reviewNote, sayFrom } from '../shared/review'
import type { AlertInput } from './alerts'
import type { HookPayload } from './hook-payload'
import type { Diff } from './review-diff'
import { looksChanged, type ReviewRecord, type ReviewStore } from './review-store'
import { matchProject } from './sessions'
import type { StatusEntry } from './turn-files'

type TurnStart = Extract<HookPayload, { hook_event_name: 'UserPromptSubmit' }>
type TurnStop = Extract<HookPayload, { hook_event_name: 'Stop' }>

/** The widths Visual Review looks at: the desktop's, and a phone's (390 px) when the project asks for it. */
export type PageSize = 'desktop' | 'phone'

/** One picture of the page: the whole of it, as a PNG. */
export interface Shot {
  png: Buffer
  width: number
  height: number
  /** The address the page ended up at, after redirects. */
  landedOn?: string
}

export interface ReviewDeps {
  projects(): Project[]
  /** Capture the page at this address and width (an address on this Mac, settled and with animations off). Throws when it can't. */
  capture(url: string, size: PageSize): Promise<Shot>
  compare(before: Buffer, after: Buffer): Promise<Diff> | Diff
  /** The top of a full-page picture, small, for the card. */
  card(png: Buffer): Buffer
  store: ReviewStore
  /** The list of reviews waiting for a decision changed. */
  onChange(): void
  /** The list of projects whose page can't be seen changed. */
  onProblems?(): void
  /** The list of projects checked with no visible change changed. */
  onChecks?(): void
  /** A look after a turn was added to the history. */
  onHistory?(): void
  /** The project's git checkout: what it lists as changed when a turn starts, and how many files changed by its end (turn-files.ts). */
  gitFiles?: {
    look(dir: string): Promise<StatusEntry[] | null>
    changed(dir: string, since: number, start: StatusEntry[] | null): Promise<number | null>
  }
  now?(): number
  log?(message: string): void
}

/** If the before picture still isn't done when the turn ends, wait this long for it, then go without. */
const BEFORE_WAIT_MS = 15_000
/** A picture from an earlier look is only a stand-in for "before" for this long. */
const LAST_LOOK_MAX_AGE_MS = 6 * 60 * 60 * 1000
/** How many captures may wait their turn (two a look, with the phone's). More than this are skipped: they'd be late anyway. */
const MAX_QUEUED = 8
/** A turn that never ended (Claude Code was closed) is forgotten after this long. */
const TURN_MAX_AGE_MS = 6 * 60 * 60 * 1000
/** How many unreviewed cards the panel gets. */
const MAX_CARDS = 5

/** What a "before" needs of a picture: the picture and how tall the page was. */
type Look = Pick<Shot, 'png' | 'height'>

interface Turn {
  projectPath: string
  startedAt: number
  /** The page as the prompt was sent, or null when it couldn't be captured. */
  before: Promise<Look | null>
  /** The same at a phone's width, when the project asks for it. */
  phoneBefore: Promise<Look | null> | null
  /** What git listed as changed as the prompt was sent, for the file count. */
  files: Promise<StatusEntry[] | null>
}

/** Too many captures were waiting: that says nothing about the app, so it's no problem to show. */
const BUSY = 'Steward is busy looking at other pages'

const turnKey = (event: { session_id: string; prompt_id?: string }) => `${event.session_id}:${event.prompt_id ?? ''}`
/** The last look at a project's page is kept per width. */
const lookKey = (projectPath: string, size: PageSize) => (size === 'phone' ? `phone:${projectPath}` : projectPath)
const dataUrl = (jpeg: Buffer) => `data:image/jpeg;base64,${jpeg.toString('base64')}`

/**
 * The alert a review gets. It waits for your decision, so it is urgent (no waiting for a batch) and counts as needing
 * you (presence.ts). A click opens the panel, where the card is at the top.
 */
export function reviewAlert(record: Pick<ReviewRecord, 'id' | 'project' | 'projectPath'>): AlertInput {
  return { key: `review:${record.id}`, level: 'urgent', title: `${record.project} changed`, detail: 'Review what Claude did?', scope: record.projectPath }
}

/**
 * The plain "finished" alert of the turn a review is about (sessions.ts keys it by session and prompt): the review
 * says more, so that one goes. Without a prompt id, any of that session's finished alerts.
 */
export function sameTurnFinished(event: { session_id: string; prompt_id?: string }): (alert: { key: string }) => boolean {
  const key = `finished:${event.session_id}:`
  return event.prompt_id ? (a) => a.key === `${key}${event.prompt_id}` : (a) => a.key.startsWith(key)
}

/** Words for why a page couldn't be captured, for Settings and the log. */
export function describeCaptureError(err: unknown, address: string): string {
  const text = err instanceof Error ? err.message : String(err)
  const where = addressLabel(address)
  if (/ERR_CONNECTION_(REFUSED|RESET|CLOSED)|ERR_ADDRESS_UNREACHABLE|ERR_EMPTY_RESPONSE/.test(text)) return `Nothing is answering at ${where}. Start the app, then try again.`
  if (/took too long/.test(text)) return `${where} didn't finish loading in 20 seconds.`
  if (/blank/.test(text)) return `${where} loaded, but the page is blank.`
  if (/ERR_CERT|ERR_SSL/.test(text)) return `${where} has a certificate problem that Steward can't get past. Try the http address.`
  if (/only looks at pages on this Mac|send Steward to another site/.test(text)) return text
  return `Couldn't capture ${where}: ${text.replace(/^Error invoking remote method '[^']+': (Error: )?/, '')}`
}

/**
 * Visual Review's pairing. When a turn starts (UserPromptSubmit) it photographs the project's running page in the
 * background; when the turn stops (Stop) it photographs it again, and if the page looks different it keeps a review
 * with both. The address always comes from Settings, never from a hook, and the hook never waits on any of this.
 */
export class ReviewTracker {
  private turns = new Map<string, Turn>()
  /** The newest picture of each project's page, whatever took it: a stand-in for "before" when there is none. */
  private lastLooks = new Map<string, { shot: Look; at: number }>()
  /** Captures run one at a time: each opens a hidden window, and the page is the same page. */
  private tail: Promise<void> = Promise.resolve()
  private queued = 0
  /** Per project, why its page can't be seen right now. One at a time; the next capture that works clears it. */
  private troubles = new Map<string, ReviewProblem>()
  /** Per project, its newest check that found no visible change. Its next check or card replaces it. */
  private sameChecks = new Map<string, ReviewCheck>()

  constructor(private readonly deps: ReviewDeps) {}

  /** A turn started: photograph the page now, before Claude changes it. Never waits, never throws. */
  turnStarted(event: TurnStart): void {
    const project = this.projectFor(event.cwd)
    const now = this.now()
    for (const [key, turn] of this.turns) if (now - turn.startedAt > TURN_MAX_AGE_MS) this.turns.delete(key)
    if (!project?.url) return
    const address = project.url
    const before = this.lookNow(project, address, 'desktop')
    const phoneBefore = project.phone ? this.lookNow(project, address, 'phone') : null
    const files = this.deps.gitFiles?.look(project.path).catch(() => null) ?? Promise.resolve(null)
    this.turns.set(turnKey(event), { projectPath: project.path, startedAt: now, before, phoneBefore, files })
  }

  /**
   * A turn ended: photograph the page again and compare. Returns the review it made, or null when the page looks the
   * same, isn't running, or the project has no address. Never throws.
   */
  async turnStopped(event: TurnStop): Promise<ReviewRecord | null> {
    const project = this.projectFor(event.cwd)
    // Every way this ends without a card says why in the log, so a quiet turn can be explained.
    // Claude was asked to keep going by a Stop hook: this isn't the real end.
    if (event.stop_hook_active) return this.skip(`${project?.name ?? event.cwd}: Claude is carrying on (a Stop hook asked it to), so the turn hasn't ended`)
    const key = turnKey(event)
    const turn = this.turns.get(key)
    this.turns.delete(key)
    if (!project) return this.skip(`${event.cwd} isn't in any of your projects`)
    if (!project.url) return this.skip(`${project.name} has no App address`)
    const address = project.url
    try {
      let before = turn ? await withTimeout(turn.before, BEFORE_WAIT_MS) : null
      let from: ReviewRecord['before'] = 'turn-start'
      if (!before) {
        before = await this.lastLook(project.path, 'desktop')
        from = before ? 'last-look' : 'none'
      }
      let after: Shot
      try {
        after = await this.capture(address, 'desktop')
      } catch (err) {
        this.failed(project, address, err, 'no after picture')
        await this.keepLook(project, address, 'failed', { text: describeCaptureError(err, address) })
        return null
      }
      this.remember(project.path, after, 'desktop')
      // A login page is all Steward would ever see there: say so, and make no card of it.
      const landing = this.looked(project, address, after)
      if (landing?.login) {
        await this.keepLook(project, address, 'login', { text: landing.text })
        return this.skip(`${project.name}: ${landing.text}`)
      }
      const diff = before ? await this.deps.compare(before.png, after.png) : null
      const phone = project.phone ? await this.phoneLook(project, address, turn) : null
      // Nothing to compare with shows the page as it is. A page that looks the same (at both widths) makes no card, but a
      // quiet note.
      if (diff && !diff.changed && !phone?.diff?.changed) {
        this.checkedSame(project, address)
        await this.keepLook(project, address, 'same')
        const atPhone = phone?.diff ? `; at a phone's width ${phone.diff.changedPixels}` : ''
        return this.skip(`${project.name}: the page looks the same (${diff.changedPixels} small pixels changed${atPhone}, it takes ${diff.minPixels})`)
      }
      // What Claude said it did, from the Stop hook itself: nothing else is read, and nothing leaves the Mac.
      const said = sayFrom(event.last_assistant_message)
      const filesChanged = turn ? await this.filesChanged(project.path, turn) : null
      const record = await this.deps.store.save(
        {
          ...(said ? { said } : {}),
          ...(filesChanged !== null ? { filesChanged } : {}),
          ...(diff?.regions ? { regions: diff.regions } : {}),
          ...(phone
            ? {
                phone: {
                  before: phone.from,
                  heightBefore: phone.before?.height ?? null,
                  heightAfter: phone.after.height,
                  changedPixels: phone.diff?.changedPixels ?? 0,
                  minPixels: phone.diff?.minPixels ?? 0,
                  ...(phone.diff?.regions ? { regions: phone.diff.regions } : {}),
                },
              }
            : {}),
          project: project.name,
          projectPath: project.path,
          url: address,
          before: from,
          heightBefore: before?.height ?? null,
          heightAfter: after.height,
          changedPixels: diff?.changedPixels ?? 0,
          minPixels: diff?.minPixels ?? 0,
        },
        {
          before: before?.png,
          after: after.png,
          beforeCard: before ? this.deps.card(before.png) : undefined,
          afterCard: this.deps.card(after.png),
          beforePhone: phone?.before?.png,
          afterPhone: phone?.after.png,
        },
      )
      const atPhone = phone?.diff ? `; at a phone's width ${phone.diff.changed ? 'it changed' : 'the same'} (${phone.diff.changedPixels})` : ''
      const atDesktop = !diff ? 'no earlier picture, so only how it looks now' : `the page ${diff.changed ? 'changed' : "looks the same at the desktop's width"} (${diff.changedPixels} small pixels changed, it takes ${diff.minPixels})`
      this.log(`a review of ${project.name}: ${atDesktop}${atPhone}`)
      this.clearCheck(project.path)
      await this.keepLook(project, address, 'review', { reviewId: record.id })
      this.deps.onChange()
      return record
    } catch (err) {
      this.log(`no review of ${project.name}: ${err instanceof Error ? err.message : String(err)}`)
      return null
    }
  }

  /** "Try it now": capture the project's page once, so Settings can show that it works. */
  async tryIt(projectPath: string): Promise<ReviewTryResult> {
    const project = this.deps.projects().find((p) => p.path === projectPath)
    if (!project?.url) return { ok: false, error: 'Add an address first.' }
    const started = this.now()
    try {
      const shot = await this.capture(project.url, 'desktop')
      this.remember(project.path, shot, 'desktop')
      const landing = this.looked(project, project.url, shot)
      return {
        ok: true,
        image: dataUrl(this.deps.card(shot.png)),
        width: shot.width,
        height: shot.height,
        ms: this.now() - started,
        ...(landing ? { note: landing.text, login: landing.login } : {}),
      }
    } catch (err) {
      this.failed(project, project.url, err, 'try it now')
      return { ok: false, error: describeCaptureError(err, project.url) }
    }
  }

  /** Projects whose page can't be seen right now, for the panel and Settings. Only for the address each has now. */
  problems(): ReviewProblem[] {
    const projects = this.deps.projects()
    return [...this.troubles.values()].filter((p) => projects.some((q) => q.path === p.projectPath && q.url === p.address)).sort((a, b) => b.at - a.at)
  }

  /** Projects checked after a turn with no visible change, newest first. Only for the address each has now. */
  checks(): ReviewCheck[] {
    const projects = this.deps.projects()
    return [...this.sameChecks.values()].filter((c) => projects.some((q) => q.path === c.projectPath && q.url === c.address)).sort((a, b) => b.at - a.at)
  }

  /** The reviews waiting for a decision, newest first, with their pictures for the card. */
  async pending(): Promise<ReviewView[]> {
    const { store } = this.deps
    const views: ReviewView[] = []
    for (const r of store.list()) {
      if (r.status !== 'new') continue
      const [beforeCard, afterCard] = await Promise.all([r.before === 'none' ? null : store.read(r.id, 'before-card'), store.read(r.id, 'after-card')])
      const after = store.file(r.id, 'after')
      if (!afterCard || !after) continue
      views.push({
        id: r.id,
        project: r.project,
        projectPath: r.projectPath,
        address: r.url,
        createdAt: r.createdAt,
        before: beforeCard ? dataUrl(beforeCard) : null,
        after: dataUrl(afterCard),
        beforeFrom: r.before,
        heightBefore: r.heightBefore,
        heightAfter: r.heightAfter,
        files: { before: r.before === 'none' ? null : store.file(r.id, 'before'), after, ...(r.phone ? { phoneAfter: store.file(r.id, 'after-phone') } : {}) },
        said: r.said ?? null,
        filesChanged: r.filesChanged ?? null,
        regions: r.regions ?? null,
        phone: r.phone
          ? {
              beforeFrom: r.phone.before,
              heightBefore: r.phone.heightBefore,
              heightAfter: r.phone.heightAfter,
              regions: r.phone.regions ?? null,
              changed: looksChanged(r.phone),
              only: looksChanged(r.phone) && r.before !== 'none' && !looksChanged(r),
            }
          : null,
      })
      if (views.length >= MAX_CARDS) break
    }
    return views
  }

  async markGood(id: string): Promise<void> {
    if (await this.deps.store.setStatus(id, 'good')) this.deps.onChange()
  }

  /** The note for the session, with the user's words and where the pictures are. Marks the review sent back. */
  async sendBack(id: string, note: string): Promise<string> {
    const { store } = this.deps
    const record = store.get(id)
    const after = store.file(id, 'after')
    if (!record || !after) throw new Error("That review isn't there any more.")
    const text = reviewNote({
      project: record.project,
      address: record.url,
      note,
      afterFile: after,
      beforeFile: record.before === 'none' ? null : store.file(id, 'before'),
      phoneFile: record.phone ? store.file(id, 'after-phone') : null,
    })
    await store.setStatus(id, 'sent-back', note)
    this.deps.onChange()
    return text
  }

  async clear(): Promise<void> {
    await this.deps.store.clear()
    this.lastLooks.clear()
    this.deps.onChange()
  }

  /** The looks after recent turns in a project, newest first, for Settings. Only for the address it has now. */
  history(projectPath: string): ReviewHistoryEntry[] {
    const url = this.deps.projects().find((p) => p.path === projectPath)?.url
    return url ? this.deps.store.history(projectPath).filter((e) => e.address === url) : []
  }

  /** Keep what a look after a turn found, in the history. Never throws: the history is a nicety. */
  private async keepLook(project: Project, address: string, found: ReviewHistoryEntry['found'], extra: Pick<ReviewHistoryEntry, 'text' | 'reviewId'> = {}): Promise<void> {
    try {
      await this.deps.store.addLook({ projectPath: project.path, address, at: this.now(), found, ...extra })
      this.deps.onHistory?.()
    } catch (err) {
      this.log(`couldn't keep the history of ${project.name}: ${err instanceof Error ? err.message : String(err)}`)
    }
  }

  /** How many files the turn changed in the project's checkout, or null when git can't say. */
  private async filesChanged(dir: string, turn: Turn): Promise<number | null> {
    if (!this.deps.gitFiles) return null
    try {
      return await this.deps.gitFiles.changed(dir, turn.startedAt, await turn.files)
    } catch {
      return null
    }
  }

  private projectFor(cwd: string): Project | null {
    return matchProject(cwd, this.deps.projects())
  }

  private now(): number {
    return this.deps.now?.() ?? Date.now()
  }

  private log(message: string): void {
    this.deps.log?.(message)
  }

  /** A capture worked: whether the page ended up somewhere else, and if it's a login page, that's the project's problem now. Otherwise it has none. */
  private looked(project: Project, address: string, shot: Shot): { login: boolean; text: string } | null {
    const landing = landingNote(address, shot.landedOn)
    if (landing?.login) this.trouble(project, address, landing.text, true)
    else this.fine(project.path)
    return landing
  }

  private failed(project: Project, address: string, err: unknown, what: string): void {
    const reason = describeCaptureError(err, address)
    this.log(`${what} of ${project.name}: ${reason}`)
    if (!(err instanceof Error && err.message === BUSY)) this.trouble(project, address, reason, false)
  }

  /** No card this time: say why in the log. */
  private skip(why: string): null {
    this.log(`no review: ${why}`)
    return null
  }

  /** The turn's check found no visible change: that's the project's note now. */
  private checkedSame(project: Project, address: string): void {
    this.sameChecks.set(project.path, { projectPath: project.path, project: project.name, address, at: this.now() })
    this.deps.onChecks?.()
  }

  private clearCheck(projectPath: string): void {
    if (this.sameChecks.delete(projectPath)) this.deps.onChecks?.()
  }

  private trouble(project: Project, address: string, reason: string, login: boolean): void {
    // The check didn't work this time: the problem replaces any "no visible change" note.
    this.clearCheck(project.path)
    const was = this.troubles.get(project.path)
    this.troubles.set(project.path, { projectPath: project.path, project: project.name, address, reason, login, at: this.now() })
    if (was?.reason !== reason || was.address !== address) this.deps.onProblems?.()
  }

  private fine(projectPath: string): void {
    if (this.troubles.delete(projectPath)) this.deps.onProblems?.()
  }

  private remember(projectPath: string, shot: Look, size: PageSize): void {
    this.lastLooks.set(lookKey(projectPath, size), { shot, at: this.now() })
  }

  /**
   * The last picture of a project's page at a width, if it's recent: from this run, or else the newest review's after
   * picture (Steward restarted since).
   */
  private async lastLook(projectPath: string, size: PageSize): Promise<Look | null> {
    const look = this.lastLooks.get(lookKey(projectPath, size))
    if (look && this.now() - look.at < LAST_LOOK_MAX_AGE_MS) return look.shot
    const newest = this.deps.store.latest(projectPath)
    if (!newest || this.now() - newest.createdAt >= LAST_LOOK_MAX_AGE_MS) return null
    if (size === 'phone') {
      const png = newest.phone ? await this.deps.store.read(newest.id, 'after-phone') : null
      return png && newest.phone ? { png, height: newest.phone.heightAfter } : null
    }
    const png = await this.deps.store.read(newest.id, 'after')
    return png ? { png, height: newest.heightAfter } : null
  }

  /**
   * Photograph the page now, at a width, and remember it; null when it can't. Only the desktop's look says when the
   * page can't be seen: a phone picture that fails is in the log, and the review goes on at the desktop's width.
   */
  private lookNow(project: Project, address: string, size: PageSize): Promise<Look | null> {
    return this.capture(address, size).then(
      (shot) => {
        this.remember(project.path, shot, size)
        if (size === 'desktop') this.looked(project, address, shot)
        return shot
      },
      (err) => {
        if (size === 'desktop') this.failed(project, address, err, 'no before picture')
        else this.log(`no phone before picture of ${project.name}: ${describeCaptureError(err, address)}`)
        return null
      },
    )
  }

  /** The page at a phone's width as the turn ends, and what it was before; null when the phone picture can't be taken. */
  private async phoneLook(project: Project, address: string, turn: Turn | undefined): Promise<{ before: Look | null; from: ReviewRecord['before']; after: Shot; diff: Diff | null } | null> {
    let before = turn?.phoneBefore ? await withTimeout(turn.phoneBefore, BEFORE_WAIT_MS) : null
    let from: ReviewRecord['before'] = 'turn-start'
    if (!before) {
      before = await this.lastLook(project.path, 'phone')
      from = before ? 'last-look' : 'none'
    }
    let after: Shot
    try {
      after = await this.capture(address, 'phone')
    } catch (err) {
      this.log(`no phone picture of ${project.name}: ${describeCaptureError(err, address)}`)
      return null
    }
    this.remember(project.path, after, 'phone')
    return { before, from, after, diff: before ? await this.deps.compare(before.png, after.png) : null }
  }

  /** Capture, after any capture already running. Refused when too many are waiting. */
  private capture(address: string, size: PageSize): Promise<Shot> {
    if (this.queued >= MAX_QUEUED) return Promise.reject(new Error(BUSY))
    this.queued++
    const run = this.tail.then(() => this.deps.capture(address, size))
    // The next capture waits for this one, whether it worked or not. The caller gets the failure.
    this.tail = run
      .catch(() => undefined)
      .then(() => {
        this.queued--
      })
    return run
  }
}

/** The promise's value, or null if it takes longer than `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms)
    promise.then(
      (value) => {
        clearTimeout(timer)
        resolve(value)
      },
      () => {
        clearTimeout(timer)
        resolve(null)
      },
    )
  })
}
