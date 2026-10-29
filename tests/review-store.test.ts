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

  it('keeps what Claude said with the review, and a review.json with a bad one is not loaded', () =>
    inTemp(async (dir) => {
      const store = new ReviewStore(dir, REVIEW_LIMITS, () => NOW)
      const { id } = await store.save({ ...draft(), said: 'I made the button blue.' }, files)
      const again = new ReviewStore(dir, REVIEW_LIMITS, () => NOW)
      await again.load()
      expect(again.get(id)?.said).toBe('I made the button blue.')

      const json = path.join(path.dirname(store.file(id, 'after')!), 'review.json')
      await fs.writeFile(json, JSON.stringify({ ...JSON.parse(await fs.readFile(json, 'utf8')), said: 42 }))
      const third = new ReviewStore(dir, REVIEW_LIMITS, () => NOW)
      await third.load()
      expect(third.get(id)).toBeNull()
    }))

  it('keeps where the page changed with the review, and drops areas that do not read (the review stays)', () =>
    inTemp(async (dir) => {
      const store = new ReviewStore(dir, REVIEW_LIMITS, () => NOW)
      const regions = [{ x: 160, y: 480, width: 128, height: 32 }]
      const { id } = await store.save({ ...draft(), regions }, files)
      const again = new ReviewStore(dir, REVIEW_LIMITS, () => NOW)
      await again.load()
      expect(again.get(id)?.regions).toEqual(regions)

      const json = path.join(path.dirname(store.file(id, 'after')!), 'review.json')
      await fs.writeFile(json, JSON.stringify({ ...JSON.parse(await fs.readFile(json, 'utf8')), regions: [{ x: -1, y: 'top' }] }))
      const third = new ReviewStore(dir, REVIEW_LIMITS, () => NOW)
      await third.load()
      expect(third.get(id)).not.toBeNull()
      expect(third.get(id)?.regions).toBeUndefined()
    }))

  it('serves review://<id>/before and /after for the viewer, and nothing else', () =>
    inTemp(async (dir) => {
      const store = new ReviewStore(dir, REVIEW_LIMITS, () => NOW)
      const { id } = await store.save(draft(), files)
      const only = await store.save({ ...draft('/Users/me/other'), before: 'none', heightBefore: null }, { after: files.after, afterCard: files.afterCard })
      expect(store.pictureFor(`review://${id}/before`)).toBe(store.file(id, 'before'))
      expect(store.pictureFor(`review://${id}/after`)).toBe(store.file(id, 'after'))
      expect(store.pictureFor(`review://${only.id}/after`)).toBe(store.file(only.id, 'after'))
      // A review with no before picture has none to serve.
      expect(store.pictureFor(`review://${only.id}/before`)).toBeNull()
      for (const url of [
        `review://${id}/review.json`,
        `review://${id}/before-card`,
        `review://${id}/after.png`,
        `review://${id}/`,
        `review://${id}/../${only.id}/after`,
        `review://${id}/after/../../review.json`,
        `review://${id}/%2e%2e/after`,
        `review://${id}/after?x=1`,
        `review://${id}/after#top`,
        'review://20261020-120000-deadbeef/after',
        'review://../after',
        'review://not-an-id/after',
        `tray://${id}/after`,
        `file:///${store.file(id, 'after')}`,
        'nonsense',
      ])
        expect([url, store.pictureFor(url)]).toEqual([url, null])
    }))

  it('keeps a history of looks: 20 a project, none too old, and Clear takes it too', () =>
    inTemp(async (dir) => {
      let now = NOW
      const store = new ReviewStore(dir, REVIEW_LIMITS, () => now)
      const look = (projectPath: string, at: number) => ({ projectPath, address: 'http://localhost:3000', at, found: 'same' as const })
      await store.addLook(look('/a', now - 15 * DAY))
      for (let i = 0; i < 25; i++) await store.addLook(look('/a', now + i))
      await store.addLook(look('/b', now))
      expect(store.history('/a')).toHaveLength(20)
      expect(store.history('/a')[0].at).toBe(NOW + 24)
      expect(store.history('/b')).toHaveLength(1)

      // A file that was tampered with keeps only what reads as a look.
      await fs.writeFile(path.join(dir, 'history.json'), JSON.stringify([look('/a', NOW), { projectPath: '/a', found: 'hacked' }, 'nonsense', { ...look('/a', NOW), text: 'x'.repeat(500), reviewId: '../x' }]))
      const again = new ReviewStore(dir, REVIEW_LIMITS, () => now)
      await again.load()
      expect(again.history('/a')).toHaveLength(2)
      expect(again.history('/a')[1].text).toHaveLength(300)
      expect(again.history('/a')[1]).not.toHaveProperty('reviewId')
      // The history file is not taken for a project's folder.
      expect(again.list()).toEqual([])

      now += 1
      await again.clear()
      expect(again.history('/a')).toEqual([])
    }))

  it('says what became of a review in the history, and "gone" once it is no longer kept', () =>
    inTemp(async (dir) => {
      const store = new ReviewStore(dir, REVIEW_LIMITS, () => NOW)
      const { id } = await store.save(draft(), files)
      await store.addLook({ projectPath: '/Users/me/site', address: 'http://localhost:3000', at: NOW, found: 'review', reviewId: id })
      await store.addLook({ projectPath: '/Users/me/site', address: 'http://localhost:3000', at: NOW, found: 'review', reviewId: '20200101-000000-deadbeef' })
      await store.setStatus(id, 'sent-back', 'bigger')
      expect(store.history('/Users/me/site').map((e) => e.decided)).toEqual(['gone', 'sent-back'])
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
