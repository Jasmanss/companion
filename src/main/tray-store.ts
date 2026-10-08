import { promises as fs } from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import type { TrayItem } from '../shared/types'

export const MAX_IMAGE_BYTES = 25 * 1024 * 1024

const EXT_BY_MIME: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/avif': '.avif',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
  'image/tiff': '.tiff',
}

export const IMAGE_EXTENSIONS = new Set([...Object.values(EXT_BY_MIME), '.jpeg', '.heic', '.ico'])

export function extensionForMime(contentType: string): string | undefined {
  return EXT_BY_MIME[contentType.split(';')[0].trim().toLowerCase()]
}

export interface ItemMeta {
  name?: string
  source?: string
  note?: string
  credit?: string
}

/**
 * The shelf of collected images. Each image is copied into the tray folder,
 * and an index.json next to them keeps the order and metadata across restarts.
 */
export class TrayStore {
  private items: TrayItem[] = []
  private readonly indexFile: string

  constructor(
    private readonly dir: string,
    private readonly onChange: (items: TrayItem[]) => void = () => {},
  ) {
    this.indexFile = path.join(dir, 'index.json')
  }

  async load(): Promise<void> {
    await fs.mkdir(this.dir, { recursive: true })
    try {
      const saved = JSON.parse(await fs.readFile(this.indexFile, 'utf8')) as TrayItem[]
      const present = await Promise.all(saved.map((item) => fs.access(item.file).then(() => true, () => false)))
      this.items = saved.filter((_, i) => present[i])
    } catch {
      this.items = []
    }
  }

  list(): TrayItem[] {
    return [...this.items]
  }

  get(id: string): TrayItem | undefined {
    return this.items.find((item) => item.id === id)
  }

  async addFile(src: string, meta: ItemMeta = {}): Promise<TrayItem> {
    const ext = path.extname(src).toLowerCase()
    if (!IMAGE_EXTENSIONS.has(ext)) throw new Error(`${path.basename(src)} isn't an image`)
    const { size } = await fs.stat(src)
    if (size > MAX_IMAGE_BYTES) throw new Error(`${path.basename(src)} is too big (max 25 MB)`)
    const id = randomUUID()
    const file = path.join(this.dir, id + ext)
    await fs.copyFile(src, file)
    return this.push({ id, file, name: meta.name ?? path.basename(src), bytes: size, addedAt: Date.now(), ...pickMeta(meta) })
  }

  async addBuffer(data: Buffer, ext: string, meta: ItemMeta = {}): Promise<TrayItem> {
    if (data.byteLength > MAX_IMAGE_BYTES) throw new Error('Image is too big (max 25 MB)')
    const id = randomUUID()
    const file = path.join(this.dir, id + ext)
    await fs.writeFile(file, data)
    return this.push({ id, file, name: meta.name ?? `image${ext}`, bytes: data.byteLength, addedAt: Date.now(), ...pickMeta(meta) })
  }

  async remove(id: string): Promise<void> {
    const item = this.get(id)
    if (!item) return
    this.items = this.items.filter((i) => i.id !== id)
    await fs.rm(item.file, { force: true })
    await this.save()
  }

  async clear(): Promise<void> {
    const old = this.items
    this.items = []
    await Promise.all(old.map((item) => fs.rm(item.file, { force: true })))
    await this.save()
  }

  private async push(item: TrayItem): Promise<TrayItem> {
    this.items.push(item)
    await this.save()
    return item
  }

  private async save(): Promise<void> {
    await fs.writeFile(this.indexFile, JSON.stringify(this.items, null, 2))
    this.onChange(this.list())
  }
}

function pickMeta({ source, note, credit }: ItemMeta): Pick<TrayItem, 'source' | 'note' | 'credit'> {
  return { source, note, credit }
}
