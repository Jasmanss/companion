import type { Project, ReviewTryResult, ReviewView } from '../shared/types'
import { addressLabel, reviewNote } from '../shared/review'
import type { HookPayload } from './hook-payload'
import type { Diff } from './review-diff'
import type { ReviewRecord, ReviewStore } from './review-store'
import { matchProject } from './sessions'

type TurnStart = Extract<HookPayload, { hook_event_name: 'UserPromptSubmit' }>
type TurnStop = Extract<HookPayload, { hook_event_name: 'Stop' }>

/** One picture of the page: the whole of it, as a PNG. */
export interface Shot {
  png: Buffer
  width: number
  height: number
}

export interface ReviewDeps {
  projects(): Project[]
  /** Capture the page at this address (an address on this Mac, settled and with animations off). Throws when it can't. */
  capture(url: string): Promise<Shot>
  compare(before: Buffer, after: Buffer): Promise<Diff> | Diff
  /** The top of a full-page picture, small, for the card. */
  card(png: Buffer): Buffer
  store: ReviewStore
  /** The list of reviews waiting for a decision changed. */
  onChange(): void
  now?(): number
  log?(message: string): void
}

/** If the before picture still isn't done when the turn ends, wait this long for it, then go without. */
const BEFORE_WAIT_MS = 15_000
/** A picture from an earlier look is only a stand-in for "before" for this long. */
const LAST_LOOK_MAX_AGE_MS = 6 * 60 * 60 * 1000
/** How many captures may wait their turn. More than this are skipped: they'd be late anyway. */
const MAX_QUEUED = 4
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
}

const turnKey = (event: { session_id: string; prompt_id?: string }) => `${event.session_id}:${event.prompt_id ?? ''}`
const dataUrl = (jpeg: Buffer) => `data:image/jpeg;base64,${jpeg.toString('base64')}`

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

  constructor(private readonly deps: ReviewDeps) {}

  /** A turn started: photograph the page now, before Claude changes it. Never waits, never throws. */
  turnStarted(event: TurnStart): void {
    const project = this.projectFor(event.cwd)
    const now = this.now()
    for (const [key, turn] of this.turns) if (now - turn.startedAt > TURN_MAX_AGE_MS) this.turns.delete(key)
    if (!project?.url) return
    const address = project.url
    const before = this.capture(address).then(
      (shot) => {
        this.remember(project.path, shot)
        return shot
      },
      (err) => {
        this.log(`no before picture of ${project.name}: ${describeCaptureError(err, address)}`)
        return null
      },
    )
    this.turns.set(turnKey(event), { projectPath: project.path, startedAt: now, before })
  }

  /**
   * A turn ended: photograph the page again and compare. Returns the review it made, or null when the page looks the
   * same, isn't running, or the project has no address. Never throws.
   */
  async turnStopped(event: TurnStop): Promise<ReviewRecord | null> {
    // Claude was asked to keep going by a Stop hook: this isn't the real end.
    if (event.stop_hook_active) return null
    const key = turnKey(event)
    const turn = this.turns.get(key)
    this.turns.delete(key)
    const project = this.projectFor(event.cwd)
    if (!project?.url) return null
    const address = project.url
    try {
      let before = turn ? await withTimeout(turn.before, BEFORE_WAIT_MS) : null
      let from: ReviewRecord['before'] = 'turn-start'
      if (!before) {
        before = await this.lastLook(project.path)
        from = before ? 'last-look' : 'none'
      }
      const after = await this.capture(address)
      this.remember(project.path, after)
      const diff = before ? await this.deps.compare(before.png, after.png) : null
      // Nothing to compare with shows the page as it is; a page that looks the same makes no card.
      if (diff && !diff.changed) return null
      const record = await this.deps.store.save(
        {
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
        },
      )
      this.deps.onChange()
      return record
    } catch (err) {
      this.log(`no review of ${project.name}: ${describeCaptureError(err, address)}`)
      return null
    }
  }

  /** "Try it now": capture the project's page once, so Settings can show that it works. */
  async tryIt(projectPath: string): Promise<ReviewTryResult> {
    const project = this.deps.projects().find((p) => p.path === projectPath)
    if (!project?.url) return { ok: false, error: 'Add an address first.' }
    const started = this.now()
    try {
      const shot = await this.capture(project.url)
      this.remember(project.path, shot)
      return { ok: true, image: dataUrl(this.deps.card(shot.png)), width: shot.width, height: shot.height, ms: this.now() - started }
    } catch (err) {
      return { ok: false, error: describeCaptureError(err, project.url) }
    }
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
        files: { before: r.before === 'none' ? null : store.file(r.id, 'before'), after },
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
    const text = reviewNote({ project: record.project, address: record.url, note, afterFile: after, beforeFile: record.before === 'none' ? null : store.file(id, 'before') })
    await store.setStatus(id, 'sent-back', note)
    this.deps.onChange()
    return text
  }

  async clear(): Promise<void> {
    await this.deps.store.clear()
    this.lastLooks.clear()
    this.deps.onChange()
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

  private remember(projectPath: string, shot: Look): void {
    this.lastLooks.set(projectPath, { shot, at: this.now() })
  }

  /** The last picture of a project's page, if it's recent: from this run, or else the newest review's after picture (Steward restarted since). */
  private async lastLook(projectPath: string): Promise<Look | null> {
    const look = this.lastLooks.get(projectPath)
    if (look && this.now() - look.at < LAST_LOOK_MAX_AGE_MS) return look.shot
    const newest = this.deps.store.latest(projectPath)
    if (!newest || this.now() - newest.createdAt >= LAST_LOOK_MAX_AGE_MS) return null
    const png = await this.deps.store.read(newest.id, 'after')
    return png ? { png, height: newest.heightAfter } : null
  }

  /** Capture, after any capture already running. Refused when too many are waiting. */
  private capture(address: string): Promise<Shot> {
    if (this.queued >= MAX_QUEUED) return Promise.reject(new Error('Steward is busy looking at other pages'))
    this.queued++
    const run = this.tail.then(() => this.deps.capture(address))
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
