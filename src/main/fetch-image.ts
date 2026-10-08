import path from 'node:path'
import { extensionForMime, MAX_IMAGE_BYTES } from './tray-store'

export interface DownloadedImage {
  data: Buffer
  ext: string
  name: string
}

/** Download an image from an http(s) URL, refusing anything that isn't an image or is too large. */
export async function downloadImage(url: string): Promise<DownloadedImage> {
  const target = new URL(url)
  if (target.protocol !== 'https:' && target.protocol !== 'http:') throw new Error('Only http(s) image links are supported')

  const res = await fetch(target, {
    redirect: 'follow',
    signal: AbortSignal.timeout(20_000),
    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh) Companion' },
  })
  if (!res.ok) throw new Error(`Download failed (HTTP ${res.status})`)

  const ext = extensionForMime(res.headers.get('content-type') ?? '')
  if (!ext) throw new Error("That link isn't an image")
  if (Number(res.headers.get('content-length') ?? 0) > MAX_IMAGE_BYTES) throw new Error('Image is too big (max 25 MB)')

  const data = Buffer.from(await res.arrayBuffer())
  if (data.byteLength > MAX_IMAGE_BYTES) throw new Error('Image is too big (max 25 MB)')

  const base = safeDecode(path.basename(target.pathname)) || 'image'
  return { data, ext, name: path.extname(base) ? base : base + ext }
}

function safeDecode(s: string): string {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}
