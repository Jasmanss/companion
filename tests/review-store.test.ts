import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { chooseToDelete, isReviewId, projectFolder, ReviewStore, REVIEW_LIMITS, type Kept } from '../src/main/review-store'

const DAY = 24 * 60 * 60 * 1000
const MB = 1024 * 1024
const NOW = Date.UTC(2026, 9, 20, 12, 0, 0)

const kept = (id: string, projectPath: string, ageDays: number, mb = 1): Kept => ({ id, projectPath, createdAt: NOW - ageDays * DAY, bytes: mb * MB })

describe('chooseToDelete, the limits', () => {
  it('keeps everything inside the limits', () => {
    expect(chooseToDelete([kept('a', '/p', 1), kept('b', '/p', 2), kept('c', '/q', 3)], NOW)).toEqual([])
  })

  it('removes what is older than 14 days', () => {
    expect(chooseToDelete([kept('new', '/p', 13), kept('old', '/p', 15)], NOW)).toEqual(['old'])
  })

  it('keeps the newest 10 of each project, and counts projects separately', () => {
    const many = Array.from({ length: 13 }, (_, i) => kept(`p${i}`, '/p', i * 0.5))
    const other = Array.from({ length: 4 }, (_, i) => kept(`q${i}`, '/q', i))
    const gone = chooseToDelete([...many, ...other], NOW)
    expect(gone.sort()).toEqual(['p10', 'p11', 'p12']) // the three oldest of /p
  })

  it('removes the oldest across projects until it fits in 300 MB', () => {
    const list = [kept('a', '/p', 5, 120), kept('b', '/q', 4, 120), kept('c', '/p', 3, 120), kept('d', '/q', 1, 120)]
    // 480 MB: the oldest two (a, b) go, leaving 240 MB.
    expect(chooseToDelete(list, NOW).sort()).toEqual(['a', 'b'])
    expect(chooseToDelete(list, NOW, { ...REVIEW_LIMITS, maxBytes: 100 * MB }).sort()).toEqual(['a', 'b', 'c', 'd'])
  })

  it('does not count what age already removed against the size', () => {
    expect(chooseToDelete([kept('old', '/p', 20, 400), kept('new', '/p', 1, 100)], NOW)).toEqual(['old'])
  })
})

describe('names', () => {
  it('only knows its own review ids', () => {
    expect(isReviewId('20261020-120000-a1b2c3d4')).toBe(true)
    for (const bad of ['../../etc', '20261020-120000-A1B2C3D4', '', 7, null, '20261020-120000-a1b2c3d4/../x']) expect(isReviewId(bad)).toBe(false)
  })

  it('makes a readable folder per project, different for two projects of one name', () => {
    expect(projectFolder('My Site!', '/a/my-site')).toMatch(/^my-site-[0-9a-f]{6}$/)
    expect(projectFolder('site', '/a/site')).not.toBe(projectFolder('site', '/b/site'))
    expect(projectFolder('***', '/x')).toMatch(/^project-/)
  })
})

describe('ReviewStore', () => {
  const draft = (projectPath = '/Users/me/site') => ({
    project: 'site',
    projectPath,
    url: 'http://localhost:3000',
    before: 'turn-start' as const,
    heightBefore: 900,
    heightAfter: 1200,
    changedPixels: 500,
    minPixels: 243,
  })
  const files = { before: Buffer.from('b'), after: Buffer.from('a'), beforeCard: Buffer.from('bc'), afterCard: Buffer.from('ac') }

  async function inTemp<T>(fn: (dir: string) => Promise<T>): Promise<T> {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'steward-reviews-'))
    try {
      return await fn(dir)
    } finally {
      await fs.rm(dir, { recursive: true, force: true })
    }
  }

  it('saves a review under the project, and a restart finds it again', () =>
    inTemp(async (dir) => {
      const store = new ReviewStore(dir, REVIEW_LIMITS, () => NOW)
      const saved = await store.save(draft(), files)
      expect(saved).toMatchObject({ status: 'new', createdAt: NOW, project: 'site' })
      expect(isReviewId(saved.id)).toBe(true)
      expect(store.file(saved.id, 'after')).toBe(path.join(dir, projectFolder('site', '/Users/me/site'), saved.id, 'after.png'))
      expect((await store.read(saved.id, 'after-card'))?.toString()).toBe('ac')
      // Nothing but the review's own files, all under the folder it was given (the privacy check).
      expect((await fs.readdir(path.dirname(store.file(saved.id, 'after')!))).sort()).toEqual(['after-card.jpg', 'after.png', 'before-card.jpg', 'before.png', 'review.json'])

      const again = new ReviewStore(dir, REVIEW_LIMITS, () => NOW)
      await again.load()
      expect(again.list().map((r) => r.id)).toEqual([saved.id])
      expect(again.usage()).toEqual({ count: 1, bytes: 1 + 1 + 2 + 2 + (await fs.stat(path.join(path.dirname(store.file(saved.id, 'after')!), 'review.json'))).size })
    }))

  it('remembers the decision, and keeps the note short', () =>
    inTemp(async (dir) => {
      const store = new ReviewStore(dir, REVIEW_LIMITS, () => NOW)
      const { id } = await store.save(draft(), files)
      await store.setStatus(id, 'sent-back', 'x'.repeat(5000))
      const again = new ReviewStore(dir, REVIEW_LIMITS, () => NOW)
      await again.load()
      expect(again.get(id)).toMatchObject({ status: 'sent-back' })
      expect(again.get(id)?.note).toHaveLength(2000)
    }))

  it('prunes on save, oldest first, and the project folder goes with its last review', () =>
    inTemp(async (dir) => {
      let now = NOW
      const store = new ReviewStore(dir, { ...REVIEW_LIMITS, perProject: 2 }, () => now)
      const ids: string[] = []
      for (let i = 0; i < 3; i++) {
        now += 1000
        ids.push((await store.save(draft(), files)).id)
      }
      expect(store.list().map((r) => r.id)).toEqual([ids[2], ids[1]])
      expect(await fs.readdir(path.join(dir, projectFolder('site', '/Users/me/site')))).toHaveLength(2)

      now += 15 * DAY
      expect(await store.prune()).toHaveLength(2)
      expect(await fs.readdir(dir)).toEqual([])
    }))

  it('clears everything, and cleans up a save that was cut off', () =>
    inTemp(async (dir) => {
      const store = new ReviewStore(dir, REVIEW_LIMITS, () => NOW)
      await store.save(draft(), files)
      const cutOff = path.join(dir, 'site-abcdef', '20261020-120000-deadbeef')
      await fs.mkdir(cutOff, { recursive: true })
      await fs.writeFile(path.join(cutOff, 'after.png'), 'half')
      const again = new ReviewStore(dir, REVIEW_LIMITS, () => NOW)
      await again.load()
      expect(again.list()).toHaveLength(1)
      await expect(fs.stat(cutOff)).rejects.toThrow()

      await again.clear()
      expect(again.list()).toEqual([])
      expect(again.usage()).toEqual({ count: 0, bytes: 0 })
      await expect(fs.stat(dir)).rejects.toThrow()
    }))
})
