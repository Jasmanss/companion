import { promises as fs } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { extensionForMime, TrayStore } from '../src/main/tray-store'

let dir: string

beforeEach(async () => {
  dir = await fs.mkdtemp(path.join(os.tmpdir(), 'tray-'))
})
afterEach(async () => {
  await fs.rm(dir, { recursive: true, force: true })
})

const png = Buffer.from('89504e470d0a1a0a', 'hex')

describe('TrayStore', () => {
  it('adds buffers and files, and persists them across loads', async () => {
    const src = path.join(dir, 'Hero Shot.png')
    await fs.writeFile(src, png)
    const store = new TrayStore(path.join(dir, 'tray'))
    await store.load()

    await store.addBuffer(png, '.png', { name: 'pasted.png', source: 'https://example.com' })
    await store.addFile(src, { note: 'nice' })

    const reloaded = new TrayStore(path.join(dir, 'tray'))
    await reloaded.load()
    expect(reloaded.list().map((i) => i.name)).toEqual(['pasted.png', 'Hero Shot.png'])
    expect(reloaded.list()[0].source).toBe('https://example.com')
    expect(reloaded.list()[1].note).toBe('nice')
  })

  it('rejects files that are not images', async () => {
    const src = path.join(dir, 'notes.txt')
    await fs.writeFile(src, 'hello')
    const store = new TrayStore(path.join(dir, 'tray'))
    await store.load()
    await expect(store.addFile(src)).rejects.toThrow("isn't an image")
  })

  it('removes and clears items along with their files', async () => {
    const store = new TrayStore(path.join(dir, 'tray'))
    await store.load()
    const a = await store.addBuffer(png, '.png')
    const b = await store.addBuffer(png, '.png')

    await store.remove(a.id)
    expect(store.list().map((i) => i.id)).toEqual([b.id])
    await expect(fs.access(a.file)).rejects.toThrow()

    await store.clear()
    expect(store.list()).toEqual([])
    await expect(fs.access(b.file)).rejects.toThrow()
  })

  it('drops index entries whose files have gone missing', async () => {
    const store = new TrayStore(path.join(dir, 'tray'))
    await store.load()
    const item = await store.addBuffer(png, '.png')
    await fs.rm(item.file)

    const reloaded = new TrayStore(path.join(dir, 'tray'))
    await reloaded.load()
    expect(reloaded.list()).toEqual([])
  })

  it('notifies on every change', async () => {
    const seen: number[] = []
    const store = new TrayStore(path.join(dir, 'tray'), (items) => seen.push(items.length))
    await store.load()
    await store.addBuffer(png, '.png')
    await store.clear()
    expect(seen).toEqual([1, 0])
  })
})

describe('extensionForMime', () => {
  it('maps image content types and ignores parameters', () => {
    expect(extensionForMime('image/jpeg')).toBe('.jpg')
    expect(extensionForMime('image/PNG; charset=binary')).toBe('.png')
    expect(extensionForMime('text/html')).toBeUndefined()
  })
})
