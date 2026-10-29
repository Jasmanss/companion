import { createHash, randomBytes } from 'node:crypto'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import type { ReviewHistoryEntry, ReviewRegion } from '../shared/types'

/** What Visual Review keeps: the newest reviews per project, nothing older than 14 days, and about 300 MB in all. */
export interface ReviewLimits {
  perProject: number
  maxAgeMs: number
  maxBytes: number
}
export const REVIEW_LIMITS: ReviewLimits = { perProject: 10, maxAgeMs: 14 * 24 * 60 * 60 * 1000, maxBytes: 300 * 1024 * 1024 }

/** review.json: the facts about one review. The prompt the user typed is never part of it. */
export interface ReviewRecord {
  id: string
  project: string
  projectPath: string
  /** The address that was captured. */
  url: string
  createdAt: number
  /** When the before picture was taken: as the prompt was sent, the last time Steward looked, or never. */
  before: 'turn-start' | 'last-look' | 'none'
  /** Page heights in pixels. */
  heightBefore: number | null
  heightAfter: number
  /** The compare gate's numbers: how many (small) pixels changed, and how many it takes to count. */
  changedPixels: number
  minPixels: number
  /** new: waiting for a decision. good: marked as looking good. sent-back: the note was copied. */
  status: 'new' | 'good' | 'sent-back'
  note?: string
  /** The "Claude says" note: the start of Claude's last reply for the turn (sayFrom), when it said something. */
  said?: string
  /** How many files the turn changed in the project's git checkout (turn-files.ts), when git could say. */
  filesChanged?: number
  /** Where the page changed, in its own pixels, top to bottom (review-diff.ts). Absent: no earlier picture, or an older review. */
  regions?: ReviewRegion[]
}

/** The files of one review, besides review.json. The card pictures are small JPEGs of the top of the page. */
export interface ReviewFiles {
  before?: Buffer
  after: Buffer
  beforeCard?: Buffer
  afterCard: Buffer
}

export type ReviewFile = 'before' | 'after' | 'before-card' | 'after-card'
const FILE_NAMES: Record<ReviewFile, string> = { before: 'before.png', after: 'after.png', 'before-card': 'before-card.jpg', 'after-card': 'after-card.jpg' }

export interface Kept {
  id: string
  projectPath: string
  createdAt: number
  bytes: number
}

/** Which reviews to delete: the too old, then all but the newest few of each project, then the oldest until it all fits. */
export function chooseToDelete(kept: Kept[], now: number, limits: ReviewLimits = REVIEW_LIMITS): string[] {
  const gone = new Set<string>()
  for (const r of kept) if (now - r.createdAt > limits.maxAgeMs) gone.add(r.id)

  const perProject = new Map<string, Kept[]>()
  for (const r of kept) if (!gone.has(r.id)) perProject.set(r.projectPath, [...(perProject.get(r.projectPath) ?? []), r])
  for (const list of perProject.values()) {
    list.sort((a, b) => b.createdAt - a.createdAt)
    for (const r of list.slice(limits.perProject)) gone.add(r.id)
  }

  let total = kept.filter((r) => !gone.has(r.id)).reduce((sum, r) => sum + r.bytes, 0)
  const oldestFirst = kept.filter((r) => !gone.has(r.id)).sort((a, b) => a.createdAt - b.createdAt)
  for (const r of oldestFirst) {
    if (total <= limits.maxBytes) break
    gone.add(r.id)
    total -= r.bytes
  }
  return [...gone]
}

/** The history keeps this many looks per project, and none older than the reviews themselves. */
export const HISTORY_PER_PROJECT = 20
const HISTORY_FILE = 'history.json'
const FOUND = new Set<string>(['review', 'same', 'failed', 'login'])

/** A look worth keeping as read back from history.json: anything else in the file is dropped. */
function historyEntry(e: unknown): ReviewHistoryEntry | null {
  const r = e as Partial<ReviewHistoryEntry> | null
  if (!r || typeof r.projectPath !== 'string' || typeof r.address !== 'string' || typeof r.at !== 'number' || !FOUND.has(r.found as string)) return null
  return {
    projectPath: r.projectPath,
    address: r.address,
    at: r.at,
    found: r.found as ReviewHistoryEntry['found'],
    ...(typeof r.text === 'string' ? { text: r.text.slice(0, 300) } : {}),
    ...(isReviewId(r.reviewId) ? { reviewId: r.reviewId } : {}),
  }
}

const ID_PATTERN = /^\d{8}-\d{6}-[a-f0-9]{8}$/
export const isReviewId = (id: unknown): id is string => typeof id === 'string' && ID_PATTERN.test(id)

/** "My Site" and its folder become one folder name: readable, and different for two projects of the same name. */
export function projectFolder(name: string, projectPath: string): string {
  const slug = name.normalize('NFKD').replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase().slice(0, 40) || 'project'
  return `${slug}-${createHash('sha1').update(projectPath).digest('hex').slice(0, 6)}`
}

interface Entry {
  dir: string
  record: ReviewRecord
  bytes: number
}

/**
 * <root>/<project>/<review>/ holds before.png, after.png, the two card pictures and review.json. Everything is under
 * the Steward data folder, nothing is sent anywhere, and `prune` keeps it to the limits.
 */
export class ReviewStore {
  private entries = new Map<string, Entry>()
  /** The looks after turns, newest first (history.json beside the project folders). */
  private looks: ReviewHistoryEntry[] = []
  /** Writes of history.json, one after another. */
  private writing: Promise<void> = Promise.resolve()

  constructor(
    private readonly root: string,
    private readonly limits: ReviewLimits = REVIEW_LIMITS,
    private readonly now: () => number = Date.now,
  ) {}

  /** Read what's on disk. A review whose review.json is missing (a save that was cut off) is removed. */
  async load(): Promise<void> {
    this.entries.clear()
    this.looks = await fs.readFile(path.join(this.root, HISTORY_FILE), 'utf8').then(
      (text) => {
        const list: unknown = JSON.parse(text)
        return Array.isArray(list) ? list.map(historyEntry).filter((e): e is ReviewHistoryEntry => e !== null) : []
      },
      () => [],
    )
    const projects = (await fs.readdir(this.root).catch(() => [])).filter((name) => !name.startsWith(HISTORY_FILE))
    for (const project of projects) {
      const reviews = await fs.readdir(path.join(this.root, project)).catch(() => [])
      for (const review of reviews) {
        const dir = path.join(this.root, project, review)
        const record = await fs.readFile(path.join(dir, 'review.json'), 'utf8').then(
          (text) => parseRecord(text),
          () => null,
        )
        if (!record || record.id !== review) {
          await fs.rm(dir, { recursive: true, force: true })
          continue
        }
        this.entries.set(record.id, { dir, record, bytes: await sizeOf(dir) })
      }
    }
    await this.prune()
  }

  /** Every review, newest first. */
  list(): ReviewRecord[] {
    return [...this.entries.values()].map((e) => e.record).sort((a, b) => b.createdAt - a.createdAt)
  }

  get(id: string): ReviewRecord | null {
    return this.entries.get(id)?.record ?? null
  }

  /** The path of one of a review's files, if it has it. */
  file(id: string, which: ReviewFile): string | null {
    const entry = this.entries.get(id)
    return entry ? path.join(entry.dir, FILE_NAMES[which]) : null
  }

  /**
   * What review://<id>/before and review://<id>/after load, for the big viewer: the full-page picture of a review that is
   * in the store, and nothing else. Any other id, file name or path gives null.
   */
  pictureFor(url: string): string | null {
    // The URL parser would resolve a "..", which could only reach this review's own pictures; refused all the same.
    if (/\.\.|%2e/i.test(url)) return null
    let u: URL
    try {
      u = new URL(url)
    } catch {
      return null
    }
    const which = u.pathname === '/before' ? 'before' : u.pathname === '/after' ? 'after' : null
    const record = u.protocol === 'review:' && isReviewId(u.hostname) ? this.get(u.hostname) : null
    if (!which || !record || u.search || u.hash || (which === 'before' && record.before === 'none')) return null
    return this.file(record.id, which)
  }

  /** The contents of one of a review's files. */
  async read(id: string, which: ReviewFile): Promise<Buffer | null> {
    const file = this.file(id, which)
    return file ? fs.readFile(file).catch(() => null) : null
  }

  /** The newest review of a project, if there is one. */
  latest(projectPath: string): ReviewRecord | null {
    return this.list().find((r) => r.projectPath === projectPath) ?? null
  }

  async save(draft: Omit<ReviewRecord, 'id' | 'createdAt' | 'status'>, files: ReviewFiles): Promise<ReviewRecord> {
    const createdAt = this.now()
    const stamp = new Date(createdAt).toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15)
    const record: ReviewRecord = { ...draft, id: `${stamp}-${randomBytes(4).toString('hex')}`, createdAt, status: 'new' }
    const dir = path.join(this.root, projectFolder(record.project, record.projectPath), record.id)
    await fs.mkdir(dir, { recursive: true })
    const write = (which: ReviewFile, data: Buffer | undefined) => (data ? fs.writeFile(path.join(dir, FILE_NAMES[which]), data) : undefined)
    await Promise.all([write('before', files.before), write('after', files.after), write('before-card', files.beforeCard), write('after-card', files.afterCard)])
    // review.json goes last: a review without it is a save that was cut off, and is cleaned up on the next start.
    await writeRecord(dir, record)
    this.entries.set(record.id, { dir, record, bytes: await sizeOf(dir) })
    await this.prune()
    return record
  }

  async setStatus(id: string, status: ReviewRecord['status'], note?: string): Promise<ReviewRecord | null> {
    const entry = this.entries.get(id)
    if (!entry) return null
    entry.record = { ...entry.record, status, ...(note !== undefined ? { note: note.slice(0, 2000) } : {}) }
    await writeRecord(entry.dir, entry.record)
    return entry.record
  }

  /** Delete what the limits say to. Returns the ids that went. */
  async prune(): Promise<string[]> {
    const gone = chooseToDelete(
      [...this.entries.values()].map((e) => ({ id: e.record.id, projectPath: e.record.projectPath, createdAt: e.record.createdAt, bytes: e.bytes })),
      this.now(),
      this.limits,
    )
    for (const id of gone) await this.remove(id)
    return gone
  }

  /** "Clear review pictures": everything goes, the history too. */
  async clear(): Promise<void> {
    await this.writing
    await fs.rm(this.root, { recursive: true, force: true })
    this.entries.clear()
    this.looks = []
  }

  /** Keep one look after a turn: the newest HISTORY_PER_PROJECT of each project, none older than the reviews' limit. */
  async addLook(look: ReviewHistoryEntry): Promise<void> {
    const now = this.now()
    const fresh = [look, ...this.looks].filter((e) => now - e.at <= this.limits.maxAgeMs)
    const count = new Map<string, number>()
    this.looks = fresh.filter((e) => {
      const n = (count.get(e.projectPath) ?? 0) + 1
      count.set(e.projectPath, n)
      return n <= HISTORY_PER_PROJECT
    })
    const text = JSON.stringify(this.looks, null, 1)
    this.writing = this.writing.then(async () => {
      await fs.mkdir(this.root, { recursive: true })
      const tmp = path.join(this.root, `${HISTORY_FILE}.tmp`)
      await fs.writeFile(tmp, text)
      await fs.rename(tmp, path.join(this.root, HISTORY_FILE))
    })
    await this.writing.catch(() => {})
  }

  /** A project's looks, newest first, each review with what became of it. */
  history(projectPath: string): ReviewHistoryEntry[] {
    return this.looks
      .filter((e) => e.projectPath === projectPath)
      .map((e) => (e.found === 'review' ? { ...e, decided: (e.reviewId && this.get(e.reviewId)?.status) || 'gone' } : e))
  }

  usage(): { count: number; bytes: number } {
    return { count: this.entries.size, bytes: [...this.entries.values()].reduce((sum, e) => sum + e.bytes, 0) }
  }

  private async remove(id: string): Promise<void> {
    const entry = this.entries.get(id)
    if (!entry) return
    this.entries.delete(id)
    await fs.rm(entry.dir, { recursive: true, force: true })
    // The project's folder goes with its last review.
    await fs.rmdir(path.dirname(entry.dir)).catch(() => {})
  }
}

function parseRecord(text: string): ReviewRecord | null {
  try {
    const r = JSON.parse(text) as Partial<ReviewRecord>
    const ok =
      isReviewId(r.id) &&
      typeof r.project === 'string' &&
      typeof r.projectPath === 'string' &&
      typeof r.url === 'string' &&
      typeof r.createdAt === 'number' &&
      (r.before === 'turn-start' || r.before === 'last-look' || r.before === 'none') &&
      typeof r.heightAfter === 'number' &&
      (r.status === 'new' || r.status === 'good' || r.status === 'sent-back') &&
      (r.said === undefined || typeof r.said === 'string') &&
      (r.filesChanged === undefined || (typeof r.filesChanged === 'number' && Number.isInteger(r.filesChanged) && r.filesChanged >= 0))
    if (!ok) return null
    // Areas that don't read are dropped, not the review: it still shows, without "Show changes".
    const { regions, ...rest } = r as ReviewRecord
    return regions === undefined || isRegions(regions) ? (r as ReviewRecord) : rest
  } catch {
    return null
  }
}

/** A list of changed areas as review.json should have it: whole numbers, inside a page Steward could have photographed. */
export function isRegions(list: unknown): list is ReviewRegion[] {
  return (
    Array.isArray(list) &&
    list.length <= 50 &&
    list.every((g: Partial<ReviewRegion> | null) => g !== null && typeof g === 'object' && [g.x, g.y, g.width, g.height].every((n) => Number.isInteger(n) && (n as number) >= 0 && (n as number) <= 100_000))
  )
}

async function writeRecord(dir: string, record: ReviewRecord): Promise<void> {
  const tmp = path.join(dir, 'review.json.tmp')
  await fs.writeFile(tmp, JSON.stringify(record, null, 2))
  await fs.rename(tmp, path.join(dir, 'review.json'))
}

async function sizeOf(dir: string): Promise<number> {
  const names = await fs.readdir(dir).catch(() => [])
  const sizes = await Promise.all(names.map((n) => fs.stat(path.join(dir, n)).then((s) => s.size, () => 0)))
  return sizes.reduce((sum, n) => sum + n, 0)
}
